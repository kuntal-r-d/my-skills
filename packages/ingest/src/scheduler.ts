#!/usr/bin/env node
/** Scheduler: lean daily ingest + weekly slow-books (fundamentals/shareholding/OHLCV top-up). */
import { createDb, closeDb, loadEnv } from '@stock-buddy/db';
import { ingestDaily, ingestSlowBooks } from './jobs.js';

loadEnv();

const OHLCV_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FULL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function runDaily(): Promise<void> {
  const db = createDb();
  try {
    console.log(`[${new Date().toISOString()}] Daily ingest starting`);
    const result = await ingestDaily(db);
    console.log(`  news: ${result.news_rows} rows, symbols: ${result.symbols.join(', ') || '(none)'}`);
  } finally {
    await closeDb(db);
  }
}

async function runWeekly(): Promise<void> {
  const db = createDb();
  try {
    console.log(`[${new Date().toISOString()}] Weekly slow-books starting`);
    const result = await ingestSlowBooks(db);
    const fundRan = Object.values(result.fundamentals).filter((v) => v === 'ran').length;
    const shareRan = Object.values(result.shareholding).filter((v) => v === 'ran').length;
    const ohlcvRan = Object.values(result.ohlcv).filter((v) => typeof v === 'number').length;
    console.log(
      `  symbols=${result.symbols.length} fund_ran=${fundRan} share_ran=${shareRan} ohlcv_topup=${ohlcvRan}`,
    );
  } finally {
    await closeDb(db);
  }
}

function schedule(label: string, fn: () => Promise<void>): void {
  void fn().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] ${label} failed: ${msg}`);
  });
}

console.log('Stock Buddy ingest worker started');
schedule('daily', runDaily);
setInterval(() => schedule('daily', runDaily), OHLCV_INTERVAL_MS);
setInterval(() => schedule('weekly', runWeekly), FULL_INTERVAL_MS);
