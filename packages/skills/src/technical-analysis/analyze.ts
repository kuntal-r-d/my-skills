import * as ind from '@stock-buddy/core';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

function clamp(x: number, lo = -1.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, x));
}

function r(x: number | null): number | null {
  return typeof x === 'number' ? Math.round(x * 100) / 100 : x;
}

type MemberResult = [number, Record<string, unknown>, string[]];

function trend(c: number[], h: number[], l: number[]): MemberResult {
  const s50 = ind.sma(c, 50);
  const s150 = ind.sma(c, 150);
  const s200 = ind.sma(c, 200);
  const px = c[c.length - 1]!;
  const a = ind.adx(h, l, c, 14);
  const adxV = ind.lastValid(a.adx) ?? 0.0;
  const pdi = ind.lastValid(a.plus_di) ?? 0.0;
  const mdi = ind.lastValid(a.minus_di) ?? 0.0;
  let score = 0.0;
  const notes: string[] = [];
  const m50 = ind.lastValid(s50);
  const m150 = ind.lastValid(s150);
  const m200 = ind.lastValid(s200);
  if (m200 != null) {
    if (px > m200) {
      score += 0.3;
      notes.push('Price above 200-day MA (long-term uptrend)');
    } else {
      score -= 0.3;
      notes.push('Price below 200-day MA (long-term downtrend)');
    }
  }
  if (m50 != null && m150 != null && m200 != null && m50 > m150 && m150 > m200) {
    score += 0.3;
    notes.push('MA stack 50>150>200 (textbook uptrend)');
  }
  if (adxV >= 25) {
    const bump = pdi >= mdi ? 0.4 : -0.4;
    score += bump;
    notes.push(`ADX ${adxV.toFixed(0)} strong trend, ${pdi >= mdi ? '+DI leads' : '-DI leads'}`);
  } else {
    notes.push(`ADX ${adxV.toFixed(0)} weak/!trending`);
  }
  return [clamp(score), { adx_14: Math.round(adxV * 10) / 10, sma_50: r(m50), sma_200: r(m200) }, notes];
}

function momentumOsc(c: number[], h: number[], l: number[], v: number[]): MemberResult {
  const rsiV = ind.lastValid(ind.rsi(c, 14)) ?? 50.0;
  const mac = ind.macd(c);
  const hist = ind.lastValid(mac.hist);
  const line = ind.lastValid(mac.macd);
  const sig = ind.lastValid(mac.signal);
  const rc = ind.lastValid(ind.roc(c, 12)) ?? 0.0;
  const mf = ind.lastValid(ind.mfi(h, l, c, v, 14)) ?? 50.0;
  let score = 0.0;
  const notes: string[] = [];
  if (rsiV >= 40 && rsiV <= 70) {
    score += 0.25;
    notes.push(`RSI ${rsiV.toFixed(0)} healthy (40-70)`);
  } else if (rsiV > 70) {
    score -= 0.15;
    notes.push(`RSI ${rsiV.toFixed(0)} overbought`);
  } else {
    score -= 0.2;
    notes.push(`RSI ${rsiV.toFixed(0)} weak/oversold`);
  }
  if (line != null && sig != null) {
    if (line > sig) {
      score += 0.25;
      notes.push('MACD above signal (bullish)');
    } else {
      score -= 0.2;
      notes.push('MACD below signal (bearish)');
    }
  }
  if (rc > 0) {
    score += 0.2;
    notes.push(`ROC +${rc.toFixed(1)}% (positive momentum)`);
  } else {
    score -= 0.2;
    notes.push(`ROC ${rc.toFixed(1)}% (negative momentum)`);
  }
  if (mf >= 20 && mf <= 80) score += 0.1;
  return [
    clamp(score),
    { rsi_14: Math.round(rsiV * 10) / 10, macd_hist: r(hist), roc_12: Math.round(rc * 10) / 10, mfi_14: Math.round(mf * 10) / 10 },
    notes,
  ];
}

