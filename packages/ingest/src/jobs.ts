import type { Db } from '@stock-buddy/db';
import {
  ensureTicker,
  getDefaultAccount,
  getFreshness,
  getLatestFundamentals,
  getOhlcv,
  getShareholding,
  getPortfolioPositions,
  getWatchlistSymbols,
  recordIngestRun,
  recordPredictionOutcome,
  retagUntaggedNews,
  retagSectorNews,
  updateFreshness,
  upsertFundamentals,
  upsertMacro,
  upsertNews,
  upsertOhlcvBatch,
  upsertShareholding,
  aggregateSectorMetrics,
  seedCanonicalSectors,
  upsertSectorSnapshot,
  countSectorNews,
  SEED_TICKERS,
} from '@stock-buddy/db';
import { mergeFundamentals, sanitizeOhlcv, sectorPeBenchmark, detectSectorFromHeadline, enrichFundamentals } from '@stock-buddy/core';
import {
  DEFAULT_MACRO,
  parseDseNewsHtml,
  fetchText,
  fetchMarketNews,
  tagTickerInHeadline,
  createOhlcvRegistry,
  fetchAllFundamentals,
  fetchLankabdDataMatrix,
  fetchDseIndexHistory,
  DSE_INDEX_SYMBOLS,
  DSEScraper,
  type ShareholdingRow,
  type TickerRef,
} from '@stock-buddy/scraper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scraper = new DSEScraper(join(process.env.INGEST_CACHE_DIR ?? tmpdir(), 'stock-buddy-ingest'));

const SEED_NAME_BY_SYMBOL = new Map(SEED_TICKERS.map((t) => [t.symbol, t.name ?? null]));

function enrichTickerRefs(tickers: Array<{ id: number; symbol: string; name?: string | null }>): TickerRef[] {
  return tickers.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name ?? SEED_NAME_BY_SYMBOL.get(t.symbol) ?? null,
  }));
}

function makeNewsTagger(refs: TickerRef[]) {
  return (headline: string, url?: string | null) => tagTickerInHeadline(headline, refs, url);
}

function minOhlcvBarsForWindow(days: number): number {
  if (days <= 60) return 1;
  return 30;
}

