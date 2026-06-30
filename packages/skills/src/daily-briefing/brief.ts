import {
  getBriefingFooterNote,
  getDisclaimer,
  isAdvisoryMode,
  shouldStripImperatives,
} from '@stock-buddy/core';

export const DISCLAIMER = getDisclaimer();

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
  if (!shouldStripImperatives()) return [text, false];
  const original = text;
  let out = text;
  for (const [pat, repl] of IMPERATIVE_REWRITES) {
    out = out.replace(pat, repl);
  }
  return [out, out !== original];
}

function guard(lines: string[]): [string[], number] {
  if (!shouldStripImperatives()) return [lines, 0];
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

function formatRating(rating: unknown): string {
  if (!rating) return 'n/a';
  return String(rating).replace(/_/g, ' ');
}

function formatScore(score: unknown): string {
  if (score == null) return '';
  return ` (${score}/10)`;
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
  if (!macro || !Object.keys(macro).length) {
    return [
      isAdvisoryMode()
        ? 'Market regime **unavailable** — run `npm run ingest:macro` or `npm run ingest:daily` before sizing positions.'
        : 'Market regime: not supplied.',
      null,
    ];
  }
  const rating = macro.rating ?? 'unknown';
  const mult = macro.risk_multiplier;
  const mtxt = mult != null ? ` · risk multiplier **${mult}**` : '';
  const reasoning = macro.reasoning as string[] | undefined;
  let line =
    `Market regime: **${rating}**${mtxt}. `
    + (isAdvisoryMode()
      ? 'Scale position sizes and new entries accordingly.'
      : 'Position-sizing conditions scale with this multiplier.');
  if (reasoning?.length) {
    line += ` Drivers: ${reasoning.slice(0, 2).join('; ')}.`;
  }
  return [line, { rating, risk_multiplier: mult, reasoning }];
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
      const action = isAdvisoryMode()
        ? ` Review stop at ৳${stop} — price ৳${px} is ${ds.toFixed(1)}% away.`
        : '';
      lines.push(`${t} is within ${ds.toFixed(1)}% of its stop level (price ${px} vs stop ${stop}).${action}`);
      items.push({ ticker: t, near: 'stop', distance_pct: Math.round(ds * 10) / 10 });
    } else if (dt != null && dt <= NEAR_PCT) {
      const action = isAdvisoryMode()
        ? ` Consider taking partial profits near target ৳${tgt}.`
        : '';
      lines.push(`${t} is within ${dt.toFixed(1)}% of its target level (price ${px} vs target ${tgt}).${action}`);
      items.push({ ticker: t, near: 'target', distance_pct: Math.round(dt * 10) / 10 });
    }
  }
  if (!lines.length) {
    lines.push(
      isAdvisoryMode()
        ? 'No held position is within ~3% of a stop or target — no immediate level alerts.'
        : 'No held position is within ~3% of a stop or target level.',
    );
  }
  return [lines, items];
}

function watchlistSection(watch: Record<string, unknown>[]): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const w of watch) {
    const t = w.ticker ?? '?';
    const px = w.current_price as number | undefined;
    const entry = w.entry_level as number | undefined;
    if (px != null && entry != null) {
      const d = pctDiff(px, entry);
      if (d != null && d <= NEAR_PCT) {
        const sig = w.signal;
        const sigTxt = sig ? ` Signal: ${formatRating(sig)}.` : '';
        const action = isAdvisoryMode() ? ' Entry zone is live — review size and stop before acting.' : '';
        lines.push(`${t} is within ${d.toFixed(1)}% of its entry level (price ${px} vs entry ${entry}).${sigTxt}${action}`);
        items.push({ ticker: t, distance_pct: Math.round(d * 10) / 10, signal: sig });
      }
    }
  }
  if (!lines.length) {
    if (isAdvisoryMode() && watch.length) {
      lines.push('No watchlist name is within ~3% of its buy-zone entry — see signal summary below.');
    } else {
      lines.push('No watchlist name is within ~3% of its entry level.');
    }
  }
  return [lines, items];
}

