import { describe, expect, it } from 'vitest';
import {
  closeDb,
  createDb,
  getLatestFundamentals,
  getLatestMacro,
  getOhlcv,
  getShareholding,
  getTickerBySymbol,
} from '@stock-buddy/db';
import { buildTickerContract, stripMeta, validateContract } from '@stock-buddy/ingest';
import { analyzeTicker } from '../packages/mcp-server/src/composites.js';
import { seedLhbFixture } from './helpers/seed-lhb-fixture.js';

const dbUrl = process.env.DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

describeDb('data platform E2E (requires DATABASE_URL + seeded LHB ingest)', () => {
  it('builds a valid contract from Postgres and runs analyze_ticker', async () => {
    const db = createDb(dbUrl);
    try {
      const ticker = await getTickerBySymbol(db, 'LHB');
      expect(ticker).toBeTruthy();

      let ohlcv = await getOhlcv(db, ticker!.id, { limit: 500 });
      if (ohlcv.length < 30) {
        await seedLhbFixture(db);
        ohlcv = await getOhlcv(db, ticker!.id, { limit: 500 });
      }
      expect(ohlcv.length).toBeGreaterThanOrEqual(30);

      let fundamentals = await getLatestFundamentals(db, ticker!.id);
      if (!fundamentals) {
        await seedLhbFixture(db);
        fundamentals = await getLatestFundamentals(db, ticker!.id);
      }
      expect(fundamentals).toBeTruthy();

      let shareholding = await getShareholding(db, ticker!.id, 4);
      if (shareholding.length === 0) {
        await seedLhbFixture(db);
        shareholding = await getShareholding(db, ticker!.id, 4);
      }
      expect(shareholding.length).toBeGreaterThan(0);

      expect(await getLatestMacro(db)).toBeTruthy();
      // news is optional in SkillInputSchema; may be empty when DSE has no displayNews links

      const contract = await buildTickerContract(db, 'LHB', { includePortfolio: true });
      expect(validateContract(contract)).toBe(true);

      const analysis = analyzeTicker(stripMeta(contract));
      expect(analysis.skill).toBe('analyze_ticker');
      expect(analysis.synthesis).toBeTruthy();
      expect(analysis.risk).toBeTruthy();
    } finally {
      await closeDb(db);
    }
  });
});
