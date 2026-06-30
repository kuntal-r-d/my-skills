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

// src/risk-manager/analyze.ts
import * as ind from "@stock-buddy/core";

// src/risk-manager/risk-core.ts
var KELLY_CAP = 0.25;
var PER_POSITION_CAP = 0.05;
var VOL_SCALE_THRESHOLD = 0.06;
var VOL_SCALE_FACTOR = 0.5;
var LIQUIDITY_FLOOR_BDT = 1e7;
var SECTOR_CAP = 0.3;
var HEAT_CAP = 0.06;
var PROXY_POSITION_RISK = 0.01;
function num(x, defaultVal = 0) {
  try {
    const n = Number(x);
    return Number.isNaN(n) ? defaultVal : n;
  } catch {
    return defaultVal;
  }
}
function roundBdt(x) {
  if (x == null) return null;
  return Math.round(x * 100) / 100;
}
function computeSizing(levels, capital, riskPct, atrV, reasoning, flags) {
  const { entry, stop_loss: stop } = levels;
  const riskPerShare = entry - stop;
  const riskAmount = capital * riskPct / 100;
  const rawShares = riskPerShare > 0 ? riskAmount / riskPerShare : 0;
  const kellyValue = KELLY_CAP * capital;
  const posCapValue = PER_POSITION_CAP * capital;
  const capValue = Math.min(kellyValue, posCapValue);
  const capShares = entry > 0 ? capValue / entry : 0;
  let shares = rawShares;
  if (shares > capShares) {
    shares = capShares;
    reasoning.push(
      `Size capped by min(Kelly 25%=${roundBdt(kellyValue)}, 5% per-position=${roundBdt(posCapValue)} BDT) -> ${roundBdt(capValue)} BDT ceiling.`
    );
  }
  const atrRatio = atrV / entry;
  if (atrRatio > VOL_SCALE_THRESHOLD) {
    shares *= VOL_SCALE_FACTOR;
    flags.push("high_volatility_size_halved");
    reasoning.push(`ATR/price ${Math.round(atrRatio * 1e3) / 10}% > 6% \u2014 position halved (volatility scaling).`);
  }
  shares = Math.floor(shares);
  const positionValue = shares * entry;
  const pctOfCapital = capital ? positionValue / capital * 100 : 0;
  const actualRiskAmount = shares * riskPerShare;
  const actualRiskPctOfCapital = capital ? actualRiskAmount / capital * 100 : 0;
  if (shares <= 0) {
    flags.push("size_rounds_to_zero");
    reasoning.push("Computed size rounds to 0 shares at this risk budget.");
  }
  return {
    ...levels,
    suggested_shares: shares,
    position_value_bdt: roundBdt(positionValue) ?? 0,
    pct_of_capital: Math.round(pctOfCapital * 100) / 100,
    risk_amount_bdt: roundBdt(actualRiskAmount) ?? 0,
    risk_pct_of_capital: Math.round(actualRiskPctOfCapital * 100) / 100
  };
}
function evaluateGates(input) {
  const {
    mode,
    ms,
    portfolio,
    sector,
    positionValue,
    capital,
    actualRiskAmount,
    capped,
    riskReward,
    flags,
    reasoning
  } = input;
  const gates = {};
  let rating = "approved";
  const adv = num(ms.avg_daily_value_bdt, 0);
  if (adv > LIQUIDITY_FLOOR_BDT) {
    gates.liquidity = { pass: true, detail: `Avg daily value ${roundBdt(adv)} BDT > 1 crore floor.` };
  } else {
    gates.liquidity = {
      pass: false,
      detail: `Avg daily value ${roundBdt(adv)} BDT <= 1 crore floor \u2014 too illiquid; trade rejected.`
    };
    rating = "rejected";
    reasoning.push("Liquidity gate FAILED \u2014 illiquid name, slippage/exit risk too high.");
  }
  const totalValue = num(portfolio.total_value_bdt, 0);
  if (portfolio && totalValue > 0) {
    const positions = portfolio.positions ?? [];
    const existingSector = positions.filter((p) => sector && p.sector === sector).reduce((sum, p) => sum + num(p.value_bdt), 0);
    const sectorPct = (existingSector + positionValue) / totalValue * 100;
    if (sectorPct <= SECTOR_CAP * 100) {
      gates.sector = {
        pass: true,
        detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% <= 30%.`
      };
    } else {
      gates.sector = {
        pass: false,
        detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% > 30% \u2014 concentration limit.`
      };
      if (rating !== "rejected") rating = "reduced";
      flags.push("sector_concentration_breach");
      reasoning.push("Sector gate FAILED \u2014 over-concentrated; reduce or skip.");
    }
  } else {
    gates.sector = { pass: true, detail: "No portfolio supplied \u2014 sector gate skipped." };
  }
  if (portfolio) {
    const positions = portfolio.positions ?? [];
    const nPositions = positions.length;
    const existingHeat = nPositions * PROXY_POSITION_RISK;
    const thisHeat = capital ? actualRiskAmount / capital : 0;
    const totalHeat = existingHeat + thisHeat;
    if (totalHeat <= HEAT_CAP) {
      gates.heat = {
        pass: true,
        detail: `Portfolio heat ${Math.round(totalHeat * 1e3) / 10}% <= 6% (${nPositions} existing @1% proxy + this trade).`
      };
    } else {
      gates.heat = {
        pass: false,
        detail: `Portfolio heat ${Math.round(totalHeat * 1e3) / 10}% > 6% \u2014 too much aggregate risk.`
      };
      if (rating !== "rejected") rating = "reduced";
      flags.push("portfolio_heat_breach");
      reasoning.push("Heat gate FAILED \u2014 aggregate open risk exceeds 6%.");
    }
  } else {
    gates.heat = { pass: true, detail: "No portfolio supplied \u2014 heat gate skipped." };
  }
  const circuitHit = ms.circuit_state === "limit_up" || ms.circuit_state === "limit_down" || Boolean(ms.floor_price) || Boolean(ms.halted);
  if (circuitHit) {
    const why = ms.circuit_state === "limit_up" || ms.circuit_state === "limit_down" ? `circuit_state=${ms.circuit_state}` : ms.floor_price ? "floor_price set" : "trading halted";
    gates.circuit = { pass: false, detail: `${why} \u2014 price discovery interrupted.` };
    if (mode === "momentum") {
      rating = "suppressed";
      reasoning.push(
        `Circuit gate: ${why}. Momentum recommendation SUPPRESSED \u2014 no reliable price discovery, do not enter until normal trading resumes.`
      );
    } else {
      flags.push("microstructure_circuit_or_floor");
      reasoning.push(
        `Circuit gate: ${why}. Investment levels stand but defer execution until normal trading resumes.`
      );
    }
  } else {
    gates.circuit = { pass: true, detail: "Normal trading \u2014 no circuit/floor/halt." };
  }
  if (capped && rating === "approved") rating = "reduced";
  let score = 0.5 + Math.min(0.3, Math.max(0, (riskReward - 1) * 0.2));
  score -= 0.05 * Object.values(gates).filter((g) => !g.pass).length;
  if (flags.includes("high_volatility_size_halved")) score -= 0.1;
  score = Math.round(Math.max(0.1, Math.min(0.95, score)) * 100) / 100;
  return { rating, gates, score };
}

