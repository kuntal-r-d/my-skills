/** Calendar-based OHLCV resampling and multi-timeframe market structure helpers. */

import type { OhlcvBar } from './contract.js';
import { adx, lastValid, sma, splitOhlcv } from './indicators.js';

export type WeinsteinStage = 1 | 2 | 3 | 4;
export type TrendDirection = 'up' | 'down' | 'sideways';
export type DowTrendLevel = 'primary' | 'secondary' | 'minor';

export interface SwingStructure {
  pattern: 'HH_HL' | 'LH_LL' | 'mixed' | 'insufficient';
  higher_highs: boolean;
  higher_lows: boolean;
  lower_highs: boolean;
  lower_lows: boolean;
}

export interface WeinsteinStageResult {
  stage: WeinsteinStage;
  confidence: number;
  ma30: number | null;
  ma30_slope: 'rising' | 'flat' | 'falling' | null;
  price_vs_ma30: 'above' | 'below' | 'at' | null;
  structure: SwingStructure['pattern'];
  range_pct: number | null;
}

export interface DowTrendResult {
  direction: TrendDirection;
  reversal_signal: boolean;
  structure: SwingStructure['pattern'];
}

export interface TimeframeRead {
  trend: TrendDirection;
  stage: WeinsteinStage | null;
  ma_slope: 'rising' | 'flat' | 'falling' | null;
  structure: SwingStructure['pattern'];
  adx: number | null;
  extension_pct: number | null;
  ma_stack: string | null;
}

export interface MultiTimeframeResult {
  daily: TimeframeRead;
  weekly: TimeframeRead;
  monthly: TimeframeRead;
  confluence_score: number;
  alignment: 'bullish' | 'mixed' | 'bearish';
  conflicts: string[];
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function aggregateBars(bars: OhlcvBar[]): OhlcvBar {
  const open = bars[0]!.open;
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const close = bars[bars.length - 1]!.close;
  const volume = bars.reduce((s, b) => s + (b.volume ?? 0), 0);
  return { date: bars[bars.length - 1]!.date, open, high, low, close, volume };
}

/** Group daily bars into calendar weeks (last trading day of each ISO week). */
export function resampleToWeekly(bars: OhlcvBar[]): OhlcvBar[] {
  if (!bars.length) return [];
  const groups = new Map<string, OhlcvBar[]>();
  for (const bar of bars) {
    const key = isoWeekKey(bar.date);
    const list = groups.get(key) ?? [];
    list.push(bar);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, chunk]) => aggregateBars(chunk));
}

/** Group daily bars into calendar months (last trading day of each month). */
export function resampleToMonthly(bars: OhlcvBar[]): OhlcvBar[] {
  if (!bars.length) return [];
  const groups = new Map<string, OhlcvBar[]>();
  for (const bar of bars) {
    const key = monthKey(bar.date);
    const list = groups.get(key) ?? [];
    list.push(bar);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, chunk]) => aggregateBars(chunk));
}

const SWING_WINDOW = 2;

function swingHighs(highs: number[], window = SWING_WINDOW): number[] {
  const out: number[] = [];
  for (let i = window; i < highs.length - window; i++) {
    let isHigh = true;
    for (let j = 1; j <= window; j++) {
      if (highs[i]! <= highs[i - j]! || highs[i]! <= highs[i + j]!) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) out.push(highs[i]!);
  }
  return out;
}

function swingLows(lows: number[], window = SWING_WINDOW): number[] {
  const out: number[] = [];
  for (let i = window; i < lows.length - window; i++) {
    let isLow = true;
    for (let j = 1; j <= window; j++) {
      if (lows[i]! >= lows[i - j]! || lows[i]! >= lows[i + j]!) {
        isLow = false;
        break;
      }
    }
    if (isLow) out.push(lows[i]!);
  }
  return out;
}

