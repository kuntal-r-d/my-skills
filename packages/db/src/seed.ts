import { createDb, closeDb } from './client.js';
import { loadEnv } from './load-env.js';
import { portfolioAccounts, tickers, watchlistTickers } from './schema.js';
import { SEED_TICKERS } from './seed-data.js';

loadEnv();

async function main(): Promise<void> {
  const db = createDb();
  console.log('Seeding tickers...');

  for (const t of SEED_TICKERS) {
    await db
      .insert(tickers)
      .values({
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        exchange: 'DSE',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: tickers.symbol,
        set: {
          name: t.name,
          sector: t.sector,
          updatedAt: new Date(),
        },
      });
  }

  const allTickers = await db.select().from(tickers);
  console.log(`Seeded ${allTickers.length} tickers`);

  for (const t of allTickers) {
    await db
      .insert(watchlistTickers)
      .values({ tickerId: t.id })
      .onConflictDoNothing();
  }

  const existing = await db.select().from(portfolioAccounts).limit(1);
  if (existing.length === 0) {
    await db.insert(portfolioAccounts).values({
      label: 'default',
      capitalBdt: 1_000_000,
      riskPerTradePct: 1.0,
    });
    console.log('Created default portfolio account');
  }

  await closeDb(db);
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
