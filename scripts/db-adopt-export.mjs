#!/usr/bin/env node
/**
 * Copy rows from a loose Postgres→SQLite export into a migrated Stock Buddy SQLite DB.
 *
 * Usage:
 *   node scripts/db-adopt-export.mjs [exportPath] [destPath]
 *
 * Defaults:
 *   export: data/stockbuddy.export.sqlite (or data/stockbuddy.sqlite if export missing)
 *   dest:   DATABASE_URL / file:data/stockbuddy.sqlite
 *
 * Dest must already be migrated (npm run db:migrate). This script replaces table data.
 */
import { existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const TIMESTAMP_COLS = new Set([
  'created_at',
  'updated_at',
  'ingested_at',
  'started_at',
  'finished_at',
  'last_success_at',
  'last_attempt_at',
  'added_at',
  'fetched_at',
]);

const BOOL_COLS = new Set(['is_active']);

/** Parents first for FK order. */
const TABLE_ORDER = [
  'tickers',
  'portfolio_accounts',
  'sectors',
  'ohlcv_daily',
  'fundamentals_snapshots',
  'shareholding_monthly',
  'macro_snapshots',
  'sector_snapshots',
  'news_items',
  'portfolio_positions',
  'portfolio_lots',
  'ingest_runs',
  'data_freshness',
  'watchlist_tickers',
  'analysis_snapshots',
  'research_memos',
  'research_sources',
  'skill_overrides',
  'prediction_outcomes',
];

function resolveDestPath() {
  const raw = (process.env.DATABASE_URL ?? process.env.DATABASE_PATH ?? 'file:data/stockbuddy.sqlite').trim();
  let path = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  if (path.startsWith('///')) path = path.slice(2);
  return resolve(root, path);
}

function toMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  let s = String(value).trim();
  // Export sometimes stored JSON-stringified dates: "\"2026-01-01T00:00:00.000Z\""
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

function transformCell(col, value) {
  if (TIMESTAMP_COLS.has(col)) return toMs(value);
  if (BOOL_COLS.has(col)) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value == null) return null;
    return Number(value) ? 1 : 0;
  }
  return value;
}

const exportArg = process.argv[2];
const destArg = process.argv[3];

let exportPath = exportArg
  ? resolve(root, exportArg)
  : resolve(root, 'data/stockbuddy.export.sqlite');

if (!exportArg && !existsSync(exportPath)) {
  const legacy = resolve(root, 'data/stockbuddy.sqlite');
  if (existsSync(legacy)) exportPath = legacy;
}

const destPath = destArg ? resolve(root, destArg) : resolveDestPath();

if (!existsSync(exportPath)) {
  console.error(`Export not found: ${exportPath}`);
  process.exit(1);
}

if (exportPath === destPath) {
  const backup = resolve(root, 'data/stockbuddy.export.sqlite');
  console.log(`Moving live DB aside → ${backup}`);
  if (existsSync(backup)) {
    console.error(`Backup already exists: ${backup}. Move/delete it first.`);
    process.exit(1);
  }
  renameSync(exportPath, backup);
  exportPath = backup;
  console.error(
    'Dest was the same as export. After migrate, re-run:\n' +
      '  npm run db:migrate && npm run db:adopt-export',
  );
  process.exit(2);
}

if (!existsSync(destPath)) {
  console.error(`Dest DB missing (run migrate first): ${destPath}`);
  process.exit(1);
}

const src = new Database(exportPath, { readonly: true });
const dest = new Database(destPath);
dest.pragma('foreign_keys = OFF');
dest.pragma('journal_mode = WAL');

try {
  console.log(`Adopting ${exportPath} → ${destPath}`);

  const clear = dest.transaction(() => {
    for (const table of [...TABLE_ORDER].reverse()) {
      dest.prepare(`DELETE FROM "${table}"`).run();
    }
  });
  clear();

  for (const table of TABLE_ORDER) {
    const present = src.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (!present) {
      console.warn(`skip missing export table: ${table}`);
      continue;
    }

    const destCols = dest.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    const srcCols = src.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    const cols = destCols.filter((c) => srcCols.includes(c));
    if (!cols.length) {
      console.warn(`skip ${table}: no overlapping columns`);
      continue;
    }

    const rows = src.prepare(`SELECT * FROM "${table}"`).all();
    if (!rows.length) {
      console.log(`${table}: 0`);
      continue;
    }

    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const insert = dest.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);

    const insertMany = dest.transaction((batch) => {
      for (const row of batch) {
        insert.run(...cols.map((c) => transformCell(c, row[c])));
      }
    });

    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      insertMany(rows.slice(i, i + batchSize));
    }
    console.log(`${table}: ${rows.length}`);
  }

  // Reset sqlite autoincrement sequences
  const seqExists = dest
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`)
    .get();
  if (seqExists) {
    for (const table of TABLE_ORDER) {
      const info = dest.prepare(`PRAGMA table_info("${table}")`).all();
      const hasId = info.some((c) => c.name === 'id' && c.pk === 1);
      if (!hasId) continue;
      const max = dest.prepare(`SELECT MAX(id) AS m FROM "${table}"`).get();
      if (max?.m == null) continue;
      dest.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
      dest.prepare(`INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)`).run(table, max.m);
    }
  }

  dest.pragma('foreign_keys = ON');
  dest.pragma('wal_checkpoint(TRUNCATE)');
  console.log('\nAdopt complete.');
} catch (err) {
  console.error('Adopt failed:', err);
  process.exitCode = 1;
} finally {
  src.close();
  dest.close();
}
