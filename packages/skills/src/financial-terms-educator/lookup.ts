import glossaryData from '../../../../skills/financial-terms-educator/assets/glossary.json' with { type: 'json' };

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

type VerdictFn = (v: number) => [string, string];

interface GlossaryEntry {
  [key: string]: unknown;
}

interface Glossary {
  terms: Record<string, GlossaryEntry>;
  _meta: { metric_key_map: Record<string, string> };
}

function load(): Glossary {
  return glossaryData as Glossary;
}

function resolveKey(
  query: unknown,
  terms: Record<string, GlossaryEntry>,
  keyMap: Record<string, string>,
): string | null {
  const q = String(query).trim();
  if (q in terms) return q;
  const lo = q.toLowerCase();
  if (lo in keyMap) return keyMap[lo]!;
  for (const k of Object.keys(terms)) {
    if (k.toLowerCase() === lo) return k;
  }
  return null;
}

function verdictRoe(v: number): [string, string] {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 20) return ['good', `${pct.toFixed(0)}% is excellent (>20%).`];
  if (pct >= 15) return ['good', `${pct.toFixed(0)}% is good (>15%).`];
  if (pct >= 10) return ['fair', `${pct.toFixed(0)}% is fair (10-15%).`];
  return ['weak', `${pct.toFixed(0)}% is weak (<10%).`];
}

function verdictPe(v: number): [string, string] {
  if (v < 12) return ['good', `P/E ${v.toFixed(1)} is on the cheap side (<12 for DSE).`];
  if (v <= 20) return ['fair', `P/E ${v.toFixed(1)} is fair (12-20).`];
  if (v <= 25) return ['fair', `P/E ${v.toFixed(1)} is fullish (20-25).`];
  return ['weak', `P/E ${v.toFixed(1)} is rich (>25); growth must justify it.`];
}

function verdictPb(v: number): [string, string] {
  if (v < 1) return ['good', `P/B ${v.toFixed(1)} is below book (<1) — potentially cheap.`];
  if (v <= 3) return ['fair', `P/B ${v.toFixed(1)} is normal (1-3).`];
  return ['weak', `P/B ${v.toFixed(1)} is high (>3); needs strong growth/ROE.`];
}

function verdictPeg(v: number): [string, string] {
  if (v < 1) return ['good', `PEG ${v.toFixed(2)} is attractive (<1).`];
  if (v <= 2) return ['fair', `PEG ${v.toFixed(2)} is fair (~1-2).`];
  return ['weak', `PEG ${v.toFixed(2)} is expensive for the growth (>2).`];
}

function verdictDe(v: number): [string, string] {
  if (v < 0.5) return ['good', `D/E ${v.toFixed(2)} is conservative (<0.5).`];
  if (v <= 1.0) return ['fair', `D/E ${v.toFixed(2)} is moderate (0.5-1.0).`];
  return ['weak', `D/E ${v.toFixed(2)} is elevated (>1.0) — leverage risk.`];
}

function verdictCurrent(v: number): [string, string] {
  if (v < 1) return ['weak', `Current ratio ${v.toFixed(1)} is below 1 — liquidity warning.`];
  if (v <= 3) return ['good', `Current ratio ${v.toFixed(1)} is healthy (1.5-3).`];
  return ['fair', `Current ratio ${v.toFixed(1)} is high (>3) — possibly idle assets.`];
}

function verdictDiv(v: number): [string, string] {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 4 && pct <= 7) return ['good', `Yield ${pct.toFixed(1)}% is attractive (4-7%) if covered.`];
  if (pct > 7) return ['fair', `Yield ${pct.toFixed(1)}% is high (>7%) — check it is sustainable.`];
  return ['fair', `Yield ${pct.toFixed(1)}% is modest (<4%).`];
}

function verdictMargin(v: number): [string, string] {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 20) return ['good', `Margin ${pct.toFixed(0)}% is strong (>=20%).`];
  if (pct >= 10) return ['fair', `Margin ${pct.toFixed(0)}% is moderate (10-20%).`];
  return ['weak', `Margin ${pct.toFixed(0)}% is thin (<10%).`];
}

