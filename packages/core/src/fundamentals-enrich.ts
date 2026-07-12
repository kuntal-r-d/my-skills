export type ShareholdingRow = {
  month: string;
  sponsor?: number;
  institution?: number;
  foreign?: number;
  public?: number;
};

export type OhlcvCloseBar = { close?: number };

/** CAGR or latest YoY from oldest→newest EPS series (decimals, e.g. 0.15 = 15%). */
export function earningsGrowthFromEpsHistory(epsHistory: number[]): number | null {
  const pts = epsHistory.filter((e) => typeof e === 'number' && Number.isFinite(e));
  if (pts.length < 2) return null;

  const prev = pts[pts.length - 2]!;
  const last = pts[pts.length - 1]!;
  if (prev !== 0) {
    return (last - prev) / Math.abs(prev);
  }

  const first = pts[0]!;
  const years = pts.length - 1;
  if (first <= 0 || years <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

export interface EnrichFundamentalsInput {
  fundamentals?: Record<string, unknown>;
  shareholding?: ShareholdingRow[];
  ohlcv?: OhlcvCloseBar[];
}

/** Fill derived checklist fields from OHLCV, shareholding, and EPS history. */
export function enrichFundamentals(input: EnrichFundamentalsInput): Record<string, unknown> {
  const f: Record<string, unknown> = { ...(input.fundamentals ?? {}) };

  if (f.price == null && input.ohlcv?.length) {
    const last = input.ohlcv[input.ohlcv.length - 1];
    if (last && typeof last.close === 'number' && Number.isFinite(last.close)) {
      f.price = last.close;
      f._price_source = 'ohlcv_close';
    }
  }

  if (input.shareholding?.length) {
    const sorted = [...input.shareholding].sort((a, b) => a.month.localeCompare(b.month));
    const latest = sorted[sorted.length - 1]!;
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2]! : undefined;

    if (latest.institution != null) {
      f.institution_ownership = latest.institution / 100;
      f._institution_ownership_source = 'shareholding';
    }

    if (f.insider_buying == null && latest.sponsor != null && prev?.sponsor != null) {
      f.insider_buying = latest.sponsor > prev.sponsor;
      f._insider_buying_source = 'shareholding_sponsor_delta';
    }
  }

  const epsHist = Array.isArray(f.eps_history)
    ? (f.eps_history as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    : [];

  if (f.earnings_growth == null && epsHist.length >= 2) {
    const g = earningsGrowthFromEpsHistory(epsHist);
    if (g != null) {
      f.earnings_growth = g;
      f._earnings_growth_source = 'eps_history';
    }
  }

  if (
    f.peg == null &&
    typeof f.pe === 'number' &&
    typeof f.earnings_growth === 'number' &&
    f.earnings_growth > 0
  ) {
    f.peg = f.pe / (f.earnings_growth * 100);
    f._peg_source = 'derived';
  }

  if (
    f.moat == null &&
    typeof f.roe === 'number' &&
    typeof f.profit_margin === 'number' &&
    typeof f.debt_to_equity === 'number'
  ) {
    f.moat = f.roe > 0.15 && f.profit_margin > 0.15 && f.debt_to_equity < 0.5;
    f._moat_proxy = true;
  }

  if (typeof f.pe === 'number' && typeof f.pb === 'number' && f.pe > 0 && f.pb > 0) {
    f.graham_number_product = f.pe * f.pb;
  }

  return f;
}

/** Inject fair-value median from fundamental-analysis into fundamentals for the value checklist. */
export function injectIntrinsicValue(
  fundamentals: Record<string, unknown>,
  fundamentalCard: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!fundamentalCard || fundamentalCard.error) return fundamentals;
  const km = fundamentalCard.key_metrics as Record<string, unknown> | undefined;
  const fv = km?.fair_value_median;
  if (typeof fv !== 'number' || !Number.isFinite(fv)) return fundamentals;
  return { ...fundamentals, intrinsic_value: fv, _intrinsic_value_source: 'fundamental_analysis' };
}