function dailyOhlcvDays(): number {
  const n = parseInt(process.env.INGEST_DAILY_OHLCV_DAYS ?? '90', 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** Total OHLCV fetch attempts per symbol (retries + 1); tunable via INGEST_OHLCV_RETRIES. */
function ohlcvFetchAttempts(): number {
  const n = parseInt(process.env.INGEST_OHLCV_RETRIES ?? '2', 10);
  const retries = Number.isFinite(n) && n >= 0 ? n : 2;
  return retries + 1;
}

/** Linear backoff between OHLCV fetch attempts; base tunable via INGEST_OHLCV_RETRY_MS. */
function ohlcvRetryDelayMs(attempt: number): number {
  const base = parseInt(process.env.INGEST_OHLCV_RETRY_MS ?? '750', 10);
  const ms = Number.isFinite(base) && base >= 0 ? base : 750;
  return ms * (attempt + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function portfolioAndWatchlistSymbols(db: Db): Promise<string[]> {
  const symbols = new Set(await getWatchlistSymbols(db));
  const account = await getDefaultAccount(db);
  if (account) {
    const positions = await getPortfolioPositions(db, account.id);
    for (const p of positions) symbols.add(p.symbol);
  }
  return [...symbols];
}

/** Pure check: missing/invalid timestamp or older than maxAgeDays. */
export function isStaleTimestamp(
  lastSuccessAt: Date | string | null | undefined,
  maxAgeDays: number,
  nowMs = Date.now(),
): boolean {
  if (lastSuccessAt == null) return true;
  const t = lastSuccessAt instanceof Date ? lastSuccessAt.getTime() : new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** True when entity has no successful freshness row or last success is older than maxAgeDays. */
export async function isEntityStale(
  db: Db,
  entityType: string,
  tickerId: number,
  maxAgeDays: number,
): Promise<boolean> {
  const rows = await getFreshness(db, tickerId);
  const hit = rows.find((r) => r.entityType === entityType);
  return isStaleTimestamp(hit?.lastSuccessAt ?? null, maxAgeDays);
}

function slowBooksMaxAgeDays(): number {
  const n = parseInt(process.env.INGEST_SLOW_MAX_AGE_DAYS ?? '14', 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function slowBooksMinOhlcvBars(): number {
  const n = parseInt(process.env.INGEST_SLOW_MIN_OHLCV_BARS ?? '240', 10);
  return Number.isFinite(n) && n > 0 ? n : 240;
}

export type SlowBooksResult = {
  symbols: string[];
  fundamentals: Record<string, 'ran' | 'skipped' | 'failed'>;
  shareholding: Record<string, 'ran' | 'skipped' | 'failed'>;
  ohlcv: Record<string, number | 'skipped'>;
};

/**
 * Lean weekly refresh for portfolio ∪ watchlist:
 * fundamentals + shareholding when stale (default >14d), and OHLCV top-up to 365d
 * when bar count is under the momentum floor (~240). Does NOT replace ingest:daily.
 */
export async function ingestSlowBooks(
  db: Db,
  opts: { maxAgeDays?: number; minOhlcvBars?: number; symbols?: string[] } = {},
): Promise<SlowBooksResult> {
  const maxAgeDays = opts.maxAgeDays ?? slowBooksMaxAgeDays();
  const minBars = opts.minOhlcvBars ?? slowBooksMinOhlcvBars();
  const symbols = (opts.symbols ?? (await portfolioAndWatchlistSymbols(db)))
    .map((s) => s.toUpperCase())
    .filter((s) => !(DSE_INDEX_SYMBOLS as readonly string[]).includes(s))
    .sort();

  const result: SlowBooksResult = {
    symbols,
    fundamentals: {},
    shareholding: {},
    ohlcv: {},
  };

  for (const symbol of symbols) {
    const ticker = await ensureTicker(db, symbol);

    const fundStale = await isEntityStale(db, 'fundamentals', ticker.id, maxAgeDays);
    const fundSnap = fundStale ? null : await getLatestFundamentals(db, ticker.id);
    if (fundStale || !fundSnap) {
      try {
        await ingestFundamentals(db, symbol);
        result.fundamentals[symbol] = 'ran';
      } catch (err) {
        console.warn(`[ingest:slow-books] fundamentals failed for ${symbol}:`, err);
        result.fundamentals[symbol] = 'failed';
      }
    } else {
      result.fundamentals[symbol] = 'skipped';
    }

    const shareStale = await isEntityStale(db, 'shareholding', ticker.id, maxAgeDays);
    const shareRows = shareStale ? [] : await getShareholding(db, ticker.id, 1);
    if (shareStale || !shareRows.length) {
      try {
        await ingestShareholding(db, symbol);
        result.shareholding[symbol] = 'ran';
      } catch (err) {
        console.warn(`[ingest:slow-books] shareholding failed for ${symbol}:`, err);
        result.shareholding[symbol] = 'failed';
      }
    } else {
      result.shareholding[symbol] = 'skipped';
    }

    const bars = await getOhlcv(db, ticker.id, { limit: minBars + 20 });
    if (bars.length < minBars) {
      try {
        result.ohlcv[symbol] = await ingestOhlcv(db, symbol, 365);
      } catch (err) {
        console.warn(`[ingest:slow-books] OHLCV top-up failed for ${symbol}:`, err);
        result.ohlcv[symbol] = 0;
      }
    } else {
      result.ohlcv[symbol] = 'skipped';
    }
  }

  return result;
}

/**
 * One-shot bootstrap when a ticker is added to watchlist/portfolio:
 * OHLCV (365d) + fundamentals + shareholding + news + analysis.
 * Safe to fire-and-forget from the dashboard (errors logged, not thrown to client).
 */
export async function bootstrapTickerOnAdd(db: Db, symbol: string, days = 365): Promise<void> {
  const sym = symbol.toUpperCase();
  if ((DSE_INDEX_SYMBOLS as readonly string[]).includes(sym)) return;
  console.log(`[ingest:on-add] bootstrapping ${sym}...`);
  await ingestAll(db, sym, days);
  console.log(`[ingest:on-add] done ${sym}`);
}

export async function ingestOhlcv(db: Db, symbol: string, days = 365): Promise<number> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);
  const minBars = minOhlcvBarsForWindow(days);

  // Indexes are not on day_end_archive — route to the market-information archive.
  const symUpper = symbol.toUpperCase();
  if ((DSE_INDEX_SYMBOLS as readonly string[]).includes(symUpper)) {
    const series = await fetchDseIndexHistory(days);
    const rows = series[symUpper as (typeof DSE_INDEX_SYMBOLS)[number]] ?? [];
    if (!rows.length) {
      await recordIngestRun(db, {
        jobName: 'ingest_ohlcv',
        tickerId: ticker.id,
        status: 'failed',
        errorMessage: 'No index OHLCV from dse-index-archive',
        startedAt: started,
      });
      await updateFreshness(db, 'ohlcv', ticker.id, false, 24);
      return 0;
    }
    const mapped = rows.map((r) => ({
      tradeDate: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: 'dse-index-archive',
    }));
    const count = await upsertOhlcvBatch(db, ticker.id, mapped);
    await recordIngestRun(db, {
      jobName: 'ingest_ohlcv',
      tickerId: ticker.id,
      status: 'ok',
      rowsUpserted: count,
      source: 'dse-index-archive',
      startedAt: started,
    });
    await updateFreshness(db, 'ohlcv', ticker.id, true, 24);
    return count;
  }

  type Candidate = { rows: Awaited<ReturnType<typeof scraper.getHistoricalData>>; source: string };

  // Transient dsebd.org failures (rate-limit/timeout) during the daily loop surface as an
  // empty fetch for a symbol that actually has data — a single miss otherwise forces a full
  // manual rerun of all symbols. Retry with backoff, keeping the best result across attempts,
  // before recording failure. Genuinely empty symbols (e.g. suspended instruments) still fail
  // after the retries, which is the correct outcome.
  const attempts = ohlcvFetchAttempts();
  let rows: Candidate['rows'] = [];
  let source = 'dse';
  let bestCount = 0;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidates: Candidate[] = [];
    for (const src of createOhlcvRegistry()) {
      try {
        const fetched = await src.fetch(symbol, days);
        if (fetched.length) candidates.push({ rows: fetched, source: src.id });
      } catch (err) {
        console.warn(`[ingest] OHLCV source ${src.id} failed for ${symbol}:`, err);
      }
    }

    for (const c of candidates) {
      const { bars } = sanitizeOhlcv(c.rows);
      if (bars.length > bestCount) {
        bestCount = bars.length;
        rows = bars;
        source = c.source;
      }
    }

    if (bestCount >= minBars) break;
    if (attempt < attempts - 1) await sleep(ohlcvRetryDelayMs(attempt));
  }

  if (rows.length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_ohlcv',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No OHLCV data from enabled sources',
      startedAt: started,
    });
    await updateFreshness(db, 'ohlcv', ticker.id, false, 24);
    return 0;
  }

  if (rows.length < minBars) {
    await recordIngestRun(db, {
      jobName: 'ingest_ohlcv',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: `Only ${rows.length} plausible bars after sanitization (need ${minBars}, source=${source}, days=${days})`,
      startedAt: started,
    });
    await updateFreshness(db, 'ohlcv', ticker.id, false, 24);
    return 0;
  }

  const batch = rows.map((r) => ({
    tradeDate: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    source,
  }));

  const count = await upsertOhlcvBatch(db, ticker.id, batch);
  await recordIngestRun(db, {
    jobName: 'ingest_ohlcv',
    tickerId: ticker.id,
    status: 'ok',
    rowsUpserted: count,
    source,
    startedAt: started,
  });
  await updateFreshness(db, 'ohlcv', ticker.id, true, 24);
  return count;
}

export async function ingestFundamentals(db: Db, symbol: string): Promise<void> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);
  const asOf = new Date().toISOString().slice(0, 10);

  const fetched = await fetchAllFundamentals(symbol);
  const { payload, compositeSource } = mergeFundamentals(fetched);

  if (Object.keys(payload).filter((k) => !k.startsWith('_')).length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_fundamentals',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No fundamentals parsed from enabled sources',
      startedAt: started,
    });
    await updateFreshness(db, 'fundamentals', ticker.id, false, 168);
    return;
  }

  const priorSnap = await getLatestFundamentals(db, ticker.id);
  const priorInv = priorSnap?.payload?.inventory_turnover;
  if (priorInv != null && payload.inventory_turnover != null) {
    payload.inventory_turnover_prev = priorInv;
  }

  const shareRows = await getShareholding(db, ticker.id, 4);
  const shareholding = shareRows.map((r) => ({
    month: String(r.month).slice(0, 7),
    sponsor: r.sponsor ?? undefined,
    institution: r.institution ?? undefined,
  }));
  const ohlcvRows = await getOhlcv(db, ticker.id, { limit: 5 });
  const enriched = enrichFundamentals({
    fundamentals: payload,
    shareholding,
    ohlcv: ohlcvRows.map((r) => ({ close: r.close })),
  });

  await upsertFundamentals(db, ticker.id, asOf, enriched, compositeSource);
  await recordIngestRun(db, {
    jobName: 'ingest_fundamentals',
    tickerId: ticker.id,
    status: 'ok',
    rowsUpserted: 1,
    source: compositeSource,
    startedAt: started,
  });
  await updateFreshness(db, 'fundamentals', ticker.id, true, 168);
}

