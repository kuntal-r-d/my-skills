import * as ind from '@stock-buddy/core';
import type { OhlcvBar } from '@stock-buddy/core';

export interface MomentumRotation {
  roc_1m: number | null;
  roc_3m: number | null;
  roc_6m: number | null;
  roc_12m: number | null;
  momentum_age_days: number | null;
  dual_momentum: { absolute: boolean | null; relative: boolean | null };
  rebalance_note: string;
}

const TRADING_DAYS = { m1: 21, m3: 63, m6: 126, m12: 252 };

function rocAt(c: number[], periods: number): number | null {
  if (c.length <= periods) return null;
  const prev = c[c.length - 1 - periods]!;
  const cur = c[c.length - 1]!;
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

/** REQ-030: momentum rotation timing metrics from OHLCV. */
export function computeMomentumRotation(ohlcv: OhlcvBar[]): MomentumRotation {
  if (ohlcv.length < 30) {
    return {
      roc_1m: null,
      roc_3m: null,
      roc_6m: null,
      roc_12m: null,
      momentum_age_days: null,
      dual_momentum: { absolute: null, relative: null },
      rebalance_note: 'Insufficient history for rotation metrics.',
    };
  }

  const c = ohlcv.map((b) => Number(b.close));
  const roc1 = rocAt(c, TRADING_DAYS.m1);
  const roc3 = rocAt(c, TRADING_DAYS.m3);
  const roc6 = rocAt(c, TRADING_DAYS.m6);
  const roc12 = rocAt(c, TRADING_DAYS.m12);

  let momentumAge: number | null = null;
  const rsiSeries = ind.rsi(c, 14);
  let streak = 0;
  for (let i = rsiSeries.length - 1; i >= 0; i--) {
    const v = rsiSeries[i];
    if (v != null && v >= 50 && v <= 75) streak++;
    else break;
  }
  momentumAge = streak > 0 ? streak : null;

  const absolute = roc3 != null ? roc3 > 0 : null;
  const relative = roc3 != null && roc12 != null ? roc3 > roc12 / 4 : null;

  return {
    roc_1m: roc1 != null ? Math.round(roc1 * 100) / 100 : null,
    roc_3m: roc3 != null ? Math.round(roc3 * 100) / 100 : null,
    roc_6m: roc6 != null ? Math.round(roc6 * 100) / 100 : null,
    roc_12m: roc12 != null ? Math.round(roc12 * 100) / 100 : null,
    momentum_age_days: momentumAge,
    dual_momentum: { absolute, relative },
    rebalance_note:
      'Monthly rebalancing recommended — avoid daily churn. Watch RSI > 80 for crash protection.',
  };
}
