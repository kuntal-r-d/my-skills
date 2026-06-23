import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

type SqlClient = ReturnType<typeof postgres>;

let _client: SqlClient | null = null;
let _db: Db | null = null;

/** Maps each Drizzle instance to its postgres.js client for scoped shutdown. */
const clientByDb = new WeakMap<Db, SqlClient>();

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

export function createDb(connectionString?: string): Db {
  const url = connectionString ?? getDatabaseUrl();
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  clientByDb.set(db, client);
  return db;
}

/** Singleton pool for long-lived servers (dashboard, MCP). */
export function getDb(): Db {
  if (!_db) {
    _client = postgres(getDatabaseUrl(), { max: 10 });
    _db = drizzle(_client, { schema });
    clientByDb.set(_db, _client);
  }
  return _db;
}

/**
 * Close database connection(s).
 * Pass a `Db` from `createDb()` to close only that connection (safe for concurrent requests).
 * Omit `db` to close the singleton from `getDb()`.
 */
export async function closeDb(db?: Db): Promise<void> {
  if (db) {
    const client = clientByDb.get(db);
    if (client) {
      await client.end();
      clientByDb.delete(db);
    }
    if (_db === db) {
      _client = null;
      _db = null;
    }
    return;
  }
  if (_client) {
    await _client.end();
    if (_db) clientByDb.delete(_db);
    _client = null;
    _db = null;
  }
}

export { schema };