/** Bulk fundamentals from LankaBangla DataMatrix (one fetch, all tickers). */
export async function ingestFundamentalsUniverse(db: Db): Promise<number> {
  const started = new Date();
  const asOf = new Date().toISOString().slice(0, 10);
  const grid = await fetchLankabdDataMatrix();

  if (grid.size === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_fundamentals_universe',
      status: 'failed',
      errorMessage: 'Lankabd DataMatrix empty or unreachable',
      startedAt: started,
    });
    return 0;
  }

  let count = 0;
  for (const [symbol, raw] of grid) {
    const ticker = await ensureTicker(db, symbol);
    const payload: Record<string, unknown> = {
      ...raw,
      _field_sources: Object.fromEntries(
        Object.keys(raw).filter((k) => !k.startsWith('_')).map((k) => [k, 'lankabd']),
      ),
      _sources: ['lankabd'],
    };
    await upsertFundamentals(db, ticker.id, asOf, payload, 'lankabd');
    count++;
  }

  await recordIngestRun(db, {
    jobName: 'ingest_fundamentals_universe',
    status: 'ok',
    rowsUpserted: count,
    source: 'lankabd',
    startedAt: started,
  });
  return count;
}

export async function ingestShareholding(db: Db, symbol: string): Promise<number> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);
  const dseData = await scraper.fetchFundamentalsAndShareholding(symbol);
  const rows = (dseData.shareholding as ShareholdingRow[] | undefined) ?? [];

  if (rows.length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_shareholding',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No shareholding rows',
      startedAt: started,
    });
    await updateFreshness(db, 'shareholding', ticker.id, false, 720);
    return 0;
  }

  for (const row of rows) {
    await upsertShareholding(db, ticker.id, row.month, row);
  }

  await recordIngestRun(db, {
    jobName: 'ingest_shareholding',
    tickerId: ticker.id,
    status: 'ok',
    rowsUpserted: rows.length,
    source: 'dse',
    startedAt: started,
  });
  await updateFreshness(db, 'shareholding', ticker.id, true, 720);
  return rows.length;
}