function chartPattern(c: number[]): MemberResult {
  const window = c.length >= 40 ? c.slice(-40) : c;
  const hi = window.length > 1 ? Math.max(...window.slice(0, -1)) : window[window.length - 1]!;
  const px = c[c.length - 1]!;
  const rng = window.length ? (Math.max(...window) - Math.min(...window)) / (window.reduce((a, b) => a + b, 0) / window.length) : 0;
  let score = 0.0;
  const notes: string[] = [];
  if (px >= hi) {
    score += 0.5;
    notes.push('Breakout above 40-bar high');
  }
  if (rng < 0.12) {
    notes.push('Tight consolidation (low range) — coiling');
    score += 0.1;
  }
  if (px <= Math.min(...window)) {
    score -= 0.5;
    notes.push('Breakdown below 40-bar low');
  }
  return [clamp(score), { breakout_ref_high: r(hi), range_ratio: Math.round(rng * 1000) / 1000 }, notes];
}

function candlestick(o: number[], h: number[], l: number[], c: number[]): MemberResult {
  if (c.length < 2) return [0.0, {}, ['Insufficient bars for candlestick read']];
  const body = c[c.length - 1]! - o[o.length - 1]!;
  const rng = h[h.length - 1]! - l[l.length - 1]! || 1e-9;
  const lowerWick = Math.min(o[o.length - 1]!, c[c.length - 1]!) - l[l.length - 1]!;
  const upperWick = h[h.length - 1]! - Math.max(o[o.length - 1]!, c[c.length - 1]!);
  let score = 0.0;
  const notes: string[] = [];
  if (body > 0 && lowerWick > 2 * Math.abs(body)) {
    score += 0.4;
    notes.push('Hammer-like (bullish rejection of lows)');
  }
  if (body < 0 && upperWick > 2 * Math.abs(body)) {
    score -= 0.4;
    notes.push('Shooting-star-like (bearish rejection of highs)');
  }
  if (
    c[c.length - 1]! > o[o.length - 1]! &&
    c[c.length - 2]! < o[o.length - 2]! &&
    c[c.length - 1]! > o[o.length - 2]! &&
    o[o.length - 1]! < c[c.length - 2]!
  ) {
    score += 0.3;
    notes.push('Bullish engulfing');
  }
  if (notes.length === 0) notes.push('No decisive candlestick signal');
  return [clamp(score), { body_pct_range: Math.round((body / rng) * 100) / 100 }, notes];
}

function levels(c: number[]): MemberResult {
  const px = c[c.length - 1]!;
  const lookback = c.length >= 60 ? c.slice(-60) : c;
  const support = Math.min(...lookback);
  const resistance = Math.max(...lookback);
  const span = resistance - support || 1e-9;
  const pos = (px - support) / span;
  let score = 0.0;
  const notes: string[] = [];
  const distSup = ((px - support) / px) * 100;
  if (distSup < 8) {
    score += 0.3;
    notes.push(`Near support (+${distSup.toFixed(1)}% above) — favourable entry`);
  }
  if (((resistance - px) / px) * 100 < 3) {
    score -= 0.2;
    notes.push('Pressing resistance — overhead supply');
  }
  return [clamp(score), { support: r(support), resistance: r(resistance), range_position: Math.round(pos * 100) / 100 }, notes];
}

