export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const NEAR_PCT = 3.0;
const CONCENTRATION_PCT = 25.0;
const STALE_DAYS = 2;

const IMPERATIVE_REWRITES: [RegExp, string][] = [
  [/\byou should (buy|sell|short|exit|add)\b/gi, 'conditions relate to a possible $1 zone'],
  [/\bif\b(.+?)\bthen consider\b/gi, 'a condition is met when$1and a level is in view at'],
  [/\bwatch for\b/gi, 'a level to note is'],
  [/\bwatch\b/gi, 'in view:'],
  [/\bbuy\b/gi, 'an entry-level condition'],
  [/\bsell\b/gi, 'an exit-level condition'],
  [/\bshort\b/gi, 'a downside-level condition'],
  [/\bexit now\b/gi, 'an exit level is in view'],
  [/\bgo long\b/gi, 'an upside-level condition'],
  [/\btake profit\b/gi, 'a target-level condition'],
  [/\bcut\b/gi, 'a stop-level condition'],
];

export function stripImperatives(text: string): [string, boolean] {
  const original = text;
  let out = text;
  for (const [pat, repl] of IMPERATIVE_REWRITES) {
    out = out.replace(pat, repl);
  }
  return [out, out !== original];
}

function guard(lines: string[]): [string[], number] {
  const clean: string[] = [];
  let modified = 0;
  for (const ln of lines) {
    const [c, was] = stripImperatives(ln);
    if (was) modified++;
    clean.push(c);
  }
  return [clean, modified];
}

function pctDiff(a: number, b: number): number | null {
  if (!b) return null;
  return (Math.abs(a - b) / b) * 100.0;
}

function asOfFlags(asOf: unknown): string[] {
  const flags: string[] = [];
  if (!asOf) return ['stale_briefing'];
  try {
    const d = new Date(String(asOf).slice(0, 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if ((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) > STALE_DAYS) {
      flags.push('stale_briefing');
    }
  } catch {
    flags.push('stale_briefing');
  }
  return flags;
}

function regimeSection(macro: Record<string, unknown> | undefined): [string, Record<string, unknown> | null] {
  if (!macro) return ['Market regime: not supplied.', null];
  const rating = macro.rating ?? 'unknown';
  const mult = macro.risk_multiplier;
  const mtxt = mult != null ? `, risk multiplier ${mult}` : '';
  return [
    `Market regime rated **${rating}**${mtxt}. Position-sizing conditions scale with this multiplier.`,
    { rating, risk_multiplier: mult },
  ];
}

function positionsSection(positions: Record<string, unknown>[]): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const p of positions) {
    const t = p.ticker ?? '?';
    const px = p.current_price as number | undefined;
    if (px == null) continue;
    const stop = p.stop_level as number | undefined;
    const tgt = p.target_level as number | undefined;
    const ds = stop != null ? pctDiff(px, stop) : null;
    const dt = tgt != null ? pctDiff(px, tgt) : null;
    if (ds != null && ds <= NEAR_PCT) {
      lines.push(`${t} is within ${ds.toFixed(1)}% of its stop level (price ${px} vs stop ${stop}).`);
      items.push({ ticker: t, near: 'stop', distance_pct: Math.round(ds * 10) / 10 });
    } else if (dt != null && dt <= NEAR_PCT) {
      lines.push(`${t} is within ${dt.toFixed(1)}% of its target level (price ${px} vs target ${tgt}).`);
      items.push({ ticker: t, near: 'target', distance_pct: Math.round(dt * 10) / 10 });
    }
  }
  if (!lines.length) lines.push('No held position is within ~3% of a stop or target level.');
  return [lines, items];
}

function watchlistSection(watch: Record<string, unknown>[]): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const w of watch) {
    const t = w.ticker ?? '?';
    const px = w.current_price as number | undefined;
    const entry = w.entry_level as number | undefined;
    if (px == null || entry == null) continue;
    const d = pctDiff(px, entry);
    if (d != null && d <= NEAR_PCT) {
      const sig = w.signal;
      const sigTxt = sig ? ` Prior signal noted: ${sig}.` : '';
      lines.push(`${t} is within ${d.toFixed(1)}% of its entry level (price ${px} vs entry ${entry}).${sigTxt}`);
      items.push({ ticker: t, distance_pct: Math.round(d * 10) / 10, signal: sig });
    }
  }
  if (!lines.length) lines.push('No watchlist name is within ~3% of its entry level.');
  return [lines, items];
}

function calendarSection(calendar: Record<string, unknown>[], asOf: unknown): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const e of calendar) {
    if (String(e.date ?? '').slice(0, 10) === String(asOf ?? '').slice(0, 10)) {
      lines.push(`Today: ${e.event ?? '(unspecified event)'}.`);
      items.push(e);
    }
  }
  if (!lines.length) lines.push('No economic or earnings events are dated today.');
  return [lines, items];
}

function newsSection(news: Record<string, unknown>[], knownTickers: Set<unknown>): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const n of news) {
    const t = n.ticker ?? '?';
    const head = n.headline ?? '';
    const src = n.source ?? '';
    const scope = knownTickers.has(t) ? 'held/watch' : 'other';
    const srcTxt = src ? ` (source: ${src})` : '';
    lines.push(`${t} [${scope}]: ${head}${srcTxt}.`);
    items.push({ ticker: t, scope });
  }
  if (!lines.length) lines.push('No overnight news or disclosures supplied.');
  return [lines, items];
}

