import { roundBdt } from './risk-core.js';
import type { TradeLevels } from './risk-core.js';
import { buildStructureLadder } from './structure-levels.js';

/** Match technical-analysis `levels()` lookback. */
export const STRUCTURE_LOOKBACK = 60;
/** Stop sits this many ATR below support (structure invalidation buffer). */
export const SUPPORT_BUFFER_ATR = 0.5;
/** Minimum risk:reward when resistance is too close. */
export const MIN_RISK_REWARD = 1.5;
/** Within this % above support, price counts as "near support" for buy-zone logic. */
export const NEAR_SUPPORT_PCT = 8;
/** Limit band above support when waiting for a pullback (% of support price). */
export const BUY_BAND_ABOVE_SUPPORT_PCT = 0.02;

export function computeStructureLevels(
  closes: number[],
  lows: number[],
  highs: number[],
  atrV: number,
  signalEntry: number,
): { levels: TradeLevels; reasoning: string[]; flags: string[] } {
  const flags: string[] = [];
  const reasoning: string[] = [];
  const px = signalEntry;
  const ladder = buildStructureLadder(closes, lows, highs, STRUCTURE_LOOKBACK, px);
  const support = ladder.support;
  const resistance = ladder.resistance;

  const distToSupportPct = px > 0 ? ((px - support) / px) * 100 : 0;
  let buyLow: number;
  let buyHigh: number;

  if (distToSupportPct <= NEAR_SUPPORT_PCT) {
    buyLow = support;
    buyHigh = px;
    reasoning.push(
      `Price ${roundBdt(px)} is within ${distToSupportPct.toFixed(1)}% of 60-bar support ${roundBdt(support)} — buy zone spans support to current price.`,
    );
  } else {
    const bandTop = support + Math.max(atrV * 0.5, support * BUY_BAND_ABOVE_SUPPORT_PCT);
    buyLow = support;
    buyHigh = bandTop;
    reasoning.push(
      `Price ${roundBdt(px)} is ${distToSupportPct.toFixed(1)}% above 60-bar support ${roundBdt(support)} — wait for pullback; limit band ${roundBdt(buyLow)}-${roundBdt(buyHigh)}.`,
    );
  }

  const entry = buyHigh;
  let stop = support - SUPPORT_BUFFER_ATR * atrV;
  if (stop >= entry) {
    stop = entry - 2 * atrV;
    flags.push('structure_stop_fallback');
    reasoning.push(
      `Support buffer would place stop above entry — fallback stop ${roundBdt(stop)} at entry - 2*ATR.`,
    );
  } else {
    reasoning.push(
      `Stop ${roundBdt(stop)} below support ${roundBdt(support)} with ${SUPPORT_BUFFER_ATR}*ATR buffer (structure invalidation).`,
    );
  }

  const riskPerShare = entry - stop;
  const minTarget = entry + MIN_RISK_REWARD * riskPerShare;
  let target = resistance;
  let targetSource = 'resistance';

  if (resistance <= entry) {
    target = minTarget;
    targetSource = 'min_risk_reward';
    flags.push('resistance_below_entry');
  } else if (resistance < minTarget) {
    target = minTarget;
    targetSource = 'min_risk_reward';
    flags.push('target_above_resistance');
    reasoning.push(
      `Nearest resistance ${roundBdt(resistance)} yields R:R < ${MIN_RISK_REWARD}:1 — target raised to ${roundBdt(minTarget)} (min R:R).`,
    );
  } else {
    reasoning.push(
      `Target ${roundBdt(target)} at 60-bar resistance ${roundBdt(resistance)} (meets min ${MIN_RISK_REWARD}:1 R:R).`,
    );
  }

  const rewardPerShare = target - entry;
  const riskReward = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const tradeRiskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;

  if (targetSource === 'resistance') {
    reasoning.push(`Structure sizing entry anchored at buy-zone high ${roundBdt(entry)}.`);
  }

  const levels: TradeLevels = {
    entry: roundBdt(entry) ?? entry,
    buy_zone_low: roundBdt(buyLow) ?? buyLow,
    buy_zone_high: roundBdt(buyHigh) ?? buyHigh,
    stop_loss: roundBdt(stop) ?? stop,
    target: roundBdt(target) ?? target,
    risk_reward: Math.round(riskReward * 100) / 100,
    trade_risk_pct: Math.round(tradeRiskPct * 100) / 100,
    support: roundBdt(support) ?? support,
    resistance: roundBdt(resistance) ?? resistance,
    next_support: ladder.next_support,
    next_resistance: ladder.next_resistance,
  };

  if (ladder.next_support != null) {
    reasoning.push(
      `Next support (deeper) ${roundBdt(ladder.next_support)} BDT below primary ${roundBdt(support)}.`,
    );
  }
  if (ladder.next_resistance != null) {
    reasoning.push(
      `Next resistance (higher) ${roundBdt(ladder.next_resistance)} BDT above primary ${roundBdt(resistance)}.`,
    );
  }

  return { levels, reasoning, flags };
}

export function minBarsForStructure(): number {
  return Math.max(STRUCTURE_LOOKBACK, 15);
}