export async function ingestMacro(db: Db): Promise<void> {
  const started = new Date();
  const asOf = new Date().toISOString().slice(0, 10);

  let payload: Record<string, unknown> = { ...DEFAULT_MACRO };
  let source = 'seed';

  try {
    const { fetchBangladeshBankMacro } = await import('@stock-buddy/scraper');
    const bb = await fetchBangladeshBankMacro();
    if (bb.inflation != null) {
      payload.inflation = bb.inflation;
      source = 'bangladesh_bank';
      if (bb.inflation_month) payload.inflation_as_of = bb.inflation_month;
    }
  } catch (err) {
    console.warn('[ingest] Bangladesh Bank macro fetch failed:', err);
  }

  await upsertMacro(db, asOf, payload, source);
  await recordIngestRun(db, {
    jobName: 'ingest_macro',
    status: 'ok',
    rowsUpserted: 1,
    source,
    startedAt: started,
  });
  await updateFreshness(db, 'macro', null, true, 168);
}

export async function ingestSectorSnapshots(db: Db): Promise<number> {
  const started = new Date();
  const asOf = new Date().toISOString().slice(0, 10);

  try {
    await seedCanonicalSectors(db);
  } catch (err) {
    console.warn('[ingest] sector seed skipped:', err);
  }

  const aggregates = await aggregateSectorMetrics(db);
  let upserted = 0;

  for (const row of aggregates) {
    const newsCount = await countSectorNews(db, row.sector_display, 7);
    const peBenchmark = sectorPeBenchmark(row.sector_display);
    const metricsJson: Record<string, unknown> = {
      sector_display: row.sector_display,
      ticker_count: row.ticker_count,
      median_roc_1m_pct: row.median_roc_1m_pct,
      median_roc_3m_pct: row.median_roc_3m_pct,
      avg_pe: row.avg_pe,
      sector_pe_benchmark: peBenchmark,
      pe_vs_benchmark:
        row.avg_pe != null && peBenchmark > 0
          ? Math.round(((row.avg_pe - peBenchmark) / peBenchmark) * 100)
          : null,
      top_performer: row.top_performer,
      top_roc_1m_pct: row.top_roc_1m_pct,
      bottom_performer: row.bottom_performer,
      bottom_roc_1m_pct: row.bottom_roc_1m_pct,
    };
    const newsSummaryJson = { news_count_7d: newsCount };

    await upsertSectorSnapshot(db, row.sector_slug, asOf, metricsJson, newsSummaryJson, 'aggregate');
    upserted++;
  }

  await recordIngestRun(db, {
    jobName: 'ingest_sector_snapshots',
    status: upserted > 0 ? 'ok' : 'failed',
    rowsUpserted: upserted,
    source: 'aggregate',
    errorMessage: upserted > 0 ? undefined : 'No sector aggregates computed',
    startedAt: started,
  });
  await updateFreshness(db, 'sector_snapshots', null, upserted > 0, 24);
  return upserted;
}

