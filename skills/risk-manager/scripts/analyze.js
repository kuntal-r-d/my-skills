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
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var SKILL = "risk-manager";
var ATR_PERIOD = 14;
var BUY_ZONE_ATR = 0.25;
var STOP_ATR = 2;
var TARGET_ATR = 3;
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
function analyze(data) {
  const ohlcv = data.ohlcv ?? [];
  if (ohlcv.length < ATR_PERIOD + 1) {
    return {
      skill: SKILL,
      error: `need >=${ATR_PERIOD + 1} OHLCV bars for ATR(${ATR_PERIOD})`,
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
  const entry = num(signal.entry) || c[c.length - 1];
  if (entry <= 0) return { skill: SKILL, error: "entry price must be > 0" };
  const flags = [];
  const reasoning = [];
  const buyLow = entry - BUY_ZONE_ATR * atrV;
  const buyHigh = entry;
  const stop = entry - STOP_ATR * atrV;
  const target = entry + TARGET_ATR * atrV;
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const riskReward = riskPerShare ? rewardPerShare / riskPerShare : 0;
  const tradeRiskPct = entry ? riskPerShare / entry * 100 : 0;
  reasoning.push(
    `ATR(${ATR_PERIOD})=${roundBdt(atrV)} BDT. Buy zone ${roundBdt(buyLow)}-${roundBdt(buyHigh)} (entry - 0.25*ATR).`
  );
  reasoning.push(
    `Stop ${roundBdt(stop)} (entry - 2*ATR), target ${roundBdt(target)} (entry + 3*ATR) -> risk:reward 1:${Math.round(riskReward * 100) / 100}.`
  );
  const riskAmount = capital * riskPct / 100;
  const rawShares = riskPerShare ? riskAmount / riskPerShare : 0;
  const kellyValue = KELLY_CAP * capital;
  const posCapValue = PER_POSITION_CAP * capital;
  const capValue = Math.min(kellyValue, posCapValue);
  const capShares = entry ? capValue / entry : 0;
  let capped = false;
  let shares = rawShares;
  if (shares > capShares) {
    shares = capShares;
    capped = true;
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
  const gates = {};
  let rating = "approved";
  const ms = data.microstructure ?? {};
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
  const portfolio = data.portfolio ?? {};
  const totalValue = num(portfolio.total_value_bdt, 0);
  const sector = (data.fundamentals ?? {}).sector;
  if (portfolio && totalValue > 0) {
    const positions = portfolio.positions ?? [];
    const existingSector = positions.filter((p) => sector && p.sector === sector).reduce((sum, p) => sum + num(p.value_bdt), 0);
    const sectorPct = (existingSector + positionValue) / totalValue * 100;
    if (sectorPct <= SECTOR_CAP * 100) {
      gates.sector = { pass: true, detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% <= 30%.` };
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
  return {
    skill: SKILL,
    ticker: data.ticker,
    mode,
    as_of: data.as_of,
    score,
    confidence: score,
    rating,
    key_metrics: {
      atr: roundBdt(atrV),
      entry: roundBdt(entry),
      buy_zone_low: roundBdt(buyLow),
      buy_zone_high: roundBdt(buyHigh),
      stop_loss: roundBdt(stop),
      target: roundBdt(target),
      risk_reward: Math.round(riskReward * 100) / 100,
      suggested_shares: shares,
      position_value_bdt: roundBdt(positionValue),
      pct_of_capital: Math.round(pctOfCapital * 100) / 100,
      trade_risk_pct: Math.round(tradeRiskPct * 100) / 100,
      risk_amount_bdt: roundBdt(actualRiskAmount),
      risk_pct_of_capital: Math.round(actualRiskPctOfCapital * 100) / 100
    },
    gates,
    reasoning,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/risk-manager.ts
runCli(analyze, parseCliArgs(process.argv));
//# sourceMappingURL=risk-manager.js.map