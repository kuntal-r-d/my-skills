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

// src/macro-regime/regime.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var MULT_LO = 0.5;
var MULT_HI = 1.2;
var HIGH_INFLATION = 0.08;
var HIGH_POLICY_RATE = 0.09;
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function assess(data) {
  const macro = data.macro;
  const flags = [];
  if (!macro || typeof macro !== "object") {
    return { skill: "macro-regime", error: "missing `macro` object" };
  }
  const m = macro;
  let mult = 1;
  const reasoning = [];
  const drivers = {};
  const rate = m.policy_rate;
  if (rate == null) {
    flags.push("stale_macro");
  } else {
    const r = Number(rate);
    let d;
    if (r >= HIGH_POLICY_RATE) {
      d = -0.1;
      reasoning.push(
        `Policy rate ${(r * 100).toFixed(1)}% \u2014 tight money raises cost of capital, risk-off pressure`
      );
    } else {
      d = 0.07;
      reasoning.push(
        `Policy rate ${(r * 100).toFixed(1)}% \u2014 accommodative stance supports risk appetite`
      );
    }
    mult += d;
    drivers.policy_rate = Math.round(d * 1e3) / 1e3;
  }
  const infl = m.inflation;
  if (infl == null) {
    flags.push("stale_macro");
  } else {
    const i = Number(infl);
    let d;
    if (i > HIGH_INFLATION) {
      d = -0.1;
      reasoning.push(
        `Inflation ${(i * 100).toFixed(1)}% \u2014 above 8% erodes real returns and invites tightening, risk-off`
      );
    } else {
      d = 0.05;
      reasoning.push(`Inflation ${(i * 100).toFixed(1)}% \u2014 contained, supportive of equities`);
    }
    mult += d;
    drivers.inflation = Math.round(d * 1e3) / 1e3;
  }
  const trend = m.reserves_trend;
  if (trend == null) {
    flags.push("stale_macro");
  } else if (trend === "falling") {
    const d = -0.12;
    reasoning.push(
      "Reserves falling \u2014 import-cover stress and BDT pressure, strong risk-off pressure"
    );
    mult += d;
    drivers.reserves_trend = Math.round(d * 1e3) / 1e3;
  } else if (trend === "rising") {
    const d = 0.1;
    reasoning.push("Reserves rising \u2014 easing external pressure, risk-on");
    mult += d;
    drivers.reserves_trend = Math.round(d * 1e3) / 1e3;
  } else {
    reasoning.push("Reserves stable \u2014 neutral external backdrop");
    drivers.reserves_trend = 0;
  }
  const pol = m.politics;
  if (pol == null) {
    flags.push("stale_macro");
  } else if (pol === "crisis") {
    const d = -0.2;
    reasoning.push("Political crisis \u2014 heightened uncertainty, sharp risk-off");
    mult += d;
    drivers.politics = Math.round(d * 1e3) / 1e3;
  } else if (pol === "tense") {
    const d = -0.1;
    reasoning.push("Political tension \u2014 elevated headline risk, risk-off pressure");
    mult += d;
    drivers.politics = Math.round(d * 1e3) / 1e3;
  } else {
    const d = 0.05;
    reasoning.push("Politics stable \u2014 supportive backdrop");
    mult += d;
    drivers.politics = Math.round(d * 1e3) / 1e3;
  }
  const reg = m.regulatory;
  if (reg == null) {
    flags.push("stale_macro");
    reasoning.push("Regulatory stance unknown \u2014 assuming neutral");
  } else if (reg === "floor_prices") {
    const d = -0.15;
    reasoning.push(
      "Floor prices in force \u2014 broken price discovery and trapped liquidity, risk-off"
    );
    mult += d;
    drivers.regulatory = Math.round(d * 1e3) / 1e3;
  } else if (reg === "tightening") {
    const d = -0.08;
    reasoning.push("Regulatory tightening \u2014 added market friction, mild risk-off");
    mult += d;
    drivers.regulatory = Math.round(d * 1e3) / 1e3;
  } else {
    reasoning.push("Regulatory regime normal \u2014 no policy drag");
    drivers.regulatory = 0;
  }
  mult = clamp(mult, MULT_LO, MULT_HI);
  let regime;
  if (mult >= 1.05) regime = "risk_on";
  else if (mult >= 0.85) regime = "neutral";
  else if (mult >= 0.7) regime = "cautious";
  else regime = "risk_off";
  const score = clamp((mult - 1) / 0.2, -1, 1);
  const stale = flags.includes("stale_macro");
  let confidence = clamp(0.85 - 0.12 * flags.filter((f) => f === "stale_macro").length, 0.2, 0.9);
  if (stale) confidence = clamp(confidence, 0.2, 0.6);
  return {
    skill: "macro-regime",
    ticker: data.ticker,
    mode: data.mode ?? "both",
    as_of: data.as_of,
    score: Math.round(score * 1e3) / 1e3,
    confidence: Math.round(confidence * 100) / 100,
    rating: regime,
    key_metrics: {
      risk_multiplier: Math.round(mult * 1e3) / 1e3,
      drivers
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/macro-regime.ts
runCli(assess, parseCliArgs(process.argv));
//# sourceMappingURL=macro-regime.js.map