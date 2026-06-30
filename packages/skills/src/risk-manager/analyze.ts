import * as ind from '@stock-buddy/core';
import {
  ATR_PERIOD,
  atrReasoning,
  computeAtrLevels,
  minBarsForAtr,
  resolveAtrEntry,
} from './atr-strategy.js';
import {
  computeSizing,
  evaluateGates,
  num,
  roundBdt,
} from './risk-core.js';
import type { SizedTrade, TradeLevels } from './risk-core.js';
import {
  computeStructureLevels,
  minBarsForStructure,
} from './structure-strategy.js';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';
export const SKILL = 'risk-manager';

export type RiskStrategyId = 'atr' | 'structure';

function buildStrategyResult(input: {
  strategy: RiskStrategyId;
  levels: TradeLevels;
  atrV: number;
  capital: number;
  riskPct: number;
  mode: string;
  ms: Record<string, unknown>;
  portfolio: Record<string, unknown>;
  sector?: string;
  reasoning: string[];
  flags: string[];
}): Record<string, unknown> {
  const { strategy, levels, atrV, capital, riskPct, mode, ms, portfolio, sector, reasoning, flags } =
    input;

  const riskPerShare = levels.entry - levels.stop_loss;
  const riskAmount = (capital * riskPct) / 100;
  const rawShares = riskPerShare > 0 ? riskAmount / riskPerShare : 0;
  const capValue = Math.min(0.25 * capital, 0.05 * capital);
  const capShares = levels.entry > 0 ? capValue / levels.entry : 0;
  const capped = rawShares > capShares;

  const sized = computeSizing(levels, capital, riskPct, atrV, reasoning, flags);
  const { rating, gates, score } = evaluateGates({
    mode,
    ms,
    portfolio,
    sector,
    positionValue: sized.position_value_bdt,
    capital,
    actualRiskAmount: sized.risk_amount_bdt,
    capped,
    riskReward: sized.risk_reward,
    flags,
    reasoning,
  });

  const keyMetrics: Record<string, unknown> = {
    atr: roundBdt(atrV),
    entry: roundBdt(levels.entry),
    buy_zone_low: roundBdt(levels.buy_zone_low),
    buy_zone_high: roundBdt(levels.buy_zone_high),
    stop_loss: roundBdt(levels.stop_loss),
    target: roundBdt(levels.target),
    risk_reward: sized.risk_reward,
    suggested_shares: sized.suggested_shares,
    position_value_bdt: roundBdt(sized.position_value_bdt),
    pct_of_capital: sized.pct_of_capital,
    trade_risk_pct: sized.trade_risk_pct,
    risk_amount_bdt: roundBdt(sized.risk_amount_bdt),
    risk_pct_of_capital: sized.risk_pct_of_capital,
  };

  if (levels.support != null) keyMetrics.support = levels.support;
  if (levels.resistance != null) keyMetrics.resistance = levels.resistance;
  keyMetrics.next_support = levels.next_support ?? null;
  keyMetrics.next_resistance = levels.next_resistance ?? null;

  return {
    strategy,
    score,
    confidence: score,
    rating,
    key_metrics: keyMetrics,
    gates,
    reasoning,
    flags,
  };
}

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  const minBars = Math.max(minBarsForAtr(), minBarsForStructure());
  if (ohlcv.length < minBars) {
    return {
      skill: SKILL,
      error: `need >=${minBars} OHLCV bars for ATR(${ATR_PERIOD}) and structure levels`,
      bars_supplied: ohlcv.length,
    };
  }

  const account = (data.account as Record<string, unknown>) ?? {};
  const capital = num(account.capital_bdt);
  if (capital <= 0) return { skill: SKILL, error: 'account.capital_bdt must be > 0' };
  let riskPct = num(account.risk_per_trade_pct, 1.0);
  if (riskPct <= 0) riskPct = 1.0;

  const [, h, l, c] = ind.splitOhlcv(ohlcv);
  const atrV = ind.lastValid(ind.atr(h, l, c, ATR_PERIOD));
  if (!atrV || atrV <= 0) return { skill: SKILL, error: 'could not compute a positive ATR' };

  const signal = (data.signal as Record<string, unknown>) ?? {};
  const mode = (signal.mode as string) ?? (data.mode as string) ?? 'momentum';
  const signalEntry = num(signal.entry);
  const lastClose = c[c.length - 1]!;
  const atrEntry = resolveAtrEntry(signalEntry, lastClose);
  const structureEntry = signalEntry > 0 ? signalEntry : lastClose;
  if (atrEntry <= 0 || structureEntry <= 0) {
    return { skill: SKILL, error: 'entry price must be > 0' };
  }

  const ms = (data.microstructure as Record<string, unknown>) ?? {};
  const portfolio = (data.portfolio as Record<string, unknown>) ?? {};
  const sector = ((data.fundamentals as Record<string, unknown>) ?? {}).sector as string | undefined;

  const atrLevels = computeAtrLevels(atrEntry, atrV);
  const atrResult = buildStrategyResult({
    strategy: 'atr',
    levels: atrLevels,
    atrV,
    capital,
    riskPct,
    mode,
    ms,
    portfolio,
    sector,
    reasoning: atrReasoning(atrV, atrLevels),
    flags: [],
  });

  const structureSeed = computeStructureLevels(c, l, h, atrV, structureEntry);
  const structureResult = buildStrategyResult({
    strategy: 'structure',
    levels: structureSeed.levels,
    atrV,
    capital,
    riskPct,
    mode,
    ms,
    portfolio,
    sector,
    reasoning: structureSeed.reasoning,
    flags: structureSeed.flags,
  });

  const primary = atrResult;

  return {
    skill: SKILL,
    ticker: data.ticker,
    mode,
    as_of: data.as_of,
    active_strategy: 'atr',
    strategy: 'atr',
    score: primary.score,
    confidence: primary.confidence,
    rating: primary.rating,
    key_metrics: primary.key_metrics,
    gates: primary.gates,
    reasoning: primary.reasoning,
    flags: primary.flags,
    strategies: {
      atr: atrResult,
      structure: structureResult,
    },
    disclaimer: DISCLAIMER,
  };
}

export type { SizedTrade, TradeLevels };
