import * as ind from '@stock-buddy/core';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';
export const DEFAULT_LIMIT = 25;

const TEMPLATES: Record<string, Record<string, unknown>> = {
  dividend_champions: { div_yield_min: 0.04, roe_min: 0.12 },
  value: { pe_max: 15, pb_max: 1.5, roe_min: 0.12 },
  momentum_leaders: { rsi_min: 55, breakout: true, pos_52w_min: 0.7 },
  oversold_quality: { rsi_max: 35, roe_min: 0.15, de_max: 0.6 },
  small_cap_growth: { market_cap_min: 0, roe_min: 0.15 },
};

const SECTOR_KEYWORDS: Record<string, string> = {
  bank: 'Bank', banks: 'Bank', banking: 'Bank',
  telecom: 'Telecom', telco: 'Telecom',
  pharma: 'Pharma', pharmaceutical: 'Pharma',
  cement: 'Cement', textile: 'Textile', fuel: 'Fuel', power: 'Power',
  insurance: 'Insurance', food: 'Food', engineering: 'Engineering',
};

function technicals(ohlcv: ind.OhlcvBar[] | undefined): Record<string, unknown> {
  if (!ohlcv || ohlcv.length < 2) return {};
  const [, , , c, v] = ind.splitOhlcv(ohlcv);
  const tech: Record<string, unknown> = {};
  tech.rsi = ind.lastValid(ind.rsi(c, 14));
  const m50 = ind.lastValid(ind.sma(c, 50));
  const m200 = ind.lastValid(ind.sma(c, 200));
  tech.ma50 = m50;
  tech.ma200 = m200;
  tech.ma_cross = m50 != null && m200 != null ? (m50 > m200 ? 'golden' : 'death') : null;

  const window = c.length >= 252 ? c.slice(-252) : c;
  const hi52 = Math.max(...window);
  const lo52 = Math.min(...window);
  const span = hi52 - lo52 || 1e-9;
  tech.pos_52w = (c[c.length - 1]! - lo52) / span;
  tech.high_52w = hi52;
  tech.low_52w = lo52;

  const prior = c.length >= 41 ? c.slice(-41, -1) : c.slice(0, -1);
  tech.breakout = prior.length > 0 && c[c.length - 1]! >= Math.max(...prior);

  const avg20 = ind.lastValid(ind.sma(v, 20)) ?? (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  tech.rel_volume = avg20 ? v[v.length - 1]! / avg20 : 1.0;
  return tech;
}

function evaluate(
  stock: Record<string, unknown>,
  filters: Record<string, unknown>,
): [boolean, Record<string, boolean>, Record<string, unknown>, Record<string, unknown>] {
  const f = (stock.fundamentals as Record<string, unknown>) ?? {};
  const sector = (stock.sector as string) ?? (f.sector as string);
  const tech = technicals(stock.ohlcv as ind.OhlcvBar[] | undefined);
  const matched: Record<string, boolean> = {};
  let passes = true;

  function check(name: string, ok: boolean): void {
    if (ok) matched[name] = true;
    else passes = false;
  }

  if ('pe_max' in filters) {
    const pe = f.pe;
    check('pe_max', pe != null && Number(pe) <= Number(filters.pe_max));
  }
  if ('pb_max' in filters) {
    const pb = f.pb;
    check('pb_max', pb != null && Number(pb) <= Number(filters.pb_max));
  }
  if ('roe_min' in filters) {
    const roe = f.roe;
    check('roe_min', roe != null && Number(roe) >= Number(filters.roe_min));
  }
  if ('de_max' in filters) {
    const de = f.debt_to_equity;
    check('de_max', de != null && Number(de) <= Number(filters.de_max));
  }
  if ('div_yield_min' in filters) {
    const dy = f.dividend_yield;
    check('div_yield_min', dy != null && Number(dy) >= Number(filters.div_yield_min));
  }
  if ('market_cap_min' in filters) {
    const mc = f.market_cap;
    check('market_cap_min', Number(filters.market_cap_min) <= 0 || (mc != null && Number(mc) >= Number(filters.market_cap_min)));
  }
  if ('sector' in filters) {
    const want = String(filters.sector).toLowerCase();
    const have = String(sector ?? '').toLowerCase();
    check('sector', have.includes(want) || want.includes(have));
  }
  if ('rsi_min' in filters) {
    check('rsi_min', tech.rsi != null && Number(tech.rsi) >= Number(filters.rsi_min));
  }
  if ('rsi_max' in filters) {
    check('rsi_max', tech.rsi != null && Number(tech.rsi) <= Number(filters.rsi_max));
  }
  if ('ma_cross' in filters) {
    check('ma_cross', tech.ma_cross === filters.ma_cross);
  }
  if ('pos_52w_min' in filters) {
    check('pos_52w_min', tech.pos_52w != null && Number(tech.pos_52w) >= Number(filters.pos_52w_min));
  }
  if ('pos_52w_max' in filters) {
    check('pos_52w_max', tech.pos_52w != null && Number(tech.pos_52w) <= Number(filters.pos_52w_max));
  }
  if ('breakout' in filters && filters.breakout) {
    check('breakout', tech.breakout === true);
  }
  if ('rel_volume_min' in filters) {
    check('rel_volume_min', tech.rel_volume != null && Number(tech.rel_volume) >= Number(filters.rel_volume_min));
  }

  return [passes, matched, f, tech];
}

function rankScore(f: Record<string, unknown>, tech: Record<string, unknown>): number {
  const roe = Number(f.roe ?? 0);
  const pos = tech.pos_52w as number | undefined;
  const rsi = tech.rsi as number | undefined;
  let score = 0.0;
  score += (Math.min(roe, 0.4) / 0.4) * 0.5;
  if (pos != null) score += pos * 0.3;
  if (rsi != null) score += Math.min(Math.max((rsi - 30) / 50.0, 0), 1) * 0.2;
  return Math.round(score * 10000) / 10000;
}

export function parseQuery(query: string): Record<string, unknown> {
  const q = (query || '').toLowerCase();
  const filters: Record<string, unknown> = {};
  if (!q) return filters;

  if (q.includes('cheap') || q.includes('value') || q.includes('undervalued')) {
    Object.assign(filters, TEMPLATES.value);
  }
  if (q.includes('dividend') || q.includes('income')) {
    Object.assign(filters, TEMPLATES.dividend_champions);
  }
  if (q.includes('momentum') || q.includes('breaking') || q.includes('breakout')) {
    Object.assign(filters, TEMPLATES.momentum_leaders);
  }
  if (q.includes('oversold')) {
    Object.assign(filters, TEMPLATES.oversold_quality);
  }

  for (const [kw, sec] of Object.entries(SECTOR_KEYWORDS)) {
    if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)) {
      filters.sector = sec;
      break;
    }
  }

  if (q.includes('profitable') || q.includes('profit') || q.includes('quality')) {
    if (!('roe_min' in filters)) filters.roe_min = 0.10;
  }

  let m = q.match(/p\s*\/?\s*e\s*(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)/);
  if (m) filters.pe_max = parseFloat(m[1]!);

  m = q.match(/roe\s*(?:above|over|greater than|>)\s*(\d+(?:\.\d+)?)\s*%?/);
  if (m) filters.roe_min = parseFloat(m[1]!) / 100.0;

  if (q.includes('52-week high') || q.includes('52 week high') || q.includes('52w high')) {
    filters.pos_52w_min = 0.9;
    filters.breakout = true;
  }

  if (q.includes('volume surge') || q.includes('volume spike') || q.includes('high volume')) {
    filters.rel_volume_min = 1.5;
  }

  return filters;
}

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const universe = data.universe;
  if (!Array.isArray(universe) || universe.length === 0) {
    return { skill: 'stock-screener', error: 'missing or empty `universe` array' };
  }

  const template = data.template as string | undefined;
  const query = data.query as string | undefined;
  const explicit = (data.filters as Record<string, unknown>) ?? {};
  const limit = (data.limit as number) ?? DEFAULT_LIMIT;
  const reasoning: string[] = [];

  const filters: Record<string, unknown> = {};
  if (template) {
    if (!(template in TEMPLATES)) {
      return {
        skill: 'stock-screener',
        error: `unknown template: ${template}`,
        available_templates: Object.keys(TEMPLATES).sort(),
      };
    }
    Object.assign(filters, TEMPLATES[template]);
    reasoning.push(`Template '${template}' applied: ${JSON.stringify(TEMPLATES[template])}`);
  }
  if (query) {
    const parsed = parseQuery(query);
    Object.assign(filters, parsed);
    reasoning.push(`Parsed query '${query}' -> ${JSON.stringify(parsed)}`);
  }
  if (Object.keys(explicit).length) {
    Object.assign(filters, explicit);
    reasoning.push(`Explicit filters override: ${JSON.stringify(explicit)}`);
  }
  if (Object.keys(filters).length === 0) {
    reasoning.push('No filters supplied — ranking the full universe.');
  }

  const results: Record<string, unknown>[] = [];
  for (const stock of universe as Record<string, unknown>[]) {
    const [passes, matched, f, tech] = evaluate(stock, filters);
    if (!passes) continue;
    results.push({
      ticker: stock.ticker,
      passes: true,
      score: rankScore(f, tech),
      matched_filters: matched,
      key_metrics: {
        pe: f.pe,
        roe: f.roe,
        rsi: tech.rsi != null ? Math.round(Number(tech.rsi) * 10) / 10 : null,
        pos_52w: tech.pos_52w != null ? Math.round(Number(tech.pos_52w) * 1000) / 1000 : null,
      },
    });
  }

  results.sort((a, b) => Number(b.score) - Number(a.score));
  const total = results.length;
  const limited = typeof limit === 'number' && limit > 0 ? results.slice(0, limit) : results;

  reasoning.push(`${total} of ${universe.length} stocks passed; returning top ${limited.length} by rank score.`);

  return {
    skill: 'stock-screener',
    as_of: data.as_of,
    applied: { template, query, filters },
    count: limited.length,
    results: limited,
    reasoning,
    disclaimer: DISCLAIMER,
  };
}
