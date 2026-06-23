export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const DISCOUNT_RATE = 0.15;
const TERMINAL_GROWTH = 0.03;
const PROJECTION_YEARS = 5;
const MAX_GROWTH = 0.15;
const DEFAULT_SECTOR_PE = 15.0;

function clamp(x: number, lo = -1.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, x));
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && !Number.isNaN(x);
}

function balanceSheetReader(f: Record<string, unknown>): {
  line_items: Record<string, unknown>;
  red_flags: string[];
} {
  const de = f.debt_to_equity;
  const fcf = f.free_cash_flow;
  const cr = f.current_ratio;
  const ic = f.interest_coverage;
  const pm = f.profit_margin;
  const epsHist = (f.eps_history as unknown[]) ?? [];

  const redFlags: string[] = [];
  if (isNum(de) && de > 1.0) redFlags.push(`high_leverage_de_${de.toFixed(2)}`);
  if (isNum(fcf) && fcf <= 0) redFlags.push('negative_or_zero_free_cash_flow');
  if (
    epsHist.length >= 2 &&
    isNum(epsHist[epsHist.length - 1]) &&
    isNum(epsHist[epsHist.length - 2]) &&
    (epsHist[epsHist.length - 1] as number) < (epsHist[epsHist.length - 2] as number)
  ) {
    redFlags.push('declining_earnings_last_vs_prev');
  }
  if (isNum(cr) && cr < 1.0) redFlags.push(`current_ratio_below_1_${cr.toFixed(2)}`);
  if (isNum(ic) && ic < 2.0) redFlags.push(`weak_interest_coverage_${ic.toFixed(2)}`);
  if (isNum(pm) && pm < 0) redFlags.push('negative_profit_margin');

  return {
    line_items: {
      debt_to_equity: de,
      free_cash_flow: fcf,
      current_ratio: cr,
      interest_coverage: ic,
      profit_margin: pm,
      roe: f.roe,
      book_value_per_share: f.book_value_per_share,
    },
    red_flags: redFlags,
  };
}

function valuationExtractor(f: Record<string, unknown>): {
  methods: Record<string, number>;
  fair_value: { low: number | null; median: number | null; high: number | null };
  assumptions: string[];
  aggressive_assumptions: boolean;
} {
  const eps = f.eps_ttm;
  const bvps = f.book_value_per_share;
  const eg = f.earnings_growth;
  const sectorPe = f.sector_median_pe;

  let g = MAX_GROWTH;
  if (isNum(eg)) g = Math.min(eg, MAX_GROWTH);
  g = Math.max(g, 0.0);

  const assumptions = [
    `Near-term growth g = min(earnings_growth, ${(MAX_GROWTH * 100).toFixed(0)}%) = ${(g * 100).toFixed(1)}%`,
    `Discount rate r = ${(DISCOUNT_RATE * 100).toFixed(0)}% (DSE frontier-market required return)`,
    `Terminal growth = ${(TERMINAL_GROWTH * 100).toFixed(0)}% after a ${PROJECTION_YEARS}-year window`,
    `Sector-median P/E = ${isNum(sectorPe) ? sectorPe : DEFAULT_SECTOR_PE} (${isNum(sectorPe) ? 'supplied' : 'default'})`,
  ];

  const methods: Record<string, number> = {};

  if (isNum(eps) && eps > 0) {
    methods.dcf_graham_formula = Math.round(eps * (8.5 + 2.0 * g * 100.0) * 100) / 100;
  }

  if (isNum(eps) && isNum(bvps) && eps > 0 && bvps > 0) {
    methods.graham_number = Math.round(Math.sqrt(22.5 * eps * bvps) * 100) / 100;
  }

  const peUsed = isNum(sectorPe) ? sectorPe : DEFAULT_SECTOR_PE;
  if (isNum(eps) && eps > 0) {
    methods.pe_based = Math.round(eps * peUsed * 100) / 100;
  }

  const vals = Object.values(methods).filter(isNum).sort((a, b) => a - b);
  let fair: { low: number | null; median: number | null; high: number | null };
  if (vals.length > 0) {
    const n = vals.length;
    const median =
      n % 2 ? vals[Math.floor(n / 2)]! : (vals[n / 2 - 1]! + vals[n / 2]!) / 2.0;
    fair = {
      low: Math.round(vals[0]! * 100) / 100,
      median: Math.round(median * 100) / 100,
      high: Math.round(vals[vals.length - 1]! * 100) / 100,
    };
  } else {
    fair = { low: null, median: null, high: null };
  }

  const aggressive = isNum(eg) && eg >= MAX_GROWTH;
  return { methods, fair_value: fair, assumptions, aggressive_assumptions: aggressive };
}

