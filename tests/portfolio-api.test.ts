import { describe, expect, it } from 'vitest';
import {
  closeDb,
  createDb,
  ensureTicker,
  extractRiskMetrics,
  getDefaultAccount,
  getPortfolioLots,
  getPortfolioPositions,
  movePortfolioPosition,
  movePortfolioLot,
  removePosition,
  addPortfolioFill,
  splitPortfolioLot,
  upsertPosition,
} from '@stock-buddy/db';

const dbUrl = process.env.DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

const TEST_SYMBOL = 'TESTMOVE';

describe('extractRiskMetrics for portfolio suggest', () => {
  it('returns flat atr fields and nested structure', () => {
    const risk = extractRiskMetrics({
      risk: {
        key_metrics: {
          buy_zone_low: 100,
          buy_zone_high: 105,
          stop_loss: 95,
          target: 120,
          suggested_shares: 50,
          position_value_bdt: 5000,
          entry: 102,
        },
        strategies: {
          structure: {
            key_metrics: {
              stop_loss: 93,
              target: 125,
            },
          },
        },
      },
    });
    expect(risk.stop_loss).toBe(95);
    expect(risk.target).toBe(120);
    expect(risk.structure?.stop_loss).toBe(93);
    expect(risk.structure?.target).toBe(125);
  });
});

