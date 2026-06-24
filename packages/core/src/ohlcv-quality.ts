/** OHLCV plausibility checks — filters corrupt scraper rows (e.g. mis-parsed lows/closes). */

import type { OhlcvBar } from './contract.js';

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function isPlausibleOhlcvBar(bar: OhlcvBar, refClose: number): boolean {
  const { open, high, low, close } = bar;
  if (![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) return false;
  if (high < low) return false;
  if (close > high * 1.02 || close < low * 0.98) return false;
  if (open > high * 1.02 || open < low * 0.98) return false;
  if (refClose > 0) {
    const ratio = close / refClose;
    if (ratio < 0.45 || ratio > 2.2) return false;
  }
  return true;
}

/** Drop corrupt bars; returns cleaned series sorted by date ascending. */
export function sanitizeOhlcv<T extends OhlcvBar>(bars: T[]): { bars: T[]; dropped: number } {
  if (!bars.length) return { bars: [], dropped: 0 };

  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const refClose = median(sorted.map((b) => b.close).filter((c) => c > 0));

  const kept: T[] = [];
  let dropped = 0;
  let lastClose = refClose;

  for (const bar of sorted) {
    const anchor = lastClose > 0 ? lastClose : refClose;
    if (!isPlausibleOhlcvBar(bar, anchor)) {
      dropped++;
      continue;
    }
    kept.push(bar);
    lastClose = bar.close;
  }

  return { bars: kept, dropped };
}

export function countSuspiciousOhlcvBars(bars: OhlcvBar[]): number {
  if (!bars.length) return 0;
  const ref = median(bars.map((b) => b.close).filter((c) => c > 0));
  return bars.filter((b) => !isPlausibleOhlcvBar(b, ref)).length;
}
