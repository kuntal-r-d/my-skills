import type { Db } from '@stock-buddy/db';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureTicker,
  recordIngestRun,
  updateFreshness,
  upsertFundamentals,
  upsertMacro,
  upsertNews,
  upsertOhlcvBatch,
  upsertShareholding,
} from '@stock-buddy/db';
import {
  DSEScraper,
  DEFAULT_MACRO,
  fetchStockAnalysisFundamentals,
  fetchYahooOhlcv,
  parseDseNewsHtml,
  fetchText,
  type ShareholdingRow,
} from '@stock-buddy/scraper';

const scraper = new DSEScraper(join(process.env.INGEST_CACHE_DIR ?? tmpdir(), 'stock-buddy-ingest'));

export async function ingestOhlcv(db: Db, symbol: string, days = 365): Promise<number> {
  const started = new Date();
  const ticker = await ensureTicker(db, symbol);

  let rows = await scraper.getHistoricalData(symbol, days);
  let source = 'dse';

  if (rows.length < 30) {
    rows = await fetchYahooOhlcv(symbol, 'DHA', days > 365 ? '2y' : '1y');
    source = 'yahoo';
  }

  if (rows.length < 30) {
    const { fetchStockAnalysisOhlcv } = await import('@stock-buddy/scraper');
    rows = await fetchStockAnalysisOhlcv(symbol);
    source = 'stockanalysis';
  }

  if (rows.length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_ohlcv',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No OHLCV data from DSE or Yahoo',
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

  let payload: Record<string, unknown> = {};
  let source = 'dse';

  const dseData = await scraper.fetchFundamentalsAndShareholding(symbol);
  if (dseData && Object.keys(dseData).length > 0) {
    const { shareholding: _s, ...fund } = dseData;
    payload = fund;
  }

  if (!payload.pe && !payload.eps_ttm) {
    const sa = await fetchStockAnalysisFundamentals(symbol);
    if (Object.keys(sa).length > 0) {
      payload = { ...payload, ...sa };
      source = 'stockanalysis';
    }
  }

  if (Object.keys(payload).length === 0) {
    await recordIngestRun(db, {
      jobName: 'ingest_fundamentals',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: 'No fundamentals parsed',
      startedAt: started,
    });
    await updateFreshness(db, 'fundamentals', ticker.id, false, 168);
    return;
  }

  await upsertFundamentals(db, ticker.id, asOf, payload, source);
  await recordIngestRun(db, {
    jobName: 'ingest_fundamentals',
    tickerId: ticker.id,
    status: 'ok',
    rowsUpserted: 1,
    source,
    startedAt: started,
  });
  await updateFreshness(db, 'fundamentals', ticker.id, true, 168);
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
}

export async function ingestWatchlist(db: Db, days = 365): Promise<void> {
  const { getWatchlistSymbols } = await import('@stock-buddy/db');
  const symbols = await getWatchlistSymbols(db);
  await ingestMacro(db);
  for (const symbol of symbols) {
    await ingestAll(db, symbol, days);
  }
}
