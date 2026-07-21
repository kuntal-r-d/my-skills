import { describe, expect, it } from 'vitest';
import { computeDailyBuySignal } from '../packages/ingest/src/buy-signal.js';

/** Minimal strategy record with a trade plan. */
function strat(
  status: 'actionable' | 'watch',
  direction: 'buy' | 'sell',
  score: number,
  levels: { entry: number; stop_loss: number; take_profit_1: number },
  rsi?: number,
) {
  return {
    score,
    key_metrics: {
      ...(rsi != null ? { rsi } : {}),
      trade_plan: { status, direction, ...levels },
    },
  };
}

/** Build a payload with the given strategies, consensus score, trend and technical MAs. */
function payload(opts: {
  strategies: Record<string, unknown>;
  consensus?: number;
  composite?: number;
  rating?: string;
  trend?: number;
  sma50?: number;
  sma200?: number;
  rsi14?: number;
}) {
  return {
    as_of: '2026-07-21',
    momentum_trading: {
      summary: opts.consensus != null ? { consensus_score: opts.consensus } : {},
      strategies: opts.strategies,
    },
    synthesis: {
      momentum: {
        composite_1_10: opts.composite ?? 6,
        rating: opts.rating ?? 'buy',
      },
    },
    agent_cards: {
      technical: {
        sub_scores: opts.trend != null ? { trend: opts.trend } : {},
        key_metrics: {
          ...(opts.sma50 != null ? { sma_50: opts.sma50 } : {}),
          ...(opts.sma200 != null ? { sma_200: opts.sma200 } : {}),
          ...(opts.rsi14 != null ? { rsi_14: opts.rsi14 } : {}),
        },
      },
    },
  };
}

/** OHLCV whose last close sits `pct` above the flat 10-day MA (all prior bars = base). */
function ohlcvExtended(base: number, pct: number) {
  const bars = Array.from({ length: 9 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    open: base,
    high: base,
    low: base,
    close: base,
    volume: 1000,
  }));
  // choose last close so (price / ma10) - 1 ~= pct. ma10 = (9*base + last)/10.
  // solve last = (10*base*(1+pct) - 9*base) / (1 - ... ) — approximate by iterating.
  let last = base * (1 + pct);
  for (let i = 0; i < 40; i++) {
    const ma10 = (9 * base + last) / 10;
    last = ma10 * (1 + pct);
  }
  bars.push({ date: '2026-07-10', open: base, high: last, low: base, close: last, volume: 2000 });
  return bars;
}

