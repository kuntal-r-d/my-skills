import { describe, expect, it } from 'vitest';
import { screen as minerviniScreen } from '../packages/skills/src/minervini-sepa/screen.js';
import { screen as canSlimScreen } from '../packages/skills/src/can-slim/screen.js';
import { screen as darvasScreen } from '../packages/skills/src/darvas-box/screen.js';
import { screen as livermoreScreen } from '../packages/skills/src/livermore-pivot/screen.js';
import { MomentumStrategiesCoordinator } from '../packages/agents/src/momentum-strategies-coordinator.js';
import { hasMomentumTrading } from '../packages/ingest/src/momentum-trading.js';
import { enrichMomentumInAnalysis } from '../packages/ingest/src/momentum-enrich.js';

function makeBars(closes: number[], volume = 1_000_000) {
  return closes.map((close, i) => ({
    date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume,
  }));
}

function trendingCloses(n: number, start = 100, end = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(start + ((end - start) * i) / Math.max(n - 1, 1));
  }
  return out;
}

function basePayload(closes: number[], extras: Record<string, unknown> = {}) {
  return {
    ticker: 'TEST',
    as_of: '2026-06-30',
    mode: 'momentum',
    ohlcv: makeBars(closes),
    fundamentals: {
      eps_history: [1, 1.2, 1.5, 1.9, 2.4],
      roe: 18,
      earnings_surprise: 0.05,
      ...((extras.fundamentals as object) ?? {}),
    },
    market_index: makeBars(trendingCloses(260, 5000, 5500)),
    ...extras,
  };
}

describe('minervini-sepa', () => {
  it('scores uptrend with sufficient history', () => {
    const result = minerviniScreen(basePayload(trendingCloses(260)));
    expect(result.error).toBeUndefined();
    expect(result.skill).toBe('minervini-sepa');
    expect(result.rating).toBeDefined();
    expect((result.criteria as unknown[]).length).toBeGreaterThan(0);
    expect(result.key_metrics).toBeDefined();
  });
});

describe('can-slim', () => {
  it('evaluates C/L/M with fundamentals and market', () => {
    const result = canSlimScreen(basePayload(trendingCloses(260)));
    expect(result.error).toBeUndefined();
    expect(result.skill).toBe('can-slim');
    const cats = (result.key_metrics as Record<string, unknown>).categories as Record<string, { total: number }>;
    expect(cats.C).toBeDefined();
    expect(cats.M).toBeDefined();
  });
});

describe('darvas-box', () => {
  it('detects box structure on consolidating series', () => {
    const flat = [...trendingCloses(200, 150, 180), ...Array(30).fill(175)];
    const result = darvasScreen(basePayload(flat));
    expect(result.error).toBeUndefined();
    expect((result.key_metrics as Record<string, unknown>).box_high).toBeDefined();
  });
});

describe('livermore-pivot', () => {
  it('identifies pivot on trending data', () => {
    const result = livermoreScreen(basePayload(trendingCloses(80, 100, 130)));
    expect(result.error).toBeUndefined();
    expect((result.key_metrics as Record<string, unknown>).pivot).toBeDefined();
  });
});

describe('MomentumStrategiesCoordinator', () => {
  it('returns four strategy buckets in summary', async () => {
    const coord = new MomentumStrategiesCoordinator();
    const result = await coord.analyze(basePayload(trendingCloses(260)));
    const summary = result.summary as Record<string, unknown>;
    const buckets = summary.buckets as Record<string, { total: number }>;
    expect(buckets.minervini_sepa).toBeDefined();
    expect(buckets.can_slim).toBeDefined();
    expect(buckets.darvas_box).toBeDefined();
    expect(buckets.livermore_pivot).toBeDefined();
    expect(summary.overall_count).toMatch(/\d+\/\d+/);
  });
});

describe('momentum enrich', () => {
  it('detects missing momentum_trading', () => {
    expect(hasMomentumTrading({})).toBe(false);
    expect(hasMomentumTrading({ momentum_trading: { summary: { buckets: { a: {} } } } })).toBe(true);
  });

  it('backfills old snapshots', async () => {
    const analysis = { synthesis: {}, momentum_screen: { rating: 'B' } };
    const enriched = await enrichMomentumInAnalysis(analysis, basePayload(trendingCloses(260)));
    expect(enriched.momentum_trading).toBeDefined();
    expect(hasMomentumTrading(enriched)).toBe(true);
  });
});
