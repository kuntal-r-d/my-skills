#!/usr/bin/env node
/** Simple scheduler: run OHLCV ingest daily, full watchlist weekly. */
import { createDb, closeDb, loadEnv } from '@stock-buddy/db';
import { ingestWatchlist, ingestOhlcv, ingestMacro } from './jobs.js';
import { getWatchlistSymbols } from '@stock-buddy/db';

loadEnv();

const OHLCV_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FULL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function runDaily(): Promise<void> {
  const db = createDb();
  try {
    console.log(`[${new Date().toISOString()}] Daily ingest starting`);
    await ingestMacro(db);
    const symbols = await getWatchlistSymbols(db);
    for (const symbol of symbols) {
      try {
        const n = await ingestOhlcv(db, symbol, 30);
        console.log(`  ${symbol}: ${n} OHLCV rows`);
      } catch (e) {
        console.error(`  ${symbol} failed:`, e);
      }
    }
  } finally {
    await closeDb(db);
  }
}

async function runWeekly(): Promise<void> {
  const db = createDb();
  try {
    console.log(`[${new Date().toISOString()}] Weekly full ingest starting`);
    await ingestWatchlist(db, 365);
  } finally {
    await closeDb(db);
  }
}

console.log('Stock Buddy ingest worker started');
void runDaily();
setInterval(() => void runDaily(), OHLCV_INTERVAL_MS);
setInterval(() => void runWeekly(), FULL_INTERVAL_MS);
