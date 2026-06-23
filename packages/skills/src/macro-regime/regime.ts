export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const MULT_LO = 0.5;
const MULT_HI = 1.2;
const HIGH_INFLATION = 0.08;
const HIGH_POLICY_RATE = 0.09;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function assess(data: Record<string, unknown>): Record<string, unknown> {
  const macro = data.macro;
  const flags: string[] = [];
  if (!macro || typeof macro !== 'object') {
    return { skill: 'macro-regime', error: 'missing `macro` object' };
  }

  const m = macro as Record<string, unknown>;
  let mult = 1.0;
  const reasoning: string[] = [];
  const drivers: Record<string, number> = {};

  const rate = m.policy_rate;
  if (rate == null) {
    flags.push('stale_macro');
  } else {
    const r = Number(rate);
    let d: number;
    if (r >= HIGH_POLICY_RATE) {
      d = -0.1;
      reasoning.push(
        `Policy rate ${(r * 100).toFixed(1)}% — tight money raises cost of capital, risk-off pressure`,
      );
    } else {
      d = 0.07;
      reasoning.push(
        `Policy rate ${(r * 100).toFixed(1)}% — accommodative stance supports risk appetite`,
      );
    }
    mult += d;
    drivers.policy_rate = Math.round(d * 1000) / 1000;
  }

  const infl = m.inflation;
  if (infl == null) {
    flags.push('stale_macro');
  } else {
    const i = Number(infl);
    let d: number;
    if (i > HIGH_INFLATION) {
      d = -0.1;
      reasoning.push(
        `Inflation ${(i * 100).toFixed(1)}% — above 8% erodes real returns and invites tightening, risk-off`,
      );
    } else {
      d = 0.05;
      reasoning.push(`Inflation ${(i * 100).toFixed(1)}% — contained, supportive of equities`);
    }
    mult += d;
    drivers.inflation = Math.round(d * 1000) / 1000;
  }

  const trend = m.reserves_trend;
  if (trend == null) {
    flags.push('stale_macro');
  } else if (trend === 'falling') {
    const d = -0.12;
    reasoning.push(
      'Reserves falling — import-cover stress and BDT pressure, strong risk-off pressure',
    );
    mult += d;
    drivers.reserves_trend = Math.round(d * 1000) / 1000;
  } else if (trend === 'rising') {
    const d = 0.1;
    reasoning.push('Reserves rising — easing external pressure, risk-on');
    mult += d;
    drivers.reserves_trend = Math.round(d * 1000) / 1000;
  } else {
    reasoning.push('Reserves stable — neutral external backdrop');
    drivers.reserves_trend = 0.0;
  }

  const pol = m.politics;
  if (pol == null) {
    flags.push('stale_macro');
  } else if (pol === 'crisis') {
    const d = -0.2;
    reasoning.push('Political crisis — heightened uncertainty, sharp risk-off');
    mult += d;
    drivers.politics = Math.round(d * 1000) / 1000;
  } else if (pol === 'tense') {
    const d = -0.1;
    reasoning.push('Political tension — elevated headline risk, risk-off pressure');
    mult += d;
    drivers.politics = Math.round(d * 1000) / 1000;
  } else {
    const d = 0.05;
    reasoning.push('Politics stable — supportive backdrop');
    mult += d;
    drivers.politics = Math.round(d * 1000) / 1000;
  }

  const reg = m.regulatory;
  if (reg == null) {
    flags.push('stale_macro');
    reasoning.push('Regulatory stance unknown — assuming neutral');
  } else if (reg === 'floor_prices') {
    const d = -0.15;
    reasoning.push(
      'Floor prices in force — broken price discovery and trapped liquidity, risk-off',
    );
    mult += d;
    drivers.regulatory = Math.round(d * 1000) / 1000;
  } else if (reg === 'tightening') {
    const d = -0.08;
    reasoning.push('Regulatory tightening — added market friction, mild risk-off');
    mult += d;
    drivers.regulatory = Math.round(d * 1000) / 1000;
  } else {
    reasoning.push('Regulatory regime normal — no policy drag');
    drivers.regulatory = 0.0;
  }

  mult = clamp(mult, MULT_LO, MULT_HI);

  let regime: string;
  if (mult >= 1.05) regime = 'risk_on';
  else if (mult >= 0.85) regime = 'neutral';
  else if (mult >= 0.7) regime = 'cautious';
  else regime = 'risk_off';

  const score = clamp((mult - 1.0) / 0.2, -1.0, 1.0);
  const stale = flags.includes('stale_macro');
  let confidence = clamp(0.85 - 0.12 * flags.filter((f) => f === 'stale_macro').length, 0.2, 0.9);
  if (stale) confidence = clamp(confidence, 0.2, 0.6);

  return {
    skill: 'macro-regime',
    ticker: data.ticker,
    mode: data.mode ?? 'both',
    as_of: data.as_of,
    score: Math.round(score * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    rating: regime,
    key_metrics: {
      risk_multiplier: Math.round(mult * 1000) / 1000,
      drivers,
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
