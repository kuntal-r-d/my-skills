import type { Db } from '@stock-buddy/db';
import {
  ensureTicker,
  upsertFundamentals,
  upsertMacro,
  upsertOhlcvBatch,
  upsertShareholding,
} from '@stock-buddy/db';
import { DEFAULT_MACRO } from '@stock-buddy/scraper';

/** Deterministic LHB rows for CI when live DSE ingest is unavailable. */
export async function seedLhbFixture(db: Db): Promise<void> {
  const ticker = await ensureTicker(db, 'LHB', {
    name: 'LafargeHolcim Bangladesh PLC',
    sector: 'Cement',
  });

  const ohlcv = Array.from({ length: 60 }, (_, i) => {
    const d = new Date('2026-01-01');
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const base = 50 + i * 0.05;
    return {
      tradeDate: date,
      open: base,
      high: base + 0.5,
      low: base - 0.5,
      close: base + 0.1,
      volume: 500_000,
      source: 'fixture',
    };
  });

  await upsertOhlcvBatch(db, ticker.id, ohlcv);
  await upsertFundamentals(
    db,
    ticker.id,
    '2026-06-24',
    { price: 54.3, eps_ttm: 4.17, pe: 13, roe: 0.24, dividend_yield: 0.074 },
    'fixture',
  );
  await upsertShareholding(db, ticker.id, '2026-05-01', {
    sponsor: 63.39,
    govt: 0,
    institution: 22.58,
    foreign: 0.78,
    public: 13.25,
  });
  await upsertMacro(db, '2026-06-24', DEFAULT_MACRO, 'fixture');
}