// src/risk-manager/atr-strategy.ts
var ATR_PERIOD = 14;
var BUY_ZONE_ATR = 0.25;
var STOP_ATR = 2;
var TARGET_ATR = 3;
function computeAtrLevels(entry, atrV) {
  const buyLow = entry - BUY_ZONE_ATR * atrV;
  const buyHigh = entry;
  const stop = entry - STOP_ATR * atrV;
  const target = entry + TARGET_ATR * atrV;
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const riskReward = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const tradeRiskPct = entry > 0 ? riskPerShare / entry * 100 : 0;
  return {
    entry,
    buy_zone_low: roundBdt(buyLow) ?? buyLow,
    buy_zone_high: roundBdt(buyHigh) ?? buyHigh,
    stop_loss: roundBdt(stop) ?? stop,
    target: roundBdt(target) ?? target,
    risk_reward: Math.round(riskReward * 100) / 100,
    trade_risk_pct: Math.round(tradeRiskPct * 100) / 100
  };
}
function atrReasoning(atrV, levels) {
  return [
    `ATR(${ATR_PERIOD})=${roundBdt(atrV)} BDT. Buy zone ${roundBdt(levels.buy_zone_low)}-${roundBdt(levels.buy_zone_high)} (entry - 0.25*ATR).`,
    `Stop ${roundBdt(levels.stop_loss)} (entry - 2*ATR), target ${roundBdt(levels.target)} (entry + 3*ATR) -> risk:reward 1:${levels.risk_reward}.`
  ];
}
function resolveAtrEntry(signalEntry, lastClose) {
  return signalEntry > 0 ? signalEntry : lastClose;
}
function minBarsForAtr() {
  return ATR_PERIOD + 1;
}

