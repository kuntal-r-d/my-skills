import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;
export type SqliteClient = InstanceType<typeof Database>;

let _client: SqliteClient | null = null;
let _db: Db | null = null;

/** Maps each Drizzle instance to its better-sqlite3 handle for scoped shutdown. */
const clientByDb = new WeakMap<Db, SqliteClient>();

const DEFAULT_SQLITE_URL = 'file:data/stockbuddy.sqlite';

function findRepoRoot(): string {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'packages'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

/**
 * Resolve DATABASE_URL / DATABASE_PATH to a filesystem path.
 * Accepts `file:…`, bare relative/absolute paths. Rejects postgres URLs.
 * Relative paths resolve against the monorepo root (not the package cwd).
 */
export function resolveSqlitePath(connectionString?: string): string {
  const raw = (
    connectionString ??
    process.env.DATABASE_URL ??
    process.env.DATABASE_PATH ??
    DEFAULT_SQLITE_URL
  ).trim();
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  if (/^postgres(ql)?:/i.test(raw)) {
    throw new Error(
      'PostgreSQL is no longer supported. Set DATABASE_URL=file:data/stockbuddy.sqlite',
    );
  }

  let path = raw;
  if (path.startsWith('file:')) {
    const rest = path.slice('file:'.length);
    if (rest.startsWith('///')) {
      path = rest.slice(2);
    } else if (rest.startsWith('//')) {
      try {
        path = fileURLToPath(raw);
      } catch {
        path = rest.replace(/^\/\/\//, '/').replace(/^\/\//, '/');
      }
    } else {
      path = rest;
    }
  } else if (path.startsWith('sqlite:')) {
    path = path.slice('sqlite:'.length);
  }

  return isAbsolute(path) ? path : resolve(findRepoRoot(), path);
}

/** @deprecated Use resolveSqlitePath — kept for callers that expect a "URL". */
export function getDatabaseUrl(): string {
  return resolveSqlitePath();
}

export function getDatabasePath(): string {
  return resolveSqlitePath();
}

function openSqlite(path: string): SqliteClient {
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  client.pragma('busy_timeout = 5000');
  return client;
}

export function createDb(connectionString?: string): Db {
  const path = resolveSqlitePath(connectionString);
  const client = openSqlite(path);
  const db = drizzle(client, { schema });
  clientByDb.set(db, client);
  return db;
}

/** Singleton for long-lived servers (dashboard, MCP, ingest). */
export function getDb(): Db {
  if (!_db) {
    _client = openSqlite(resolveSqlitePath());
    _db = drizzle(_client, { schema });
    clientByDb.set(_db, _client);
  }
  return _db;
}

/**
 * Close database connection(s).
 * Pass a `Db` from `createDb()` to close only that connection.
 * Omit `db` to close the singleton from `getDb()`.
 */
export async function closeDb(db?: Db): Promise<void> {
  if (db) {
    const client = clientByDb.get(db);
    if (client) {
      client.close();
      clientByDb.delete(db);
    }
    if (_db === db) {
      _client = null;
      _db = null;
    }
    return;
  }
  if (_client) {
    _client.close();
    if (_db) clientByDb.delete(_db);
    _client = null;
    _db = null;
  }
}

/** Normalize drizzle/better-sqlite3 query results to a plain row array. */
export function rowsFromExecute<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export { schema };
