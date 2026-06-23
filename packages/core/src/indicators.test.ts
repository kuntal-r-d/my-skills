import { describe, expect, it } from 'vitest';
import { atr, macd, mfi, roc, rsi, sma } from './indicators.js';

describe('Indicators', () => {
  it('sma', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = sma(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2.0);
    expect(result[3]).toBe(3.0);
    expect(result[9]).toBe(9.0);
  });

  it('rsi', () => {
    const closes = [
      44, 44.25, 44.5, 43.75, 44.65, 45.12, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
      46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const result = rsi(closes, 14);
    for (let i = 0; i < 14; i++) {
      expect(result[i]).toBeNull();
    }
    expect(result[14]).not.toBeNull();
    expect(result[14]!).toBeGreaterThanOrEqual(0);
    expect(result[14]!).toBeLessThanOrEqual(100);
  });

  it('macd', () => {
    const closes = Array.from({ length: 50 }, (_, i) => i + 1);
    const result = macd(closes, 12, 26, 9);
    expect(result.macd).toHaveLength(50);
    expect(result.signal).toHaveLength(50);
    expect(result.hist).toHaveLength(50);
  });

  it('roc', () => {
    const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 110, 112, 111, 113, 115];
    const result = roc(closes, 5);
    for (let i = 0; i < 5; i++) {
      expect(result[i]).toBeNull();
    }
    expect(result[5]).toBe(4.0);
  });

  it('mfi', () => {
    const highs = [10, 11, 12, 11, 13, 14, 13, 12, 14, 15];
    const lows = [8, 9, 10, 9, 11, 12, 11, 10, 12, 13];
    const closes = [9, 10, 11, 10, 12, 13, 12, 11, 13, 14];
    const volumes = Array(10).fill(1000);
    const result = mfi(highs, lows, closes, volumes, 3);
    for (let i = 0; i < 3; i++) {
      expect(result[i]).toBeNull();
    }
    for (let i = 3; i < result.length; i++) {
      if (result[i] !== null) {
        expect(result[i]!).toBeGreaterThanOrEqual(0);
        expect(result[i]!).toBeLessThanOrEqual(100);
      }
    }
  });

  it('atr', () => {
    const highs = [10, 11, 12, 11, 13, 14, 13, 12, 14, 15].concat(
      [10, 11, 12, 11, 13, 14, 13, 12, 14, 15],
      [10, 11, 12, 11, 13, 14, 13, 12, 14, 15],
    );
    const lows = [8, 9, 10, 9, 11, 12, 11, 10, 12, 13].concat(
      [8, 9, 10, 9, 11, 12, 11, 10, 12, 13],
      [8, 9, 10, 9, 11, 12, 11, 10, 12, 13],
    );
    const closes = [9, 10, 11, 10, 12, 13, 12, 11, 13, 14].concat(
      [9, 10, 11, 10, 12, 13, 12, 11, 13, 14],
      [9, 10, 11, 10, 12, 13, 12, 11, 13, 14],
    );
    const result = atr(highs, lows, closes, 14);
    expect(result).toHaveLength(closes.length);
    for (const val of result) {
      if (val !== null) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('Edge cases', () => {
  it('empty data', () => {
    expect(sma([], 5)).toEqual([]);
    expect(rsi([], 14)).toEqual([]);
  });

  it('insufficient data', () => {
    const values = [1, 2, 3];
    const result = sma(values, 5);
    expect(result.every((x) => x === null)).toBe(true);
  });

  it('negative period', () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, -1);
    expect(result.every((x) => x === null)).toBe(true);
  });
});
