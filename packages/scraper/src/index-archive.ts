import * as cheerio from 'cheerio';
import { fetchPostText, fetchText, formatDate, type OhlcvRow } from './utils.js';

/** Rolling ~30-day table (GET). */
export const DSE_INDEX_RECENT_URL = 'https://www.dsebd.org/recent_market_information.php';
/** Full archive (POST startDate/endDate). Equity day_end_archive cannot fetch indexes. */
export const DSE_INDEX_ARCHIVE_URL = 'https://www.dsebd.org/recent_market_information_more.php';

export const DSE_INDEX_SYMBOLS = ['DSEX', 'DSES', 'DS30'] as const;
export type DseIndexSymbol = (typeof DSE_INDEX_SYMBOLS)[number];

function parseDdMmYyyy(s: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function num(s: string): number | null {
  const t = String(s).replace(/,/g, '').trim();
  if (!t || t === '-' || t === '--') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function findIndexHistoryTableHtml(html: string): string | null {
  const $ = cheerio.load(html);
  let foundHtml: string | null = null;
  $('table').each((_, el) => {
    if (foundHtml) return;
    const headers = $(el)
      .find('tr')
      .first()
      .find('th,td')
      .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
      .get();
    const joined = headers.join(' | ');
    if (/Date/i.test(joined) && /DSEX/i.test(joined)) {
      foundHtml = $.html(el);
    }
  });
  return foundHtml;
}

/**
 * Parse DSE day-wise index table (Date … DSEX … DSES … DS30 …).
 * Index level only — synthesises flat OHLC from close; volume = market TOTAL_VOLUME.
 */
export function parseDseIndexHistoryHtml(html: string): Record<DseIndexSymbol, OhlcvRow[]> {
  const empty: Record<DseIndexSymbol, OhlcvRow[]> = { DSEX: [], DSES: [], DS30: [] };
  const tableHtml = findIndexHistoryTableHtml(html);
  if (!tableHtml) return empty;

  const $ = cheerio.load(tableHtml);
  const series: Record<DseIndexSymbol, OhlcvRow[]> = { DSEX: [], DSES: [], DS30: [] };
  $('tr').slice(1).each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
      .get();
    if (cells.length < 8) return;
    const date = parseDdMmYyyy(cells[0] ?? '');
    if (!date) return;
    const volume = num(cells[2] ?? '') ?? 0;
    const push = (key: DseIndexSymbol, close: number | null) => {
      if (close == null) return;
      series[key].push({
        date,
        open: close,
        high: close,
        low: close,
        close,
        volume,
      });
    };
    push('DSEX', num(cells[5] ?? ''));
    push('DSES', num(cells[6] ?? ''));
    push('DS30', num(cells[7] ?? ''));
  });

  for (const key of DSE_INDEX_SYMBOLS) {
    series[key].sort((a, b) => a.date.localeCompare(b.date));
  }
  return series;
}

/**
 * Fetch DSE index history for `days` calendar days.
 * Uses the archive POST endpoint (equity scrapers return 0 for DSEX/DSES/DS30).
 */
export async function fetchDseIndexHistory(
  days = 365,
): Promise<Record<DseIndexSymbol, OhlcvRow[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const html = await fetchPostText(DSE_INDEX_ARCHIVE_URL, {
    startDate: formatDate(start),
    endDate: formatDate(end),
    searchRecentMarket: 'Search Recent Market',
  });
  if (!html) {
    // Fallback: rolling ~30d GET (better than nothing if POST fails).
    const recent = await fetchText(DSE_INDEX_RECENT_URL);
    if (!recent) return { DSEX: [], DSES: [], DS30: [] };
    return parseDseIndexHistoryHtml(recent);
  }
  return parseDseIndexHistoryHtml(html);
}

/** OHLCV for one index symbol (empty if unknown / missing). */
export async function fetchDseIndexOhlcv(
  symbol: string,
  days = 365,
): Promise<OhlcvRow[]> {
  const key = symbol.toUpperCase() as DseIndexSymbol;
  if (!DSE_INDEX_SYMBOLS.includes(key)) return [];
  const all = await fetchDseIndexHistory(days);
  return all[key] ?? [];
}
