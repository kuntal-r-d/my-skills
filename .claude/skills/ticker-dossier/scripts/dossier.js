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

// src/ticker-dossier/dossier.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var CARD_LABELS = {
  technical: "Technical Analysis",
  momentum: "Momentum Screen",
  pattern: "Pattern Miner",
  fundamental: "Fundamental Analysis",
  value: "Value Checklist",
  smart_money: "Smart-Money Flow",
  sentiment: "Sentiment & News",
  macro: "Macro Regime",
  synthesizer: "Signal Synthesizer",
  risk: "Risk Manager"
};
var ALL_CARDS = Object.keys(CARD_LABELS);
function fmt(x) {
  if (x == null) return "-";
  if (typeof x === "number") {
    return `${x.toFixed(3)}`.replace(/\.?0+$/, "");
  }
  return String(x);
}
function verdictRow(label, card) {
  const rating = card.rating ?? card.grade ?? card.status ?? "-";
  let score = card.score;
  if (score == null) score = card.composite_score ?? card.dse_composite_score;
  const conf = card.confidence;
  return `| ${label} | ${fmt(rating)} | ${fmt(score)} | ${fmt(conf)} |`;
}
function cardBlock(label, card) {
  const lines = [];
  const rating = card.rating ?? card.grade ?? card.status;
  const score = card.score ?? card.composite_score;
  const conf = card.confidence;
  const bits = [];
  if (rating != null) bits.push(`**Rating:** ${fmt(rating)}`);
  if (score != null) bits.push(`**Score:** ${fmt(score)}`);
  if (conf != null) bits.push(`**Confidence:** ${fmt(conf)}`);
  if (bits.length) lines.push(bits.join(" \xB7 "));
  const reasoning = card.reasoning ?? card.notes;
  if (Array.isArray(reasoning) && reasoning.length) {
    for (const r of reasoning.slice(0, 8)) lines.push(`- ${r}`);
  }
  const fl = card.flags;
  if (Array.isArray(fl) && fl.length) {
    lines.push(`- _Flags: ${fl.map(String).join(", ")}_`);
  }
  if (!lines.length) lines.push(`_${label}: card supplied but no readable fields._`);
  lines.push("");
  return lines;
}
function section(md, title, keys, cards) {
  md.push(`## ${title}`);
  const present = keys.filter((k) => cards[k] && typeof cards[k] === "object");
  if (!present.length) {
    md.push("_No analyses supplied for this section._");
    md.push("");
    return;
  }
  for (const k of keys) {
    if (k in cards) {
      md.push(`### ${CARD_LABELS[k]}`);
      md.push(...cardBlock(CARD_LABELS[k], cards[k]));
    }
  }
}
function render(data) {
  const ticker = data.ticker ?? "(unknown)";
  const asOf = data.as_of ?? "(date unknown)";
  const rawCards = data.cards;
  const cards = rawCards && typeof rawCards === "object" && !Array.isArray(rawCards) ? rawCards : {};
  const included = ALL_CARDS.filter((k) => cards[k] && typeof cards[k] === "object");
  const missing = ALL_CARDS.filter((k) => !included.includes(k));
  const md = [];
  md.push(`# Ticker Dossier \u2014 ${ticker}`);
  md.push("");
  md.push(`**As of:** ${asOf}  `);
  md.push(`**Disclaimer:** ${DISCLAIMER}`);
  md.push("");
  md.push(
    "> This dossier consolidates the analyses supplied by Stock Buddy's component skills. It contains educational analysis only and is not individualised investment advice or an instruction to trade."
  );
  md.push("");
  md.push("## At a glance");
  if (included.length) {
    md.push("| Analysis | Rating | Score | Confidence |");
    md.push("|----------|--------|-------|------------|");
    for (const k of ALL_CARDS) {
      if (included.includes(k)) {
        const row = verdictRow(CARD_LABELS[k], cards[k]);
        if (row) md.push(row);
      }
    }
    md.push("");
  } else {
    md.push(
      "_No analyses supplied \u2014 this is a skeleton dossier. Run the component skills (technical-analysis, fundamental-analysis, etc.) and pass their Thinking Cards under `cards` to populate this report._"
    );
    md.push("");
  }
  section(md, "Investment view", ["fundamental", "value"], cards);
  section(md, "Momentum view", ["technical", "momentum", "pattern"], cards);
  section(md, "Risk & levels", ["risk"], cards);
  section(md, "Smart-money & sentiment", ["smart_money", "sentiment"], cards);
  section(md, "Macro context", ["macro"], cards);
  section(md, "Synthesised signal", ["synthesizer"], cards);
  md.push("## Data provenance & missing analyses");
  md.push(
    `- **Included cards (${included.length}):** ${included.length ? included.map((k) => CARD_LABELS[k]).join(", ") : "none"}`
  );
  md.push(
    `- **Missing cards (${missing.length}):** ${missing.length ? missing.map((k) => CARD_LABELS[k]).join(", ") : "none"}`
  );
  md.push("- Verdicts above are only as current as the cards supplied; re-run the component skills to refresh.");
  md.push("");
  return {
    skill: "ticker-dossier",
    ticker,
    as_of: asOf,
    markdown: md.join("\n"),
    included_cards: included,
    missing_cards: missing,
    disclaimer: DISCLAIMER
  };
}

// src/cli/ticker-dossier.ts
runCli(render, parseCliArgs(process.argv));
//# sourceMappingURL=ticker-dossier.js.map