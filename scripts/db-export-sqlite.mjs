#!/usr/bin/env node
/**
 * Export full Postgres stockbuddy data into a portable SQLite file.
 *
 * Usage:
 *   node scripts/db-export-sqlite.mjs [outPath]
 *
 * Default out: data/stockbuddy.sqlite (+ .gz beside it)
 * Requires DATABASE_URL (or loads .env) and a running Postgres.
 */
import {
  mkdirSync,
  existsSync,
  unlinkSync,
  renameSync,
  readFileSync,
  createWriteStream,
  createReadStream,
} from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvFile();

const outPath = resolve(root, process.argv[2] || 'data/stockbuddy.sqlite');
const url = process.env.DATABASE_URL || 'postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy';

/** Tables in FK-safe export order (parents first). */
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

function pgTypeToSqlite(udtName, dataType) {
  if (udtName === 'jsonb' || udtName === 'json' || dataType === 'jsonb' || dataType === 'json') {
    return 'TEXT';
  }
  if (udtName === 'bool' || dataType === 'boolean') return 'INTEGER';
  if (
    udtName === 'int2' ||
    udtName === 'int4' ||
    udtName === 'int8' ||
    udtName === 'serial' ||
    udtName === 'bigserial' ||
    dataType === 'integer' ||
    dataType === 'bigint' ||
    dataType === 'smallint'
  ) {
    return 'INTEGER';
  }
  if (
    udtName === 'float4' ||
    udtName === 'float8' ||
    udtName === 'numeric' ||
    dataType === 'double precision' ||
    dataType === 'real' ||
    dataType === 'numeric'
  ) {
    return 'REAL';
  }
  return 'TEXT';
}

function cellToSqlite(value, sqliteType) {
  if (value == null) return null;
  if (sqliteType === 'TEXT') {
    if (typeof value === 'object') return JSON.stringify(value);
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
  if (sqliteType === 'INTEGER') {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.getTime();
    return Number(value);
  }
  if (sqliteType === 'REAL') return Number(value);
  return value;
}

async function exportTable(sql, db, table, schema = 'public') {
  const exists = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = ${schema} AND table_name = ${table}
    LIMIT 1
  `;
  if (!exists.length) return null;

  const cols = await sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  if (!cols.length) return null;

  const colDefs = cols.map((c) => {
    const st = pgTypeToSqlite(c.udt_name, c.data_type);
    return { name: c.column_name, sqliteType: st, udt: c.udt_name, dataType: c.data_type };
  });

  const sqliteName = schema === 'public' ? table : `${schema}__${table}`;
  db.exec(
    `CREATE TABLE "${sqliteName}" (${colDefs.map((c) => `"${c.name}" ${c.sqliteType}`).join(', ')});`,
  );
  db.prepare('INSERT INTO _stock_buddy_export_meta (key, value) VALUES (?, ?)').run(
    `schema:${sqliteName}`,
    JSON.stringify(colDefs),
  );

  const rows = await sql.unsafe(`SELECT * FROM "${schema}"."${table}"`);
  if (!rows.length) {
    console.log(`${schema}.${table}: 0`);
    return { name: sqliteName, count: 0 };
  }

  const placeholders = colDefs.map(() => '?').join(', ');
  const colList = colDefs.map((c) => `"${c.name}"`).join(', ');
  const insert = db.prepare(`INSERT INTO "${sqliteName}" (${colList}) VALUES (${placeholders})`);

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      insert.run(...colDefs.map((c) => cellToSqlite(row[c.name], c.sqliteType)));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`${schema}.${table}: ${rows.length}`);
  return { name: sqliteName, count: rows.length };
}

const sql = postgres(url, { max: 4 });

try {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  if (existsSync(tmpPath)) unlinkSync(tmpPath);

  const db = new DatabaseSync(tmpPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = OFF;');

  db.exec(`
    CREATE TABLE _stock_buddy_export_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const metaIns = db.prepare('INSERT INTO _stock_buddy_export_meta (key, value) VALUES (?, ?)');
  metaIns.run('exported_at', new Date().toISOString());
  metaIns.run('source', 'postgresql');
  metaIns.run(
    'database_url_host',
    (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'unknown';
      }
    })(),
  );

  const counts = {};

  for (const table of TABLE_ORDER) {
    const result = await exportTable(sql, db, table, 'public');
    if (result) counts[result.name] = result.count;
    else console.warn(`skip missing table: public.${table}`);
  }

  const drizzleMig = await exportTable(sql, db, '__drizzle_migrations', 'drizzle');
  if (drizzleMig) counts[drizzleMig.name] = drizzleMig.count;

  metaIns.run('counts', JSON.stringify(counts));
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('PRAGMA journal_mode = DELETE;');
  db.close();

  for (const side of [`${tmpPath}-wal`, `${tmpPath}-shm`]) {
    if (existsSync(side)) unlinkSync(side);
  }
  if (existsSync(outPath)) unlinkSync(outPath);
  renameSync(tmpPath, outPath);

  const gzPath = `${outPath}.gz`;
  if (existsSync(gzPath)) unlinkSync(gzPath);
  await pipeline(createReadStream(outPath), createGzip({ level: 9 }), createWriteStream(gzPath));

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nWrote ${outPath}`);
  console.log(`Wrote ${gzPath} (${total} rows across ${Object.keys(counts).length} tables)`);
} catch (err) {
  console.error('Export failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
