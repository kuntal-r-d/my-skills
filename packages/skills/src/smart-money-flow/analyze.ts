export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const SIGNIFICANCE_THRESHOLD = 2.0;
const CONFIDENCE_CAP = 0.7;

function clamp(x: number, lo = -1.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, x));
}

function num(x: unknown): x is number {
  return typeof x === 'number' && !Number.isNaN(x);
}

function noDataCard(data: Record<string, unknown>): Record<string, unknown> {
  return {
    skill: 'smart-money-flow',
    ticker: data.ticker,
    mode: data.mode ?? 'investment',
    as_of: data.as_of,
    score: 0.0,
    confidence: 0.1,
    rating: 'neutral',
    key_metrics: { latest_deltas: {}, funds_featuring: [] },
    reasoning: [
      'No `shareholding` disclosure present in the input. Smart-money flow cannot be assessed from public data; no private broker book is ever inferred.',
    ],
    flags: ['no_disclosure_data'],
    disclaimer: DISCLAIMER,
  };
}

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const sh = data.shareholding;
  if (!Array.isArray(sh) || sh.length < 1) return noDataCard(data);

  const flags: string[] = ['monthly_disclosure_lag'];
  const reasoning: string[] = [];
  let score = 0.0;
  let deltas: Record<string, number> = {};

  if (sh.length < 2) {
    flags.push('single_month_no_trend');
    const first = sh[0] as Record<string, unknown>;
    reasoning.push(
      `Only one disclosure month (${first.month}) available — no month-over-month trend computable; confidence reduced.`,
    );
  } else {
    const prev = sh[sh.length - 2] as Record<string, unknown>;
    const latest = sh[sh.length - 1] as Record<string, unknown>;
    const pm = prev.month;
    const lm = latest.month;
    deltas = {};
    for (const key of ['sponsor', 'govt', 'institution', 'foreign', 'public'] as const) {
      if (num(latest[key]) && num(prev[key])) {
        deltas[key] = Math.round((latest[key]! - prev[key]!) * 100) / 100;
      }
    }

    const di = deltas.institution;
    if (di != null) {
      if (di >= SIGNIFICANCE_THRESHOLD) {
        score += 0.3;
        reasoning.push(
          `${lm}: institutional ownership +${di.toFixed(1)}pp MoM (vs ${pm}) — significant accumulation (positive).`,
        );
      } else if (di <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.3;
        reasoning.push(
          `${lm}: institutional ownership ${di.toFixed(1)}pp MoM (vs ${pm}) — significant distribution (negative).`,
        );
      } else {
        reasoning.push(
          `${lm}: institutional ownership ${di >= 0 ? '+' : ''}${di.toFixed(1)}pp MoM (vs ${pm}) — below the 2pp significance threshold.`,
        );
      }
    }

    const df = deltas.foreign;
    if (df != null) {
      if (df >= SIGNIFICANCE_THRESHOLD) {
        score += 0.3;
        reasoning.push(
          `${lm}: foreign holding +${df.toFixed(1)}pp MoM (vs ${pm}) — significant foreign INFLOW (confidence/governance signal, positive).`,
        );
      } else if (df <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.3;
        reasoning.push(
          `${lm}: foreign holding ${df.toFixed(1)}pp MoM (vs ${pm}) — significant foreign OUTFLOW (negative).`,
        );
      } else if (df > 0) {
        score += 0.1;
        reasoning.push(`${lm}: foreign holding +${df.toFixed(1)}pp MoM (vs ${pm}) — modest inflow.`);
      } else if (df < 0) {
        score -= 0.1;
        reasoning.push(`${lm}: foreign holding ${df.toFixed(1)}pp MoM (vs ${pm}) — modest outflow.`);
      }
    }

    const ds = deltas.sponsor;
    if (ds != null) {
      if (ds <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.4;
        flags.push('sponsor_director_selling');
        reasoning.push(
          `${lm}: sponsor/director holding ${ds.toFixed(1)}pp MoM (vs ${pm}) — significant insider SELLING (RED FLAG, strong negative).`,
        );
      } else if (ds < 0) {
        score -= 0.15;
        reasoning.push(
          `${lm}: sponsor/director holding ${ds.toFixed(1)}pp MoM (vs ${pm}) — minor insider reduction (caution).`,
        );
      } else if (ds >= SIGNIFICANCE_THRESHOLD) {
        score += 0.25;
        reasoning.push(
          `${lm}: sponsor/director holding +${ds.toFixed(1)}pp MoM (vs ${pm}) — insider buying (positive).`,
        );
      } else if (ds > 0) {
        score += 0.1;
        reasoning.push(
          `${lm}: sponsor/director holding +${ds.toFixed(1)}pp MoM (vs ${pm}) — modest insider accumulation.`,
        );
      }
    }
  }

  const funds = data.funds;
  const fundsFeaturing: Record<string, unknown>[] = [];
  if (Array.isArray(funds) && funds.length > 0) {
    for (const fd of funds as Record<string, unknown>[]) {
      const name = fd.name;
      const w = fd.ticker_weight_pct;
      const pw = fd.prev_weight_pct;
      const tr = fd.track_record_3y;
      if (!num(w) || !num(pw)) continue;
      const dw = Math.round((w - pw) * 100) / 100;
      const trScale = num(tr) ? clamp(tr, 0.0, 1.0) : 0.3;
      if (dw > 0) {
        let bump = Math.round(0.25 * (dw / 1.0) * (0.5 + trScale) * 1000) / 1000;
        bump = Math.min(bump, 0.3);
        score += bump;
        reasoning.push(
          `Fund ${name} raised weight ${pw.toFixed(1)}%->${w.toFixed(1)}% (+${dw.toFixed(1)}pp), 3y track record ${num(tr) ? tr : 'n/a'} — positive (+${bump}).`,
        );
      } else if (dw < 0) {
        score -= 0.1;
        reasoning.push(
          `Fund ${name} cut weight ${pw.toFixed(1)}%->${w.toFixed(1)}% (${dw.toFixed(1)}pp) — negative.`,
        );
      }
      fundsFeaturing.push({
        name,
        weight_pct: w,
        weight_delta_pp: dw,
        manager: fd.manager,
        track_record_3y: tr,
      });
    }
  } else {
    reasoning.push(
      'No public fund-holding (`funds`) data supplied — fund-manager featuring not assessed (no private data inferred).',
    );
  }

  score = Math.round(clamp(score) * 1000) / 1000;

  let confidence = 0.6;
  if (flags.includes('single_month_no_trend')) confidence -= 0.25;
  if (fundsFeaturing.length === 0) confidence -= 0.05;
  confidence = Math.round(Math.min(CONFIDENCE_CAP, clamp(confidence, 0.1, 0.95)) * 100) / 100;

  let rating: string;
  if (score >= 0.2) rating = 'accumulation';
  else if (score <= -0.2) rating = 'distribution';
  else rating = 'neutral';

  const latestSh = sh[sh.length - 1] as Record<string, unknown>;

  return {
    skill: 'smart-money-flow',
    ticker: data.ticker,
    mode: data.mode ?? 'investment',
    as_of: data.as_of,
    score,
    confidence,
    rating,
    key_metrics: {
      latest_deltas: deltas,
      latest_month: latestSh.month ?? null,
      funds_featuring: fundsFeaturing,
      significance_threshold_pp: SIGNIFICANCE_THRESHOLD,
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
