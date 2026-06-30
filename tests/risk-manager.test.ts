import { describe, expect, it } from 'vitest';
import { analyze } from '../packages/skills/src/risk-manager/analyze.js';

function makeBars(closes: number[]) {
  return closes.map((close, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1_000_000,
  }));
}

function basePayload(closes: number[]) {
  return {
    ticker: 'TEST',
    as_of: '2026-06-30',
    ohlcv: makeBars(closes),
    account: { capital_bdt: 1_000_000, risk_per_trade_pct: 1 },
    microstructure: { avg_daily_value_bdt: 25_000_000, circuit_state: 'normal' },
    fundamentals: { sector: 'Telecom' },
  };
}

/** Flat-ish series with a late rally so support < resistance < last close. */
function trendingCloses(n = 80, start = 280, end = 320): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(start + ((end - start) * i) / (n - 1));
  }
  return out;
}

describe('risk-manager structure strategy', () => {
  it('returns both atr and structure strategies', () => {
    const result = analyze(basePayload(trendingCloses()));
    expect(result.error).toBeUndefined();
    expect(result.active_strategy).toBe('atr');
    expect(result.strategies).toBeDefined();

    const atr = result.strategies as Record<string, Record<string, unknown>>;
    const structure = atr.structure;
    expect(atr.atr.strategy).toBe('atr');
    expect(structure.strategy).toBe('structure');

    const atrKm = atr.atr.key_metrics as Record<string, number>;
    const structKm = structure.key_metrics as Record<string, number>;
    expect(atrKm.stop_loss).toBeLessThan(atrKm.entry);
    expect(structKm.stop_loss).toBeLessThan(structKm.entry);
    expect(structKm.support).toBeDefined();
    expect(structKm.resistance).toBeDefined();
    expect('next_support' in structKm).toBe(true);
    expect('next_resistance' in structKm).toBe(true);
    expect(structKm.buy_zone_low).toBeLessThanOrEqual(structKm.buy_zone_high);
  });

  it('anchors structure stop below support with ATR buffer', () => {
    const closes = trendingCloses();
    const result = analyze(basePayload(closes));
    const structKm = (result.strategies as Record<string, Record<string, unknown>>).structure
      .key_metrics as Record<string, number>;

    expect(structKm.stop_loss).toBeLessThan(structKm.support!);
    expect(structKm.target).toBeGreaterThanOrEqual(structKm.entry);
    expect(structKm.risk_reward).toBeGreaterThanOrEqual(1.5);
  });

  it('keeps top-level key_metrics as ATR for backward compatibility', () => {
    const result = analyze(basePayload(trendingCloses()));
    const top = result.key_metrics as Record<string, number>;
    const atrKm = (result.strategies as Record<string, Record<string, unknown>>).atr
      .key_metrics as Record<string, number>;
    expect(top.stop_loss).toBe(atrKm.stop_loss);
    expect(top.target).toBe(atrKm.target);
  });
});
