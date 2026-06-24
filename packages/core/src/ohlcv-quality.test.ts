import { describe, expect, it } from 'vitest';
import { isPlausibleOhlcvBar, sanitizeOhlcv } from './ohlcv-quality.js';

describe('sanitizeOhlcv', () => {
  it('drops corrupt stockanalysis-style spikes', () => {
    const bars = [
      { date: '2026-01-01', open: 210, high: 215, low: 208, close: 212, volume: 1000 },
      { date: '2026-01-20', open: 208.5, high: 213.5, low: 1.51, close: 2.63, volume: 0 },
      { date: '2026-02-01', open: 211, high: 216, low: 209, close: 214, volume: 900 },
    ];
    const { bars: clean, dropped } = sanitizeOhlcv(bars);
    expect(dropped).toBe(1);
    expect(clean).toHaveLength(2);
    expect(clean.every((b) => b.close > 100)).toBe(true);
  });

  it('accepts normal DSE bars', () => {
    const bar = { date: '2026-06-01', open: 200, high: 205, low: 198, close: 203, volume: 5000 };
    expect(isPlausibleOhlcvBar(bar, 200)).toBe(true);
  });
});