function signalSummarySection(
  positions: Record<string, unknown>[],
  watch: Record<string, unknown>[],
): [string[], Record<string, unknown>[]] {
  if (!isAdvisoryMode()) return [[], []];
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];

  if (positions.length) {
    lines.push('**Holdings**');
    for (const p of positions) {
      const t = p.ticker ?? '?';
      const inv = p.investment_rating;
      const mom = p.momentum_rating;
      const px = p.current_price;
      if (inv == null && mom == null) {
        lines.push(`- ${t}: no analysis on file — run Analyze first.`);
        continue;
      }
      const pxTxt = px != null ? ` @ ৳${px}` : '';
      lines.push(
        `- **${t}**${pxTxt}: Investment **${formatRating(inv)}**${formatScore(p.investment_score)} · `
        + `Momentum **${formatRating(mom)}**${formatScore(p.momentum_score)}`,
      );
      items.push({ ticker: t, type: 'holding', investment_rating: inv, momentum_rating: mom });
    }
  }

  if (watch.length) {
    lines.push('');
    lines.push('**Watchlist**');
    for (const w of watch) {
      const t = w.ticker ?? '?';
      const purpose = w.purpose ?? 'investment';
      const inv = w.investment_rating;
      const mom = w.momentum_rating;
      const px = w.current_price;
      const entry = w.entry_level;
      if (inv == null && mom == null) {
        lines.push(`- ${t} (${purpose}): no analysis — run Analyze to populate ratings.`);
        continue;
      }
      const pxTxt = px != null ? ` @ ৳${px}` : '';
      const entryTxt = entry != null ? ` · entry zone ৳${entry}` : '';
      lines.push(
        `- **${t}** (${purpose})${pxTxt}: Inv **${formatRating(inv)}**${formatScore(w.investment_score)} · `
        + `Mom **${formatRating(mom)}**${formatScore(w.momentum_score)}${entryTxt}`,
      );
      items.push({ ticker: t, type: 'watchlist', purpose, investment_rating: inv, momentum_rating: mom });
    }
  }

  if (!lines.length) {
    lines.push('No portfolio or watchlist symbols to summarize.');
  }
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
  if (!lines.length) {
    lines.push(
      isAdvisoryMode()
        ? 'No economic or earnings events dated today — check DSE price-sensitive notices separately.'
        : 'No economic or earnings events are dated today.',
    );
  }
  return [lines, items];
}

