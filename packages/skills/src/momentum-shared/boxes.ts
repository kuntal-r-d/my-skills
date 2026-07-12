export interface DarvasBox {
  box_high: number;
  box_low: number;
  box_width_pct: number;
  tightening: boolean;
  contraction_pct: number | null;
  in_box: boolean;
  at_upper_box: boolean;
  breakout: boolean;
  box_stop: number;
}

/** Detect a Darvas-style consolidation box over the lookback window. */
export function detectDarvasBox(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 25,
): DarvasBox | null {
  if (closes.length < lookback + 5) return null;

  const hSlice = highs.slice(-lookback);
  const lSlice = lows.slice(-lookback);
  const cSlice = closes.slice(-lookback);
  const vSlice = volumes.slice(-lookback);

  const boxHigh = Math.max(...hSlice);
  const boxLow = Math.min(...lSlice);
  const px = closes[closes.length - 1]!;
  if (boxLow <= 0 || boxHigh <= boxLow) return null;

  const boxWidthPct = ((boxHigh - boxLow) / boxLow) * 100;

  const priorLen = Math.min(lookback, Math.floor(lookback / 2));
  const priorHigh = Math.max(...highs.slice(-lookback - priorLen, -lookback));
  const priorLow = Math.min(...lows.slice(-lookback - priorLen, -lookback));
  const priorWidth = priorLow > 0 ? ((priorHigh - priorLow) / priorLow) * 100 : boxWidthPct;
  const tightening = boxWidthPct < priorWidth * 0.85;
  const contractionPct = priorWidth > 0 ? Math.round((1 - boxWidthPct / priorWidth) * 1000) / 10 : null;

  const mid = (boxHigh + boxLow) / 2;
  const inBox = px >= boxLow * 0.998 && px <= boxHigh * 1.002;
  const atUpperBox = px >= mid && px <= boxHigh * 1.01;

  const avgVol = vSlice.reduce((a, b) => a + b, 0) / vSlice.length;
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const breakout = px > boxHigh && lastVol > avgVol * 1.5;

  return {
    box_high: Math.round(boxHigh * 100) / 100,
    box_low: Math.round(boxLow * 100) / 100,
    box_width_pct: Math.round(boxWidthPct * 10) / 10,
    tightening,
    contraction_pct: contractionPct,
    in_box: inBox,
    at_upper_box: atUpperBox,
    breakout,
    box_stop: Math.round(boxLow * 100) / 100,
  };
}