// src/risk-manager/structure-levels.ts
var SWING_WINDOW = 2;
var CLUSTER_PCT = 1.5;
function clusterLevels(levels) {
  const sorted = [...levels].filter((x) => x > 0).sort((a, b) => a - b);
  const out = [];
  for (const level of sorted) {
    const last = out[out.length - 1];
    if (last == null || Math.abs(level - last) / last > CLUSTER_PCT / 100) {
      out.push(level);
    }
  }
  return out;
}
function swingLows(lows, window = SWING_WINDOW) {
  const out = [];
  for (let i = window; i < lows.length - window; i++) {
    const v = lows[i];
    let isSwing = true;
    for (let j = 1; j <= window; j++) {
      if (v >= lows[i - j] || v >= lows[i + j]) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) out.push(v);
  }
  return out;
}
function swingHighs(highs, window = SWING_WINDOW) {
  const out = [];
  for (let i = window; i < highs.length - window; i++) {
    const v = highs[i];
    let isSwing = true;
    for (let j = 1; j <= window; j++) {
      if (v <= highs[i - j] || v <= highs[i + j]) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) out.push(v);
  }
  return out;
}
function buildStructureLadder(closes, lows, highs, lookback, price) {
  const n = closes.length;
  const start = Math.max(0, n - lookback);
  const cSlice = closes.slice(start);
  const lSlice = lows.slice(start);
  const hSlice = highs.slice(start);
  const rangeSupport = Math.min(...cSlice);
  const rangeResistance = Math.max(...cSlice);
  const supportPool = clusterLevels([rangeSupport, ...swingLows(lSlice)]);
  const resistancePool = clusterLevels([rangeResistance, ...swingHighs(hSlice)]);
  const supportsBelow = supportPool.filter((s) => s <= price * 1.002).sort((a, b) => b - a);
  const resistancesAbove = resistancePool.filter((r) => r >= price * 0.998).sort((a, b) => a - b);
  const support = supportsBelow[0] ?? rangeSupport;
  const resistance = resistancesAbove[0] ?? rangeResistance;
  const deeper = supportPool.filter((s) => s < support * (1 - CLUSTER_PCT / 100)).sort((a, b) => b - a);
  const higher = resistancePool.filter((r) => r > resistance * (1 + CLUSTER_PCT / 100)).sort((a, b) => a - b);
  const next_support = deeper[0] ?? supportsBelow[1] ?? null;
  const next_resistance = higher[0] ?? resistancesAbove[1] ?? null;
  return {
    support: roundBdt(support) ?? support,
    resistance: roundBdt(resistance) ?? resistance,
    next_support: next_support != null ? roundBdt(next_support) : null,
    next_resistance: next_resistance != null ? roundBdt(next_resistance) : null
  };
}