function volumeFlow(c: number[], v: number[]): MemberResult {
  const obvSeries = ind.obv(c, v);
  const obvSlope = obvSeries.length >= 2 ? obvSeries[obvSeries.length - 1]! - obvSeries[obvSeries.length - Math.min(10, obvSeries.length)]! : 0.0;
  const avg20 = ind.lastValid(ind.sma(v, 20)) ?? (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const relVol = avg20 ? v[v.length - 1]! / avg20 : 1.0;
  let score = 0.0;
  const notes: string[] = [];
  if (obvSlope > 0) {
    score += 0.3;
    notes.push('OBV rising (accumulation)');
  } else {
    score -= 0.2;
    notes.push('OBV falling (distribution)');
  }
  if (relVol >= 1.5) {
    score += 0.3;
    notes.push(`Volume ${relVol.toFixed(1)}x 20-day avg (confirms move)`);
  } else if (relVol < 0.7) {
    score -= 0.1;
    notes.push('Thin volume — weak confirmation');
  }
  return [clamp(score), { rel_volume: Math.round(relVol * 100) / 100 }, notes];
}

const WEIGHTS: Record<string, number> = {
  trend: 0.25,
  momentum_oscillator: 0.22,
  volume_flow: 0.20,
  levels: 0.13,
  chart_pattern: 0.12,
  candlestick: 0.08,
};

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  const flags: string[] = [];
  if (ohlcv.length < 30) {
    return { skill: 'technical-analysis', error: 'need >=30 OHLCV bars', bars_supplied: ohlcv.length };
  }
  const [o, h, l, c, v] = ind.splitOhlcv(ohlcv);
  if (c.length < 200) flags.push('limited_history_<200_bars');

  const members: Record<string, MemberResult> = {
    trend: trend(c, h, l),
    momentum_oscillator: momentumOsc(c, h, l, v),
    chart_pattern: chartPattern(c),
    candlestick: candlestick(o, h, l, c),
    levels: levels(c),
    volume_flow: volumeFlow(c, v),
  };

  let composite = 0;
  for (const k of Object.keys(members)) composite += WEIGHTS[k]! * members[k]![0];

  const metrics: Record<string, unknown> = {};
  const reasoning: string[] = [];
  const subScores: Record<string, number> = {};
  for (const [name, [sc, mx, notes]] of Object.entries(members)) {
    subScores[name] = Math.round(sc * 1000) / 1000;
    Object.assign(metrics, mx);
    reasoning.push(...notes);
  }

  const bulls = Object.entries(members).filter(([, [sc]]) => sc > 0.15).map(([k]) => k);
  const bears = Object.entries(members).filter(([, [sc]]) => sc < -0.15).map(([k]) => k);
  let chair: string;
  let conflictPenalty: number;
  if (bulls.length && bears.length) {
    chair = `Mixed: ${bulls.join(', ')} bullish vs ${bears.join(', ')} bearish — confidence downgraded for internal conflict.`;
    conflictPenalty = 0.2;
  } else if (bulls.length && !bears.length) {
    chair = `Broad agreement bullish across ${bulls.length} members.`;
    conflictPenalty = 0.0;
  } else if (bears.length && !bulls.length) {
    chair = `Broad agreement bearish across ${bears.length} members.`;
    conflictPenalty = 0.0;
  } else {
    chair = 'No member shows a decisive signal — neutral.';
    conflictPenalty = 0.1;
  }

  const ms = (data.microstructure as Record<string, unknown>) ?? {};
  if (ms.circuit_state === 'limit_up' || ms.circuit_state === 'limit_down' || ms.floor_price) {
    flags.push('microstructure_circuit_or_floor');
  }

  const confidence = clamp(
    0.55 + 0.4 * Math.abs(composite) - conflictPenalty - (flags.includes('limited_history_<200_bars') ? 0.15 : 0),
    0.1,
    0.95,
  );

  let rating: string;
  if (composite >= 0.5) rating = 'strong_bullish';
  else if (composite >= 0.15) rating = 'bullish';
  else if (composite <= -0.5) rating = 'strong_bearish';
  else if (composite <= -0.15) rating = 'bearish';
  else rating = 'neutral';

  return {
    skill: 'technical-analysis',
    ticker: data.ticker,
    mode: data.mode ?? 'momentum',
    as_of: data.as_of,
    score: Math.round(composite * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    rating,
    sub_scores: subScores,
    chair_note: chair,
    key_metrics: metrics,
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
