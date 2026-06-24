/** Per-field source precedence (first available value wins). */
const FIELD_PRECEDENCE: Record<string, readonly string[]> = {
  eps_ttm: ['stockanalysis', 'dse', 'amarstock', 'lankabd'],
  pe: ['dse', 'amarstock', 'lankabd', 'stockanalysis'],
  market_cap: ['stockanalysis', 'lankabd', 'dse'],
  dividend_yield: ['stockanalysis', 'lankabd', 'dse'],
  beta: ['stockanalysis', 'lankabd', 'dse'],
  book_value_per_share: ['stockanalysis_statistics', 'lankabd', 'dse'],
  pb: ['stockanalysis_statistics', 'lankabd', 'dse'],
  roe: ['stockanalysis_statistics', 'lankabd'],
  debt_to_equity: ['stockanalysis_statistics', 'lankabd'],
  profit_margin: ['stockanalysis_statistics', 'lankabd'],
  sector: ['dse', 'lankabd'],
  revenue: ['stockanalysis'],
  price: ['dse', 'stockanalysis', 'lankabd'],
  current_ratio: ['stockanalysis_statistics', 'amarstock'],
};

export interface SourceFetchResult {
  id: string;
  payload: Record<string, unknown>;
}

export interface MergedFundamentals {
  payload: Record<string, unknown>;
  fieldSources: Record<string, string>;
  sources: string[];
  compositeSource: string;
}

function isUsablePe(v: unknown): boolean {
  if (v == null || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/** Merge fundamentals from multiple sources with field-level provenance. */
export function mergeFundamentals(results: SourceFetchResult[]): MergedFundamentals {
  const sourceMap = new Map<string, Record<string, unknown>>();
  const sources: string[] = [];

  for (const r of results) {
    if (!r.payload || Object.keys(r.payload).length === 0) continue;
    sourceMap.set(r.id, r.payload);
    if (!sources.includes(r.id)) sources.push(r.id);
  }

  const payload: Record<string, unknown> = {};
  const fieldSources: Record<string, string> = {};

  const allFields = new Set<string>(Object.keys(FIELD_PRECEDENCE));
  for (const p of sourceMap.values()) {
    for (const k of Object.keys(p)) {
      if (!k.startsWith('_')) allFields.add(k);
    }
  }

  for (const field of allFields) {
    const order = FIELD_PRECEDENCE[field] ?? sources;
    for (const id of order) {
      const p = sourceMap.get(id);
      if (!p) continue;
      const v = p[field];
      if (v == null || v === '') continue;
      if (field === 'pe' && !isUsablePe(v)) continue;
      payload[field] = v;
      fieldSources[field] = id;
      break;
    }
  }

  const price = payload.price as number | undefined;
  const nav = payload.book_value_per_share as number | undefined;
  if (payload.pb == null && price != null && nav != null && nav > 0) {
    payload.pb = price / nav;
    fieldSources.pb = 'derived';
  }

  if (payload.pe == null && price != null && typeof payload.eps_ttm === 'number' && payload.eps_ttm > 0) {
    payload.pe = price / payload.eps_ttm;
    fieldSources.pe = 'derived';
  }

  if (typeof payload.eps_ttm === 'number' && payload.eps_ttm <= 0) {
    delete payload.pe;
    delete fieldSources.pe;
  }

  payload._field_sources = fieldSources;
  payload._sources = sources;

  return {
    payload,
    fieldSources,
    sources,
    compositeSource: sources.join('+') || 'unknown',
  };
}