describeDb('portfolio move and stop/target levels', () => {
  async function cleanup(db: ReturnType<typeof createDb>) {
    const account = await getDefaultAccount(db);
    if (!account) return;
    const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });
    await removePosition(db, account.id, ticker.id, 'investment');
    await removePosition(db, account.id, ticker.id, 'trading');
  }

  it('keeps multiple distinct positions instead of fuzzy-collapsing symbols', async () => {
    const db = createDb(dbUrl);
    const syms = ['ZZZQA', 'ZZZQB', 'ZZZQC'];
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      for (const sym of syms) {
        const ticker = await ensureTicker(db, sym, { sector: 'Test' });
        await upsertPosition(db, account!.id, ticker.id, {
          qty: 100,
          avgCost: 50,
          purpose: 'investment',
        });
      }

      const rows = await getPortfolioPositions(db, account!.id, 'investment');
      const found = rows.filter((r) => syms.includes(r.symbol));
      expect(found).toHaveLength(3);
      expect(found.map((r) => r.symbol).sort()).toEqual([...syms].sort());
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        for (const sym of syms) {
          const ticker = await ensureTicker(db, sym);
          await removePosition(db, account.id, ticker.id, 'investment');
        }
      }
      await closeDb(db);
    }
  });

  it('accumulates qty and weighted avg cost when adding same symbol again', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTACCUM';
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Test' });
      await removePosition(db, account!.id, ticker.id, 'investment');

      // e.g. existing 100 @ 118, then broker fill 250 @ 124.9 → 350 @ ~122.93
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 100,
        price: 118,
        tradeDate: '2026-06-01',
        purpose: 'investment',
      });
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 250,
        price: 124.9,
        tradeDate: '2026-07-01',
        purpose: 'investment',
        notes: 'Executed',
      });

      const rows = await getPortfolioPositions(db, account!.id, 'investment');
      const row = rows.find((r) => r.symbol === sym);
      expect(row?.position.qty).toBe(350);
      expect(row?.position.avgCost).toBeCloseTo(122.928571, 4);

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      expect(lots).toHaveLength(2);
      expect(lots[0]?.notes).toBe('Executed');
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
      }
      await cleanup(db);
      await closeDb(db);
    }
  });

  it('persists stop_level and target_level on upsert', async () => {
    const db = createDb(dbUrl);
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });

      await upsertPosition(db, account!.id, ticker.id, {
        qty: 100,
        avgCost: 50,
        stopLevel: 45,
        targetLevel: 65,
        purpose: 'trading',
      });

      const rows = await getPortfolioPositions(db, account!.id, 'trading');
      const row = rows.find((r) => r.symbol === TEST_SYMBOL);
      expect(row?.position.stopLevel).toBe(45);
      expect(row?.position.targetLevel).toBe(65);
    } finally {
      await cleanup(db);
      await closeDb(db);
    }
  });

  it('moves investment → trading and preserves levels', async () => {
    const db = createDb(dbUrl);
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 200,
        price: 30,
        tradeDate: '2026-06-01',
        purpose: 'investment',
      });

      await upsertPosition(db, account!.id, ticker.id, {
        qty: 200,
        avgCost: 30,
        stopLevel: 28,
        targetLevel: 40,
        purpose: 'investment',
      }, 'replace');

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading');
      expect(moved).toBeTruthy();
      expect(moved && moved.moved_qty).toBe(200);

      const investment = await getPortfolioPositions(db, account!.id, 'investment');
      const trading = await getPortfolioPositions(db, account!.id, 'trading');
      expect(investment.find((r) => r.symbol === TEST_SYMBOL)).toBeUndefined();
      const tRow = trading.find((r) => r.symbol === TEST_SYMBOL);
      expect(tRow?.position.qty).toBe(200);
      expect(tRow?.position.avgCost).toBe(30);
      expect(tRow?.position.stopLevel).toBe(28);
      expect(tRow?.position.targetLevel).toBe(40);

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'trading');
      expect(lots).toHaveLength(1);
      expect(lots[0]?.qty).toBe(200);
    } finally {
      await cleanup(db);
      await closeDb(db);
    }
  });

  it('merges fills when moving into an existing destination position', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTMERGE';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Test' });
      await removePosition(db, account!.id, ticker.id, 'investment');
      await removePosition(db, account!.id, ticker.id, 'trading');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 100,
        price: 118,
        tradeDate: '2026-06-01',
        purpose: 'trading',
        stopLevel: 110,
        targetLevel: 140,
      });
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 250,
        price: 124.9,
        tradeDate: '2026-07-01',
        purpose: 'investment',
      });

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading');
      expect(moved).toBeTruthy();
      expect(moved && moved.moved_qty).toBe(250);

      const trading = await getPortfolioPositions(db, account!.id, 'trading');
      const row = trading.find((r) => r.symbol === sym);
      expect(row?.position.qty).toBe(350);
      expect(row?.position.avgCost).toBeCloseTo(122.928571, 4);

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'trading');
      expect(lots).toHaveLength(2);
      expect(lots.map((l) => l.qty).sort((a, b) => a - b)).toEqual([100, 250]);

      const investment = await getPortfolioPositions(db, account!.id, 'investment');
      expect(investment.find((r) => r.symbol === sym)).toBeUndefined();
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
        await removePosition(db, account.id, ticker.id, 'trading');
      }
      await closeDb(db);
    }
  });

  it('round-trips investment → trading → investment with fill history intact', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTROUND';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Test' });
      await removePosition(db, account!.id, ticker.id, 'investment');
      await removePosition(db, account!.id, ticker.id, 'trading');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 50,
        price: 100,
        tradeDate: '2026-05-01',
        purpose: 'investment',
      });
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 50,
        price: 110,
        tradeDate: '2026-06-01',
        purpose: 'investment',
      });

      await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading');
      await movePortfolioPosition(db, account!.id, ticker.id, 'trading', 'investment');

      const investment = await getPortfolioPositions(db, account!.id, 'investment');
      const row = investment.find((r) => r.symbol === sym);
      expect(row?.position.qty).toBe(100);
      expect(row?.position.avgCost).toBe(105);
      expect(row?.position.stopLevel).toBeNull();
      expect(row?.position.targetLevel).toBeNull();

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      expect(lots).toHaveLength(2);
      expect(lots.reduce((s, l) => s + l.qty, 0)).toBe(100);
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
        await removePosition(db, account.id, ticker.id, 'trading');
      }
      await closeDb(db);
    }
  });

  it('backfills a synthetic lot when moving a legacy position without fills', async () => {
    const db = createDb(dbUrl);
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });

      await upsertPosition(db, account!.id, ticker.id, {
        qty: 75,
        avgCost: 42.5,
        purpose: 'investment',
      }, 'replace');

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading');
      expect(moved).toBeTruthy();
      expect(moved && moved.moved_qty).toBe(75);

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'trading');
      expect(lots).toHaveLength(1);
      expect(lots[0]?.qty).toBe(75);
      expect(lots[0]?.price).toBe(42.5);
      expect(lots[0]?.notes).toContain('Backfill');
    } finally {
      await cleanup(db);
      await closeDb(db);
    }
  });

  it('moves trading → investment', async () => {
    const db = createDb(dbUrl);
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });

      await upsertPosition(db, account!.id, ticker.id, {
        qty: 50,
        avgCost: 100,
        purpose: 'trading',
      });

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'trading', 'investment');
      expect(moved).toBeTruthy();
      expect(moved && moved.moved_qty).toBe(50);

      const trading = await getPortfolioPositions(db, account!.id, 'trading');
      const investment = await getPortfolioPositions(db, account!.id, 'investment');
      expect(trading.find((r) => r.symbol === TEST_SYMBOL)).toBeUndefined();
      expect(investment.find((r) => r.symbol === TEST_SYMBOL)?.position.qty).toBe(50);
    } finally {
      await cleanup(db);
      await closeDb(db);
    }
  });

  it('splits a lot with a different split price and adjusts the remainder avg', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTPRICESPLIT';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Pharma' });
      await removePosition(db, account!.id, ticker.id, 'investment');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 732,
        price: 214.05,
        tradeDate: '2026-07-04',
        purpose: 'investment',
        notes: 'Imported from portfolio JSON',
      });

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      const split = await splitPortfolioLot(db, account!.id, lots[0]!.id, 100, 220.9);
      expect(split?.remain_qty).toBe(632);
      expect(split?.remain_price).toBeCloseTo(212.965, 2);
      expect(split?.lot.qty).toBe(100);
      expect(split?.lot.price).toBe(220.9);

      const after = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      expect(after).toHaveLength(2);
      expect(after.reduce((s, l) => s + l.qty * l.price, 0)).toBeCloseTo(732 * 214.05, 0);

      const rows = await getPortfolioPositions(db, account!.id, 'investment');
      expect(rows.find((r) => r.symbol === sym)?.position.qty).toBe(732);
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
      }
      await closeDb(db);
    }
  });

  it('splits a lot into two fills without changing total qty', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTSPLIT';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Test' });
      await removePosition(db, account!.id, ticker.id, 'investment');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 350,
        price: 122.93,
        tradeDate: '2026-07-01',
        purpose: 'investment',
      });

      const lots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      const split = await splitPortfolioLot(db, account!.id, lots[0]!.id, 100);
      expect(split?.remain_qty).toBe(250);
      expect(split?.lot.qty).toBe(100);

      const after = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      expect(after).toHaveLength(2);
      expect(after.reduce((s, l) => s + l.qty, 0)).toBe(350);

      const rows = await getPortfolioPositions(db, account!.id, 'investment');
      expect(rows.find((r) => r.symbol === sym)?.position.qty).toBe(350);
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
      }
      await closeDb(db);
    }
  });

  it('moves partial qty FIFO and leaves remainder in source book', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTPART';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Test' });
      await removePosition(db, account!.id, ticker.id, 'investment');
      await removePosition(db, account!.id, ticker.id, 'trading');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 100,
        price: 118,
        tradeDate: '2026-06-01',
        purpose: 'investment',
      });
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 250,
        price: 124.9,
        tradeDate: '2026-07-01',
        purpose: 'investment',
      });

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading', { qty: 150 });
      expect(moved).toBeTruthy();
      expect(moved && moved.moved_qty).toBe(150);
      expect(moved && moved.partial).toBe(true);
      expect(moved && moved.from_qty).toBe(200);
      expect(moved && moved.to_qty).toBe(150);

      const invLots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      const trLots = await getPortfolioLots(db, account!.id, ticker.id, 'trading');
      expect(invLots.reduce((s, l) => s + l.qty, 0)).toBe(200);
      expect(trLots.reduce((s, l) => s + l.qty, 0)).toBe(150);
      // FIFO: entire first lot (100) + 50 from second lot
      expect(trLots.find((l) => l.qty === 100 && l.price === 118)).toBeTruthy();
      expect(trLots.some((l) => l.qty === 50 && l.price === 124.9)).toBe(true);
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
        await removePosition(db, account.id, ticker.id, 'trading');
      }
      await closeDb(db);
    }
  });

  it('moves a single fill to the other book and keeps both histories', async () => {
    const db = createDb(dbUrl);
    const sym = 'TESTLOTMOVE';
    try {
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, sym, { sector: 'Pharma' });
      await removePosition(db, account!.id, ticker.id, 'investment');
      await removePosition(db, account!.id, ticker.id, 'trading');

      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 732,
        price: 214.05,
        tradeDate: '2026-07-04',
        purpose: 'investment',
        notes: 'Imported from portfolio JSON',
      });
      await addPortfolioFill(db, account!.id, ticker.id, {
        qty: 100,
        price: 220.9,
        tradeDate: '2026-07-02',
        purpose: 'investment',
        notes: 'look for trend',
      });
      const lotToMove = (await getPortfolioLots(db, account!.id, ticker.id, 'investment'))
        .find((l) => l.notes === 'look for trend');
      expect(lotToMove).toBeTruthy();

      const moved = await movePortfolioLot(db, account!.id, lotToMove!.id, 'trading');
      expect(moved).toBeTruthy();
      expect(moved?.moved_qty).toBe(100);
      expect(moved?.from_position?.qty).toBe(732);
      expect(moved?.to_position?.qty).toBe(100);
      expect(moved?.to_position?.avg_cost).toBeCloseTo(220.9, 2);

      const invLots = await getPortfolioLots(db, account!.id, ticker.id, 'investment');
      const trLots = await getPortfolioLots(db, account!.id, ticker.id, 'trading');
      expect(invLots).toHaveLength(1);
      expect(invLots[0]?.qty).toBe(732);
      expect(trLots).toHaveLength(1);
      expect(trLots[0]?.qty).toBe(100);
      expect(trLots[0]?.notes).toBe('look for trend');
    } finally {
      const account = await getDefaultAccount(db);
      if (account) {
        const ticker = await ensureTicker(db, sym);
        await removePosition(db, account.id, ticker.id, 'investment');
        await removePosition(db, account.id, ticker.id, 'trading');
      }
      await closeDb(db);
    }
  });

  it('returns false when source position missing', async () => {
    const db = createDb(dbUrl);
    try {
      await cleanup(db);
      const account = await getDefaultAccount(db);
      expect(account).toBeTruthy();
      const ticker = await ensureTicker(db, TEST_SYMBOL, { sector: 'Test' });

      const moved = await movePortfolioPosition(db, account!.id, ticker.id, 'investment', 'trading');
      expect(moved).toBe(false);
    } finally {
      await cleanup(db);
      await closeDb(db);
    }
  });
});
