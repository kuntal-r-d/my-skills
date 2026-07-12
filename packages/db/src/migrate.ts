import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb, getDatabasePath } from './client.js';
import { loadEnv } from './load-env.js';

loadEnv();

async function main(): Promise<void> {
  const db = createDb();
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');
  console.log(`Running migrations on ${getDatabasePath()}...`);
  migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
  await closeDb(db);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