function epsSlope(epsHist: unknown[]): number | null {
  const pts = epsHist.filter(isNum);
  if (pts.length < 2) return null;
  const changes: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (a !== 0) changes.push((b - a) / Math.abs(a));
  }
  if (changes.length === 0) return null;
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const f = data.fundamentals;
  if (!f || typeof f !== 'object') {
    return { skill: 'fundamental-analysis', error: 'missing required `fundamentals` object' };
  }

  const fund = f as Record<string, unknown>;
  let price = fund.price;
  if (!isNum(price)) {
    const ohlcv = (data.ohlcv as Record<string, unknown>[]) ?? [];
    if (ohlcv.length && isNum(ohlcv[ohlcv.length - 1]?.close)) {
      price = ohlcv[ohlcv.length - 1]!.close as number;
    }
  }

  const flags: string[] = [];
  const reasoning: string[] = [];

  const bs = balanceSheetReader(fund);
  const val = valuationExtractor(fund);
  const redFlags = bs.red_flags;
  const fair = val.fair_value;

  const slope = epsSlope((fund.eps_history as unknown[]) ?? []);
  let trendScore: number;
  if (slope == null) {
    trendScore = 0.0;
    flags.push('no_eps_history');
    reasoning.push('No usable EPS history — earnings trend unscored.');
  } else {
    trendScore = clamp(slope / 0.15);
    reasoning.push(
      `EPS history avg change ${slope >= 0 ? '+' : ''}${(slope * 100).toFixed(1)}% -> trend component ${trendScore >= 0 ? '+' : ''}${trendScore.toFixed(2)}.`,
    );
  }

  let gap: number | null = null;
  let gapScore: number;
  if (isNum(fair.median) && isNum(price) && price > 0) {
    gap = (fair.median - price) / price;
    gapScore = clamp(gap / 0.5);
    reasoning.push(
      `Fair-value median ${fair.median} vs price ${price} -> valuation gap ${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}% (component ${gapScore >= 0 ? '+' : ''}${gapScore.toFixed(2)}).`,
    );
  } else {
    gapScore = 0.0;
    flags.push('no_price_or_fair_value');
    reasoning.push('Price or fair value unavailable — valuation gap unscored.');
  }

  const flagPenalty = Math.min(redFlags.length * 0.2, 0.8);
  let qualityScore = -flagPenalty;
  if (redFlags.length > 0) {
    reasoning.push(
      `${redFlags.length} balance-sheet red flag(s): ${redFlags.join(', ')} -> quality component ${qualityScore >= 0 ? '+' : ''}${qualityScore.toFixed(2)}.`,
    );
  } else {
    qualityScore = 0.1;
    reasoning.push('No balance-sheet red flags -> clean quality component +0.10.');
  }

  const core = [
    'eps_ttm', 'eps_history', 'book_value_per_share', 'debt_to_equity',
    'current_ratio', 'interest_coverage', 'free_cash_flow', 'profit_margin', 'roe',
  ];
  const present = core.filter((k) => fund[k] != null).length;
  const disclosure = present / core.length;
  if (disclosure < 0.6) {
    flags.push('limited_disclosure');
    reasoning.push(`Only ${present}/${core.length} core fields disclosed — confidence reduced.`);
  }

  const composite = clamp(0.35 * gapScore + 0.3 * trendScore + 0.35 * qualityScore);

  let confidence = 0.5 + 0.25 * disclosure;
  confidence -= 0.07 * redFlags.length;
  if (val.aggressive_assumptions) {
    confidence -= 0.1;
    reasoning.push('Growth pinned at the assumption cap — aggressive; confidence reduced.');
  }
  if (flags.includes('no_price_or_fair_value')) confidence -= 0.15;
  confidence = Math.round(clamp(confidence, 0.1, 0.9) * 100) / 100;

  const nflags = redFlags.length;
  let rating: string;
  if (gap != null && gap >= 0.3 && nflags === 0) rating = 'strong_buy';
  else if (gap != null && gap >= 0.1 && nflags <= 1) rating = 'buy';
  else if ((gap != null && gap <= -0.15) || nflags >= 3) rating = 'sell';
  else rating = 'hold';

  return {
    skill: 'fundamental-analysis',
    ticker: data.ticker,
    mode: data.mode ?? 'investment',
    as_of: data.as_of,
    score: Math.round(composite * 1000) / 1000,
    confidence,
    rating,
    key_metrics: {
      fair_value_low: fair.low,
      fair_value_median: fair.median,
      fair_value_high: fair.high,
      valuation_gap_pct: gap != null ? Math.round(gap * 1000) / 10 : null,
      red_flags: redFlags,
      pe: fund.pe,
      roe: fund.roe,
      de: fund.debt_to_equity,
      valuation_methods: val.methods,
      assumptions: val.assumptions,
      price,
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
