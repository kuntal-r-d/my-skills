import type { Db } from '@stock-buddy/db';
import {
  ensureTicker,
  getDefaultAccount,
  getOhlcv,
  getPortfolioPositions,
  getWatchlistSymbols,
  recordIngestRun,
  recordPredictionOutcome,
  retagUntaggedNews,
  updateFreshness,
  upsertFundamentals,
  upsertMacro,
  upsertNews,
  upsertOhlcvBatch,
  upsertShareholding,
  SEED_TICKERS,
} from '@stock-buddy/db';
import { mergeFundamentals, sanitizeOhlcv } from '@stock-buddy/core';
import {
  DEFAULT_MACRO,
  parseDseNewsHtml,
  fetchText,
  fetchMarketNews,
  tagTickerInHeadline,
  createOhlcvRegistry,
  fetchAllFundamentals,
  fetchLankabdDataMatrix,
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

async function portfolioAndWatchlistSymbols(db: Db): Promise<string[]> {
  const symbols = new Set(await getWatchlistSymbols(db));
  const account = await getDefaultAccount(db);
  if (account) {
    const positions = await getPortfolioPositions(db, account.id);
    for (const p of positions) symbols.add(p.symbol);
  }
  return [...symbols];
}

export async function ingestOhlcv(db: Db, symbol: string, days = 365): Promise<number> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);
  const registry = createOhlcvRegistry();

  type Candidate = { rows: Awaited<ReturnType<typeof scraper.getHistoricalData>>; source: string };
  const candidates: Candidate[] = [];

  for (const source of registry) {
    try {
      const rows = await source.fetch(symbol, days);
      if (rows.length) candidates.push({ rows, source: source.id });
    } catch (err) {
      console.warn(`[ingest] OHLCV source ${source.id} failed for ${symbol}:`, err);
    }
  }

  let rows: Candidate['rows'] = [];
  let source = 'dse';
  let bestCount = 0;

  for (const c of candidates) {
    const { bars } = sanitizeOhlcv(c.rows);
    if (bars.length > bestCount) {
      bestCount = bars.length;
      rows = bars;
      source = c.source;
    }
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

  const minBars = minOhlcvBarsForWindow(days);
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

  await upsertFundamentals(db, ticker.id, asOf, payload, compositeSource);
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
  const updated = await retagUntaggedNews(db, tag, 2000);
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

/** Pre-market refresh: macro, market news, OHLCV for portfolio + watchlist symbols. */
export async function ingestDaily(db: Db): Promise<{
  news_rows: number;
  retagged_news: number;
  ohlcv: Record<string, number>;
  symbols: string[];
}> {
  const started = new Date();
  const days = dailyOhlcvDays();
  const symbols = await portfolioAndWatchlistSymbols(db);

  await ingestMacro(db);
  const newsRows = await ingestNewsMarket(db);
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
  await recordIngestRun(db, {
    jobName: 'ingest_daily',
    status: 'ok',
    rowsUpserted: newsRows + ohlcvTotal,
    source: 'multi',
    startedAt: started,
  });

  return { news_rows: newsRows, retagged_news: retagged, ohlcv, symbols };
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
