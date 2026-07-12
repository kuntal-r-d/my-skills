#!/usr/bin/env node
/**
 * Import a Stock Buddy SQLite snapshot into Postgres (replaces table data).
 *
 * Usage:
 *   node scripts/db-import-sqlite.mjs [--force] [sqlitePath]
 *
 * Default in: data/stockbuddy.sqlite.gz (falls back to .sqlite)
 * Requires DATABASE_URL (or loads .env), migrated schema, and a running Postgres.
 *
 * Collaborator flow:
 *   docker compose up -d postgres
 *   npm run db:migrate
 *   npm run db:import-sqlite -- --force
 *
 * WARNING: Truncates all known app tables before insert.
 */
import {
  existsSync,
  readFileSync,
  createReadStream,
  createWriteStream,
  unlinkSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
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

const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force') || process.env.STOCK_BUDDY_IMPORT_FORCE === '1';

function resolveInputPath() {
  if (args[0]) return resolve(root, args[0]);
  const gz = resolve(root, 'data/stockbuddy.sqlite.gz');
  const raw = resolve(root, 'data/stockbuddy.sqlite');
  if (existsSync(gz)) return gz;
  return raw;
}

const inPath = resolveInputPath();
const url = process.env.DATABASE_URL || 'postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy';

/** Truncate children first, then parents. */
const TRUNCATE_ORDER = [
  'prediction_outcomes',
  'research_sources',
  'research_memos',
  'analysis_snapshots',
  'watchlist_tickers',
  'data_freshness',
  'ingest_runs',
  'portfolio_lots',
  'portfolio_positions',
  'news_items',
  'sector_snapshots',
  'shareholding_monthly',
  'fundamentals_snapshots',
  'ohlcv_daily',
  'macro_snapshots',
  'skill_overrides',
  'sectors',
  'portfolio_accounts',
  'tickers',
];

/** Insert parents first. */
const INSERT_ORDER = [
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

function isJsonUdt(udt) {
  return udt === 'jsonb' || udt === 'json';
}

function isBoolUdt(udt) {
  return udt === 'bool';
}

function cellToPg(value, colDef) {
  if (value == null) return null;
  if (isJsonUdt(colDef.udt)) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (isBoolUdt(colDef.udt)) {
    if (typeof value === 'boolean') return value;
    return Number(value) === 1;
  }
  return value;
}

async function openSqlite(path) {
  if (!path.endsWith('.gz')) {
    return { db: new DatabaseSync(path, { readOnly: true }), cleanup: () => {} };
  }
  const dir = mkdtempSync(join(tmpdir(), 'stockbuddy-sqlite-'));
  const inflated = join(dir, 'stockbuddy.sqlite');
  await pipeline(createReadStream(path), createGunzip(), createWriteStream(inflated));
  return {
    db: new DatabaseSync(inflated, { readOnly: true }),
    cleanup: () => {
      try {
        unlinkSync(inflated);
      } catch {
        /* ignore */
      }
    },
  };
}

if (!existsSync(inPath)) {
  console.error(`SQLite file not found: ${inPath}`);
  process.exit(1);
}

if (!force) {
  console.error(
    'Refusing to truncate Postgres without --force (or STOCK_BUDDY_IMPORT_FORCE=1).\n' +
      'This replaces all Stock Buddy table data from the SQLite snapshot.',
  );
  process.exit(1);
}

const { db: sqlite, cleanup } = await openSqlite(inPath);
const sql = postgres(url, { max: 4 });

try {
  const metaRows = sqlite.prepare('SELECT key, value FROM _stock_buddy_export_meta').all();
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
  console.log(`Importing ${inPath}`);
  console.log(`  exported_at: ${meta.exported_at ?? 'unknown'}`);
  if (meta.counts) console.log(`  source counts: ${meta.counts}`);

  await sql`SET session_replication_role = replica`;

  for (const table of TRUNCATE_ORDER) {
    const exists = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
      LIMIT 1
    `;
    if (!exists.length) continue;
    await sql.unsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
  }

  for (const table of INSERT_ORDER) {
    const schemaRaw = meta[`schema:${table}`];
    if (!schemaRaw) {
      console.warn(`skip (no schema meta): ${table}`);
      continue;
    }
    const colDefs = JSON.parse(schemaRaw);

    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!tableExists) {
      console.warn(`skip missing sqlite table: ${table}`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (!rows.length) {
      console.log(`${table}: 0`);
      continue;
    }

    const batchSize = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((row) => {
        const obj = {};
        for (const c of colDefs) obj[c.name] = cellToPg(row[c.name], c);
        return obj;
      });
      await sql`INSERT INTO ${sql(table)} ${sql(batch)}`;
      inserted += batch.length;
    }
    console.log(`${table}: ${inserted}`);
  }

  // Reset serial sequences to max(id)
  const sequences = await sql`
    SELECT
      t.relname AS table_name,
      a.attname AS column_name,
      s.relname AS sequence_name
    FROM pg_class t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_depend d ON d.refobjid = t.oid AND d.refobjsubid = a.attnum
    JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
  `;
  for (const seq of sequences) {
    await sql.unsafe(
      `SELECT setval('${seq.sequence_name}', COALESCE((SELECT MAX("${seq.column_name}") FROM "${seq.table_name}"), 1), true)`,
    );
  }

  await sql`SET session_replication_role = DEFAULT`;
  console.log('\nImport complete. App still uses Postgres — this snapshot only syncs shared state.');
} catch (err) {
  console.error('Import failed:', err);
  process.exitCode = 1;
} finally {
  sqlite.close();
  cleanup();
  await sql.end({ timeout: 5 });
}
