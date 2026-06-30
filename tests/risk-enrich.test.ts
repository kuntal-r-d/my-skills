import { describe, expect, it } from 'vitest';
import { enrichRiskInAnalysis, hasStructureStrategy } from '../packages/ingest/src/risk-enrich.js';

describe('risk-enrich', () => {
  it('detects structure strategy', () => {
    expect(
      hasStructureStrategy({
        strategies: { structure: { key_metrics: { stop_loss: 1 } } },
      }),
    ).toBe(true);
    expect(hasStructureStrategy({ key_metrics: { stop_loss: 1 } })).toBe(false);
  });

  it('enriches legacy risk output', () => {
    const fixture = JSON.parse(
      JSON.stringify({
        ticker: 'TEST',
        ohlcv: Array.from({ length: 80 }, (_, i) => ({
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
          open: 280 + i * 0.5,
          high: 282 + i * 0.5,
          low: 278 + i * 0.5,
          close: 280 + i * 0.5,
          volume: 1_000_000,
        })),
        account: { capital_bdt: 1_000_000, risk_per_trade_pct: 1 },
        microstructure: { avg_daily_value_bdt: 25_000_000 },
      }),
    );

    const legacy = {
      risk: {
        key_metrics: { stop_loss: 1, target: 2, buy_zone_low: 1, buy_zone_high: 2 },
        rating: 'approved',
      },
    };

    const enriched = enrichRiskInAnalysis(legacy, fixture);
    expect(enriched.risk_enriched).toBe(true);
    expect(hasStructureStrategy(enriched.risk)).toBe(true);
  });
});
