import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeFundamentals } from './fundamentals-merge.js';

describe('mergeFundamentals', () => {
  it('prefers StockAnalysis TTM EPS over DSE quarterly basic', () => {
    const { payload, fieldSources } = mergeFundamentals([
      { id: 'dse', payload: { eps_ttm: -4.18, price: 193.1 } },
      { id: 'stockanalysis', payload: { eps_ttm: -2.48, market_cap: 1.696e10 } },
    ]);
    expect(payload.eps_ttm).toBe(-2.48);
    expect(fieldSources.eps_ttm).toBe('stockanalysis');
    expect(payload.market_cap).toBe(1.696e10);
  });

  it('takes ROE and debt/equity from stockanalysis_statistics', () => {
    const { payload } = mergeFundamentals([
      {
        id: 'stockanalysis_statistics',
        payload: { roe: 0.0358, debt_to_equity: 8.94, pb: 1.87 },
      },
    ]);
    expect(payload.roe).toBeCloseTo(0.0358);
    expect(payload.debt_to_equity).toBe(8.94);
    expect(payload.pb).toBe(1.87);
  });

  it('skips zero PE from lankabd for loss-makers', () => {
    const { payload } = mergeFundamentals([
      { id: 'lankabd', payload: { pe: 0, eps_ttm: -4.18 } },
      { id: 'stockanalysis', payload: { eps_ttm: -2.48 } },
    ]);
    expect(payload.pe).toBeUndefined();
  });

  it('clears PE when merged EPS is loss-making', () => {
    const { payload } = mergeFundamentals([
      { id: 'dse', payload: { pe: 77, eps_ttm: -7.4 } },
      { id: 'stockanalysis', payload: { eps_ttm: -2.48 } },
    ]);
    expect(payload.eps_ttm).toBe(-2.48);
    expect(payload.pe).toBeUndefined();
  });

  it('derives P/B from price and NAV when missing', () => {
    const { payload, fieldSources } = mergeFundamentals([
      { id: 'dse', payload: { price: 193.1, book_value_per_share: 85.78 } },
    ]);
    expect(payload.pb).toBeCloseTo(193.1 / 85.78, 2);
    expect(fieldSources.pb).toBe('derived');
  });

  it('stores provenance metadata in payload', () => {
    const { payload, compositeSource } = mergeFundamentals([
      { id: 'dse', payload: { sector: 'Bank' } },
      { id: 'stockanalysis', payload: { beta: 1.1 } },
    ]);
    expect(payload._sources).toEqual(['dse', 'stockanalysis']);
    expect(payload._field_sources).toMatchObject({ sector: 'dse', beta: 'stockanalysis' });
    expect(compositeSource).toBe('dse+stockanalysis');
  });
});