export async function ingestNewsMarket(db: Db): Promise<number> {
  const started = new Date();
  const { listTickers } = await import('@stock-buddy/db');
  const tickers = await listTickers(db);
  const refs = enrichTickerRefs(tickers);
  const tag = makeNewsTagger(refs);

  let rows: Awaited<ReturnType<typeof fetchMarketNews>> = [];
  try {
    rows = await fetchMarketNews(30);
  } catch (err) {
    console.warn('[ingest] market news fetch failed:', err);
  }

  const payload = rows.map((i) => ({
    tickerId: tag(i.headline, i.url),
    publishedDate: i.date,
    headline: i.headline,
    source: i.source,
    category: i.category,
    url: i.url,
    sectorTag: detectSectorFromHeadline(i.headline) ?? undefined,
  }));

  const { inserted } = await upsertNews(db, payload);
  const retagged = await retagUntaggedNews(db, tag);

  await recordIngestRun(db, {
    jobName: 'ingest_news_market',
    status: inserted > 0 || retagged > 0 ? 'ok' : 'failed',
    rowsUpserted: inserted + retagged,
    source: 'multi',
    errorMessage: inserted + retagged > 0 ? undefined : 'No new market news rows',
    startedAt: started,
  });
  await updateFreshness(db, 'news', null, inserted + retagged > 0, 24);
  return inserted + retagged;
}

export async function ingestRetagNews(db: Db): Promise<number> {
  const started = new Date();
  const { listTickers } = await import('@stock-buddy/db');
  const refs = enrichTickerRefs(await listTickers(db));
  const tag = makeNewsTagger(refs);
  const tickerTagged = await retagUntaggedNews(db, tag, 2000);
  const sectorTagged = await retagSectorNews(db, 2000);
  const updated = tickerTagged + sectorTagged;
  await recordIngestRun(db, {
    jobName: 'ingest_retag_news',
    status: updated > 0 ? 'ok' : 'failed',
    rowsUpserted: updated,
    source: 'multi',
    errorMessage: updated > 0 ? undefined : 'No untagged news matched',
    startedAt: started,
  });
  return updated;
}

