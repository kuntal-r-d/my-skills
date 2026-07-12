import { describe, expect, it } from 'vitest';
import { earningsGrowthFromEpsHistory, enrichFundamentals } from './fundamentals-enrich.js';

describe('fundamentals-enrich', () => {
  it('derives institution ownership and earnings growth', () => {
    const f = enrichFundamentals({
      fundamentals: { pe: 8, roe: 0.21, profit_margin: 0.28, debt_to_equity: 0.19, eps_history: [14.67, 14.45, 16.89, 10.22, 5.84] },
      shareholding: [
        { month: '2026-04', institution: 7.45, sponsor: 90 },
        { month: '2026-05', institution: 7.46, sponsor: 90 },
      ],
      ohlcv: [{ close: 123.9 }],
    });
    expect(f.institution_ownership).toBeCloseTo(0.0746, 4);
    expect(f.price).toBe(123.9);
    expect(typeof f.earnings_growth).toBe('number');
    expect(f.moat).toBe(true);
  });

  it('earningsGrowthFromEpsHistory uses latest YoY when prior non-zero', () => {
    const g = earningsGrowthFromEpsHistory([14.67, 14.45, 16.89, 10.22, 5.84]);
    expect(g).toBeCloseTo((5.84 - 10.22) / 10.22, 4);
  });
});
