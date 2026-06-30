import * as cheerio from 'cheerio';
import { fetchPostText, normalizeDate } from './utils.js';
import type { NewsRow } from './news/types.js';

const DSE_NEWS_BASES = [
  'https://www.dsebd.org/old_news.php',
  'https://dsebd.org/old_news.php',
] as const;

/** DSE old_news.php criteria codes (bdshare-compatible). */
export type DseNewsCriteria = 1 | 2 | 3;

export interface DseNewsFetchOpts {
  criteria?: DseNewsCriteria;
  symbol?: string;
  startDate?: string;
  endDate?: string;
}

/** Parse DSE news archive table (code, headline, date columns). */
export function parseDseNewsArchiveHtml(
  html: string,
  opts: { sourceId?: string; category?: string } = {},
): NewsRow[] {
  const $ = cheerio.load(html);
  const table = $('table.table-news').first().length
    ? $('table.table-news').first()
    : $('table').first();
  const items: NewsRow[] = [];
  const source = opts.sourceId ?? 'dse';
  const category = opts.category ?? 'general';

  table.find('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 3) return;

    const code = $(cells[0]).text().trim();
    const headline = $(cells[1]).text().trim().replace(/\s+/g, ' ');
    const dateRaw = $(cells[2]).text().trim();
    if (!headline || headline.length < 8) return;

    const date = normalizeDate(dateRaw) ?? new Date().toISOString().slice(0, 10);
    items.push({
      date,
      headline: code ? `[${code}] ${headline}` : headline,
      source,
      category,
    });
  });

  return items;
}

/** Fetch PSI (1), corporate (2), or all (3) news from DSE old_news.php. */
export async function fetchDseNewsArchive(opts: DseNewsFetchOpts = {}): Promise<NewsRow[]> {
  const criteria = opts.criteria ?? 3;
  const fields: Record<string, string> = {
    criteria: String(criteria),
    archive: 'news',
  };
  if (opts.symbol) fields.inst = opts.symbol.toUpperCase();
  if (opts.startDate) fields.startDate = opts.startDate;
  if (opts.endDate) fields.endDate = opts.endDate;

  const category =
    criteria === 1 ? 'price_sensitive' : criteria === 2 ? 'corporate' : 'general';
  const sourceId =
    criteria === 1 ? 'dse_psn' : criteria === 2 ? 'dse_corporate' : 'dse_news';

  for (const url of DSE_NEWS_BASES) {
    const html = await fetchPostText(url, fields);
    if (!html) continue;
    const rows = parseDseNewsArchiveHtml(html, { sourceId, category });
    if (rows.length > 0) return rows;
  }

  return [];
}

export async function fetchDsePriceSensitiveNews(symbol?: string): Promise<NewsRow[]> {
  return fetchDseNewsArchive({ criteria: 1, symbol });
}

export async function fetchDseCorporateNews(symbol?: string): Promise<NewsRow[]> {
  return fetchDseNewsArchive({ criteria: 2, symbol });
}
