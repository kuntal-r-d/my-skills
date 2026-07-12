import * as ind from '@stock-buddy/core';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';

const CATEGORY_WEIGHTS = { C: 0.15, A: 0.12, N: 0.13, S: 0.15, L: 0.18, I: 0.12, M: 0.15 };
const CATEGORY_CRITERIA: Record<string, number[]> = {
  C: [1, 2],
  A: [3, 4],
  N: [5, 6],
  S: [7, 8],
  L: [9, 10],
  I: [11, 12],
  M: [13, 14],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  if (ohlcv.length < 30) {
    return { skill: 'can-slim', error: 'need >=30 OHLCV bars', bars_supplied: ohlcv.length };
  }

  const [, , , c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1]!;
  const flags: string[] = [];
  const fundamentals = (data.fundamentals as Record<string, unknown>) ?? {};
  const shareholding = (data.shareholding as Record<string, unknown>[]) ?? [];
  const funds = (data.funds as Record<string, unknown>[]) ?? [];
  const mkt = (data.market_index as ind.OhlcvBar[]) ?? [];

  const hi52 = Math.max(...c.slice(-Math.min(252, c.length)));
  const rocSeries = ind.roc(c, 12);
  const rocV = ind.lastValid(rocSeries);
  const avg20Vol = ind.lastValid(ind.sma(v, 20)) ?? 1;
  const relVol = avg20Vol ? v[v.length - 1]! / avg20Vol : 1;

  let mktRoc: number | null = null;
  let mktAbove200: boolean | null = null;
  if (mkt.length >= 13) {
    const mc = mkt.map((b) => Number(b.close));
    const prev = mc[mc.length - 13]!;
    if (prev) mktRoc = ((mc[mc.length - 1]! - prev) / prev) * 100;
    if (mc.length >= 200) {
      const m200 = ind.lastValid(ind.sma(mc, 200));
      mktAbove200 = m200 != null ? mc[mc.length - 1]! > m200 : null;
    } else if (mc.length >= 50) {
      mktAbove200 = mktRoc != null ? mktRoc > 0 : null;
    }
  }

  const epsHist = (fundamentals.eps_history as number[]) ?? [];
  let currentEpsGrowth: boolean | null = null;
  if (epsHist.length >= 2 && epsHist[epsHist.length - 2]) {
    const g = (epsHist[epsHist.length - 1]! - epsHist[epsHist.length - 2]!) / Math.abs(epsHist[epsHist.length - 2]!);
    currentEpsGrowth = g >= 0.18;
  }

  let annualCagr: boolean | null = null;
  if (epsHist.length >= 5 && epsHist[0]! > 0) {
    const years = epsHist.length - 1;
    const cagr = (epsHist[epsHist.length - 1]! / epsHist[0]!) ** (1 / years) - 1;
    annualCagr = cagr > 0;
  }

  const surprise = fundamentals.earnings_surprise;
  const surprisePass = surprise == null ? null : Number(surprise) > 0;
  if (surprise == null) flags.push('missing:earnings_surprise');

  const nearHigh = px >= 0.85 * hi52;

  const sharesOut = fundamentals.shares_outstanding as number | undefined;
  const floatOk = sharesOut != null ? sharesOut < 500_000_000 : null;

  let relStrength: boolean | null = null;
  let relMissing: string[] | undefined;
  if (rocV != null && mktRoc != null) relStrength = rocV > mktRoc;
  else if (rocV != null) {
    flags.push('missing:market_index');
    relMissing = ['market_index'];
  }

  let instRising: boolean | null = null;
  if (shareholding.length >= 2) {
    const inst = shareholding.map((r) => Number(r.institutional_pct ?? r.institutional ?? 0));
    instRising = inst[inst.length - 1]! > inst[inst.length - 2]!;
  } else if (funds.length > 0) {
    instRising = funds.length >= 2;
  }

  const col = new CriterionCollector();

  col.add('C', 'Current quarterly EPS growth >= 18%', currentEpsGrowth,
    'CAN SLIM C: current earnings must be up sharply.', { eps_history: epsHist }, currentEpsGrowth == null ? ['eps_history'] : undefined);
  col.add('C', 'Earnings trend positive (latest > prior)', epsHist.length >= 2 ? epsHist[epsHist.length - 1]! > epsHist[epsHist.length - 2]! : null,
    'Latest EPS above the prior period.', { latest: epsHist[epsHist.length - 1] });

  col.add('A', 'Annual EPS growth positive (multi-year)', annualCagr,
    'CAN SLIM A: sustained annual earnings growth.', { eps_history: epsHist }, annualCagr == null ? ['eps_history'] : undefined);
  col.add('A', 'ROE >= 15% (quality proxy)', fundamentals.roe != null ? Number(fundamentals.roe) >= 15 : null,
    'Strong return on equity supports growth story.', { roe: fundamentals.roe }, fundamentals.roe == null ? ['roe'] : undefined);

  col.add('N', 'Within 15% of 52-week high', nearHigh,
    'New highs signal leadership.', { close: px, high_52w: hi52 });
  col.add('N', 'Positive earnings surprise', surprisePass,
    'Catalyst from beating estimates.', { earnings_surprise: surprise }, surprise == null ? ['earnings_surprise'] : undefined);

  col.add('S', 'Relative volume > 1.2x (demand)', relVol > 1.2,
    'Supply/demand: heavy volume shows institutional interest.', { relative_volume: relVol });
  col.add('S', 'Reasonable supply (not mega-cap dilution)', floatOk,
    'Smaller supply can move faster on demand.', { shares_outstanding: sharesOut }, floatOk == null ? ['shares_outstanding'] : undefined);

  col.add('L', 'Relative strength vs market', relStrength,
    'Leader outperforms the index.', { stock_roc: rocV, market_roc: mktRoc }, relMissing);
  col.add('L', '12-month ROC positive', rocV != null ? rocV > 0 : null,
    'Positive rate of change over 12 months.', { roc_12: rocV });

  col.add('I', 'Institutional sponsorship rising', instRising,
    'Funds accumulating the name.', { shareholding_rows: shareholding.length }, instRising == null ? ['shareholding'] : undefined);
  col.add('I', 'Fund holder count >= 2', funds.length >= 2 ? true : funds.length === 0 ? null : false,
    'Multiple funds holding adds sponsorship.', { fund_count: funds.length }, funds.length === 0 ? ['funds'] : undefined);

  const marketUp = mktAbove200 === true || (mktRoc != null && mktRoc > 0);
  col.add('M', 'Market in uptrend', mkt.length ? marketUp : null,
    'CAN SLIM M: only trade when the general market is supportive.', { market_roc: mktRoc, above_200ma: mktAbove200 }, mkt.length < 13 ? ['market_index'] : undefined);
  col.add('M', 'Market 3M ROC positive', mktRoc != null ? mktRoc > 0 : null,
    'Index momentum confirms risk-on backdrop.', { market_roc_3m: mktRoc }, mktRoc == null ? ['market_index'] : undefined);

  return buildChecklistOutput({
    skill: 'can-slim',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 14,
    extraKeyMetrics: {
      formulas: { roc_12: rocV, relative_volume: Math.round(relVol * 100) / 100, market_roc: mktRoc },
    },
  });
}