function verdictGrowth(v: number): [string, string] {
  const pct = Math.abs(v) <= 1 ? v * 100 : v;
  if (pct >= 15) return ['good', `Growth ${pct.toFixed(0)}% is strong (>=15%).`];
  if (pct >= 5) return ['fair', `Growth ${pct.toFixed(0)}% is moderate (5-15%).`];
  return ['weak', `Growth ${pct.toFixed(0)}% is slow/negative (<5%).`];
}

function verdictCoverage(v: number): [string, string] {
  if (v >= 4) return ['good', `Interest coverage ${v.toFixed(1)}x is safe (>=4x).`];
  if (v >= 2) return ['fair', `Interest coverage ${v.toFixed(1)}x is moderate (2-4x).`];
  return ['weak', `Interest coverage ${v.toFixed(1)}x is risky (<2x).`];
}

function verdictRsi(v: number): [string, string] {
  if (v > 70) return ['weak', `RSI ${v.toFixed(0)} is overbought (>70).`];
  if (v < 30) return ['weak', `RSI ${v.toFixed(0)} is oversold (<30).`];
  return ['good', `RSI ${v.toFixed(0)} is in a healthy band (30-70).`];
}

function verdictAdx(v: number): [string, string] {
  if (v >= 25) return ['good', `ADX ${v.toFixed(0)} shows a strong trend (>=25).`];
  if (v >= 20) return ['fair', `ADX ${v.toFixed(0)} is a borderline trend (20-25).`];
  return ['weak', `ADX ${v.toFixed(0)} is choppy/range-bound (<20).`];
}

const VERDICTS: Record<string, VerdictFn> = {
  ROE: verdictRoe,
  ROA: verdictRoe,
  PE: verdictPe,
  PB: verdictPb,
  PEG: verdictPeg,
  debt_to_equity: verdictDe,
  current_ratio: verdictCurrent,
  dividend_yield: verdictDiv,
  operating_margin: verdictMargin,
  earnings_growth: verdictGrowth,
  interest_coverage: verdictCoverage,
  RSI: verdictRsi,
  ADX: verdictAdx,
};

function entry(terms: Record<string, GlossaryEntry>, key: string): GlossaryEntry {
  return { ...terms[key], key };
}

export function run(req: Record<string, unknown>): Record<string, unknown> {
  const g = load();
  const terms = g.terms;
  const keyMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(g._meta.metric_key_map)) {
    keyMap[k.toLowerCase()] = v;
  }
  const results: unknown[] = [];

  if (req.list === true) {
    results.push(...Object.keys(terms).sort());
    return {
      skill: 'financial-terms-educator',
      results,
      count: results.length,
      language: 'en+bn',
      disclaimer: DISCLAIMER,
    };
  }

  if ('term' in req) {
    const key = resolveKey(req.term, terms, keyMap);
    if (key) results.push(entry(terms, key));
    else results.push({ query: req.term, error: 'term not found' });
  } else if ('terms' in req && Array.isArray(req.terms)) {
    for (const q of req.terms) {
      const key = resolveKey(q, terms, keyMap);
      results.push(key ? entry(terms, key) : { query: q, error: 'term not found' });
    }
  } else if ('metrics' in req && req.metrics && typeof req.metrics === 'object') {
    for (const [mkey, val] of Object.entries(req.metrics as Record<string, unknown>)) {
      const key = resolveKey(mkey, terms, keyMap);
      const ann: Record<string, unknown> = { metric: mkey, value: val };
      if (key) {
        ann.entry = entry(terms, key);
        const vf = VERDICTS[key];
        if (vf != null && typeof val === 'number') {
          try {
            const [verdict, note] = vf(val);
            ann.verdict = verdict;
            ann.assessment = note;
          } catch {
            ann.verdict = 'n/a';
            ann.assessment = 'value not numeric/assessable';
          }
        } else {
          ann.verdict = 'n/a';
          ann.assessment =
            "No threshold rule for this term; see entry's good_vs_bad field.";
        }
      } else {
        ann.error = 'no glossary entry for this metric key';
      }
      results.push(ann);
    }
  } else {
    return {
      skill: 'financial-terms-educator',
      error: 'request must include one of: term, terms, metrics, list',
    };
  }

  return {
    skill: 'financial-terms-educator',
    results,
    count: results.length,
    language: 'en+bn',
    disclaimer: DISCLAIMER,
  };
}
