import * as cheerio from 'cheerio';
import { fetchText, type OhlcvRow, yahooChartToOhlcv } from './utils.js';

export interface FundamentalsPayload {
  price?: number;
  eps_ttm?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  book_value_per_share?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  dividend_yield?: number;
  profit_margin?: number;
  sector?: string;
  [key: string]: unknown;
}

export async function fetchYahooOhlcv(ticker: string, exchange = 'DHA', range = '1y'): Promise<OhlcvRow[]> {
  const yahooTicker = `${ticker}.${exchange}`;
  const params = new URLSearchParams({ interval: '1d', range });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?${params.toString()}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) return [];
  const data = (await response.json()) as Record<string, unknown>;
  const chart = data.chart as Record<string, unknown> | undefined;
  if (chart?.error) return [];
  return yahooChartToOhlcv(data);
}

/** Parse DSE day_end_archive.php HTML table (archive=data returns HTML, not CSV). */
export function parseDseArchiveHtml(html: string, ticker?: string): OhlcvRow[] {
  const $ = cheerio.load(html);
  const rows: OhlcvRow[] = [];
  const symbol = ticker?.toUpperCase();

  $('table').each((_, table) => {
    const header = $(table).find('thead tr, tr').first().text().toUpperCase();
    if (!header.includes('DATE') || !header.includes('OPEN')) return;

    $(table)
      .find('tbody tr, tr')
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 8) return;

        const date = $(cells[1]).text().trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

        const code = $(cells[2]).text().trim().toUpperCase();
        if (symbol && code && !code.includes(symbol)) return;

        const parseNum = (s: string) => parseFloat(s.replace(/,/g, ''));
        const high = parseNum($(cells[4]).text());
        const low = parseNum($(cells[5]).text());
        const open = parseNum($(cells[6]).text());
        const close = parseNum($(cells[7]).text());
        const volume = parseInt($(cells[11] ?? cells[cells.length - 1]).text().replace(/,/g, ''), 10);

        if ([open, high, low, close].some((n) => Number.isNaN(n))) return;

        rows.push({
          date,
          open,
          high,
          low,
          close,
          volume: Number.isNaN(volume) ? 0 : volume,
        });
      });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchStockAnalysisOhlcv(ticker: string): Promise<OhlcvRow[]> {
  const url = `https://stockanalysis.com/quote/dse/${ticker}/history/`;
  const html = await fetchText(url);
  if (!html) return [];

  const rows: OhlcvRow[] = [];
  const re =
    /(\d{4}-\d{2}-\d{2})[\s\S]{0,120}?(\d+\.\d+)[\s\S]{0,40}?(\d+\.\d+)[\s\S]{0,40}?(\d+\.\d+)[\s\S]{0,40}?(\d+\.\d+)[\s\S]{0,40}?(\d+\.\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null && rows.length < 400) {
    const [, date, open, high, low, close] = match;
    rows.push({
      date: date!,
      open: parseFloat(open!),
      high: parseFloat(high!),
      low: parseFloat(low!),
      close: parseFloat(close!),
      volume: 0,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseDseCompanyHtml(html: string): FundamentalsPayload {
  const $ = cheerio.load(html);
  const payload: FundamentalsPayload = {};

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim().toLowerCase();
    const value = $(cells[1]).text().trim().replace(/,/g, '');

    if (label.includes('last trading price') || label.includes('ltp')) {
      payload.price = parseFloat(value) || undefined;
    } else if (label.includes('p/e') || label.includes('pe ratio')) {
      payload.pe = parseFloat(value) || undefined;
    } else if (label.includes('eps')) {
      payload.eps_ttm = parseFloat(value) || undefined;
    } else if (label.includes('nav') || label.includes('book value')) {
      payload.book_value_per_share = parseFloat(value) || undefined;
    } else if (label.includes('sector')) {
      payload.sector = $(cells[1]).text().trim();
    } else if (label.includes('dividend yield')) {
      const pct = parseFloat(value.replace('%', ''));
      if (!Number.isNaN(pct)) payload.dividend_yield = pct / 100;
    }
  });

  if (payload.price && payload.eps_ttm && !payload.pe) {
    payload.pe = payload.price / payload.eps_ttm;
  }
  if (payload.price && payload.book_value_per_share && !payload.pb) {
    payload.pb = payload.price / payload.book_value_per_share;
  }

  return payload;
}

export interface ShareholdingRow {
  month: string;
  sponsor?: number;
  govt?: number;
  institution?: number;
  foreign?: number;
  public?: number;
}

export function parseDseShareholdingHtml(html: string): ShareholdingRow[] {
  const $ = cheerio.load(html);
  const rows: ShareholdingRow[] = [];

  const parsePctBlock = (text: string): Omit<ShareholdingRow, 'month'> => {
    const num = (label: string) => {
      const m = text.match(new RegExp(`${label}:\\s*([\\d.]+)`, 'i'));
      return m ? parseFloat(m[1]!) : undefined;
    };
    return {
      sponsor: num('Sponsor/Director'),
      govt: num('Govt'),
      institution: num('Institute'),
      foreign: num('Foreign'),
      public: num('Public'),
    };
  };

  const monthFromLabel = (label: string): string | null => {
    const iso = label.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-01`;
    const named = label.match(/as on\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (named) {
      const d = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      }
    }
    return null;
  };

  $('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim();
    if (!/share holding percentage/i.test(label)) return;

    const month = monthFromLabel(label);
    if (!month) return;

    const block = parsePctBlock($(cells[1]).text());
    if (block.sponsor == null && block.institution == null) return;

    rows.push({ month, ...block });
  });

  // Legacy table layout with sponsor/institution headers
  $('table').each((_, table) => {
    const header = $(table).find('tr').first().text().toLowerCase();
    if (!header.includes('sponsor') && !header.includes('institution')) return;

    $(table)
      .find('tr')
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 5) return;
        const monthRaw = $(cells[0]).text().trim();
        let month: string | null = null;
        const iso = monthRaw.match(/(\d{4})-(\d{2})/);
        if (iso) {
          month = `${iso[1]}-${iso[2]}-01`;
        } else {
          const named = monthRaw.match(/([A-Za-z]+)\s+(\d{4})/);
          if (named) {
            const d = new Date(`${named[1]} 1, ${named[2]}`);
            if (!Number.isNaN(d.getTime())) {
              month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            }
          }
        }
        if (!month) return;

        const parsePct = (s: string) => parseFloat(s.replace(/[% ,]/g, '')) || undefined;
        rows.push({
          month,
          sponsor: parsePct($(cells[1]).text()),
          govt: parsePct($(cells[2]).text()),
          institution: parsePct($(cells[3]).text()),
          foreign: parsePct($(cells[4]).text()),
          public: parsePct($(cells[5] ?? cells[4]).text()),
        });
      });
  });

  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.month)) return false;
    seen.add(r.month);
    return true;
  });
}

export async function fetchDseCompanyHtml(ticker: string): Promise<string | null> {
  return fetchText(`https://www.dsebd.org/displayCompany.php?name=${ticker}`);
}

export async function fetchStockAnalysisFundamentals(ticker: string): Promise<FundamentalsPayload> {
  const url = `https://stockanalysis.com/quote/dse/${ticker}/`;
  const html = await fetchText(url);
  if (!html) return {};

  const $ = cheerio.load(html);
  const payload: FundamentalsPayload = {};

  $('table tr').each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim().toLowerCase();
    const value = $(cells[1]).text().trim();

    if (label === 'pe ratio') payload.pe = parseFloat(value) || undefined;
    if (label === 'eps') payload.eps_ttm = parseFloat(value.replace(/[^0-9.-]/g, '')) || undefined;
    if (label.includes('dividend')) {
      const m = value.match(/([\d.]+)/);
      if (m) payload.dividend_yield = parseFloat(m[1]!) / 100;
    }
  });

  const priceMatch = html.match(/"price"\s*:\s*([\d.]+)/);
  if (priceMatch) payload.price = parseFloat(priceMatch[1]!);

  return payload;
}

export interface NewsRow {
  date: string;
  headline: string;
  source?: string;
  category?: string;
  url?: string;
}

export function parseDseNewsHtml(html: string): NewsRow[] {
  const $ = cheerio.load(html);
  const items: NewsRow[] = [];
  const today = new Date().toISOString().slice(0, 10);

  $('a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();
    if (text.length < 10 || !href.includes('displayNews')) return;
    items.push({
      date: today,
      headline: text,
      source: 'dse',
      category: 'general',
      url: href.startsWith('http') ? href : `https://www.dsebd.org/${href}`,
    });
  });

  if (items.length === 0) {
    $('tr').each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length < 2) return;
      const label = $(cells[0]).text().trim().toLowerCase();
      if (!label.includes('price sensitive')) return;
      const link = $(cells[1]).find('a').first();
      const href = link.attr('href') ?? '';
      const headline = link.text().trim() || 'Price sensitive information';
      if (!href) return;
      items.push({
        date: today,
        headline,
        source: 'dse',
        category: 'price_sensitive',
        url: href.startsWith('http') ? href : href,
      });
    });
  }

  return items.slice(0, 20);
}

/** Default Bangladesh macro snapshot (override via ingest seed). */
export const DEFAULT_MACRO: Record<string, unknown> = {
  policy_rate: 0.1,
  inflation: 0.086,
  fx_reserves_bn: 20.1,
  bdt_usd: 122.0,
  remittances_bn: 2.1,
  reserves_trend: 'stable',
  politics: 'stable',
};