// src/risk-manager/structure-strategy.ts
var STRUCTURE_LOOKBACK = 60;
var SUPPORT_BUFFER_ATR = 0.5;
var MIN_RISK_REWARD = 1.5;
var NEAR_SUPPORT_PCT = 8;
var BUY_BAND_ABOVE_SUPPORT_PCT = 0.02;
function computeStructureLevels(closes, lows, highs, atrV, signalEntry) {
  const flags = [];
  const reasoning = [];
  const px = signalEntry;
  const lookback = closes.length >= STRUCTURE_LOOKBACK ? closes.slice(-STRUCTURE_LOOKBACK) : closes;
  const ladder = buildStructureLadder(closes, lows, highs, STRUCTURE_LOOKBACK, px);
  const support = ladder.support;
  const resistance = ladder.resistance;
  const distToSupportPct = px > 0 ? (px - support) / px * 100 : 0;
  let buyLow;
  let buyHigh;
  if (distToSupportPct <= NEAR_SUPPORT_PCT) {
    buyLow = support;
    buyHigh = px;
    reasoning.push(
      `Price ${roundBdt(px)} is within ${distToSupportPct.toFixed(1)}% of 60-bar support ${roundBdt(support)} \u2014 buy zone spans support to current price.`
    );
  } else {
    const bandTop = support + Math.max(atrV * 0.5, support * BUY_BAND_ABOVE_SUPPORT_PCT);
    buyLow = support;
    buyHigh = bandTop;
    reasoning.push(
      `Price ${roundBdt(px)} is ${distToSupportPct.toFixed(1)}% above 60-bar support ${roundBdt(support)} \u2014 wait for pullback; limit band ${roundBdt(buyLow)}-${roundBdt(buyHigh)}.`
    );
  }
  const entry = buyHigh;
  let stop = support - SUPPORT_BUFFER_ATR * atrV;
  if (stop >= entry) {
    stop = entry - 2 * atrV;
    flags.push("structure_stop_fallback");
    reasoning.push(
      `Support buffer would place stop above entry \u2014 fallback stop ${roundBdt(stop)} at entry - 2*ATR.`
    );
  } else {
    reasoning.push(
      `Stop ${roundBdt(stop)} below support ${roundBdt(support)} with ${SUPPORT_BUFFER_ATR}*ATR buffer (structure invalidation).`
    );
  }
  const riskPerShare = entry - stop;
  const minTarget = entry + MIN_RISK_REWARD * riskPerShare;
  let target = resistance;
  let targetSource = "resistance";
  if (resistance <= entry) {
    target = minTarget;
    targetSource = "min_risk_reward";
    flags.push("resistance_below_entry");
  } else if (resistance < minTarget) {
    target = minTarget;
    targetSource = "min_risk_reward";
    flags.push("target_above_resistance");
    reasoning.push(
      `Nearest resistance ${roundBdt(resistance)} yields R:R < ${MIN_RISK_REWARD}:1 \u2014 target raised to ${roundBdt(minTarget)} (min R:R).`
    );
  } else {
    reasoning.push(
      `Target ${roundBdt(target)} at 60-bar resistance ${roundBdt(resistance)} (meets min ${MIN_RISK_REWARD}:1 R:R).`
    );
  }
  const rewardPerShare = target - entry;
  const riskReward = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const tradeRiskPct = entry > 0 ? riskPerShare / entry * 100 : 0;
  if (targetSource === "resistance") {
    reasoning.push(`Structure sizing entry anchored at buy-zone high ${roundBdt(entry)}.`);
  }
  const levels = {
    entry: roundBdt(entry) ?? entry,
    buy_zone_low: roundBdt(buyLow) ?? buyLow,
    buy_zone_high: roundBdt(buyHigh) ?? buyHigh,
    stop_loss: roundBdt(stop) ?? stop,
    target: roundBdt(target) ?? target,
    risk_reward: Math.round(riskReward * 100) / 100,
    trade_risk_pct: Math.round(tradeRiskPct * 100) / 100,
    support: roundBdt(support) ?? support,
    resistance: roundBdt(resistance) ?? resistance,
    next_support: ladder.next_support,
    next_resistance: ladder.next_resistance
  };
  if (ladder.next_support != null) {
    reasoning.push(
      `Next support (deeper) ${roundBdt(ladder.next_support)} BDT below primary ${roundBdt(support)}.`
    );
  }
  if (ladder.next_resistance != null) {
    reasoning.push(
      `Next resistance (higher) ${roundBdt(ladder.next_resistance)} BDT above primary ${roundBdt(resistance)}.`
    );
  }
  return { levels, reasoning, flags };
}
function minBarsForStructure() {
  return Math.max(STRUCTURE_LOOKBACK, 15);
}

