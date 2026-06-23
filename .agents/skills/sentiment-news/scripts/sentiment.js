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

// src/sentiment-news/sentiment.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var POSITIVE = /* @__PURE__ */ new Set([
  "profit",
  "record",
  "growth",
  "grow",
  "dividend",
  "beats",
  "beat",
  "upgrade",
  "upgraded",
  "expansion",
  "expand",
  "surge",
  "surges",
  "wins",
  "win",
  "won",
  "rises",
  "rise",
  "rally",
  "jump",
  "gain",
  "gains",
  "strong",
  "high",
  "highs",
  "outperform",
  "approval",
  "approved",
  "award",
  "bonus",
  "buyback",
  "rebound"
]);
var NEGATIVE = /* @__PURE__ */ new Set([
  "loss",
  "losses",
  "fraud",
  "probe",
  "decline",
  "declines",
  "downgrade",
  "downgraded",
  "default",
  "halt",
  "halted",
  "suspension",
  "suspended",
  "penalty",
  "fall",
  "falls",
  "fell",
  "drop",
  "drops",
  "plunge",
  "plunges",
  "weak",
  "miss",
  "misses",
  "missed",
  "lawsuit",
  "scandal",
  "delist",
  "delisting",
  "warning",
  "cut",
  "cuts",
  "slump"
]);
var RUMOUR_SOURCES = /* @__PURE__ */ new Set(["social", "unconfirmed", "forum", "rumour", "rumor"]);
var RUMOUR_TERMS = /* @__PURE__ */ new Set(["rumour", "rumor", "unconfirmed", "speculation", "speculative", "alleged"]);
var FUNDAMENTAL_CATEGORIES = /* @__PURE__ */ new Set(["earnings", "regulatory", "corporate_action", "macro"]);
var RUMOUR_WEIGHT = 0.3;
var WORD = /[a-zA-Z]+/g;
function clamp(x, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
function itemSentiment(headline) {
  const words = (headline || "").match(WORD)?.map((w) => w.toLowerCase()) ?? [];
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    if (NEGATIVE.has(w)) neg++;
  }
  if (pos === 0 && neg === 0) return 0;
  return clamp((pos - neg) / (pos + neg));
}
function isRumour(item) {
  const src = String(item.source ?? "").toLowerCase();
  const cat = String(item.category ?? "").toLowerCase();
  const head = String(item.headline ?? "").toLowerCase();
  if (RUMOUR_SOURCES.has(src) || RUMOUR_TERMS.has(cat)) return true;
  for (const t of RUMOUR_TERMS) {
    if (head.includes(t)) return true;
  }
  return false;
}
function analyze(data) {
  const news = data.news;
  const flags = [];
  if (!Array.isArray(news)) {
    return { skill: "sentiment-news", error: "missing `news` array" };
  }
  const itemCount = news.length;
  if (itemCount === 0) {
    return { skill: "sentiment-news", error: "empty `news` array" };
  }
  const reasoning = [];
  const fundamentalSents = [];
  let rumourCount = 0;
  let fundamentalCount = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const it of news) {
    const s = itemSentiment(String(it.headline ?? ""));
    const rumour = isRumour(it);
    const cat = String(it.category ?? "").toLowerCase();
    const isFundamental = !rumour && FUNDAMENTAL_CATEGORIES.has(cat);
    let label;
    let weight;
    if (rumour) {
      label = "RUMOUR";
      weight = RUMOUR_WEIGHT;
      rumourCount++;
    } else if (isFundamental) {
      label = "FUNDAMENTAL";
      weight = 1;
      fundamentalCount++;
      fundamentalSents.push(s);
    } else {
      label = "general";
      weight = 0.7;
    }
    weightedSum += s * weight;
    weightTotal += weight;
    if (Math.abs(s) >= 0.5 || rumour) {
      const tone = s > 0 ? "positive" : s < 0 ? "negative" : "neutral";
      reasoning.push(
        `[${label}] '${it.headline ?? ""}' (${it.source ?? "?"}) -> ${tone} (${s >= 0 ? "+" : ""}${s.toFixed(2)})`
      );
    }
  }
  let score = weightTotal ? clamp(weightedSum / weightTotal) : 0;
  const avgFund = fundamentalSents.length ? fundamentalSents.reduce((a, b) => a + b, 0) / fundamentalSents.length : 0;
  const rumourDominated = rumourCount > 0 && fundamentalCount === 0;
  if (rumourDominated) {
    score = clamp(score, -0.4, 0.4);
    flags.push("rumour_dominated");
  }
  if (itemCount < 2) flags.push("thin_coverage");
  let confidence = 0.4 + 0.1 * Math.min(fundamentalCount, 4) + 0.05 * Math.min(itemCount, 4);
  if (rumourDominated) confidence -= 0.2;
  if (flags.includes("thin_coverage")) confidence -= 0.15;
  confidence = clamp(confidence, 0.15, 0.9);
  let rating;
  if (score >= 0.2) rating = "positive";
  else if (score <= -0.2) rating = "negative";
  else rating = "neutral";
  if (reasoning.length === 0) {
    reasoning.push("No headline carried decisive sentiment keywords \u2014 neutral read.");
  }
  return {
    skill: "sentiment-news",
    ticker: data.ticker,
    mode: data.mode ?? "both",
    as_of: data.as_of,
    score: Math.round(score * 1e3) / 1e3,
    confidence: Math.round(confidence * 100) / 100,
    rating,
    key_metrics: {
      item_count: itemCount,
      fundamental_count: fundamentalCount,
      rumour_count: rumourCount,
      avg_fundamental_sentiment: Math.round(avgFund * 1e3) / 1e3
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/sentiment-news.ts
runCli(analyze, parseCliArgs(process.argv));
//# sourceMappingURL=sentiment-news.js.map