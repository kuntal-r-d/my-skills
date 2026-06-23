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
}

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

  function add(
    id: number,
    bucket: string,
    label: string,
    passed: boolean | null,
    value: unknown,
    expl: string,
  ): void {
    crit.push({ id, bucket, label, passed, value, explanation: expl });
  }

  function need(field: string): null {
    flags.push(`missing:${field}`);
    return null;
  }

  const g = (key: string) => fund[key];
  const epsHist = (g('eps_history') as number[]) ?? [];
  const price = g('price');
  const moat = g('moat');
  const roe = g('roe') as number | undefined;
  const de = g('debt_to_equity') as number | undefined;
  const pm = g('profit_margin') as number | undefined;
  const fcf = g('free_cash_flow') as number | undefined;

  add(1, 'buffett', 'Economic moat present', moat != null ? Boolean(moat) : need('moat'), moat,
    'A durable competitive advantage protects long-term profits.');
  add(2, 'buffett', 'ROE > 15%', roe != null ? roe > 0.15 : need('roe'), roe,
    'High return on equity means the company compounds shareholder money well.');
  add(3, 'buffett', 'Debt/Equity < 0.5', de != null ? de < 0.5 : need('debt_to_equity'), de,
    'Low debt makes the business resilient in downturns.');
  add(4, 'buffett', 'Profit margin > 20%', pm != null ? pm > 0.20 : need('profit_margin'), pm,
    'Fat margins signal pricing power and efficiency.');
  add(5, 'buffett', 'Free cash flow positive', fcf != null ? fcf > 0 : need('free_cash_flow'), fcf,
    'Real cash left after spending is the lifeblood of intrinsic value.');

  let mgmt: boolean | null = null;
  if (roe != null && pm != null) mgmt = roe > 0.15 && pm > 0.15;
  add(6, 'buffett', 'Quality management (proxy: ROE>15% & margin>15%)',
    mgmt ?? need('roe/profit_margin'), { roe, profit_margin: pm },
    'Consistently high returns and margins point to capable management.');

  let predictable: boolean | null = null;
  if (epsHist.length) predictable = epsHist.every((e) => e > 0);
  add(7, 'buffett', 'Predictable earnings (all EPS history positive)',
    predictable ?? need('eps_history'), epsHist,
    'Steady, never-negative earnings are easier to value with confidence.');

  const iv = g('intrinsic_value') as number | undefined;
  let belowIv: boolean | null = null;
  if (iv != null && price != null && iv) belowIv = (price as number) <= 0.75 * iv;
  else if (iv == null) belowIv = need('intrinsic_value');
  else if (price == null) belowIv = need('price');
  add(8, 'buffett', 'Trading >= 25% below intrinsic value', belowIv,
    { price, intrinsic_value: iv },
    'A margin of safety means buying a dollar of value for 75 cents or less.');
  add(9, 'buffett', 'Business understandable', true, true,
    'Assumed true unless flagged — Buffett only buys what he can explain.');
  add(10, 'buffett', 'Sustainable competitive advantage',
    moat != null ? Boolean(moat) : need('moat'), moat,
    'The moat must persist for years, not just this quarter.');

  const peg = g('peg') as number | undefined;
  const eg = g('earnings_growth') as number | undefined;
  const rg = g('revenue_growth') as number | undefined;
  const pe = g('pe') as number | undefined;
  add(11, 'lynch', 'PEG < 1.0', peg != null ? peg < 1.0 : need('peg'), peg,
    'Paying less than 1x growth for earnings is the GARP sweet spot.');
  add(12, 'lynch', 'Earnings growth 15-30%', eg != null ? eg >= 0.15 && eg <= 0.30 : need('earnings_growth'), eg,
    'Fast but sustainable growth — not so hot it cannot last.');

  let revConsistent: boolean | null = null;
  if (eg != null && rg != null) revConsistent = Math.abs(rg - eg) <= 0.10;
  add(13, 'lynch', 'Revenue growth consistent with earnings (within 10pp)',
    revConsistent ?? need('revenue_growth/earnings_growth'),
    { revenue_growth: rg, earnings_growth: eg },
    'Earnings growth backed by sales is real, not just cost-cutting.');

  const inv = g('inventory_turnover') as number | undefined;
  const invPrev = g('inventory_turnover_prev') as number | undefined;
  let invPass: boolean | null;
  if (inv == null || invPrev == null) invPass = need('inventory_turnover');
  else invPass = inv > invPrev;
  add(14, 'lynch', 'Inventory turnover improving', invPass,
    { current: inv, previous: invPrev },
    'Faster inventory turns mean products sell briskly and cash is not stuck.');

  const insider = g('insider_buying');
  add(15, 'lynch', 'Insider buying', insider != null ? Boolean(insider) : need('insider_buying'), insider,
    'Insiders buying their own stock signals genuine confidence.');
  const inst = g('institution_ownership') as number | undefined;
  add(16, 'lynch', 'Institutional ownership < 60%', inst != null ? inst < 0.6 : need('institution_ownership'), inst,
    'Low institutional ownership leaves room for the crowd to discover it.');
  const buyback = g('buyback');
  add(17, 'lynch', 'Share buyback in place', buyback != null ? Boolean(buyback) : need('buyback'), buyback,
    'Buybacks return cash and lift per-share value.');

  let peLtGrowth: boolean | null = null;
  if (pe != null && eg != null) peLtGrowth = pe < eg * 100;
  add(18, 'lynch', 'P/E < earnings-growth rate', peLtGrowth ?? need('pe/earnings_growth'),
    { pe, growth_pct: eg != null ? eg * 100 : null },
    "Lynch's rule: a fair P/E should be below the growth percentage.");

  const pb = g('pb') as number | undefined;
  const cr = g('current_ratio') as number | undefined;
  const dy = g('dividend_yield') as number | undefined;
  add(19, 'graham', 'P/E < 15', pe != null ? pe < 15 : need('pe'), pe,
    'A low P/E limits what you overpay for earnings.');
  add(20, 'graham', 'P/B < 1.5', pb != null ? pb < 1.5 : need('pb'), pb,
    'Buying near book value gives an asset cushion.');

  let grahamNum: boolean | null = null;
  if (pe != null && pb != null) grahamNum = pe * pb < 22.5;
  add(21, 'graham', 'P/E x P/B < 22.5 (Graham number)', grahamNum ?? need('pe/pb'),
    { pe, pb, product: pe != null && pb != null ? pe * pb : null },
    "Graham's combined cheapness test for earnings and assets.");
  add(22, 'graham', 'Current ratio > 2', cr != null ? cr > 2 : need('current_ratio'), cr,
    'Twice the short-term assets vs liabilities means strong liquidity.');
  add(23, 'graham', 'Pays a dividend', dy != null ? dy > 0 : need('dividend_yield'), dy,
    'A dividend record shows real, distributable profits.');

  let tenY: boolean | null = null;
  if (epsHist.length >= 2) tenY = epsHist[0]! < epsHist[epsHist.length - 1]!;
  add(24, 'graham', 'Long-run earnings growth (first EPS < last)', tenY ?? need('eps_history'), epsHist,
    'Earnings should be meaningfully higher than a decade ago.');

  const ncav = g('ncav_per_share') as number | undefined;
  let belowNcav: boolean | null = null;
  if (ncav != null && price != null) belowNcav = (price as number) < 0.67 * ncav;
  else if (ncav == null) belowNcav = need('ncav_per_share');
  else if (price == null) belowNcav = need('price');
  add(25, 'graham', 'Price < 67% of NCAV', belowNcav, { price, ncav_per_share: ncav },
    "Buying below liquidation value is Graham's deepest margin of safety.");

  let stability: boolean | null = null;
  if (epsHist.length) stability = epsHist.every((e) => e >= 0);
  add(26, 'graham', 'Earnings stability (no negative EPS year)', stability ?? need('eps_history'), epsHist,
    'No loss years means dependable, defensive earnings.');

  add(27, 'quality', 'Revenue growth > inflation', rg != null ? rg > inflation : need('revenue_growth'),
    { revenue_growth: rg, inflation },
    'Sales must outpace inflation to grow in real terms.');
  const om = g('operating_margin') as number | undefined;
  add(28, 'quality', 'Operating margin healthy (>10%)', om != null ? om > 0.10 : need('operating_margin'), om,
    'A solid operating margin shows the core business is profitable.');
  const roa = g('return_on_assets') as number | undefined;
  add(29, 'quality', 'Return on assets > 5%', roa != null ? roa > 0.05 : need('return_on_assets'), roa,
    'Good ROA means assets are deployed efficiently.');
  const ic = g('interest_coverage') as number | undefined;
  add(30, 'quality', 'Interest coverage > 3', ic != null ? ic > 3 : need('interest_coverage'), ic,
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
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