export async function ingestNews(db: Db, symbol: string): Promise<number> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);
  const html = await fetchText(`https://www.dsebd.org/displayCompany.php?name=${symbol}`);

  const items = html ? parseDseNewsHtml(html) : [];

  if (items.length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_news',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No DSE company news parsed',
      startedAt: started,
    });
    return 0;
  }

  const { inserted } = await upsertNews(
    db,
    items.map((i) => ({
      tickerId: ticker.id,
      publishedDate: i.date,
      headline: i.headline,
      source: i.source,
      category: i.category,
      url: i.url,
    })),
  );

  await recordIngestRun(db, {
    jobName: 'ingest_news',
    tickerId: ticker.id,
    status: 'ok',
    rowsUpserted: inserted,
    source: 'dse',
    startedAt: started,
  });
  await updateFreshness(db, 'news', ticker.id, true, 24);
  return inserted;
}

export async function ingestAll(db: Db, symbol: string, days = 365): Promise<void> {
  await ingestOhlcv(db, symbol, days);
  await ingestFundamentals(db, symbol);
  await ingestShareholding(db, symbol);
  await ingestNews(db, symbol);
  const { ingestAnalysis } = await import('./analysis.js');
  await ingestAnalysis(db, symbol);
}

export async function ingestWatchlist(db: Db, days = 365): Promise<void> {
  const symbols = await getWatchlistSymbols(db);
  await ingestMacro(db);
  await ingestNewsMarket(db);
  for (const symbol of symbols) {
    await ingestAll(db, symbol, days);
  }
}

/**
 * Fetch DSEX / DSES / DS30 from the DSE market-information archive (one POST
 * covers all three). Equity OHLCV sources return 0 for index symbols.
 */
export async function ingestMarketIndexes(
  db: Db,
  days = 365,
): Promise<Record<string, number>> {
  const started = new Date();
  const series = await fetchDseIndexHistory(days);
  const result: Record<string, number> = {};
  let total = 0;
  for (const symbol of DSE_INDEX_SYMBOLS) {
    const rows = series[symbol] ?? [];
    const ticker = await ensureTicker(db, symbol);
    if (!rows.length) {
      result[symbol] = 0;
      continue;
    }
    const mapped = rows.map((r) => ({
      tradeDate: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: 'dse-index-archive',
    }));
    const n = await upsertOhlcvBatch(db, ticker.id, mapped);
    await updateFreshness(db, 'ohlcv', ticker.id, true, 24);
    result[symbol] = n;
    total += n;
  }
  await recordIngestRun(db, {
    jobName: 'ingest_market_indexes',
    status: total > 0 ? 'ok' : 'failed',
    rowsUpserted: total,
    source: 'dse-index-archive',
    startedAt: started,
    ...(total === 0 ? { errorMessage: 'No index bars from dse-index-archive' } : {}),
  });
  return result;
}

/**
 * Pre-market refresh: macro, market news, OHLCV, then the analysis pipeline for
 * portfolio + watchlist symbols. Set `opts.analysis = false` for a data-only run
 * (skips the per-symbol analysis snapshots).
 */
