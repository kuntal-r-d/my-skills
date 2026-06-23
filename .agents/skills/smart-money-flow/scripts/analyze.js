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

// src/smart-money-flow/analyze.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var SIGNIFICANCE_THRESHOLD = 2;
var CONFIDENCE_CAP = 0.7;
function clamp(x, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
function num(x) {
  return typeof x === "number" && !Number.isNaN(x);
}
function noDataCard(data) {
  return {
    skill: "smart-money-flow",
    ticker: data.ticker,
    mode: data.mode ?? "investment",
    as_of: data.as_of,
    score: 0,
    confidence: 0.1,
    rating: "neutral",
    key_metrics: { latest_deltas: {}, funds_featuring: [] },
    reasoning: [
      "No `shareholding` disclosure present in the input. Smart-money flow cannot be assessed from public data; no private broker book is ever inferred."
    ],
    flags: ["no_disclosure_data"],
    disclaimer: DISCLAIMER
  };
}
function analyze(data) {
  const sh = data.shareholding;
  if (!Array.isArray(sh) || sh.length < 1) return noDataCard(data);
  const flags = ["monthly_disclosure_lag"];
  const reasoning = [];
  let score = 0;
  let deltas = {};
  if (sh.length < 2) {
    flags.push("single_month_no_trend");
    const first = sh[0];
    reasoning.push(
      `Only one disclosure month (${first.month}) available \u2014 no month-over-month trend computable; confidence reduced.`
    );
  } else {
    const prev = sh[sh.length - 2];
    const latest = sh[sh.length - 1];
    const pm = prev.month;
    const lm = latest.month;
    deltas = {};
    for (const key of ["sponsor", "govt", "institution", "foreign", "public"]) {
      if (num(latest[key]) && num(prev[key])) {
        deltas[key] = Math.round((latest[key] - prev[key]) * 100) / 100;
      }
    }
    const di = deltas.institution;
    if (di != null) {
      if (di >= SIGNIFICANCE_THRESHOLD) {
        score += 0.3;
        reasoning.push(
          `${lm}: institutional ownership +${di.toFixed(1)}pp MoM (vs ${pm}) \u2014 significant accumulation (positive).`
        );
      } else if (di <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.3;
        reasoning.push(
          `${lm}: institutional ownership ${di.toFixed(1)}pp MoM (vs ${pm}) \u2014 significant distribution (negative).`
        );
      } else {
        reasoning.push(
          `${lm}: institutional ownership ${di >= 0 ? "+" : ""}${di.toFixed(1)}pp MoM (vs ${pm}) \u2014 below the 2pp significance threshold.`
        );
      }
    }
    const df = deltas.foreign;
    if (df != null) {
      if (df >= SIGNIFICANCE_THRESHOLD) {
        score += 0.3;
        reasoning.push(
          `${lm}: foreign holding +${df.toFixed(1)}pp MoM (vs ${pm}) \u2014 significant foreign INFLOW (confidence/governance signal, positive).`
        );
      } else if (df <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.3;
        reasoning.push(
          `${lm}: foreign holding ${df.toFixed(1)}pp MoM (vs ${pm}) \u2014 significant foreign OUTFLOW (negative).`
        );
      } else if (df > 0) {
        score += 0.1;
        reasoning.push(`${lm}: foreign holding +${df.toFixed(1)}pp MoM (vs ${pm}) \u2014 modest inflow.`);
      } else if (df < 0) {
        score -= 0.1;
        reasoning.push(`${lm}: foreign holding ${df.toFixed(1)}pp MoM (vs ${pm}) \u2014 modest outflow.`);
      }
    }
    const ds = deltas.sponsor;
    if (ds != null) {
      if (ds <= -SIGNIFICANCE_THRESHOLD) {
        score -= 0.4;
        flags.push("sponsor_director_selling");
        reasoning.push(
          `${lm}: sponsor/director holding ${ds.toFixed(1)}pp MoM (vs ${pm}) \u2014 significant insider SELLING (RED FLAG, strong negative).`
        );
      } else if (ds < 0) {
        score -= 0.15;
        reasoning.push(
          `${lm}: sponsor/director holding ${ds.toFixed(1)}pp MoM (vs ${pm}) \u2014 minor insider reduction (caution).`
        );
      } else if (ds >= SIGNIFICANCE_THRESHOLD) {
        score += 0.25;
        reasoning.push(
          `${lm}: sponsor/director holding +${ds.toFixed(1)}pp MoM (vs ${pm}) \u2014 insider buying (positive).`
        );
      } else if (ds > 0) {
        score += 0.1;
        reasoning.push(
          `${lm}: sponsor/director holding +${ds.toFixed(1)}pp MoM (vs ${pm}) \u2014 modest insider accumulation.`
        );
      }
    }
  }
  const funds = data.funds;
  const fundsFeaturing = [];
  if (Array.isArray(funds) && funds.length > 0) {
    for (const fd of funds) {
      const name = fd.name;
      const w = fd.ticker_weight_pct;
      const pw = fd.prev_weight_pct;
      const tr = fd.track_record_3y;
      if (!num(w) || !num(pw)) continue;
      const dw = Math.round((w - pw) * 100) / 100;
      const trScale = num(tr) ? clamp(tr, 0, 1) : 0.3;
      if (dw > 0) {
        let bump = Math.round(0.25 * (dw / 1) * (0.5 + trScale) * 1e3) / 1e3;
        bump = Math.min(bump, 0.3);
        score += bump;
        reasoning.push(
          `Fund ${name} raised weight ${pw.toFixed(1)}%->${w.toFixed(1)}% (+${dw.toFixed(1)}pp), 3y track record ${num(tr) ? tr : "n/a"} \u2014 positive (+${bump}).`
        );
      } else if (dw < 0) {
        score -= 0.1;
        reasoning.push(
          `Fund ${name} cut weight ${pw.toFixed(1)}%->${w.toFixed(1)}% (${dw.toFixed(1)}pp) \u2014 negative.`
        );
      }
      fundsFeaturing.push({
        name,
        weight_pct: w,
        weight_delta_pp: dw,
        manager: fd.manager,
        track_record_3y: tr
      });
    }
  } else {
    reasoning.push(
      "No public fund-holding (`funds`) data supplied \u2014 fund-manager featuring not assessed (no private data inferred)."
    );
  }
  score = Math.round(clamp(score) * 1e3) / 1e3;
  let confidence = 0.6;
  if (flags.includes("single_month_no_trend")) confidence -= 0.25;
  if (fundsFeaturing.length === 0) confidence -= 0.05;
  confidence = Math.round(Math.min(CONFIDENCE_CAP, clamp(confidence, 0.1, 0.95)) * 100) / 100;
  let rating;
  if (score >= 0.2) rating = "accumulation";
  else if (score <= -0.2) rating = "distribution";
  else rating = "neutral";
  const latestSh = sh[sh.length - 1];
  return {
    skill: "smart-money-flow",
    ticker: data.ticker,
    mode: data.mode ?? "investment",
    as_of: data.as_of,
    score,
    confidence,
    rating,
    key_metrics: {
      latest_deltas: deltas,
      latest_month: latestSh.month ?? null,
      funds_featuring: fundsFeaturing,
      significance_threshold_pp: SIGNIFICANCE_THRESHOLD
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/smart-money-flow.ts
runCli(analyze, parseCliArgs(process.argv));
//# sourceMappingURL=smart-money-flow.js.map