// src/risk-manager/analyze.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var SKILL = "risk-manager";
function buildStrategyResult(input) {
  const { strategy, levels, atrV, capital, riskPct, mode, ms, portfolio, sector, reasoning, flags } = input;
  const riskPerShare = levels.entry - levels.stop_loss;
  const riskAmount = capital * riskPct / 100;
  const rawShares = riskPerShare > 0 ? riskAmount / riskPerShare : 0;
  const capValue = Math.min(0.25 * capital, 0.05 * capital);
  const capShares = levels.entry > 0 ? capValue / levels.entry : 0;
  const capped = rawShares > capShares;
  const sized = computeSizing(levels, capital, riskPct, atrV, reasoning, flags);
  const { rating, gates, score } = evaluateGates({
    mode,
    ms,
    portfolio,
    sector,
    positionValue: sized.position_value_bdt,
    capital,
    actualRiskAmount: sized.risk_amount_bdt,
    capped,
    riskReward: sized.risk_reward,
    flags,
    reasoning
  });
  const keyMetrics = {
    atr: roundBdt(atrV),
    entry: roundBdt(levels.entry),
    buy_zone_low: roundBdt(levels.buy_zone_low),
    buy_zone_high: roundBdt(levels.buy_zone_high),
    stop_loss: roundBdt(levels.stop_loss),
    target: roundBdt(levels.target),
    risk_reward: sized.risk_reward,
    suggested_shares: sized.suggested_shares,
    position_value_bdt: roundBdt(sized.position_value_bdt),
    pct_of_capital: sized.pct_of_capital,
    trade_risk_pct: sized.trade_risk_pct,
    risk_amount_bdt: roundBdt(sized.risk_amount_bdt),
    risk_pct_of_capital: sized.risk_pct_of_capital
  };
  if (levels.support != null) keyMetrics.support = levels.support;
  if (levels.resistance != null) keyMetrics.resistance = levels.resistance;
  if (levels.next_support != null) keyMetrics.next_support = levels.next_support;
  if (levels.next_resistance != null) keyMetrics.next_resistance = levels.next_resistance;
  return {
    strategy,
    score,
    confidence: score,
    rating,
    key_metrics: keyMetrics,
    gates,
    reasoning,
    flags
  };
}
function analyze(data) {
  const ohlcv = data.ohlcv ?? [];
  const minBars = Math.max(minBarsForAtr(), minBarsForStructure());
  if (ohlcv.length < minBars) {
    return {
      skill: SKILL,
      error: `need >=${minBars} OHLCV bars for ATR(${ATR_PERIOD}) and structure levels`,
      bars_supplied: ohlcv.length
    };
  }
  const account = data.account ?? {};
  const capital = num(account.capital_bdt);
  if (capital <= 0) return { skill: SKILL, error: "account.capital_bdt must be > 0" };
  let riskPct = num(account.risk_per_trade_pct, 1);
  if (riskPct <= 0) riskPct = 1;
  const [, h, l, c] = ind.splitOhlcv(ohlcv);
  const atrV = ind.lastValid(ind.atr(h, l, c, ATR_PERIOD));
  if (!atrV || atrV <= 0) return { skill: SKILL, error: "could not compute a positive ATR" };
  const signal = data.signal ?? {};
  const mode = signal.mode ?? data.mode ?? "momentum";
  const signalEntry = num(signal.entry);
  const lastClose = c[c.length - 1];
  const atrEntry = resolveAtrEntry(signalEntry, lastClose);
  const structureEntry = signalEntry > 0 ? signalEntry : lastClose;
  if (atrEntry <= 0 || structureEntry <= 0) {
    return { skill: SKILL, error: "entry price must be > 0" };
  }
  const ms = data.microstructure ?? {};
  const portfolio = data.portfolio ?? {};
  const sector = (data.fundamentals ?? {}).sector;
  const atrLevels = computeAtrLevels(atrEntry, atrV);
  const atrResult = buildStrategyResult({
    strategy: "atr",
    levels: atrLevels,
    atrV,
    capital,
    riskPct,
    mode,
    ms,
    portfolio,
    sector,
    reasoning: atrReasoning(atrV, atrLevels),
    flags: []
  });
  const structureSeed = computeStructureLevels(c, l, h, atrV, structureEntry);
  const structureResult = buildStrategyResult({
    strategy: "structure",
    levels: structureSeed.levels,
    atrV,
    capital,
    riskPct,
    mode,
    ms,
    portfolio,
    sector,
    reasoning: structureSeed.reasoning,
    flags: structureSeed.flags
  });
  const primary = atrResult;
  return {
    skill: SKILL,
    ticker: data.ticker,
    mode,
    as_of: data.as_of,
    active_strategy: "atr",
    strategy: "atr",
    score: primary.score,
    confidence: primary.confidence,
    rating: primary.rating,
    key_metrics: primary.key_metrics,
    gates: primary.gates,
    reasoning: primary.reasoning,
    flags: primary.flags,
    strategies: {
      atr: atrResult,
      structure: structureResult
    },
    disclaimer: DISCLAIMER
  };
}

// src/cli/risk-manager.ts
runCli(analyze, parseCliArgs(process.argv));
//# sourceMappingURL=risk-manager.js.map