export async function ingestDaily(
  db: Db,
  opts: { analysis?: boolean } = {},
): Promise<{
  news_rows: number;
  retagged_news: number;
  ohlcv: Record<string, number>;
  analysis: Record<string, number>;
  symbols: string[];
  indexes: Record<string, number>;
}> {
  const started = new Date();
  const runAnalysis = opts.analysis ?? true;
  const days = dailyOhlcvDays();
  const symbols = await portfolioAndWatchlistSymbols(db);

  await ingestMacro(db);
  const newsRows = await ingestNewsMarket(db);
  // Indexes: top up ~max(daily window, 90d) each daily run so relative-strength
  // never goes stale. Full 365d catch-up is `npm run ingest -- --job indexes --days 365`.
  let indexes: Record<string, number> = {};
  try {
    indexes = await ingestMarketIndexes(db, Math.max(days, 90));
  } catch (err) {
    console.warn('[ingest:daily] market indexes skipped:', err);
  }
  try {
    await ingestSectorSnapshots(db);
  } catch (err) {
    console.warn('[ingest:daily] sector snapshots skipped:', err);
  }
  let retagged = 0;
  try {
    retagged = await ingestRetagNews(db);
  } catch (err) {
    console.warn('[ingest:daily] retag-news skipped:', err);
  }

  const ohlcv: Record<string, number> = {};
  for (const symbol of symbols) {
    try {
      ohlcv[symbol] = await ingestOhlcv(db, symbol, days);
    } catch (err) {
      console.warn(`[ingest:daily] OHLCV failed for ${symbol}:`, err);
      ohlcv[symbol] = 0;
    }
  }

  const ohlcvTotal = Object.values(ohlcv).reduce((s, n) => s + n, 0);

  // Analysis snapshots for the same portfolio + watchlist set, using the fresh
  // OHLCV just ingested. Per-symbol try/catch mirrors the OHLCV loop: a single
  // failing symbol does not abort the run (0 = failed/not persisted).
  const analysis: Record<string, number> = {};
  if (runAnalysis) {
    const { ingestAnalysis } = await import('./analysis.js');
    for (const symbol of symbols) {
      try {
        analysis[symbol] = await ingestAnalysis(db, symbol);
      } catch (err) {
        console.warn(`[ingest:daily] analysis failed for ${symbol}:`, err);
        analysis[symbol] = 0;
      }
    }
  }

  try {
    const { maybeRefreshSectorInsightsOnDaily } = await import('./sector-insights-llm.js');
    await maybeRefreshSectorInsightsOnDaily(db);
  } catch (err) {
    console.warn('[ingest:daily] sector LLM insights skipped:', err);
  }
  await recordIngestRun(db, {
    jobName: 'ingest_daily',
    status: 'ok',
    rowsUpserted: newsRows + ohlcvTotal,
    source: 'multi',
    startedAt: started,
  });

  return { news_rows: newsRows, retagged_news: retagged, ohlcv, analysis, symbols, indexes };
}

/** REQ-012: record snapshot outcomes when future prices are available. */
export async function trackPredictionOutcomes(db: Db): Promise<number> {
  const { analysisSnapshots, predictionOutcomes, tickers } = await import('@stock-buddy/db');
  const { eq, and } = await import('drizzle-orm');

  const snaps = await db
    .select({
      id: analysisSnapshots.id,
      tickerId: analysisSnapshots.tickerId,
      asOf: analysisSnapshots.asOf,
      payload: analysisSnapshots.payload,
      symbol: tickers.symbol,
    })
    .from(analysisSnapshots)
    .innerJoin(tickers, eq(analysisSnapshots.tickerId, tickers.id))
    .orderBy(analysisSnapshots.createdAt)
    .limit(50);

  let recorded = 0;
  for (const snap of snaps) {
    const payload = snap.payload as Record<string, unknown>;
    const syn = payload.synthesis as Record<string, unknown> | undefined;
    const inv = syn?.investment as Record<string, unknown> | undefined;
    const rating = String(inv?.rating ?? payload.risk ?? 'unknown');
    const ohlcv = await getOhlcv(db, snap.tickerId, { limit: 30 });
    if (ohlcv.length < 2) continue;
    const base = ohlcv.find((b) => b.tradeDate >= snap.asOf)?.close ?? ohlcv[0]?.close;
    const last = ohlcv[ohlcv.length - 1]?.close;
    if (base == null || last == null) continue;
    const ret1w = ((last - base) / base) * 100;

    const existing = await db
      .select({ id: predictionOutcomes.id })
      .from(predictionOutcomes)
      .where(and(eq(predictionOutcomes.snapshotId, snap.id)))
      .limit(1);
    if (existing.length) continue;

    await recordPredictionOutcome(db, {
      tickerId: snap.tickerId,
      signalDate: snap.asOf,
      predictedAction: rating,
      predictedRating: rating,
      snapshotId: snap.id,
      agentName: 'signal_synthesizer',
      actualReturn1w: ret1w,
    });
    recorded++;
  }
  return recorded;
}
