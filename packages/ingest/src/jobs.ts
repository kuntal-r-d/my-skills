import type { Db } from '@stock-buddy/db';
import {
  ensureTicker,
  getOhlcv,
  recordIngestRun,
  recordPredictionOutcome,
  updateFreshness,
  upsertFundamentals,
  upsertMacro,
  upsertNews,
  upsertOhlcvBatch,
  upsertShareholding,
} from '@stock-buddy/db';
import { mergeFundamentals, sanitizeOhlcv } from '@stock-buddy/core';
import {
  DEFAULT_MACRO,
  parseDseNewsHtml,
  fetchText,
  createOhlcvRegistry,
  fetchAllFundamentals,
  fetchLankabdDataMatrix,
  DSEScraper,
  type ShareholdingRow,
} from '@stock-buddy/scraper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scraper = new DSEScraper(join(process.env.INGEST_CACHE_DIR ?? tmpdir(), 'stock-buddy-ingest'));

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

  if (rows.length < 30) {
    await recordIngestRun(db, {
      jobName: 'ingest_ohlcv',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: `Only ${rows.length} plausible bars after sanitization (source=${source})`,
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
  await upsertMacro(db, asOf, DEFAULT_MACRO, 'seed');
  await recordIngestRun(db, {
    jobName: 'ingest_macro',
    status: 'ok',
    rowsUpserted: 1,
    source: 'seed',
    startedAt: started,
  });
  await updateFreshness(db, 'macro', null, true, 168);
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
      errorMessage: 'No news parsed',
      startedAt: started,
    });
    return 0;
  }

  await upsertNews(
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
    rowsUpserted: items.length,
    source: 'dse',
    startedAt: started,
  });
  await updateFreshness(db, 'news', ticker.id, true, 24);
  return items.length;
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
  const { getWatchlistSymbols } = await import('@stock-buddy/db');
  const symbols = await getWatchlistSymbols(db);
  await ingestMacro(db);
  for (const symbol of symbols) {
    await ingestAll(db, symbol, days);
  }
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
