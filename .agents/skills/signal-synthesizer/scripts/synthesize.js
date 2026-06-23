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

// src/signal-synthesizer/synthesize.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var SKILL = "signal-synthesizer";
var AGENT_KEYS = ["technical", "fundamental", "smart_money", "sentiment", "macro", "volume_flow"];
var INVESTMENT_WEIGHTS = {
  fundamental: 0.4,
  smart_money: 0.2,
  macro: 0.15,
  sentiment: 0.15,
  technical: 0.1
};
var MOMENTUM_WEIGHTS = {
  technical: 0.45,
  volume_flow: 0.2,
  smart_money: 0.15,
  sentiment: 0.12,
  fundamental: 0.08
};
var HIGH_CONVICTION = 0.5;
var AGREE_SCORE = 0.3;
var STRONG_AGENT = 0.5;
var FUNDAMENTAL_VETO = -0.5;
function clamp(x, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
function num(x, defaultVal = 0) {
  try {
    const n = Number(x);
    return Number.isNaN(n) ? defaultVal : n;
  } catch {
    return defaultVal;
  }
}
function normalizeAgents(raw) {
  const out = {};
  for (const k of AGENT_KEYS) {
    const a = raw[k];
    if (!a || typeof a !== "object") continue;
    const agent = a;
    out[k] = {
      score: clamp(num(agent.score)),
      confidence: clamp(num(agent.confidence, 0.5), 0, 1)
    };
  }
  return out;
}
function composite1_10(weighted2) {
  return Math.round(clamp(5.5 + 4.5 * weighted2, 1, 10));
}
function weighted(agents, weights) {
  const present = Object.fromEntries(Object.entries(weights).filter(([k]) => k in agents));
  const totalW = Object.values(present).reduce((a, b) => a + b, 0) || 1;
  const contributions = {};
  let wScore = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (!(k in agents)) {
      contributions[k] = 0;
      continue;
    }
    const nw = w / totalW;
    const c = Math.round(nw * agents[k].score * 1e4) / 1e4;
    contributions[k] = c;
    wScore += nw * agents[k].score;
  }
  return [clamp(wScore), contributions];
}
function agentConfidence(agents, weights) {
  const present = Object.fromEntries(Object.entries(weights).filter(([k]) => k in agents));
  const totalW = Object.values(present).reduce((a, b) => a + b, 0) || 1;
  const conf = Object.entries(present).reduce(
    (sum, [k, w]) => sum + w / totalW * agents[k].confidence,
    0
  );
  return Math.round(clamp(conf, 0, 1) * 100) / 100;
}
function agreers(agents, sign) {
  return Object.entries(agents).filter(([, a]) => a.score * sign > 0 && Math.abs(a.score) >= AGREE_SCORE).map(([k]) => k);
}
function strongConflict(agents) {
  const bulls = Object.entries(agents).filter(([, a]) => a.score >= STRONG_AGENT).map(([k]) => k);
  const bears = Object.entries(agents).filter(([, a]) => a.score <= -STRONG_AGENT).map(([k]) => k);
  return [bulls, bears];
}
function ratingFromScore(w) {
  if (w >= 0.5) return "strong_buy";
  if (w >= 0.15) return "buy";
  if (w <= -0.5) return "sell";
  if (w <= -0.15) return "sell";
  return "hold";
}
function downgrade(rating) {
  if (rating === "strong_buy") return "buy";
  if (rating === "sell") return "hold";
  return rating;
}
function buildSignal(agents, weights, reasoningSeed) {
  const [wScore, contributions] = weighted(agents, weights);
  let conf = agentConfidence(agents, weights);
  const reasoning = [...reasoningSeed];
  const [bulls, bears] = strongConflict(agents);
  let rating = ratingFromScore(wScore);
  const conflict = Boolean(bulls.length && bears.length);
  if (conflict) {
    rating = "stand_aside";
    reasoning.push(
      `Strong conflict: ${bulls.join(", ")} strongly bullish vs ${bears.join(", ")} strongly bearish \u2014 standing aside instead of averaging.`
    );
    conf = Math.round(Math.max(0.1, conf - 0.2) * 100) / 100;
  } else if (Math.abs(wScore) >= HIGH_CONVICTION) {
    const sign = wScore > 0 ? 1 : -1;
    const agree = agreers(agents, sign);
    if (agree.length >= 2) {
      reasoning.push(
        `High conviction confirmed by confluence: ${agree.join(", ")} agree (|score|>=0.3, same direction).`
      );
    } else {
      rating = downgrade(rating);
      reasoning.push(
        `High weighted score but only ${agree.length} agent(s) independently agree (need 2) \u2014 downgraded to a moderate rating.`
      );
      conf = Math.round(Math.max(0.1, conf - 0.1) * 100) / 100;
    }
  }
  return [wScore, contributions, conf, rating, reasoning, conflict];
}
function thesis(rating, contrib, _fund) {
  const top = Object.entries(contrib).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2);
  const drivers = top.filter(([, v]) => v).map(([k, v]) => `${k} (${v >= 0 ? "+" : ""}${v.toFixed(2)})`).join(", ");
  if (rating === "strong_buy" || rating === "buy") {
    return `Constructive long-term thesis driven by ${drivers || "mixed inputs"}; hold for fundamental compounding.`;
  }
  if (rating === "stand_aside") return "Inputs conflict materially \u2014 no clear long-term thesis; wait for resolution.";
  if (rating === "sell") return `Deteriorating fundamentals/flows (${drivers}); avoid or exit.`;
  return `Balanced inputs (${drivers || "neutral"}); no edge for a new investment.`;
}
function exitConditions(rating) {
  if (rating === "strong_buy" || rating === "buy") {
    return [
      "Thesis break: fundamentals deteriorate (earnings miss, margin collapse)",
      "Smart-money distribution (sponsor/institution selling for 2+ months)",
      "Valuation overshoots fair value materially"
    ];
  }
  return ["Re-enter only when conflict resolves or fundamentals improve"];
}
function entryTrigger(rating) {
  if (rating === "strong_buy" || rating === "buy") {
    return "Enter on confirmed breakout above the base on above-average volume.";
  }
  if (rating === "suppressed") {
    return "No entry \u2014 wait for circuit/floor/halt to clear and price discovery to resume.";
  }
  if (rating === "stand_aside") return "No entry \u2014 wait for the conflict/veto to resolve.";
  return "No momentum edge \u2014 stand aside.";
}
function synthesize(data) {
  const rawAgents = data.agents;
  if (!rawAgents || typeof rawAgents !== "object") {
    return { skill: SKILL, error: "missing 'agents' object" };
  }
  const agents = normalizeAgents(rawAgents);
  if (!("technical" in agents) && !("fundamental" in agents)) {
    return { skill: SKILL, error: "need at least 'technical' or 'fundamental' agent score" };
  }
  const flags = [];
  if (!("volume_flow" in agents) && "technical" in agents) {
    agents.volume_flow = {
      score: Math.round(0.8 * agents.technical.score * 1e4) / 1e4,
      confidence: Math.round(0.8 * agents.technical.confidence * 100) / 100
    };
    flags.push("volume_flow_derived_from_technical");
  }
  const ms = data.microstructure ?? {};
  const suppressed = ms.circuit_state === "limit_up" || ms.circuit_state === "limit_down" || Boolean(ms.floor_price) || Boolean(ms.halted);
  const [invW, invContrib, invConf, invRating, invReason] = buildSignal(
    agents,
    INVESTMENT_WEIGHTS,
    [
      "Investment lens weights fundamentals (.40), smart-money (.20), macro (.15), sentiment (.15), technical (.10)."
    ]
  );
  if (suppressed) {
    invReason.push(
      "Microstructure note: price discovery interrupted (circuit/floor/halt); investment thesis still valid but defer execution until normal trading."
    );
    if (!flags.includes("microstructure_circuit_or_floor")) flags.push("microstructure_circuit_or_floor");
  }
  const fund = agents.fundamental?.score;
  const fvNote = invW > 0 ? "Accumulate near support / fair-value zone; scale in on weakness." : "No discount to fair value \u2014 wait for a better entry or a thesis change.";
  const investment = {
    score: Math.round(invW * 1e3) / 1e3,
    composite_1_10: composite1_10(invW),
    rating: invRating,
    confidence: invConf,
    contributions: invContrib,
    fair_value_note: fvNote,
    thesis: thesis(invRating, invContrib, fund),
    exit_conditions: exitConditions(invRating),
    reasoning: invReason
  };
  const [momW, momContrib, momConf, momRating, momReason] = buildSignal(
    agents,
    MOMENTUM_WEIGHTS,
    [
      "Momentum lens weights technical (.45), volume-flow (.20), smart-money (.15), sentiment (.12), fundamental (.08 veto-only)."
    ]
  );
  let finalMomRating = momRating;
  if (fund != null && fund < FUNDAMENTAL_VETO && finalMomRating !== "stand_aside") {
    finalMomRating = "stand_aside";
    momReason.push(
      `Fundamental veto: fundamental score ${fund.toFixed(2)} < ${FUNDAMENTAL_VETO} \u2014 business is broken; momentum trade capped at stand_aside.`
    );
  }
  if (suppressed) {
    const state = ms.circuit_state;
    const why = state === "limit_up" || state === "limit_down" ? `circuit_state=${state}` : ms.floor_price ? "floor_price set" : "trading halted";
    finalMomRating = "suppressed";
    momReason.push(
      `Momentum suppressed: ${why}. Price discovery is interrupted, so technical signals are unreliable \u2014 no momentum entry until normal trading resumes.`
    );
    if (!flags.includes("microstructure_circuit_or_floor")) flags.push("microstructure_circuit_or_floor");
  }
  const momentum = {
    score: Math.round(momW * 1e3) / 1e3,
    composite_1_10: composite1_10(momW),
    rating: finalMomRating,
    confidence: momConf,
    contributions: momContrib,
    entry_trigger: entryTrigger(finalMomRating),
    stop_note: "Place stop below the breakout base / recent swing low (see risk-manager for ATR-based levels).",
    reasoning: momReason
  };
  return {
    skill: SKILL,
    ticker: data.ticker,
    as_of: data.as_of,
    investment,
    momentum,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/signal-synthesizer.ts
runCli(synthesize, parseCliArgs(process.argv));
//# sourceMappingURL=signal-synthesizer.js.map