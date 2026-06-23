/** Pure TypeScript technical indicators — canonical implementation for Stock Buddy. */

export type Num = number;
export type NullableNum = number | null;

interface BarSeries {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MacdResult {
  macd: NullableNum[];
  signal: NullableNum[];
  hist: NullableNum[];
}

export interface AdxResult {
  adx: NullableNum[];
  plus_di: NullableNum[];
  minus_di: NullableNum[];
}

export interface BollingerResult {
  mid: NullableNum[];
  upper: NullableNum[];
  lower: NullableNum[];
  pct_b: NullableNum[];
}

function f(xs: number[]): number[] {
  return xs.map((x) => Number(x));
}

export function sma(values: Num[], period: number): NullableNum[] {
  const out: NullableNum[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i]!;
    if (i >= period) s -= values[i - period]!;
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

export function ema(values: Num[], period: number): NullableNum[] {
  const out: NullableNum[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: Num[], period = 14): NullableNum[] {
  const n = closes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  if (n <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    gains += Math.max(ch, 0);
    losses += Math.max(-ch, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  closes: Num[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdResult {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: NullableNum[] = closes.map((_, i) =>
    ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null,
  );
  const vals = line.filter((x): x is number => x != null);
  const sigCompact = ema(vals, signal);
  const sig: NullableNum[] = new Array(closes.length).fill(null);
  let j = 0;
  for (let i = 0; i < closes.length; i++) {
    if (line[i] != null) {
      sig[i] = sigCompact[j] ?? null;
      j++;
    }
  }
  const hist: NullableNum[] = line.map((l, i) =>
    l != null && sig[i] != null ? l - sig[i]! : null,
  );
  return { macd: line, signal: sig, hist };
}

export function roc(closes: Num[], period = 12): NullableNum[] {
  const n = closes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    const prev = closes[i - period]!;
    if (prev) out[i] = ((closes[i]! - prev) / prev) * 100;
  }
  return out;
}

export function trueRange(
  highs: Num[],
  lows: Num[],
  closes: Num[],
): NullableNum[] {
  const n = closes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    out[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
  }
  return out;
}

export function atr(
  highs: Num[],
  lows: Num[],
  closes: Num[],
  period = 14,
): NullableNum[] {
  const tr = trueRange(highs, lows, closes);
  const n = closes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  const trc = tr.filter((x): x is number => x != null);
  if (trc.length < period) return out;
  const first = trc.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const idx = period;
  out[idx] = first;
  let prev = first;
  for (let i = idx + 1; i < n; i++) {
    if (tr[i] == null) continue;
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export function adx(
  highs: Num[],
  lows: Num[],
  closes: Num[],
  period = 14,
): AdxResult {
  const n = closes.length;
  const none: NullableNum[] = new Array(n).fill(null);
  if (n <= 2 * period) {
    return { adx: [...none], plus_di: [...none], minus_di: [...none] };
  }
  const plusDm = new Array(n).fill(0);
  const minusDm = new Array(n).fill(0);
  const trArr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = highs[i]! - highs[i - 1]!;
    const down = lows[i - 1]! - lows[i]!;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    trArr[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
  }

  function wilder(series: number[]): NullableNum[] {
    const sm: NullableNum[] = new Array(n).fill(null);
    let s = series.slice(1, period + 1).reduce((a, b) => a + b, 0);
    sm[period] = s;
    for (let i = period + 1; i < n; i++) {
      s = s - s / period + series[i]!;
      sm[i] = s;
    }
    return sm;
  }

  const str_ = wilder(trArr);
  const sp = wilder(plusDm);
  const sm = wilder(minusDm);
  const plusDi: NullableNum[] = new Array(n).fill(null);
  const minusDi: NullableNum[] = new Array(n).fill(null);
  const dx: NullableNum[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (str_[i]) {
      plusDi[i] = (100 * sp[i]!) / str_[i]!;
      minusDi[i] = (100 * sm[i]!) / str_[i]!;
      const denom = plusDi[i]! + minusDi[i]!;
      dx[i] = denom ? (100 * Math.abs(plusDi[i]! - minusDi[i]!)) / denom : 0;
    }
  }
  const adxOut: NullableNum[] = new Array(n).fill(null);
  const start = 2 * period;
  const dxc = dx.slice(period).filter((x): x is number => x != null);
  if (dxc.length >= period) {
    let first = dxc.slice(0, period).reduce((a, b) => a + b, 0) / period;
    adxOut[start] = first;
    let prev = first;
    for (let i = start + 1; i < n; i++) {
      if (dx[i] != null) {
        prev = (prev * (period - 1) + dx[i]!) / period;
        adxOut[i] = prev;
      }
    }
  }
  return { adx: adxOut, plus_di: plusDi, minus_di: minusDi };
}

export function mfi(
  highs: Num[],
  lows: Num[],
  closes: Num[],
  volumes: Num[],
  period = 14,
): NullableNum[] {
  const n = closes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  const tp = highs.map((_, i) => (highs[i]! + lows[i]! + closes[i]!) / 3);
  const rmf = tp.map((t, i) => t * volumes[i]!);
  for (let i = period; i < n; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j]! > tp[j - 1]!) pos += rmf[j]!;
      else if (tp[j]! < tp[j - 1]!) neg += rmf[j]!;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function bollinger(
  closes: Num[],
  period = 20,
  mult = 2,
): BollingerResult {
  const n = closes.length;
  const mid = sma(closes, period);
  const upper: NullableNum[] = new Array(n).fill(null);
  const lower: NullableNum[] = new Array(n).fill(null);
  const pctb: NullableNum[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const m = mid[i]!;
    const variance =
      window.reduce((acc, x) => acc + (x - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    const rng = upper[i]! - lower[i]!;
    pctb[i] = rng ? (closes[i]! - lower[i]!) / rng : 0.5;
  }
  return { mid, upper, lower, pct_b: pctb };
}

export function obv(closes: Num[], volumes: Num[]): number[] {
  const out = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i]! > closes[i - 1]!) out[i] = out[i - 1] + volumes[i]!;
    else if (closes[i]! < closes[i - 1]!) out[i] = out[i - 1] - volumes[i]!;
    else out[i] = out[i - 1];
  }
  return out;
}

export function vroc(volumes: Num[], period = 14): NullableNum[] {
  const n = volumes.length;
  const out: NullableNum[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    const prev = volumes[i - period]!;
    if (prev) out[i] = ((volumes[i]! - prev) / prev) * 100;
  }
  return out;
}

export function accumDist(
  highs: Num[],
  lows: Num[],
  closes: Num[],
  volumes: Num[],
): number[] {
  const out = new Array(closes.length).fill(0);
  let run = 0;
  for (let i = 0; i < closes.length; i++) {
    const rng = highs[i]! - lows[i]!;
    const mfm = rng
      ? ((closes[i]! - lows[i]!) - (highs[i]! - closes[i]!)) / rng
      : 0;
    run += mfm * volumes[i]!;
    out[i] = run;
  }
  return out;
}

export function lastValid(series: NullableNum[]): NullableNum {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) return series[i];
  }
  return null;
}

export function splitOhlcv(ohlcv: BarSeries[]): [number[], number[], number[], number[], number[]] {
  const o = f(ohlcv.map((b) => b.open));
  const h = f(ohlcv.map((b) => b.high));
  const l = f(ohlcv.map((b) => b.low));
  const c = f(ohlcv.map((b) => b.close));
  const v = f(ohlcv.map((b) => b.volume ?? 0));
  return [o, h, l, c, v];
}