/** Detect higher-highs/higher-lows vs lower-highs/lower-lows over recent swings. */
export function computeSwingStructure(
  highs: number[],
  lows: number[],
  lookback = 40,
): SwingStructure {
  const h = highs.slice(-lookback);
  const l = lows.slice(-lookback);
  if (h.length < 10) {
    return {
      pattern: 'insufficient',
      higher_highs: false,
      higher_lows: false,
      lower_highs: false,
      lower_lows: false,
    };
  }
  const sh = swingHighs(h);
  const sl = swingLows(l);
  const higherHighs = sh.length >= 2 && sh[sh.length - 1]! > sh[sh.length - 2]!;
  const lowerHighs = sh.length >= 2 && sh[sh.length - 1]! < sh[sh.length - 2]!;
  const higherLows = sl.length >= 2 && sl[sl.length - 1]! > sl[sl.length - 2]!;
  const lowerLows = sl.length >= 2 && sl[sl.length - 1]! < sl[sl.length - 2]!;

  let pattern: SwingStructure['pattern'] = 'mixed';
  if (higherHighs && higherLows) pattern = 'HH_HL';
  else if (lowerHighs && lowerLows) pattern = 'LH_LL';

  return {
    pattern,
    higher_highs: higherHighs,
    higher_lows: higherLows,
    lower_highs: lowerHighs,
    lower_lows: lowerLows,
  };
}

function maSlope(series: (number | null)[], lookback = 5): 'rising' | 'flat' | 'falling' | null {
  const valid = series.filter((v): v is number => v != null);
  if (valid.length < lookback + 1) return null;
  const recent = valid.slice(-lookback);
  const prior = valid.slice(-lookback - 1, -1);
  if (!prior.length) return null;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const pct = priorAvg ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
  if (pct > 0.5) return 'rising';
  if (pct < -0.5) return 'falling';
  return 'flat';
}

function rangePct(highs: number[], lows: number[], len: number): number | null {
  if (highs.length < len) return null;
  const h = highs.slice(-len);
  const l = lows.slice(-len);
  const hi = Math.max(...h);
  const lo = Math.min(...l);
  if (lo <= 0) return null;
  return ((hi - lo) / lo) * 100;
}

/** Classify Weinstein stage from weekly OHLCV bars using 30-week SMA. */
export function classifyWeinsteinStage(weeklyBars: OhlcvBar[]): WeinsteinStageResult {
  const empty: WeinsteinStageResult = {
    stage: 1,
    confidence: 0.2,
    ma30: null,
    ma30_slope: null,
    price_vs_ma30: null,
    structure: 'insufficient',
    range_pct: null,
  };
  if (weeklyBars.length < 35) return empty;

  const [, h, l, c] = splitOhlcv(weeklyBars);
  const px = c[c.length - 1]!;
  const ma30Series = sma(c, 30);
  const ma30 = lastValid(ma30Series);
  const slope = maSlope(ma30Series, 5);
  const structure = computeSwingStructure(h, l, 30);
  const rng = rangePct(h, l, 20);

  let priceVs: WeinsteinStageResult['price_vs_ma30'] = null;
  if (ma30 != null) {
    const diff = ((px - ma30) / ma30) * 100;
    if (diff > 1) priceVs = 'above';
    else if (diff < -1) priceVs = 'below';
    else priceVs = 'at';
  }

  let stage: WeinsteinStage = 1;
  let confidence = 0.5;

  if (ma30 != null && priceVs === 'above' && slope === 'rising' && structure.pattern === 'HH_HL') {
    stage = 2;
    confidence = 0.85;
  } else if (ma30 != null && priceVs === 'below' && slope === 'falling' && structure.pattern === 'LH_LL') {
    stage = 4;
    confidence = 0.85;
  } else if (slope === 'flat' && priceVs === 'above' && structure.pattern !== 'HH_HL') {
    stage = 3;
    confidence = 0.65;
  } else if (slope === 'flat' || structure.pattern === 'mixed') {
    stage = 1;
    confidence = rng != null && rng < 25 ? 0.7 : 0.5;
  } else if (priceVs === 'above' && slope === 'rising') {
    stage = 2;
    confidence = 0.65;
  } else if (priceVs === 'below' && slope === 'falling') {
    stage = 4;
    confidence = 0.65;
  }

  return {
    stage,
    confidence: Math.round(confidence * 100) / 100,
    ma30: ma30 != null ? Math.round(ma30 * 100) / 100 : null,
    ma30_slope: slope,
    price_vs_ma30: priceVs,
    structure: structure.pattern,
    range_pct: rng != null ? Math.round(rng * 10) / 10 : null,
  };
}