function newsSection(news: Record<string, unknown>[], knownTickers: Set<unknown>): [string[], Record<string, unknown>[]] {
  const lines: string[] = [];
  const items: Record<string, unknown>[] = [];
  for (const n of news) {
    const t = n.ticker ?? 'MARKET';
    const head = n.headline ?? '';
    const src = n.source ?? '';
    const importance = n.importance ?? '';
    const scope = t !== 'MARKET' && knownTickers.has(t) ? 'held/watch' : t !== 'MARKET' ? 'related' : 'market';
    const srcTxt = src ? ` (${src})` : '';
    const impTxt = importance ? ` [${importance}]` : '';
    lines.push(`${t}${impTxt} [${scope}]: ${head}${srcTxt}.`);
    items.push({ ticker: t, scope, importance });
  }
  if (!lines.length) {
    lines.push(
      isAdvisoryMode()
        ? 'No overnight news in the last 7 days — run `npm run ingest:daily` or `npm run ingest:news` if feeds are stale.'
        : 'No overnight news or disclosures supplied.',
    );
  }
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
        const action = isAdvisoryMode()
          ? ` Consider trimming ${t} or adding hedges — above ${CONCENTRATION_PCT.toFixed(0)}% single-name limit.`
          : '';
        lines.push(
          `Concentration: ${t} represents ${wpct.toFixed(0)}% of book value (threshold ${CONCENTRATION_PCT.toFixed(0)}%).${action}`,
        );
        items.push({ type: 'concentration', ticker: t, weight_pct: Math.round(wpct * 10) / 10 });
      }
    }
  }
  const kw = /\b(circuit|floor price|floor-price|halt|halted|suspend)\b/i;
  for (const n of news) {
    if (kw.test(String(n.headline ?? ''))) {
      lines.push(
        isAdvisoryMode()
          ? `Microstructure alert: ${n.ticker ?? '?'} — circuit/floor/halt mentioned; avoid new entries until normal trading.`
          : `Microstructure note: ${n.ticker ?? '?'} headline mentions a circuit/floor/halt condition.`,
      );
      items.push({ type: 'microstructure', ticker: n.ticker });
    }
  }
  const regime = String(macro?.rating ?? '').toLowerCase();
  if (['risk_off', 'cautious', 'bearish', 'red'].includes(regime)) {
    lines.push(
      isAdvisoryMode()
        ? `Macro regime is **${regime}** — reduce new position sizes and tighten stops.`
        : 'Macro regime is risk-off; sizing conditions are tighter than usual.',
    );
    items.push({ type: 'macro_risk_off', regime });
  }
  if (!lines.length) {
    lines.push(
      isAdvisoryMode()
        ? 'No elevated concentration or microstructure risks detected.'
        : 'No elevated risk items detected in the supplied data.',
    );
  }
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
  if (!macro?.rating) flags.push('missing_macro_regime');

  const known = new Set([
    ...positions.map((p) => p.ticker),
    ...watch.map((w) => w.ticker),
  ]);

  const [regimeLine, regimeMeta] = regimeSection(macro);
  const [posLines, posItems] = positionsSection(positions);
  const [watchLines, watchItems] = watchlistSection(watch);
  const [signalLines, signalItems] = signalSummarySection(positions, watch);
  const [calLines, calItems] = calendarSection(calendar, asOf);
  const [newsLines, newsItems] = newsSection(news, known);
  const [riskLines, riskItems] = riskSection(positions, news, macro);

  const allGroups = [[regimeLine], posLines, watchLines, calLines, newsLines, riskLines, signalLines];
  let modifiedTotal = 0;
  const cleaned: string[][] = [];
  for (const g of allGroups) {
    const [cg, m] = guard(g);
    modifiedTotal += m;
    cleaned.push(cg);
  }
  const [regimeC, posC, watchC, calC, newsC, riskC, signalC] = cleaned;
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
  if (!isAdvisoryMode()) {
    md.push(`> ${getDisclaimer()} ${getBriefingFooterNote()}`);
    md.push('');
  }
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
  if (isAdvisoryMode() && signalC.length) {
    md.push('');
    md.push('## 7. Portfolio & watchlist signal summary');
    md.push(...signalC.map((x) => (x.startsWith('- ') || x.startsWith('**') || x === '' ? x : `- ${x}`)));
  }
  md.push('');

  return {
    skill: 'daily-briefing',
    as_of: asOf,
    advisory_mode: isAdvisoryMode(),
    summary,
    markdown: md.join('\n'),
    sections: {
      market_regime: { line: regimeLineFinal, meta: regimeMeta },
      positions_near_levels: { lines: posC, items: posItems },
      watchlist_near_entry: { lines: watchC, items: watchItems },
      calendar_today: { lines: calC, items: calItems },
      overnight_news: { lines: newsC, items: newsItems },
      risk_items: { lines: riskC, items: riskItems },
      signal_summary: { lines: signalC, items: signalItems },
    },
    item_counts: {
      positions: positions.length,
      watchlist: watch.length,
      positions_near_level: posItems.length,
      watchlist_near_entry: watchItems.length,
      events_today: calItems.length,
      news: news.length,
      risk_items: riskItems.length,
      signal_summary: signalItems.length,
    },
    flags,
    disclaimer: getDisclaimer(),
  };
}
