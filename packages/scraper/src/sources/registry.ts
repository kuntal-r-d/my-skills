import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OhlcvRow } from '../utils.js';
import type { FundamentalsPayload } from '../sources.js';
import {
  fetchStockAnalysisFundamentals,
  fetchStockAnalysisOhlcv,
  fetchStockAnalysisStatistics,
  fetchYahooOhlcv,
} from '../sources.js';
import { fetchAmarStockFundamentals } from '../amarstock.js';
import { fetchLankabdFundamentals } from '../lankabd.js';
import { DSEScraper } from '../dse-scraper.js';
import { sleep } from '../utils.js';

export interface FundamentalsSource {
  id: string;
  priority: number;
  capabilities: string[];
  fetch(symbol: string): Promise<FundamentalsPayload>;
}

export interface OhlcvSource {
  id: string;
  priority: number;
  fetch(symbol: string, days?: number): Promise<OhlcvRow[]>;
}

export function parseEnabledSources(env: string | undefined, defaults: string[]): string[] {
  const raw = env?.trim();
  if (!raw) return defaults;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function ingestRateMs(): number {
  const n = parseInt(process.env.INGEST_SOURCE_RATE_MS ?? '1000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

const DEFAULT_FUNDAMENTALS = ['dse', 'stockanalysis', 'stockanalysis_statistics', 'lankabd', 'amarstock'];
const DEFAULT_OHLCV = ['dse', 'yahoo', 'stockanalysis'];

let scraperSingleton: DSEScraper | null = null;

function getScraper(): DSEScraper {
  if (!scraperSingleton) {
    scraperSingleton = new DSEScraper(join(process.env.INGEST_CACHE_DIR ?? tmpdir(), 'stock-buddy-ingest'));
  }
  return scraperSingleton;
}

export function createFundamentalsRegistry(enabledIds?: string[]): FundamentalsSource[] {
  const ids = new Set(parseEnabledSources(process.env.INGEST_FUNDAMENTALS_SOURCES, DEFAULT_FUNDAMENTALS));
  if (enabledIds) {
    for (const id of enabledIds) ids.add(id);
  }

  const all: FundamentalsSource[] = [
    {
      id: 'dse',
      priority: 1,
      capabilities: ['pe', 'eps_ttm', 'price', 'sector', 'market_cap', 'book_value_per_share', 'dividend_yield'],
      fetch: async (symbol) => {
        const data = await getScraper().fetchFundamentalsAndShareholding(symbol);
        const { shareholding: _s, ...fund } = data;
        return fund as FundamentalsPayload;
      },
    },
    {
      id: 'stockanalysis',
      priority: 2,
      capabilities: ['eps_ttm', 'pe', 'market_cap', 'revenue', 'dividend_yield', 'beta', 'price'],
      fetch: fetchStockAnalysisFundamentals,
    },
    {
      id: 'stockanalysis_statistics',
      priority: 3,
      capabilities: ['roe', 'pb', 'debt_to_equity', 'profit_margin', 'book_value_per_share'],
      fetch: fetchStockAnalysisStatistics,
    },
    {
      id: 'lankabd',
      priority: 4,
      capabilities: ['pe', 'eps_ttm', 'market_cap', 'dividend_yield', 'beta', 'book_value_per_share', 'sector', 'price'],
      fetch: fetchLankabdFundamentals,
    },
    {
      id: 'amarstock',
      priority: 5,
      capabilities: ['pe', 'eps_ttm'],
      fetch: fetchAmarStockFundamentals,
    },
  ];

  return all.filter((s) => ids.has(s.id)).sort((a, b) => a.priority - b.priority);
}

export function createOhlcvRegistry(): OhlcvSource[] {
  const ids = new Set(parseEnabledSources(process.env.INGEST_OHLCV_SOURCES, DEFAULT_OHLCV));

  const all: OhlcvSource[] = [
    {
      id: 'dse',
      priority: 1,
      fetch: async (symbol, days = 365) => getScraper().getHistoricalData(symbol, days),
    },
    {
      id: 'yahoo',
      priority: 2,
      fetch: async (symbol, days = 365) => fetchYahooOhlcv(symbol, 'DHA', days > 365 ? '2y' : '1y'),
    },
    {
      id: 'stockanalysis',
      priority: 3,
      fetch: fetchStockAnalysisOhlcv,
    },
  ];

  return all.filter((s) => ids.has(s.id)).sort((a, b) => a.priority - b.priority);
}

/** Fetch from all enabled fundamentals sources with rate limiting between calls. */
export async function fetchAllFundamentals(
  symbol: string,
  registry = createFundamentalsRegistry(),
): Promise<{ id: string; payload: FundamentalsPayload }[]> {
  const results: { id: string; payload: FundamentalsPayload }[] = [];
  const rate = ingestRateMs();

  for (let i = 0; i < registry.length; i++) {
    const source = registry[i]!;
    try {
      const payload = await source.fetch(symbol);
      if (payload && Object.keys(payload).length > 0) {
        results.push({ id: source.id, payload });
      }
    } catch (err) {
      console.warn(`[ingest] fundamentals source ${source.id} failed for ${symbol}:`, err);
    }
    if (i < registry.length - 1 && rate > 0) await sleep(rate);
  }

  return results;
}
