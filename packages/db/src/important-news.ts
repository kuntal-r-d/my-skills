import { desc, eq, gte } from 'drizzle-orm';
import type { Db } from './client.js';
import { newsItems, tickers } from './schema.js';
import { getDefaultAccount, getPortfolioPositions, listWatchlist } from './repos.js';

export type NewsImportance = 'holding' | 'watchlist' | 'disclosure' | 'market';

export interface ImportantNewsRow {
  id: number;
  publishedDate: string;
  headline: string;
  source: string | null;
  category: string | null;
  url: string | null;
  symbol: string | null;
  importance: NewsImportance;
  score: number;
}

const CATEGORY_SCORE: Record<string, number> = {
  price_sensitive: 50,
  earnings: 35,
  general: 10,
  macro: 5,
  rumour: -15,
};

const HEADLINE_SIGNAL =
  /dividend|lvo|query|circuit|ipo|delist|regulatory|disclosure|profit|loss|earnings|floor|halt|scrutiny|turnover|index|delisting|agm|egm|লভ্যাংশ|ডিএসই|price sensitive|মুনাফা|লোকসান|আইপিও|তদন্ত|সার্কিট|বোর্ড/i;

function isUrlHeadline(headline: string): boolean {
  return /^https?:\/\//i.test(headline.trim());
}

function daysAgo(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, ms / 86_400_000);
}

function scoreNews(
  row: {
    headline: string;
    source: string | null;
    category: string | null;
    publishedDate: string;
    symbol: string | null;
  },
  portfolioSymbols: Set<string>,
  watchlistSymbols: Set<string>,
): { score: number; importance: NewsImportance } {
  if (isUrlHeadline(row.headline)) return { score: -999, importance: 'market' };

  let score = 0;
  let importance: NewsImportance = 'market';

  if (row.symbol && portfolioSymbols.has(row.symbol)) {
    score += 100;
    importance = 'holding';
  } else if (row.symbol && watchlistSymbols.has(row.symbol)) {
    score += 60;
    importance = 'watchlist';
  } else if (row.symbol) {
    score += 25;
  }

  const cat = row.category ?? 'general';
  if (cat === 'price_sensitive') {
    score += CATEGORY_SCORE.price_sensitive ?? 50;
    if (importance === 'market') importance = 'disclosure';
  } else {
    score += CATEGORY_SCORE[cat] ?? 10;
  }

  if (row.source === 'dse') score += 30;
  if (['tbs_stocks', 'daily_star_business', 'dhaka_tribune_stock', 'financial_express'].includes(row.source ?? '')) {
    score += 8;
  }
  if (['prothomalo', 'google_news_bn', 'tbs_economy_bn', 'financial_express_bn'].includes(row.source ?? '')) {
    score += 6;
  }

  if (HEADLINE_SIGNAL.test(row.headline)) score += 20;

  score += Math.max(0, 14 - daysAgo(row.publishedDate));

  return { score, importance };
}

export async function listImportantNews(db: Db, limit = 12, days = 14): Promise<ImportantNewsRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const account = await getDefaultAccount(db);
  const portfolioSymbols = new Set<string>();
  if (account) {
    const positions = await getPortfolioPositions(db, account.id);
    for (const p of positions) portfolioSymbols.add(p.symbol);
  }

  const watchlistSymbols = new Set<string>();
  for (const w of await listWatchlist(db)) watchlistSymbols.add(w.symbol);

  const rows = await db
    .select({
      id: newsItems.id,
      publishedDate: newsItems.publishedDate,
      headline: newsItems.headline,
      source: newsItems.source,
      category: newsItems.category,
      url: newsItems.url,
      symbol: tickers.symbol,
    })
    .from(newsItems)
    .leftJoin(tickers, eq(newsItems.tickerId, tickers.id))
    .where(gte(newsItems.publishedDate, cutoffStr))
    .orderBy(desc(newsItems.publishedDate))
    .limit(250);

  const ranked = rows
    .map((row) => {
      const { score, importance } = scoreNews(row, portfolioSymbols, watchlistSymbols);
      return { ...row, score, importance };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.publishedDate.localeCompare(a.publishedDate));

  const seen = new Set<string>();
  const perSymbol = new Map<string, number>();
  const out: ImportantNewsRow[] = [];
  const maxPerSymbol = 2;

  for (const row of ranked) {
    const key = row.url ?? `${row.source}:${row.headline}`;
    if (seen.has(key)) continue;
    if (row.symbol) {
      const n = perSymbol.get(row.symbol) ?? 0;
      if (n >= maxPerSymbol) continue;
      perSymbol.set(row.symbol, n + 1);
    }
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }

  return out;
}
