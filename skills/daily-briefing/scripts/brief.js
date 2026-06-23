#!/usr/bin/env node

// src/cli.ts
import { readFileSync } from "fs";
import { stdin } from "process";
function readInput(inputPath) {
  if (inputPath) {
    return readFileSync(inputPath, "utf8");
  }
  return readFileSync(stdin.fd, "utf8");
}
function writeOutput(result, pretty = false) {
  const indent = pretty ? 2 : void 0;
  process.stdout.write(`${JSON.stringify(result, null, indent)}
`);
}
function runCli(handler, options = {}) {
  let raw;
  try {
    raw = readInput(options.input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    writeOutput({ error: "request must be a JSON object" });
    process.exit(1);
    return;
  }
  const result = handler(data);
  writeOutput(result, options.pretty);
  if ("error" in result) {
    process.exit(1);
  }
}
function parseCliArgs(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--input" && argv[i + 1]) {
      options.input = argv[++i];
    }
  }
  return options;
}

// src/daily-briefing/brief.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var NEAR_PCT = 3;
var CONCENTRATION_PCT = 25;
var STALE_DAYS = 2;
var IMPERATIVE_REWRITES = [
  [/\byou should (buy|sell|short|exit|add)\b/gi, "conditions relate to a possible $1 zone"],
  [/\bif\b(.+?)\bthen consider\b/gi, "a condition is met when$1and a level is in view at"],
  [/\bwatch for\b/gi, "a level to note is"],
  [/\bwatch\b/gi, "in view:"],
  [/\bbuy\b/gi, "an entry-level condition"],
  [/\bsell\b/gi, "an exit-level condition"],
  [/\bshort\b/gi, "a downside-level condition"],
  [/\bexit now\b/gi, "an exit level is in view"],
  [/\bgo long\b/gi, "an upside-level condition"],
  [/\btake profit\b/gi, "a target-level condition"],
  [/\bcut\b/gi, "a stop-level condition"]
];
function stripImperatives(text) {
  const original = text;
  let out = text;
  for (const [pat, repl] of IMPERATIVE_REWRITES) {
    out = out.replace(pat, repl);
  }
  return [out, out !== original];
}
function guard(lines) {
  const clean = [];
  let modified = 0;
  for (const ln of lines) {
    const [c, was] = stripImperatives(ln);
    if (was) modified++;
    clean.push(c);
  }
  return [clean, modified];
}
function pctDiff(a, b) {
  if (!b) return null;
  return Math.abs(a - b) / b * 100;
}
function asOfFlags(asOf) {
  const flags = [];
  if (!asOf) return ["stale_briefing"];
  try {
    const d = new Date(String(asOf).slice(0, 10));
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if ((today.getTime() - d.getTime()) / (1e3 * 60 * 60 * 24) > STALE_DAYS) {
      flags.push("stale_briefing");
    }
  } catch {
    flags.push("stale_briefing");
  }
  return flags;
}
function regimeSection(macro) {
  if (!macro) return ["Market regime: not supplied.", null];
  const rating = macro.rating ?? "unknown";
  const mult = macro.risk_multiplier;
  const mtxt = mult != null ? `, risk multiplier ${mult}` : "";
  return [
    `Market regime rated **${rating}**${mtxt}. Position-sizing conditions scale with this multiplier.`,
    { rating, risk_multiplier: mult }
  ];
}
function positionsSection(positions) {
  const lines = [];
  const items = [];
  for (const p of positions) {
    const t = p.ticker ?? "?";
    const px = p.current_price;
    if (px == null) continue;
    const stop = p.stop_level;
    const tgt = p.target_level;
    const ds = stop != null ? pctDiff(px, stop) : null;
    const dt = tgt != null ? pctDiff(px, tgt) : null;
    if (ds != null && ds <= NEAR_PCT) {
      lines.push(`${t} is within ${ds.toFixed(1)}% of its stop level (price ${px} vs stop ${stop}).`);
      items.push({ ticker: t, near: "stop", distance_pct: Math.round(ds * 10) / 10 });
    } else if (dt != null && dt <= NEAR_PCT) {
      lines.push(`${t} is within ${dt.toFixed(1)}% of its target level (price ${px} vs target ${tgt}).`);
      items.push({ ticker: t, near: "target", distance_pct: Math.round(dt * 10) / 10 });
    }
  }
  if (!lines.length) lines.push("No held position is within ~3% of a stop or target level.");
  return [lines, items];
}
function watchlistSection(watch) {
  const lines = [];
  const items = [];
  for (const w of watch) {
    const t = w.ticker ?? "?";
    const px = w.current_price;
    const entry = w.entry_level;
    if (px == null || entry == null) continue;
    const d = pctDiff(px, entry);
    if (d != null && d <= NEAR_PCT) {
      const sig = w.signal;
      const sigTxt = sig ? ` Prior signal noted: ${sig}.` : "";
      lines.push(`${t} is within ${d.toFixed(1)}% of its entry level (price ${px} vs entry ${entry}).${sigTxt}`);
      items.push({ ticker: t, distance_pct: Math.round(d * 10) / 10, signal: sig });
    }
  }
  if (!lines.length) lines.push("No watchlist name is within ~3% of its entry level.");
  return [lines, items];
}
function calendarSection(calendar, asOf) {
  const lines = [];
  const items = [];
  for (const e of calendar) {
    if (String(e.date ?? "").slice(0, 10) === String(asOf ?? "").slice(0, 10)) {
      lines.push(`Today: ${e.event ?? "(unspecified event)"}.`);
      items.push(e);
    }
  }
  if (!lines.length) lines.push("No economic or earnings events are dated today.");
  return [lines, items];
}
function newsSection(news, knownTickers) {
  const lines = [];
  const items = [];
  for (const n of news) {
    const t = n.ticker ?? "?";
    const head = n.headline ?? "";
    const src = n.source ?? "";
    const scope = knownTickers.has(t) ? "held/watch" : "other";
    const srcTxt = src ? ` (source: ${src})` : "";
    lines.push(`${t} [${scope}]: ${head}${srcTxt}.`);
    items.push({ ticker: t, scope });
  }
  if (!lines.length) lines.push("No overnight news or disclosures supplied.");
  return [lines, items];
}
function riskSection(positions, news, macro) {
  const lines = [];
  const items = [];
  let book = 0;
  const vals = [];
  for (const p of positions) {
    const v = Number(p.qty ?? 0) * Number(p.current_price ?? 0);
    vals.push([p.ticker ?? "?", v]);
    book += v;
  }
  if (book > 0) {
    for (const [t, v] of vals) {
      const wpct = v / book * 100;
      if (wpct >= CONCENTRATION_PCT) {
        lines.push(
          `Concentration: ${t} represents ${wpct.toFixed(0)}% of book value (threshold ${CONCENTRATION_PCT.toFixed(0)}%).`
        );
        items.push({ type: "concentration", ticker: t, weight_pct: Math.round(wpct * 10) / 10 });
      }
    }
  }
  const kw = /\b(circuit|floor price|floor-price|halt|halted|suspend)\b/i;
  for (const n of news) {
    if (kw.test(String(n.headline ?? ""))) {
      lines.push(`Microstructure note: ${n.ticker ?? "?"} headline mentions a circuit/floor/halt condition.`);
      items.push({ type: "microstructure", ticker: n.ticker });
    }
  }
  if (macro && ["risk_off", "bearish", "red"].includes(String(macro.rating ?? "").toLowerCase())) {
    lines.push("Macro regime is risk-off; sizing conditions are tighter than usual.");
    items.push({ type: "macro_risk_off" });
  }
  if (!lines.length) lines.push("No elevated risk items detected in the supplied data.");
  return [lines, items];
}
function build(data) {
  const asOf = data.as_of;
  const user = data.user;
  const portfolio = data.portfolio ?? {};
  const positions = portfolio.positions ?? [];
  const watch = data.watchlist ?? [];
  const calendar = data.calendar ?? [];
  const news = data.overnight_news ?? [];
  const macro = data.macro_regime ?? {};
  const flags = asOfFlags(asOf);
  if (!positions.length) flags.push("fallback");
  const known = /* @__PURE__ */ new Set([
    ...positions.map((p) => p.ticker),
    ...watch.map((w) => w.ticker)
  ]);
  const [regimeLine, regimeMeta] = regimeSection(macro);
  const [posLines, posItems] = positionsSection(positions);
  const [watchLines, watchItems] = watchlistSection(watch);
  const [calLines, calItems] = calendarSection(calendar, asOf);
  const [newsLines, newsItems] = newsSection(news, known);
  const [riskLines, riskItems] = riskSection(positions, news, macro);
  const allGroups = [[regimeLine], posLines, watchLines, calLines, newsLines, riskLines];
  let modifiedTotal = 0;
  const cleaned = [];
  for (const g of allGroups) {
    const [cg, m] = guard(g);
    modifiedTotal += m;
    cleaned.push(cg);
  }
  const [regimeC, posC, watchC, calC, newsC, riskC] = cleaned;
  const regimeLineFinal = regimeC[0];
  if (modifiedTotal) flags.push("imperative_phrasing_rewritten");
  const nearCount = posItems.length + watchItems.length;
  let summary = `Pre-market briefing for ${asOf ?? "unknown date"}: ${regimeMeta?.rating ?? "regime n/a"} regime, ${nearCount} name(s) near a level, ${calItems.length} event(s) today, ${riskItems.length} risk item(s).`;
  [summary] = stripImperatives(summary);
  const who = user ? ` for ${user}` : "";
  const md = [];
  md.push(`# Pre-Market Briefing${who} - ${asOf ?? "date unknown"}`);
  md.push("");
  md.push(`> ${DISCLAIMER} Conditions and levels only; no instructions to act.`);
  md.push("");
  md.push("## 1. Market regime");
  md.push(regimeLineFinal);
  md.push("");
  md.push("## 2. Held positions near stop/target levels");
  md.push(...posC.map((x) => `- ${x}`));
  md.push("");
  md.push("## 3. Watchlist names near entry levels");
  md.push(...watchC.map((x) => `- ${x}`));
  md.push("");
  md.push("## 4. Economic / earnings calendar today");
  md.push(...calC.map((x) => `- ${x}`));
  md.push("");
  md.push("## 5. Overnight news & disclosures");
  md.push(...newsC.map((x) => `- ${x}`));
  md.push("");
  md.push("## 6. Risk items");
  md.push(...riskC.map((x) => `- ${x}`));
  md.push("");
  return {
    skill: "daily-briefing",
    as_of: asOf,
    summary,
    markdown: md.join("\n"),
    sections: {
      market_regime: { line: regimeLineFinal, meta: regimeMeta },
      positions_near_levels: { lines: posC, items: posItems },
      watchlist_near_entry: { lines: watchC, items: watchItems },
      calendar_today: { lines: calC, items: calItems },
      overnight_news: { lines: newsC, items: newsItems },
      risk_items: { lines: riskC, items: riskItems }
    },
    item_counts: {
      positions: positions.length,
      watchlist: watch.length,
      positions_near_level: posItems.length,
      watchlist_near_entry: watchItems.length,
      events_today: calItems.length,
      news: news.length,
      risk_items: riskItems.length
    },
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/daily-briefing.ts
runCli(build, parseCliArgs(process.argv));
//# sourceMappingURL=daily-briefing.js.map