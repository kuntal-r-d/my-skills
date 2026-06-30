import { fetchText, sleep } from '../utils.js';
import { parseEnabledSources, ingestRateMs } from '../sources/registry.js';
import { fetchDseNewsArchive } from '../dse-news.js';
import { parseRssXml, isStockRelatedHeadline } from './rss.js';
import { parseFeStockHtml, parseFeBanglaStockHtml } from './parsers.js';
import type { NewsRow, NewsSourceDef } from './types.js';

/** Curated DSE-relevant news sources (newspapers + web; social via env). */
export const DEFAULT_NEWS_SOURCES: NewsSourceDef[] = [
  {
    id: 'dse_psn',
    label: 'DSE — Price Sensitive Information',
    kind: 'dse_archive',
    url: 'https://www.dsebd.org/old_news.php',
    category: 'price_sensitive',
    channel: 'dse',
    dseCriteria: 1,
  },
  {
    id: 'dse_corporate',
    label: 'DSE — Corporate Announcements',
    kind: 'dse_archive',
    url: 'https://www.dsebd.org/old_news.php',
    category: 'corporate',
    channel: 'dse',
    dseCriteria: 2,
  },
  {
    id: 'tbs_stocks',
    label: 'The Business Standard — Stocks',
    kind: 'rss',
    url: 'https://www.tbsnews.net/economy/stocks/rss.xml',
    category: 'earnings',
    channel: 'newspaper',
  },
  {
    id: 'dhaka_tribune_stock',
    label: 'Dhaka Tribune — Stock Market',
    kind: 'rss',
    url: 'https://www.dhakatribune.com/feed/business/stock',
    category: 'general',
    channel: 'newspaper',
  },
  {
    id: 'tbs_economy',
    label: 'The Business Standard — Economy',
    kind: 'rss',
    url: 'https://www.tbsnews.net/economy/rss.xml',
    category: 'macro',
    channel: 'newspaper',
    stockFilter: true,
  },
  {
    id: 'financial_express',
    label: 'The Financial Express — Stock',
    kind: 'html',
    url: 'https://thefinancialexpress.com.bd/page/stock/bangladesh',
    category: 'general',
    channel: 'newspaper',
    lang: 'en',
  },
  {
    id: 'google_news_dse',
    label: 'Google News — DSE & share market',
    kind: 'rss',
    url: 'https://news.google.com/rss/search?q=Dhaka+Stock+Exchange+OR+DSE+Bangladesh+share+market&hl=en-BD&gl=BD&ceid=BD:en',
    category: 'general',
    channel: 'web',
    stockFilter: true,
    lang: 'en',
  },
  {
    id: 'daily_star_business',
    label: 'The Daily Star — Stock',
    kind: 'rss',
    url: 'https://www.thedailystar.net/business/economy/stock/rss.xml',
    category: 'general',
    channel: 'newspaper',
    lang: 'en',
  },
  {
    id: 'tbs_economy_bn',
    label: 'The Business Standard — অর্থনীতি (বাংলা)',
    kind: 'rss',
    url: 'https://www.tbsnews.net/bangla/economy/rss.xml',
    category: 'macro',
    channel: 'newspaper',
    stockFilter: true,
    lang: 'bn',
  },
  {
    id: 'prothomalo',
    label: 'Prothom Alo — প্রথম আলো',
    kind: 'rss',
    url: 'https://www.prothomalo.com/feed',
    category: 'general',
    channel: 'newspaper',
    stockFilter: true,
    lang: 'bn',
  },
  {
    id: 'google_news_bn',
    label: 'Google News — শেয়ারবাজার (বাংলা)',
    kind: 'rss',
    url: 'https://news.google.com/rss/search?q=%E0%A6%B6%E0%A7%87%E0%A6%AF%E0%A6%BC%E0%A6%BE%E0%A6%B0%E0%A6%AC%E0%A6%BE%E0%A6%9C%E0%A6%BE%E0%A6%B0+OR+DSE+OR+%E0%A6%B2%E0%A6%AD%E0%A7%8D%E0%A6%AF%E0%A6%BE%E0%A6%82%E0%A6%B6&hl=bn-BD&gl=BD&ceid=BD:bn',
    category: 'general',
    channel: 'web',
    stockFilter: true,
    lang: 'bn',
  },
  {
    id: 'financial_express_bn',
    label: 'Financial Express — স্টক (বাংলা)',
    kind: 'html',
    url: 'https://thefinancialexpress.com.bd/bangla/stock',
    category: 'general',
    channel: 'newspaper',
    lang: 'bn',
  },
];

function parseExtraSources(): NewsSourceDef[] {
  const extra: NewsSourceDef[] = [];
  const telegram = process.env.INGEST_NEWS_TELEGRAM_RSS?.trim();
  if (telegram) {
    for (const url of telegram.split(',').map((s) => s.trim()).filter(Boolean)) {
      extra.push({
        id: `telegram_${extra.length + 1}`,
        label: 'Telegram (public channel RSS)',
        kind: 'rss',
        url,
        category: 'rumour',
        channel: 'social',
        stockFilter: true,
      });
    }
  }
  const custom = process.env.INGEST_NEWS_CUSTOM_RSS?.trim();
  if (custom) {
    for (const url of custom.split(',').map((s) => s.trim()).filter(Boolean)) {
      extra.push({
        id: `custom_${extra.length + 1}`,
        label: 'Custom RSS',
        kind: 'rss',
        url,
        category: 'general',
        channel: 'web',
        stockFilter: true,
      });
    }
  }
  return extra;
}

export function createNewsRegistry(): NewsSourceDef[] {
  const ids = new Set(
    parseEnabledSources(
      process.env.INGEST_NEWS_SOURCES,
      DEFAULT_NEWS_SOURCES.map((s) => s.id),
    ),
  );
  const base = DEFAULT_NEWS_SOURCES.filter((s) => ids.has(s.id));
  const extras = parseExtraSources();
  return [...base, ...extras];
}

async function fetchSource(def: NewsSourceDef): Promise<NewsRow[]> {
  if (def.kind === 'dse_archive') {
    return fetchDseNewsArchive({ criteria: def.dseCriteria ?? 3 });
  }

  const raw = await fetchText(def.url);
  if (!raw) return [];

  let rows: NewsRow[] = [];
  if (def.kind === 'rss') {
    rows = parseRssXml(raw, def.id, def.category);
  } else if (def.kind === 'html') {
    if (def.id === 'financial_express') rows = parseFeStockHtml(raw);
    else if (def.id === 'financial_express_bn') rows = parseFeBanglaStockHtml(raw);
  }

  if (def.stockFilter) {
    rows = rows.filter((r) => isStockRelatedHeadline(r.headline));
  }

  for (const r of rows) {
    if (!r.source) r.source = def.id;
    if (!r.category) r.category = def.category;
    if (def.channel === 'social') {
      r.category = 'rumour';
      r.source = r.source ?? def.id;
    }
  }

  return rows;
}

export async function fetchMarketNews(limitPerSource = 25): Promise<NewsRow[]> {
  const registry = createNewsRegistry();
  const all: NewsRow[] = [];
  const seen = new Set<string>();
  const rate = ingestRateMs();

  for (const def of registry) {
    try {
      const rows = (await fetchSource(def)).slice(0, limitPerSource);
      for (const row of rows) {
        const key = row.url ?? `${row.source}:${row.headline}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
      }
    } catch (err) {
      console.warn(`[news] source ${def.id} failed:`, err);
    }
    if (rate > 0) await sleep(rate);
  }

  return all;
}