/** Classify Dow trend on resampled bars (primary=monthly, secondary=weekly, minor=daily). */
export function classifyDowTrend(bars: OhlcvBar[], level: DowTrendLevel): DowTrendResult {
  const lookback = level === 'primary' ? 12 : level === 'secondary' ? 20 : 40;
  const [, h, l] = splitOhlcv(bars);
  const structure = computeSwingStructure(h, l, lookback);

  let direction: TrendDirection = 'sideways';
  if (structure.pattern === 'HH_HL') direction = 'up';
  else if (structure.pattern === 'LH_LL') direction = 'down';

  const reversal =
    (direction === 'up' && structure.lower_lows) ||
    (direction === 'down' && structure.higher_highs);

  return { direction, reversal_signal: reversal, structure: structure.pattern };
}

function trendFromMaStack(c: number[]): { trend: TrendDirection; ma_stack: string | null } {
  if (c.length < 200) {
    const s50 = lastValid(sma(c, 50));
    const px = c[c.length - 1]!;
    if (s50 == null) return { trend: 'sideways', ma_stack: null };
    return {
      trend: px > s50 ? 'up' : px < s50 ? 'down' : 'sideways',
      ma_stack: px > s50 ? 'above_50' : 'below_50',
    };
  }
  const s50 = lastValid(sma(c, 50));
  const s150 = lastValid(sma(c, 150));
  const s200 = lastValid(sma(c, 200));
  const px = c[c.length - 1]!;
  if (s50 == null || s150 == null || s200 == null) {
    return { trend: 'sideways', ma_stack: null };
  }
  const stack =
    s50 > s150 && s150 > s200 ? '50>150>200' : s50 < s150 && s150 < s200 ? '50<150<200' : 'mixed';
  let trend: TrendDirection = 'sideways';
  if (px > s50 && stack === '50>150>200') trend = 'up';
  else if (px < s50 && stack === '50<150<200') trend = 'down';
  return { trend, ma_stack: stack };
}

function readTimeframe(bars: OhlcvBar[], tf: 'daily' | 'weekly' | 'monthly'): TimeframeRead {
  const empty: TimeframeRead = {
    trend: 'sideways',
    stage: null,
    ma_slope: null,
    structure: 'insufficient',
    adx: null,
    extension_pct: null,
    ma_stack: null,
  };
  if (bars.length < 30) return empty;

  const [, h, l, c] = splitOhlcv(bars);
  const { trend, ma_stack } = trendFromMaStack(c);
  const structure = computeSwingStructure(h, l, tf === 'monthly' ? 12 : tf === 'weekly' ? 30 : 40);
  const adxResult = adx(h, l, c, 14);
  const adxVal = lastValid(adxResult.adx);

  let stage: WeinsteinStage | null = null;
  let ma_slope: TimeframeRead['ma_slope'] = null;

  if (tf === 'weekly') {
    const ws = classifyWeinsteinStage(bars);
    stage = ws.stage;
    ma_slope = ws.ma30_slope;
  } else if (tf === 'monthly') {
    const ma12 = sma(c, 12);
    ma_slope = maSlope(ma12, 3);
    const px = c[c.length - 1]!;
    const m = lastValid(ma12);
    if (m != null) {
      if (px > m && ma_slope === 'rising') stage = 2;
      else if (px < m && ma_slope === 'falling') stage = 4;
      else stage = 1;
    }
  } else {
    const s50 = lastValid(sma(c, 50));
    const px = c[c.length - 1]!;
    if (s50 != null) {
      ma_slope = maSlope(sma(c, 50), 5);
      const extension = ((px - s50) / s50) * 100;
      return {
        trend,
        stage: px > s50 && ma_slope === 'rising' ? 2 : px < s50 && ma_slope === 'falling' ? 4 : 1,
        ma_slope,
        structure: structure.pattern,
        adx: adxVal != null ? Math.round(adxVal * 10) / 10 : null,
        extension_pct: Math.round(extension * 10) / 10,
        ma_stack,
      };
    }
  }

  const s50 = lastValid(sma(c, Math.min(50, c.length - 1)));
  const px = c[c.length - 1]!;
  const extension =
    s50 != null && s50 > 0 ? Math.round(((px - s50) / s50) * 1000) / 10 : null;

  return {
    trend,
    stage,
    ma_slope,
    structure: structure.pattern,
    adx: adxVal != null ? Math.round(adxVal * 10) / 10 : null,
    extension_pct: extension,
    ma_stack,
  };
}

