import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, closeDb } from './client.js';
import { loadEnv } from './load-env.js';

loadEnv();

async function main(): Promise<void> {
  const db = createDb();
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await closeDb(db);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
