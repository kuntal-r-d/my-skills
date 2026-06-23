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

// src/pattern-miner/mine.ts
import * as ind from "@stock-buddy/core";
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var DEFAULTS = { min_occurrences: 8, forward_days: 5, success_threshold: 0.6 };
var N_PATTERNS = 4;
var BONFERRONI_BUMP = 0.05 * (1 - 1 / N_PATTERNS);
var VOL_SPIKE_MULT = 5;
var CIRCUIT_MOVE_PCT = 9.5;
function crossesUp(series, level, i) {
  const a = series[i - 1];
  const b = series[i];
  if (a == null || b == null) return false;
  return a < level && b >= level;
}
function trailingAvg(vol, i, n = 20) {
  const lo = Math.max(0, i - n);
  const window = vol.slice(lo, i);
  return window.length ? window.reduce((a, b) => a + b, 0) / window.length : vol[i] ?? 0;
}
function signalIndices(c, _h, _l, _v) {
  const n = c.length;
  const rsi2 = ind.rsi(c, 14);
  const s50 = ind.sma(c, 50);
  const s200 = ind.sma(c, 200);
  const boll = ind.bollinger(c, 20, 2);
  const upper = boll.upper;
  const breakout = [];
  const oversold = [];
  const golden = [];
  const upperBb = [];
  for (let i = 1; i < n; i++) {
    if (i >= 20) {
      const priorHigh = Math.max(...c.slice(i - 20, i));
      if (c[i] > priorHigh) breakout.push(i);
    }
    if (crossesUp(rsi2, 30, i)) oversold.push(i);
    if (s50[i] != null && s200[i] != null && s50[i - 1] != null && s200[i - 1] != null && s50[i - 1] <= s200[i - 1] && s50[i] > s200[i]) {
      golden.push(i);
    }
    if (upper[i] != null && upper[i - 1] != null && c[i - 1] <= upper[i - 1] && c[i] > upper[i]) {
      upperBb.push(i);
    }
  }
  return {
    "20-day high breakout": breakout,
    "RSI oversold bounce (cross up 30)": oversold,
    "Golden cross (MA50>MA200)": golden,
    "Close above upper Bollinger": upperBb
  };
}
function forwardReturn(c, i, fwd) {
  const j = i + fwd;
  if (j >= c.length || c[i] === 0) return null;
  return (c[j] - c[i]) / c[i] * 100;
}
function manipulationFlag(c, v, i) {
  const avg = trailingAvg(v, i);
  if (avg && v[i] > VOL_SPIKE_MULT * avg) {
    return `vol_spike_${Math.round(v[i] / avg * 10) / 10}x_at_${i}`;
  }
  if (i >= 1 && c[i - 1]) {
    const move = Math.abs(c[i] - c[i - 1]) / c[i - 1] * 100;
    if (move >= CIRCUIT_MOVE_PCT) return `circuit_sized_move_${Math.round(move * 10) / 10}pct_at_${i}`;
  }
  return null;
}
function evalWindow(idxs, c, v, fwd, lo, hi) {
  const rets = [];
  let wins = 0;
  const warnings = [];
  for (const i of idxs) {
    if (i < lo || i >= hi) continue;
    const r = forwardReturn(c, i, fwd);
    if (r == null) continue;
    rets.push(r);
    if (r > 0) wins++;
    const w = manipulationFlag(c, v, i);
    if (w) warnings.push(w);
  }
  const n = rets.length;
  const success = n ? wins / n : 0;
  const avg = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  return [n, success, avg, warnings];
}
function mine(data) {
  const ohlcv = data.ohlcv ?? [];
  const flags = [];
  if (ohlcv.length < 60) {
    return { skill: "pattern-miner", error: "need >=60 OHLCV bars to mine patterns", bars_supplied: ohlcv.length };
  }
  if (ohlcv.length < 120) flags.push("limited_history_<120_bars");
  const params = { ...DEFAULTS, ...data.params ?? {} };
  const minOcc = Number(params.min_occurrences);
  const fwd = Number(params.forward_days);
  const baseThresh = Number(params.success_threshold);
  const adjThresh = Math.min(0.95, baseThresh + BONFERRONI_BUMP);
  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const n = c.length;
  const split = Math.floor(n * 0.7);
  const sigs = signalIndices(c, h, l, v);
  const patterns = [];
  let validated = 0;
  for (const [name, idxs] of Object.entries(sigs)) {
    const usable = idxs.filter((i) => forwardReturn(c, i, fwd) != null);
    const total = usable.length;
    const [trN, trSucc, , trW] = evalWindow(usable, c, v, fwd, 0, split);
    const [hoN, hoSucc, , hoW] = evalWindow(usable, c, v, fwd, split, n);
    const allRet = usable.map((i) => forwardReturn(c, i, fwd)).filter((r) => r != null);
    const avgRet = allRet.length ? allRet.reduce((a, b) => a + b, 0) / allRet.length : 0;
    const warnings = [.../* @__PURE__ */ new Set([...trW, ...hoW])].sort();
    const manWarn = warnings.length ? [`manipulation_footprint: ${warnings.length} occurrence(s)`] : [];
    let status;
    if (total < minOcc || trN === 0 || hoN === 0) status = "insufficient_data";
    else if (trSucc >= adjThresh && hoSucc >= adjThresh) {
      status = "validated";
      validated++;
    } else if (trSucc >= adjThresh && hoSucc < adjThresh) status = "retired";
    else status = "retired";
    patterns.push({
      name,
      occurrences: total,
      train_occurrences: trN,
      holdout_occurrences: hoN,
      train_success: Math.round(trSucc * 1e3) / 1e3,
      holdout_success: Math.round(hoSucc * 1e3) / 1e3,
      avg_forward_return_pct: Math.round(avgRet * 100) / 100,
      status,
      warnings: manWarn
    });
  }
  const methodologyNote = `Tested ${N_PATTERNS} candidate patterns over ${n} bars. Train = first 70% (${split} bars), holdout = last 30% (out-of-sample). Forward window = ${fwd} bars. Requires >=${minOcc} occurrences and success >= ${Math.round(adjThresh * 1e3) / 1e3} on BOTH windows (base threshold ${baseThresh} raised by a Bonferroni multiple-testing bump of ${Math.round(BONFERRONI_BUMP * 1e4) / 1e4} for ${N_PATTERNS} tests). Patterns that pass in-sample but fail the holdout are auto-retired. Manipulation footprints (volume > ${VOL_SPIKE_MULT}x avg or move >= ${CIRCUIT_MOVE_PCT}%) are flagged, not dropped.`;
  return {
    skill: "pattern-miner",
    ticker: data.ticker,
    as_of: data.as_of,
    patterns,
    validated_count: validated,
    methodology_note: methodologyNote,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/pattern-miner.ts
runCli(mine, parseCliArgs(process.argv));
//# sourceMappingURL=pattern-miner.js.map