/** Score multi-timeframe agreement and list conflicts. */
export function computeMultiTimeframeConfluence(
  daily: TimeframeRead,
  weekly: TimeframeRead,
  monthly: TimeframeRead,
): Pick<MultiTimeframeResult, 'confluence_score' | 'alignment' | 'conflicts'> {
  const conflicts: string[] = [];
  let score = 0.5;

  const bullish = (r: TimeframeRead) =>
    r.trend === 'up' || r.stage === 2;
  const bearish = (r: TimeframeRead) =>
    r.trend === 'down' || r.stage === 4;

  const bullCount = [daily, weekly, monthly].filter(bullish).length;
  const bearCount = [daily, weekly, monthly].filter(bearish).length;

  if (bullCount === 3) {
    score = 0.95;
  } else if (bullCount === 2 && bearCount === 0) {
    score = 0.75;
  } else if (bearCount === 3) {
    score = 0.1;
  } else if (bearCount === 2) {
    score = 0.25;
  } else {
    score = 0.5;
  }

  if (bullish(daily) && bearish(weekly)) conflicts.push('daily_uptrend_vs_weekly_bearish');
  if (bullish(daily) && bearish(monthly)) conflicts.push('daily_uptrend_vs_monthly_bearish');
  if (daily.stage === 2 && (weekly.stage === 3 || weekly.stage === 4)) {
    conflicts.push('daily_stage2_vs_weekly_topping_or_decline');
  }
  if (daily.extension_pct != null && daily.extension_pct > 15) {
    conflicts.push('daily_overextended_above_50ma');
  }
  if (weekly.stage === 4) conflicts.push('weekly_stage4_decline');
  if (monthly.stage === 4) conflicts.push('monthly_stage4_decline');

  if (conflicts.length) score = Math.max(0.1, score - conflicts.length * 0.08);

  let alignment: MultiTimeframeResult['alignment'] = 'mixed';
  if (score >= 0.7) alignment = 'bullish';
  else if (score <= 0.35) alignment = 'bearish';

  return {
    confluence_score: Math.round(score * 1000) / 1000,
    alignment,
    conflicts,
  };
}

/** Full multi-timeframe analysis from daily OHLCV bars. */
export function analyzeMultiTimeframe(dailyBars: OhlcvBar[]): MultiTimeframeResult {
  const weekly = resampleToWeekly(dailyBars);
  const monthly = resampleToMonthly(dailyBars);
  const daily = readTimeframe(dailyBars, 'daily');
  const weeklyRead = readTimeframe(weekly, 'weekly');
  const monthlyRead = readTimeframe(monthly, 'monthly');
  const { confluence_score, alignment, conflicts } = computeMultiTimeframeConfluence(
    daily,
    weeklyRead,
    monthlyRead,
  );
  return {
    daily,
    weekly: weeklyRead,
    monthly: monthlyRead,
    confluence_score,
    alignment,
    conflicts,
  };
}

/** Precompute weekly/monthly series for contract caching. */
export function resampleOhlcvTimeframes(bars: OhlcvBar[]): {
  ohlcv_weekly: OhlcvBar[];
  ohlcv_monthly: OhlcvBar[];
} {
  return {
    ohlcv_weekly: resampleToWeekly(bars),
    ohlcv_monthly: resampleToMonthly(bars),
  };
}
