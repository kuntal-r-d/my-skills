import { buildCriterionEducation } from '@stock-buddy/core';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const BUCKET_WEIGHTS = {
  buffett: 0.35,
  lynch: 0.30,
  graham: 0.35,
  quality: (0.35 + 0.30 + 0.35) / 3.0,
};

const DEFAULT_INFLATION = 0.06;

interface Criterion {
  id: number;
  bucket: string;
  label: string;
  passed: boolean | null;
  value: unknown;
  explanation: string;
  missing_fields?: string[];
  levels?: ReturnType<typeof buildCriterionEducation>;
}

type CriterionResult = {
  passed: boolean | null;
  value: unknown;
  missing?: string[];
};

function gradeAndGpa(score: number): [string, number] {
  const table: [number, string, number][] = [
    [0.9, 'A+', 4.0], [0.8, 'A', 3.7], [0.7, 'B+', 3.3],
    [0.6, 'B', 3.0], [0.5, 'C', 2.0], [0.4, 'D', 1.0],
  ];
  for (const [thr, g, gpa] of table) {
    if (score >= thr) return [g, gpa];
  }
  return ['F', 0.0];
}

export function checklist(data: Record<string, unknown>): Record<string, unknown> {
  const f = data.fundamentals;
  if (!f || typeof f !== 'object') {
    return { skill: 'value-investment-checklist', error: 'fundamentals object is required' };
  }

  const fund = f as Record<string, unknown>;
  const macro = (data.macro as Record<string, unknown>) ?? {};
  const inflation = (macro.inflation as number) ?? DEFAULT_INFLATION;
  const flags: string[] = [];
  const crit: Criterion[] = [];

  function missing(...fields: string[]): Pick<CriterionResult, 'passed' | 'missing'> {
    for (const f of fields) flags.push(`missing:${f}`);
    return { passed: null, missing: fields };
  }

  function addCriterion(
    id: number,
    bucket: string,
    label: string,
    result: CriterionResult,
    expl: string,
  ): void {
    crit.push({
      id,
      bucket,
      label,
      passed: result.passed,
      value: result.value,
      explanation: expl,
      missing_fields: result.missing,
      levels: buildCriterionEducation(label, expl, result.value, 'investment', {
        passed: result.passed,
        missingFields: result.missing,
      }),
    });
  }

  const g = (key: string) => fund[key];
  const epsHist = (g('eps_history') as number[]) ?? [];
  const price = g('price');
  const moat = g('moat');
  const roe = g('roe') as number | undefined;
  const de = g('debt_to_equity') as number | undefined;
  const pm = g('profit_margin') as number | undefined;
  const fcf = g('free_cash_flow') as number | undefined;

  addCriterion(1, 'buffett', 'Economic moat present',
    moat != null ? { passed: Boolean(moat), value: moat } : { ...missing('moat'), value: moat },
    'A durable competitive advantage protects long-term profits.');
  addCriterion(2, 'buffett', 'ROE > 15%',
    roe != null ? { passed: roe > 0.15, value: roe } : { ...missing('roe'), value: roe },
    'High return on equity means the company compounds shareholder money well.');
  addCriterion(3, 'buffett', 'Debt/Equity < 0.5',
    de != null ? { passed: de < 0.5, value: de } : { ...missing('debt_to_equity'), value: de },
    'Low debt makes the business resilient in downturns.');
  addCriterion(4, 'buffett', 'Profit margin > 20%',
    pm != null ? { passed: pm > 0.20, value: pm } : { ...missing('profit_margin'), value: pm },
    'Fat margins signal pricing power and efficiency.');
  addCriterion(5, 'buffett', 'Free cash flow positive',
    fcf != null ? { passed: fcf > 0, value: fcf } : { ...missing('free_cash_flow'), value: fcf },
    'Real cash left after spending is the lifeblood of intrinsic value.');

  let mgmt: CriterionResult;
  if (roe != null && pm != null) mgmt = { passed: roe > 0.15 && pm > 0.15, value: { roe, profit_margin: pm } };
  else mgmt = { ...missing('roe', 'profit_margin'), value: { roe, profit_margin: pm } };
  addCriterion(6, 'buffett', 'Quality management (proxy: ROE>15% & margin>15%)', mgmt,
    'Consistently high returns and margins point to capable management.');

  let predictable: CriterionResult;
  if (epsHist.length) predictable = { passed: epsHist.every((e) => e > 0), value: epsHist };
  else predictable = { ...missing('eps_history'), value: epsHist };
  addCriterion(7, 'buffett', 'Predictable earnings (all EPS history positive)', predictable,
    'Steady, never-negative earnings are easier to value with confidence.');

  const iv = g('intrinsic_value') as number | undefined;
  let belowIv: CriterionResult;
  if (iv != null && price != null && iv) {
    belowIv = { passed: (price as number) <= 0.75 * iv, value: { price, intrinsic_value: iv } };
  } else if (iv == null) {
    belowIv = { ...missing('intrinsic_value'), value: { price, intrinsic_value: iv } };
  } else {
    belowIv = { ...missing('price'), value: { price, intrinsic_value: iv } };
  }
  addCriterion(8, 'buffett', 'Trading >= 25% below intrinsic value', belowIv,
    'A margin of safety means buying a dollar of value for 75 cents or less.');
  addCriterion(9, 'buffett', 'Business understandable', { passed: true, value: true },
    'Assumed true unless flagged — Buffett only buys what he can explain.');
  addCriterion(10, 'buffett', 'Sustainable competitive advantage',
    moat != null ? { passed: Boolean(moat), value: moat } : { ...missing('moat'), value: moat },
    'The moat must persist for years, not just this quarter.');

  const peg = g('peg') as number | undefined;
  const eg = g('earnings_growth') as number | undefined;
  const rg = g('revenue_growth') as number | undefined;
  const pe = g('pe') as number | undefined;
  addCriterion(11, 'lynch', 'PEG < 1.0',
    peg != null ? { passed: peg < 1.0, value: peg }
      : eg != null && eg <= 0 ? { passed: false, value: { peg, earnings_growth: eg } }
      : { ...missing('peg'), value: peg },
    'Paying less than 1x growth for earnings is the GARP sweet spot.');
  addCriterion(12, 'lynch', 'Earnings growth 15-30%',
    eg != null ? { passed: eg >= 0.15 && eg <= 0.30, value: eg } : { ...missing('earnings_growth'), value: eg },
    'Fast but sustainable growth — not so hot it cannot last.');

  let revConsistent: CriterionResult;
  if (eg != null && rg != null) {
    revConsistent = { passed: Math.abs(rg - eg) <= 0.10, value: { revenue_growth: rg, earnings_growth: eg } };
  } else {
    revConsistent = { ...missing('revenue_growth', 'earnings_growth'), value: { revenue_growth: rg, earnings_growth: eg } };
  }
  addCriterion(13, 'lynch', 'Revenue growth consistent with earnings (within 10pp)', revConsistent,
    'Earnings growth backed by sales is real, not just cost-cutting.');

  const inv = g('inventory_turnover') as number | undefined;
  const invPrev = g('inventory_turnover_prev') as number | undefined;
  let invPass: CriterionResult;
  if (inv == null) {
    invPass = { ...missing('inventory_turnover'), value: { current: inv, previous: invPrev } };
  } else if (invPrev == null) {
    invPass = { passed: false, value: { current: inv, previous: invPrev } };
  } else {
    invPass = { passed: inv > invPrev, value: { current: inv, previous: invPrev } };
  }
  addCriterion(14, 'lynch', 'Inventory turnover improving', invPass,
    'Faster inventory turns mean products sell briskly and cash is not stuck.');

  const insider = g('insider_buying');
  addCriterion(15, 'lynch', 'Insider buying',
    insider != null ? { passed: Boolean(insider), value: insider } : { ...missing('insider_buying'), value: insider },
    'Insiders buying their own stock signals genuine confidence.');
  const inst = g('institution_ownership') as number | undefined;
  addCriterion(16, 'lynch', 'Institutional ownership < 60%',
    inst != null ? { passed: inst < 0.6, value: inst } : { ...missing('institution_ownership'), value: inst },
    'Low institutional ownership leaves room for the crowd to discover it.');
  const buyback = g('buyback');
  addCriterion(17, 'lynch', 'Share buyback in place',
    buyback != null ? { passed: Boolean(buyback), value: buyback } : { ...missing('buyback'), value: buyback },
    'Buybacks return cash and lift per-share value.');

  let peLtGrowth: CriterionResult;
  if (pe != null && eg != null) {
    peLtGrowth = { passed: pe < eg * 100, value: { pe, growth_pct: eg * 100 } };
  } else {
    peLtGrowth = { ...missing('pe', 'earnings_growth'), value: { pe, growth_pct: eg != null ? eg * 100 : null } };
  }
  addCriterion(18, 'lynch', 'P/E < earnings-growth rate', peLtGrowth,
    "Lynch's rule: a fair P/E should be below the growth percentage.");

  const pb = g('pb') as number | undefined;
  const cr = g('current_ratio') as number | undefined;
  const dy = g('dividend_yield') as number | undefined;
  addCriterion(19, 'graham', 'P/E < 15',
    pe != null ? { passed: pe < 15, value: pe } : { ...missing('pe'), value: pe },
    'A low P/E limits what you overpay for earnings.');
  addCriterion(20, 'graham', 'P/B < 1.5',
    pb != null ? { passed: pb < 1.5, value: pb } : { ...missing('pb'), value: pb },
    'Buying near book value gives an asset cushion.');

  let grahamNum: CriterionResult;
  if (pe != null && pb != null) {
    grahamNum = { passed: pe * pb < 22.5, value: { pe, pb, product: pe * pb } };
  } else {
    grahamNum = { ...missing('pe', 'pb'), value: { pe, pb, product: pe != null && pb != null ? pe * pb : null } };
  }
  addCriterion(21, 'graham', 'P/E x P/B < 22.5 (Graham number)', grahamNum,
    "Graham's combined cheapness test for earnings and assets.");
  addCriterion(22, 'graham', 'Current ratio > 2',
    cr != null ? { passed: cr > 2, value: cr } : { ...missing('current_ratio'), value: cr },
    'Twice the short-term assets vs liabilities means strong liquidity.');
  addCriterion(23, 'graham', 'Pays a dividend',
    dy != null ? { passed: dy > 0, value: dy } : { ...missing('dividend_yield'), value: dy },
    'A dividend record shows real, distributable profits.');

  let tenY: CriterionResult;
  if (epsHist.length >= 2) tenY = { passed: epsHist[0]! < epsHist[epsHist.length - 1]!, value: epsHist };
  else tenY = { ...missing('eps_history'), value: epsHist };
  addCriterion(24, 'graham', 'Long-run earnings growth (first EPS < last)', tenY,
    'Earnings should be meaningfully higher than a decade ago.');

  const ncav = g('ncav_per_share') as number | undefined;
  let belowNcav: CriterionResult;
  if (ncav != null && price != null) {
    belowNcav = { passed: (price as number) < 0.67 * ncav, value: { price, ncav_per_share: ncav } };
  } else if (ncav == null) {
    belowNcav = { ...missing('ncav_per_share'), value: { price, ncav_per_share: ncav } };
  } else {
    belowNcav = { ...missing('price'), value: { price, ncav_per_share: ncav } };
  }
  addCriterion(25, 'graham', 'Price < 67% of NCAV', belowNcav,
    "Buying below liquidation value is Graham's deepest margin of safety.");

  let stability: CriterionResult;
  if (epsHist.length) stability = { passed: epsHist.every((e) => e >= 0), value: epsHist };
  else stability = { ...missing('eps_history'), value: epsHist };
  addCriterion(26, 'graham', 'Earnings stability (no negative EPS year)', stability,
    'No loss years means dependable, defensive earnings.');

  addCriterion(27, 'quality', 'Revenue growth > inflation',
    rg != null ? { passed: rg > inflation, value: { revenue_growth: rg, inflation } } : { ...missing('revenue_growth'), value: { revenue_growth: rg, inflation } },
    'Sales must outpace inflation to grow in real terms.');
  const om = g('operating_margin') as number | undefined;
  addCriterion(28, 'quality', 'Operating margin healthy (>10%)',
    om != null ? { passed: om > 0.10, value: om } : { ...missing('operating_margin'), value: om },
    'A solid operating margin shows the core business is profitable.');
  const roa = g('return_on_assets') as number | undefined;
  addCriterion(29, 'quality', 'Return on assets > 5%',
    roa != null ? { passed: roa > 0.05, value: roa } : { ...missing('return_on_assets'), value: roa },
    'Good ROA means assets are deployed efficiently.');
  const ic = g('interest_coverage') as number | undefined;
  addCriterion(30, 'quality', 'Interest coverage > 3',
    ic != null ? { passed: ic > 3, value: ic } : { ...missing('interest_coverage'), value: ic },
    'Earnings comfortably cover interest — low default risk.');

  const buckets = ['buffett', 'lynch', 'graham', 'quality'] as const;
  const bucketScores: Record<string, { criteria_met: number; total: number; fraction: number }> = {};
  let weightedSum = 0.0;
  let weightTotal = 0.0;

  for (const b of buckets) {
    const items = crit.filter((x) => x.bucket === b && x.passed != null);
    const met = items.filter((x) => x.passed).length;
    const total = items.length;
    const frac = total ? met / total : 0.0;
    bucketScores[b] = { criteria_met: met, total, fraction: Math.round(frac * 1000) / 1000 };
    if (total) {
      const w = BUCKET_WEIGHTS[b];
      weightedSum += w * frac;
      weightTotal += w;
    }
  }

  const score = Math.round((weightTotal ? weightedSum / weightTotal : 0.0) * 1000) / 1000;
  const [gLetter, gpa] = gradeAndGpa(score);

  const counted = crit.filter((x) => x.passed != null);
  const passed = counted.filter((x) => x.passed);

  const reasoning = crit.map((x) => {
    const mark = x.passed ? '✓' : x.passed == null ? '?' : '✗';
    const suffix = x.passed != null ? '' : ' (data unavailable — not counted)';
    return `${mark} ${x.label} — ${x.explanation}${suffix}`;
  });

  const evaluable = counted.length / 30.0;
  const confidence = Math.round(Math.max(0.1, Math.min(0.95, 0.5 + 0.45 * evaluable)) * 100) / 100;

  return {
    skill: 'value-investment-checklist',
    ticker: data.ticker,
    mode: data.mode ?? 'investment',
    as_of: data.as_of,
    score,
    confidence,
    rating: gLetter,
    key_metrics: {
      gpa,
      overall_count: `${passed.length}/30`,
      criteria_passed: passed.length,
      criteria_evaluated: counted.length,
      buckets: bucketScores,
    },
    criteria: crit,
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