function riskSection(
  positions: Record<string, unknown>[],
  news: Record<string, unknown>[],
  macro: Record<string, unknown> | undefined,
): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  let book = 0.0;
  const vals: [unknown, number][] = [];
  for (const p of positions) {
    const v = (Number(p.qty ?? 0)) * (Number(p.current_price ?? 0));
    vals.push([p.ticker ?? '?', v]);
    book += v;
  }
  if (book > 0) {
    for (const [t, v] of vals) {
      const wpct = (v / book) * 100.0;
      if (wpct >= CONCENTRATION_PCT) {
        lines.push(
          `Concentration: ${t} represents ${wpct.toFixed(0)}% of book value (threshold ${CONCENTRATION_PCT.toFixed(0)}%).`,
        );
        items.push({ type: 'concentration', ticker: t, weight_pct: Math.round(wpct * 10) / 10 });
      }
    }
  }
  const kw = /\b(circuit|floor price|floor-price|halt|halted|suspend)\b/i;
  for (const n of news) {
    if (kw.test(String(n.headline ?? ''))) {
      lines.push(`Microstructure note: ${n.ticker ?? '?'} headline mentions a circuit/floor/halt condition.`);
      items.push({ type: 'microstructure', ticker: n.ticker });
    }
  }
  if (macro && ['risk_off', 'bearish', 'red'].includes(String(macro.rating ?? '').toLowerCase())) {
    lines.push('Macro regime is risk-off; sizing conditions are tighter than usual.');
    items.push({ type: 'macro_risk_off' });
  }
  if (!lines.length) lines.push('No elevated risk items detected in the supplied data.');
  return [lines, items];
}

export function build(data: Record<string, unknown>): Record<string, unknown> {
  const asOf = data.as_of;
  const user = data.user;
  const portfolio = (data.portfolio as Record<string, unknown>) ?? {};
  const positions = (portfolio.positions as Record<string, unknown>[]) ?? [];
  const watch = (data.watchlist as Record<string, unknown>[]) ?? [];
  const calendar = (data.calendar as Record<string, unknown>[]) ?? [];
  const news = (data.overnight_news as Record<string, unknown>[]) ?? [];
  const macro = (data.macro_regime as Record<string, unknown>) ?? {};

  const flags = asOfFlags(asOf);
  if (!positions.length) flags.push('fallback');

  const known = new Set([
    ...positions.map((p) => p.ticker),
    ...watch.map((w) => w.ticker),
  ]);

  const [regimeLine, regimeMeta] = regimeSection(macro);
  const [posLines, posItems] = positionsSection(positions);
  const [watchLines, watchItems] = watchlistSection(watch);
  const [calLines, calItems] = calendarSection(calendar, asOf);
  const [newsLines, newsItems] = newsSection(news, known);
  const [riskLines, riskItems] = riskSection(positions, news, macro);

  const allGroups = [[regimeLine], posLines, watchLines, calLines, newsLines, riskLines];
  let modifiedTotal = 0;
  const cleaned: string[][] = [];
  for (const g of allGroups) {
    const [cg, m] = guard(g);
    modifiedTotal += m;
    cleaned.push(cg);
  }
  const [regimeC, posC, watchC, calC, newsC, riskC] = cleaned;
  const regimeLineFinal = regimeC[0]!;
  if (modifiedTotal) flags.push('imperative_phrasing_rewritten');

  const nearCount = posItems.length + watchItems.length;
  let summary =
    `Pre-market briefing for ${asOf ?? 'unknown date'}: ` +
    `${regimeMeta?.rating ?? 'regime n/a'} regime, ` +
    `${nearCount} name(s) near a level, ` +
    `${calItems.length} event(s) today, ${riskItems.length} risk item(s).`;
  [summary] = stripImperatives(summary);

  const who = user ? ` for ${user}` : '';
  const md: string[] = [];
  md.push(`# Pre-Market Briefing${who} - ${asOf ?? 'date unknown'}`);
  md.push('');
  md.push(`> ${DISCLAIMER} Conditions and levels only; no instructions to act.`);
  md.push('');
  md.push('## 1. Market regime');
  md.push(regimeLineFinal);
  md.push('');
  md.push('## 2. Held positions near stop/target levels');
  md.push(...posC.map((x) => `- ${x}`));
  md.push('');
  md.push('## 3. Watchlist names near entry levels');
  md.push(...watchC.map((x) => `- ${x}`));
  md.push('');
  md.push('## 4. Economic / earnings calendar today');
  md.push(...calC.map((x) => `- ${x}`));
  md.push('');
  md.push('## 5. Overnight news & disclosures');
  md.push(...newsC.map((x) => `- ${x}`));
  md.push('');
  md.push('## 6. Risk items');
  md.push(...riskC.map((x) => `- ${x}`));
  md.push('');

  return {
    skill: 'daily-briefing',
    as_of: asOf,
    summary,
    markdown: md.join('\n'),
    sections: {
      market_regime: { line: regimeLineFinal, meta: regimeMeta },
      positions_near_levels: { lines: posC, items: posItems },
      watchlist_near_entry: { lines: watchC, items: watchItems },
      calendar_today: { lines: calC, items: calItems },
      overnight_news: { lines: newsC, items: newsItems },
      risk_items: { lines: riskC, items: riskItems },
    },
    item_counts: {
      positions: positions.length,
      watchlist: watch.length,
      positions_near_level: posItems.length,
      watchlist_near_entry: watchItems.length,
      events_today: calItems.length,
      news: news.length,
      risk_items: riskItems.length,
    },
    flags,
    disclaimer: DISCLAIMER,
  };
}
