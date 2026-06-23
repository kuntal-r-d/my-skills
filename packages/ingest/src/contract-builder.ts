import type { Db } from '@stock-buddy/db';
import {
  getDefaultAccount,
  getFreshness,
  getLatestFundamentals,
  getLatestMacro,
  getNews,
  getOhlcv,
  getPortfolioPositions,
  getShareholding,
  getTickerBySymbol,
} from '@stock-buddy/db';
import { SkillInputSchema } from '@stock-buddy/core';

export interface ContractMeta {
  sources: string[];
  missing: string[];
  freshness: Record<string, string | null>;
}

export interface BuildContractOptions {
  mode?: 'momentum' | 'investment';
  ohlcvDays?: number;
  includePortfolio?: boolean;
}

export async function buildTickerContract(
  db: Db,
  symbol: string,
  opts: BuildContractOptions = {},
): Promise<Record<string, unknown>> {
  const ticker = await getTickerBySymbol(db, symbol);
  if (!ticker) {
    throw new Error(`Ticker not found: ${symbol}`);
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const ohlcvDays = opts.ohlcvDays ?? 260;
  const sources: string[] = [];
  const missing: string[] = [];

  const ohlcvRows = await getOhlcv(db, ticker.id, { limit: ohlcvDays });
  const ohlcv = ohlcvRows.map((r) => ({
    date: r.tradeDate,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
  if (ohlcv.length > 0) sources.push('db:ohlcv');
  else missing.push('ohlcv');

  let fundamentals: Record<string, unknown> | undefined;
  const fundSnap = await getLatestFundamentals(db, ticker.id);
  if (fundSnap) {
    fundamentals = fundSnap.payload as Record<string, unknown>;
    sources.push(`db:fundamentals:${fundSnap.source}`);
  } else {
    missing.push('fundamentals');
  }

  const shareRows = await getShareholding(db, ticker.id, 4);
  const shareholding =
    shareRows.length > 0
      ? shareRows.map((r) => ({
          month: String(r.month).slice(0, 7),
          sponsor: r.sponsor ?? undefined,
          govt: r.govt ?? undefined,
          institution: r.institution ?? undefined,
          foreign: r.foreign ?? undefined,
          public: r.public ?? undefined,
        }))
      : undefined;
  if (!shareholding?.length) missing.push('shareholding');
  else sources.push('db:shareholding');

  const macroSnap = await getLatestMacro(db);
  const macro = macroSnap ? (macroSnap.payload as Record<string, unknown>) : undefined;
  if (macro) sources.push('db:macro');
  else missing.push('macro');

  const newsRows = await getNews(db, ticker.id, 7);
  const news =
    newsRows.length > 0
      ? newsRows.map((n) => ({
          date: n.publishedDate,
          headline: n.headline,
          source: n.source ?? undefined,
          category: n.category ?? undefined,
        }))
      : undefined;
  if (!news?.length) missing.push('news');
  else sources.push('db:news');

  let microstructure: Record<string, unknown> | undefined;
  if (ohlcv.length >= 20) {
    const tail = ohlcv.slice(-20);
    const avgDailyValue = tail.reduce((s, b) => s + b.close * b.volume, 0) / tail.length;
    microstructure = {
      circuit_state: 'normal',
      floor_price: null,
      halted: false,
      avg_daily_value_bdt: Math.round(avgDailyValue),
    };
    sources.push('derived:microstructure');
  }

  const contract: Record<string, unknown> = {
    ticker: ticker.symbol,
    as_of: asOf,
    mode: opts.mode ?? 'investment',
    ohlcv,
    ...(fundamentals ? { fundamentals } : {}),
    ...(shareholding ? { shareholding } : {}),
    ...(macro ? { macro } : {}),
    ...(news ? { news } : {}),
    ...(microstructure ? { microstructure } : {}),
  };

  if (opts.includePortfolio) {
    const account = await getDefaultAccount(db);
    if (account) {
      const positions = await getPortfolioPositions(db, account.id);
      const totalValue = positions.reduce((s, p) => s + p.position.qty * p.position.avgCost, 0);
      contract.portfolio = {
        total_value_bdt: totalValue || account.capitalBdt,
        positions: positions.map((p) => ({
          ticker: p.symbol,
          qty: p.position.qty,
          price: p.position.avgCost,
          sector: p.position.sector ?? ticker.sector,
        })),
      };
      contract.account = {
        capital_bdt: account.capitalBdt,
        risk_per_trade_pct: account.riskPerTradePct,
      };
      sources.push('db:portfolio');
    } else {
      missing.push('portfolio');
    }
  }

  const freshnessRows = await getFreshness(db, ticker.id);
  const freshness: Record<string, string | null> = {};
  for (const f of freshnessRows) {
    freshness[f.entityType] = f.lastSuccessAt?.toISOString() ?? null;
  }

  contract._meta = { sources, missing, freshness } satisfies ContractMeta;

  return contract;
}

/** Strip _meta before passing to analysis skills. */
export function stripMeta(contract: Record<string, unknown>): Record<string, unknown> {
  const { _meta: _, ...rest } = contract;
  return rest;
}

export function validateContract(contract: Record<string, unknown>): boolean {
  const stripped = stripMeta(contract);
  const result = SkillInputSchema.safeParse(stripped);
  return result.success;
}