describe('computeDailyBuySignal', () => {
  it('BUY: >=2 actionable buys and not extended', () => {
    const p = payload({
      consensus: 0.74,
      rsi14: 66,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 43.8, stop_loss: 40.3, take_profit_1: 50.8 }),
        can_slim: strat('actionable', 'buy', 0.8, { entry: 44.2, stop_loss: 40.9, take_profit_1: 52.5 }),
        darvas_box: strat('watch', 'buy', 0.6, { entry: 44.5, stop_loss: 39.6, take_profit_1: 54.2 }),
        failure_test_reversal: strat('actionable', 'sell', 0.5, { entry: 42.4, stop_loss: 43.4, take_profit_1: 40.2 }, 66),
      },
    });
    // flat OHLCV -> price ~ ma10, not extended
    const flat = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      open: 43,
      high: 43,
      low: 43,
      close: 43,
      volume: 1000,
    }));
    const s = computeDailyBuySignal(p, flat);
    expect(s.verdict).toBe('BUY');
    expect(s.actionableCount).toBe(2); // the sell does not count
    // most conservative (lowest) entry among actionable buys
    expect(s.entry).toBe(43.8);
    expect(s.stop).toBe(40.3);
    expect(s.target).toBe(50.8);
    expect(s.primaryStrategy).toBe('minervini_sepa'); // highest score
    expect(s.rsi).toBe(66);
    expect(s.confidence).toBeCloseTo(0.74, 5);
    expect(s.rationale).toContain('not extended');
  });

  it('WAIT: BUY downgraded by the overbought RSI guard', () => {
    const p = payload({
      consensus: 0.62,
      rsi14: 75,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 19.5, stop_loss: 17.9, take_profit_1: 21.8 }),
        livermore_pivot: strat('actionable', 'buy', 0.7, { entry: 19.6, stop_loss: 18.0, take_profit_1: 22.0 }),
        failure_test_reversal: strat('actionable', 'sell', 0.5, { entry: 18.0, stop_loss: 19.0, take_profit_1: 16.0 }, 75),
      },
    });
    const flat = Array.from({ length: 10 }, () => ({ date: '2026-07-10', open: 19.5, high: 19.5, low: 19.5, close: 19.5, volume: 1000 }));
    const s = computeDailyBuySignal(p, flat);
    expect(s.verdict).toBe('WAIT');
    expect(s.actionableCount).toBe(2);
    expect(s.rationale).toContain('overbought');
    // confidence reduced by the guard (0.62 * 0.7)
    expect(s.confidence).toBeCloseTo(0.43, 2);
  });

  it('WAIT: BUY downgraded by the +8% over-extension guard even when RSI is calm', () => {
    const p = payload({
      consensus: 0.7,
      rsi14: 60,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 100, stop_loss: 92, take_profit_1: 120 }),
        can_slim: strat('actionable', 'buy', 0.8, { entry: 101, stop_loss: 93, take_profit_1: 122 }),
      },
    });
    const s = computeDailyBuySignal(p, ohlcvExtended(100, 0.1)); // last close ~+10% vs 10-MA
    expect(s.verdict).toBe('WAIT');
    expect(s.pctVs10ma).toBeGreaterThanOrEqual(8);
    expect(s.rationale).toContain('10-MA');
  });

  it('WATCH: exactly one actionable buy is a lean-buy / setup forming', () => {
    const p = payload({
      consensus: 0.55,
      rsi14: 58,
      rating: 'buy',
      trend: 0.3,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 50, stop_loss: 46, take_profit_1: 58 }),
        darvas_box: strat('watch', 'buy', 0.6, { entry: 52, stop_loss: 47, take_profit_1: 60 }),
      },
    });
    const flat = Array.from({ length: 10 }, () => ({ date: '2026-07-10', open: 50, high: 50, low: 50, close: 50, volume: 1000 }));
    const s = computeDailyBuySignal(p, flat);
    expect(s.verdict).toBe('WATCH');
    expect(s.actionableCount).toBe(1);
    expect(s.entry).toBe(50);
    expect(s.rationale).toContain('lean-buy');
  });

  it('WATCH: zero actionable buys but in an uptrend stands aside with a watch-trigger', () => {
    const p = payload({
      consensus: 0.5,
      rsi14: 55,
      rating: 'hold',
      trend: 0.4, // positive trend -> not a downtrend, so WATCH not AVOID
      strategies: {
        darvas_box: strat('watch', 'buy', 0.6, { entry: 60, stop_loss: 55, take_profit_1: 70 }),
        minervini_sepa: strat('watch', 'buy', 0.4, { entry: 62, stop_loss: 56, take_profit_1: 72 }),
      },
    });
    const s = computeDailyBuySignal(p);
    expect(s.verdict).toBe('WATCH');
    expect(s.actionableCount).toBe(0);
    // nearest strategy's trigger surfaced as a watch-trigger (highest score = darvas)
    expect(s.entry).toBe(60);
    expect(s.primaryStrategy).toBe('darvas_box');
  });

  it('AVOID: zero actionable buys in a downtrend', () => {
    const p = payload({
      consensus: 0.35,
      rsi14: 41,
      rating: 'hold',
      trend: -0.3, // downtrend signal
      strategies: {
        failure_test_reversal: strat('actionable', 'sell', 0.5, { entry: 24, stop_loss: 25, take_profit_1: 22 }, 41),
        darvas_box: strat('watch', 'buy', 0.3, { entry: 26, stop_loss: 23, take_profit_1: 30 }),
      },
    });
    const s = computeDailyBuySignal(p);
    expect(s.verdict).toBe('AVOID');
    expect(s.actionableCount).toBe(0); // the actionable strategy is a sell
    expect(s.rationale).toContain('avoid');
  });

  it('AVOID: downtrend inferred from price below both key MAs', () => {
    const p = payload({
      consensus: 0.3,
      rsi14: 38,
      rating: 'hold',
      sma50: 100,
      sma200: 110,
      strategies: {
        darvas_box: strat('watch', 'buy', 0.3, { entry: 95, stop_loss: 88, take_profit_1: 105 }),
      },
    });
    const below = Array.from({ length: 10 }, () => ({ date: '2026-07-10', open: 90, high: 90, low: 90, close: 90, volume: 1000 }));
    const s = computeDailyBuySignal(p, below); // price 90 < sma50 100 and < sma200 110
    expect(s.verdict).toBe('AVOID');
  });

  it('falls back to synthesis composite for confidence when consensus is absent', () => {
    const p = payload({
      composite: 8,
      rsi14: 60,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 10, stop_loss: 9, take_profit_1: 12 }),
        can_slim: strat('actionable', 'buy', 0.8, { entry: 11, stop_loss: 9.5, take_profit_1: 13 }),
      },
    });
    const flat = Array.from({ length: 10 }, () => ({ date: '2026-07-10', open: 10, high: 10, low: 10, close: 10, volume: 1000 }));
    const s = computeDailyBuySignal(p, flat);
    expect(s.confidence).toBeCloseTo(0.8, 5); // 8/10
  });

  it('skips the extension guard and notes it when RSI and MA10 are unavailable', () => {
    const p = payload({
      consensus: 0.8,
      strategies: {
        minervini_sepa: strat('actionable', 'buy', 0.9, { entry: 10, stop_loss: 9, take_profit_1: 12 }),
        can_slim: strat('actionable', 'buy', 0.8, { entry: 11, stop_loss: 9.5, take_profit_1: 13 }),
      },
    });
    // no rsi14, no ftr rsi, no ohlcv -> guard cannot run
    const s = computeDailyBuySignal(p);
    expect(s.verdict).toBe('BUY');
    expect(s.rsi).toBeNull();
    expect(s.rationale).toContain('extension guard unavailable');
  });
});
