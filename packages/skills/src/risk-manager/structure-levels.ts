import { roundBdt } from './risk-core.js';

const SWING_WINDOW = 2;
/** Merge swing levels within this % of each other. */
const CLUSTER_PCT = 1.5;

export interface StructureLadder {
  support: number;
  resistance: number;
  next_support: number | null;
  next_resistance: number | null;
}

function clusterLevels(levels: number[]): number[] {
  const sorted = [...levels].filter((x) => x > 0).sort((a, b) => a - b);
  const out: number[] = [];
  for (const level of sorted) {
    const last = out[out.length - 1];
    if (last == null || Math.abs(level - last) / last > CLUSTER_PCT / 100) {
      out.push(level);
    }
  }
  return out;
}

function swingLows(lows: number[], window = SWING_WINDOW): number[] {
  const out: number[] = [];
  for (let i = window; i < lows.length - window; i++) {
    const v = lows[i]!;
    let isSwing = true;
    for (let j = 1; j <= window; j++) {
      if (v >= lows[i - j]! || v >= lows[i + j]!) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) out.push(v);
  }
  return out;
}

function swingHighs(highs: number[], window = SWING_WINDOW): number[] {
  const out: number[] = [];
  for (let i = window; i < highs.length - window; i++) {
    const v = highs[i]!;
    let isSwing = true;
    for (let j = 1; j <= window; j++) {
      if (v <= highs[i - j]! || v <= highs[i + j]!) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) out.push(v);
  }
  return out;
}

/** Nearest and next structural levels relative to price. */
export function buildStructureLadder(
  closes: number[],
  lows: number[],
  highs: number[],
  lookback: number,
  price: number,
): StructureLadder {
  const n = closes.length;
  const start = Math.max(0, n - lookback);
  const cSlice = closes.slice(start);
  const lSlice = lows.slice(start);
  const hSlice = highs.slice(start);

  const rangeSupport = Math.min(...cSlice);
  const rangeResistance = Math.max(...cSlice);

  const supportPool = clusterLevels([rangeSupport, ...swingLows(lSlice)]);
  const resistancePool = clusterLevels([rangeResistance, ...swingHighs(hSlice)]);

  const supportsBelow = supportPool.filter((s) => s <= price * 1.002).sort((a, b) => b - a);
  const resistancesAbove = resistancePool.filter((r) => r >= price * 0.998).sort((a, b) => a - b);

  const support = supportsBelow[0] ?? rangeSupport;
  const resistance = resistancesAbove[0] ?? rangeResistance;

  const deeper = supportPool.filter((s) => s < support * (1 - CLUSTER_PCT / 100)).sort((a, b) => b - a);
  const higher = resistancePool.filter((r) => r > resistance * (1 + CLUSTER_PCT / 100)).sort((a, b) => a - b);

  const next_support = deeper[0] ?? supportsBelow[1] ?? null;
  const next_resistance = higher[0] ?? resistancesAbove[1] ?? null;

  return {
    support: roundBdt(support) ?? support,
    resistance: roundBdt(resistance) ?? resistance,
    next_support: next_support != null ? roundBdt(next_support) : null,
    next_resistance: next_resistance != null ? roundBdt(next_resistance) : null,
  };
}
