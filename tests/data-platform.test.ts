import { describe, expect, it } from 'vitest';
import { SkillInputSchema } from '@stock-buddy/core';
import { stripMeta } from '@stock-buddy/ingest';

describe('contract builder', () => {
  it('validates a minimal fixture contract after stripMeta', () => {
    const contract = {
      ticker: 'LHB',
      as_of: '2026-06-24',
      mode: 'investment',
      ohlcv: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, '0')}`,
        open: 50,
        high: 51,
        low: 49,
        close: 50.5,
        volume: 100000,
      })),
      fundamentals: { price: 54.3, eps_ttm: 4.17, pe: 13 },
      _meta: { sources: ['test'], missing: [], freshness: {} },
    };
    const stripped = stripMeta(contract);
    const parsed = SkillInputSchema.safeParse(stripped);
    expect(parsed.success).toBe(true);
  });
});
