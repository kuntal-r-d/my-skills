#!/usr/bin/env node
/**
 * Import the watchlist from scripts/watchlist.json (the durable source of truth) into the DB.
 * Symbols are added EXACTLY (via ensureTicker's exact-match-or-create) — never fuzzy-collapsed.
 * Usage:
 *   node scripts/import-watchlist.mjs              # additive upsert (updates cadence)
 *   node scripts/import-watchlist.mjs --replace    # wipe the whole DB watchlist first, then load
 *   node scripts/import-watchlist.mjs --bootstrap  # after import, run ingestAll for newly added symbols
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = process.argv.find((a) => a.endsWith('.json')) ?? join(repoRoot, 'scripts/watchlist.json');
const replace = process.argv.includes('--replace');
const bootstrap = process.argv.includes('--bootstrap');

const { loadEnv, createDb, closeDb, ensureTicker, addToWatchlist, clearWatchlist, getWatchlistSymbols } =
  await import('@stock-buddy/db');

loadEnv();
const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
const entries = data.watchlist ?? [];
const db = createDb();

try {
  const beforeSymbols = new Set(await getWatchlistSymbols(db));
  const before = beforeSymbols.size;
  if (replace) {
    await clearWatchlist(db);
    console.log(`Cleared existing watchlist (${before} entries).`);
  }
  let n = 0;
  const touched = new Set();
  for (const e of entries) {
    const ticker = String(e.ticker ?? '').toUpperCase();
    if (!ticker) continue;
    const purpose = e.purpose === 'investment' ? 'investment' : 'trading';
    const cadence = ['daily', 'weekly', 'monthly'].includes(e.cadence) ? e.cadence : null;
    const t = await ensureTicker(db, ticker);
    await addToWatchlist(db, t.id, purpose, cadence);
    touched.add(ticker);
    n++;
  }
  const after = (await getWatchlistSymbols(db)).length;
  console.log(`Imported ${n} watchlist entr(ies) from ${jsonPath}. Watchlist size: ${before} -> ${after}.`);

  if (bootstrap) {
    const { bootstrapTickerOnAdd } = await import('@stock-buddy/ingest');
    const targets = [...touched].filter((s) => replace || !beforeSymbols.has(s)).sort();
    console.log(`Bootstrapping ${targets.length} symbol(s)${replace ? ' (--replace → all imported)' : ' (newly added only)'}...`);
    for (const sym of targets) {
      try {
        await bootstrapTickerOnAdd(db, sym);
      } catch (err) {
        console.warn(`  bootstrap failed for ${sym}:`, err);
      }
    }
  }
} finally {
  await closeDb(db);
}
