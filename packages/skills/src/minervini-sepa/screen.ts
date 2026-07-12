import * as ind from '@stock-buddy/core';
import { slopeRising } from '../momentum-shared/grading.js';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';
import { detectVcp } from '../momentum-shared/vcp.js';

const CATEGORY_WEIGHTS = {
  trend_template: 0.35,
  vcp: 0.25,
  fundamentals: 0.25,
  risk: 0.15,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  trend_template: [1, 2, 3, 4, 5, 6, 7, 8],
  vcp: [9, 10, 11],
  fundamentals: [12, 13],
  risk: [14, 15],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  if (ohlcv.length < 30) {
    return { skill: 'minervini-sepa', error: 'need >=30 OHLCV bars', bars_supplied: ohlcv.length };
  }

  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1]!;
  const flags: string[] = [];
  const fundamentals = (data.fundamentals as Record<string, unknown>) ?? {};

  if (c.length < 200) flags.push('limited_history_<200_bars');

  const s50 = ind.sma(c, 50);
  const s150 = ind.sma(c, 150);
  const s200 = ind.sma(c, 200);
  const m50 = ind.lastValid(s50);
  const m150 = ind.lastValid(s150);
  const m200 = ind.lastValid(s200);

  const hi52 = Math.max(...c.slice(-Math.min(252, c.length)));
  const lo52 = Math.min(...c.slice(-Math.min(252, c.length)));

  const atrSeries = ind.atr(h, l, c, 14);
  const atrV = ind.lastValid(atrSeries) ?? 0;
  const atrRatio = px ? atrV / px : null;

  const vcpData = detectVcp(h, l, c, v);
  const vcpTightening = vcpData?.progressive ?? null;
  const seg1 = vcpData?.segments[0]?.range_pct ?? null;
  const seg2 = vcpData?.segments[1]?.range_pct ?? null;
  const seg3 = vcpData?.segments[2]?.range_pct ?? null;

  const atrPrior = ind.lastValid(atrSeries.slice(0, -10)) ?? null;
  const atrDeclining = atrV != null && atrPrior != null ? atrV < atrPrior : null;

  const epsHist = (fundamentals.eps_history as number[]) ?? [];
  let epsGrowth: boolean | null = null;
  if (epsHist.length >= 2 && epsHist[epsHist.length - 2]) {
    const g =
      (epsHist[epsHist.length - 1]! - epsHist[epsHist.length - 2]!) /
      Math.abs(epsHist[epsHist.length - 2]!);
    epsGrowth = g >= 0.2;
  }

  let earnAccel: boolean | null = null;
  if (epsHist.length >= 3 && epsHist[epsHist.length - 2] && epsHist[epsHist.length - 3]) {
    const latestG =
      (epsHist[epsHist.length - 1]! - epsHist[epsHist.length - 2]!) /
      Math.abs(epsHist[epsHist.length - 2]!);
    const priorG =
      (epsHist[epsHist.length - 2]! - epsHist[epsHist.length - 3]!) /
      Math.abs(epsHist[epsHist.length - 3]!);
    earnAccel = latestG > priorG;
  }

  const revenueHist = (fundamentals.revenue_history as number[]) ?? [];
  let revGrowth: boolean | null = null;
  if (revenueHist.length >= 2 && revenueHist[revenueHist.length - 2]) {
    const g =
      (revenueHist[revenueHist.length - 1]! - revenueHist[revenueHist.length - 2]!) /
      Math.abs(revenueHist[revenueHist.length - 2]!);
    revGrowth = g >= 0.2;
  }

  const col = new CriterionCollector();

  col.add('trend_template', 'Close > 50-day MA', m50 != null ? px > m50 : null,
    'Price above the 50-day average shows recent strength.', { close: px, ma50: m50 }, m50 == null ? ['ohlcv'] : undefined);
  col.add('trend_template', 'Close > 150-day MA', m150 != null ? px > m150 : null,
    'Above the 150-day average confirms medium-term uptrend.', { close: px, ma150: m150 }, m150 == null ? ['ohlcv'] : undefined);
  col.add('trend_template', 'Close > 200-day MA', m200 != null ? px > m200 : null,
    'Above the 200-day average marks a long-term Stage 2 uptrend.', { close: px, ma200: m200 }, m200 == null ? ['ohlcv'] : undefined);
  col.add('trend_template', '50-day MA > 150-day MA', m50 != null && m150 != null ? m50 > m150 : null,
    'Short average above medium average — momentum improving.', { ma50: m50, ma150: m150 });
  col.add('trend_template', '150-day MA > 200-day MA', m150 != null && m200 != null ? m150 > m200 : null,
    'MA stack aligned upward.', { ma150: m150, ma200: m200 });
  const rising200 = slopeRising(s200, 21);
  col.add('trend_template', '200-day MA rising (~1 month)', rising200,
    'Rising long-term average means the trend is still building.', { rising: rising200 }, rising200 == null ? ['ohlcv'] : undefined);
  col.add('trend_template', 'Within 25% of 52-week high', px >= 0.75 * hi52,
    'Leaders trade near highs.', { close: px, high_52w: hi52 });
  col.add('trend_template', '>= 30% above 52-week low', lo52 > 0 && px >= 1.30 * lo52,
    'Strong recovery off lows.', { close: px, low_52w: lo52 });

  col.add('vcp', 'Volatility contraction (ranges tightening)', vcpTightening,
    'VCP: each consolidation segment narrower than the last.', { seg1, seg2, seg3 }, vcpTightening == null ? ['ohlcv'] : undefined);
  col.add('vcp', 'ATR declining vs prior segment', atrDeclining,
    'Falling ATR shows volatility drying up before a breakout.', { atr: atrV, atr_prior: atrPrior });
  col.add('vcp', 'Final contraction tightest', vcpData?.final_tightest ?? null,
    'VCP final segment should be the narrowest before breakout.', { final_range_pct: vcpData?.final_range_pct }, vcpData == null ? ['ohlcv'] : undefined);

  col.add('fundamentals', 'EPS growth >= 20% (latest period)', epsGrowth,
  'Minervini wants accelerating earnings growth of 20%+.', { eps_history: epsHist }, epsGrowth == null ? ['eps_history'] : undefined);
  col.add('fundamentals', 'Earnings acceleration (growth speeding up)', earnAccel ?? revGrowth,
    'Each period growth beating the prior signals a catalyst.', { eps_accel: earnAccel, rev_growth_20pct: revGrowth },
    earnAccel == null && revGrowth == null ? ['eps_history'] : undefined);

  col.add('risk', 'ATR/price < 6%', atrRatio != null ? atrRatio < 0.06 : null,
    'Controlled volatility allows tighter stops.', { atr_ratio: atrRatio });
  const extension = m50 != null && m50 > 0 ? ((px - m50) / m50) * 100 : null;
  col.add('risk', 'Not extended >15% above 50-day MA', extension != null ? extension <= 15 : null,
    'Avoid chasing extended leaders.', { pct_above_ma50: extension }, extension == null ? ['ohlcv'] : undefined);

  return buildChecklistOutput({
    skill: 'minervini-sepa',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 15,
    extraKeyMetrics: {
      formulas: { atr: atrV, ma50: m50, ma200: m200, rel_volume: v.length ? v[v.length - 1]! / (ind.lastValid(ind.sma(v, 20)) ?? 1) : null },
    },
  });
}
