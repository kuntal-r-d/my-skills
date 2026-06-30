import type { OhlcvBar } from '@stock-buddy/core';
import { roundBdt } from './risk-core.js';
import type { TradeLevels } from './risk-core.js';

export const ATR_PERIOD = 14;
const BUY_ZONE_ATR = 0.25;
const STOP_ATR = 2.0;
const TARGET_ATR = 3.0;

export function computeAtrLevels(entry: number, atrV: number): TradeLevels {
  const buyLow = entry - BUY_ZONE_ATR * atrV;
  const buyHigh = entry;
  const stop = entry - STOP_ATR * atrV;
  const target = entry + TARGET_ATR * atrV;
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const riskReward = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const tradeRiskPct = entry > 0 ? (riskPerShare / entry) * 100 : 0;

  return {
    entry,
    buy_zone_low: roundBdt(buyLow) ?? buyLow,
    buy_zone_high: roundBdt(buyHigh) ?? buyHigh,
    stop_loss: roundBdt(stop) ?? stop,
    target: roundBdt(target) ?? target,
    risk_reward: Math.round(riskReward * 100) / 100,
    trade_risk_pct: Math.round(tradeRiskPct * 100) / 100,
  };
}

export function atrReasoning(atrV: number, levels: TradeLevels): string[] {
  return [
    `ATR(${ATR_PERIOD})=${roundBdt(atrV)} BDT. Buy zone ${roundBdt(levels.buy_zone_low)}-${roundBdt(levels.buy_zone_high)} (entry - 0.25*ATR).`,
    `Stop ${roundBdt(levels.stop_loss)} (entry - 2*ATR), target ${roundBdt(levels.target)} (entry + 3*ATR) -> risk:reward 1:${levels.risk_reward}.`,
  ];
}

export function resolveAtrEntry(
  signalEntry: number,
  lastClose: number,
): number {
  return signalEntry > 0 ? signalEntry : lastClose;
}

export function minBarsForAtr(): number {
  return ATR_PERIOD + 1;
}

export type { OhlcvBar };
