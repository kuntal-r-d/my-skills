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

// src/momentum-screen/screen.ts
import * as ind from "@stock-buddy/core";
var DISCLAIMER = "Educational analysis only. Not financial advice.";
var CATEGORY_WEIGHTS = {
  trend: 0.25,
  momentum_power: 0.25,
  volume: 0.2,
  relative_performance: 0.15,
  risk: 0.15
};
var CATEGORY_CRITERIA = {
  trend: [1, 2, 3, 4, 5, 6, 7, 8],
  momentum_power: [9, 10, 11, 12, 13, 14],
  volume: [15, 16, 17, 18],
  relative_performance: [19, 20, 21, 22],
  risk: [23, 24, 25]
};
function slopeRising(series, lookback = 21) {
  const vals = series.filter((x) => x != null);
  if (vals.length < 2) return null;
  const a = vals[vals.length - Math.min(lookback, vals.length)];
  const b = vals[vals.length - 1];
  return b > a;
}
function grade(score) {
  if (score >= 0.9) return "A+";
  if (score >= 0.8) return "A";
  if (score >= 0.7) return "B+";
  if (score >= 0.6) return "B";
  if (score >= 0.5) return "C";
  if (score >= 0.4) return "D";
  return "F";
}
function screen(data) {
  const ohlcv = data.ohlcv ?? [];
  if (ohlcv.length < 30) {
    return { skill: "momentum-screen", error: "need >=30 OHLCV bars", bars_supplied: ohlcv.length };
  }
  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1];
  const flags = [];
  const fundamentals = data.fundamentals ?? {};
  const mkt = data.market_index ?? [];
  if (c.length < 200) flags.push("limited_history_<200_bars");
  const s50 = ind.sma(c, 50);
  const s150 = ind.sma(c, 150);
  const s200 = ind.sma(c, 200);
  const m50 = ind.lastValid(s50);
  const m150 = ind.lastValid(s150);
  const m200 = ind.lastValid(s200);
  const hi52 = c.length >= 1 ? Math.max(...c.slice(-252)) : px;
  const lo52 = c.length >= 1 ? Math.min(...c.slice(-252)) : px;
  const rsiV = ind.lastValid(ind.rsi(c, 14));
  const mac = ind.macd(c);
  const macdLine = ind.lastValid(mac.macd);
  const macdSig = ind.lastValid(mac.signal);
  const rocSeries = ind.roc(c, 12);
  const rocV = ind.lastValid(rocSeries);
  const adxV = ind.lastValid(ind.adx(h, l, c, 14).adx);
  const mfiV = ind.lastValid(ind.mfi(h, l, c, v, 14));
  const boll = ind.bollinger(c, 20);
  const pctb = ind.lastValid(boll.pct_b);
  const obvSeries = ind.obv(c, v);
  const adSeries = ind.accumDist(h, l, c, v);
  const avg20Vol = ind.lastValid(ind.sma(v, 20)) ?? (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const vrocV = ind.lastValid(ind.vroc(v, 14));
  const relVol = avg20Vol ? v[v.length - 1] / avg20Vol : 1;
  const atrV = ind.lastValid(ind.atr(h, l, c, 14)) ?? 0;
  const support = c.length >= 1 ? Math.min(...c.slice(-60)) : px;
  const resistance = c.length >= 1 ? Math.max(...c.slice(-60)) : px;
  let mktRoc = null;
  if (mkt.length >= 13) {
    const mc = mkt.map((b) => Number(b.close));
    const prev = mc[mc.length - 13];
    if (prev) mktRoc = (mc[mc.length - 1] - prev) / prev * 100;
  }
  const crit = [];
  function add(id, cat, label, passed2, expl) {
    crit.push({ id, category: cat, label, passed: passed2, explanation: expl });
  }
  add(
    1,
    "trend",
    "Close > 50-day MA",
    m50 != null ? px > m50 : null,
    "Price trading above its 50-day average shows recent strength."
  );
  add(
    2,
    "trend",
    "Close > 150-day MA",
    m150 != null ? px > m150 : null,
    "Above the 150-day average confirms the medium-term uptrend."
  );
  add(
    3,
    "trend",
    "Close > 200-day MA",
    m200 != null ? px > m200 : null,
    "Above the 200-day average marks a long-term uptrend."
  );
  add(
    4,
    "trend",
    "50-day MA > 150-day MA",
    m50 != null && m150 != null ? m50 > m150 : null,
    "Short average over the medium one means momentum is improving."
  );
  add(
    5,
    "trend",
    "150-day MA > 200-day MA",
    m150 != null && m200 != null ? m150 > m200 : null,
    "Medium average over the long one confirms the stack is aligned up."
  );
  const rising200 = slopeRising(s200, 21);
  add(
    6,
    "trend",
    "200-day MA rising (~1 month)",
    rising200,
    "A rising long-term average means the trend is still building."
  );
  add(
    7,
    "trend",
    "Within 25% of 52-week high",
    px >= 0.75 * hi52,
    "Leaders trade near their highs, not deep in a hole."
  );
  add(
    8,
    "trend",
    ">= 30% above 52-week low",
    lo52 > 0 && px >= 1.3 * lo52,
    "A big rise off the lows shows real recovery, not a falling knife."
  );
  add(
    9,
    "momentum_power",
    "RSI between 40 and 70",
    rsiV != null ? rsiV >= 40 && rsiV <= 70 : null,
    "RSI 40-70 is the 'strong but not exhausted' momentum zone."
  );
  add(
    10,
    "momentum_power",
    "MACD above signal line",
    macdLine != null && macdSig != null ? macdLine > macdSig : null,
    "MACD over its signal line is a classic bullish trigger."
  );
  const rocRising = slopeRising(rocSeries, 5);
  add(
    11,
    "momentum_power",
    "ROC positive and rising",
    rocV != null ? rocV > 0 && Boolean(rocRising) : null,
    "Positive and accelerating rate-of-change means momentum is speeding up."
  );
  add(
    12,
    "momentum_power",
    "ADX > 25",
    adxV != null ? adxV > 25 : null,
    "ADX above 25 confirms a genuine trend rather than chop."
  );
  add(
    13,
    "momentum_power",
    "MFI between 20 and 80",
    mfiV != null ? mfiV >= 20 && mfiV <= 80 : null,
    "Money Flow Index 20-80 shows healthy buying without blow-off."
  );
  add(
    14,
    "momentum_power",
    "Bollinger %B favourable (0.5-1.0)",
    pctb != null ? pctb >= 0.5 && pctb <= 1 : null,
    "Price in the upper half of the bands (but not bursting out) signals strength."
  );
  const obvUp = slopeRising(obvSeries, 10);
  add(
    15,
    "volume",
    "OBV trending up",
    obvUp != null ? Boolean(obvUp) : null,
    "Rising On-Balance Volume means volume backs the advance."
  );
  add(
    16,
    "volume",
    "Volume > 20-day average",
    avg20Vol > 0 ? v[v.length - 1] > avg20Vol : null,
    "Above-average volume shows real participation behind the move."
  );
  const adUp = slopeRising(adSeries, 10);
  add(
    17,
    "volume",
    "Accumulation/Distribution rising",
    adUp != null ? Boolean(adUp) : null,
    "A rising A/D line means buyers control the day's range."
  );
  add(
    18,
    "volume",
    "Volume ROC positive",
    vrocV != null ? vrocV > 0 : null,
    "Growing volume vs a month ago signals fresh interest."
  );
  const epsHist = fundamentals.eps_history ?? [];
  let earnAccel = null;
  if (epsHist.length >= 3 && epsHist[epsHist.length - 2] && epsHist[epsHist.length - 3]) {
    const latestG = (epsHist[epsHist.length - 1] - epsHist[epsHist.length - 2]) / Math.abs(epsHist[epsHist.length - 2]);
    const priorG = (epsHist[epsHist.length - 2] - epsHist[epsHist.length - 3]) / Math.abs(epsHist[epsHist.length - 3]);
    earnAccel = latestG > priorG;
  }
  add(
    19,
    "relative_performance",
    "Earnings acceleration",
    earnAccel,
    "Each year's earnings growth beating the last is the Driehaus signature."
  );
  const surprise = fundamentals.earnings_surprise;
  let surprisePass;
  if (surprise == null) {
    surprisePass = null;
    flags.push("missing:earnings_surprise");
  } else {
    surprisePass = Number(surprise) > 0;
  }
  add(
    20,
    "relative_performance",
    "Positive recent earnings surprise",
    surprisePass,
    "Beating analyst estimates often sparks the next leg up."
  );
  add(
    21,
    "relative_performance",
    "Institutional accumulation (rel. volume > 1.2)",
    relVol > 1.2,
    "Volume well above normal hints big institutions are buying."
  );
  let relStrength = null;
  if (rocV != null && mktRoc != null) relStrength = rocV > mktRoc;
  else if (rocV != null && mktRoc == null) flags.push("missing:market_index");
  add(
    22,
    "relative_performance",
    "Relative strength vs market positive",
    relStrength,
    "Outperforming the index means money is rotating into this name."
  );
  const atrRatio = px ? atrV / px : null;
  add(
    23,
    "risk",
    "ATR within acceptable range (ATR/price < 6%)",
    atrRatio != null ? atrRatio < 0.06 : null,
    "Lower volatility means tighter, safer stops."
  );
  const distSupport = px ? (px - support) / px * 100 : null;
  add(
    24,
    "risk",
    "Distance from support < 8%",
    distSupport != null ? distSupport < 8 : null,
    "Close to support gives a low-risk entry with a nearby stop."
  );
  const distResist = px ? (resistance - px) / px * 100 : null;
  add(
    25,
    "risk",
    "No major resistance within 10%",
    distResist != null ? distResist >= 10 : null,
    "Clear overhead room lets the stock run without hitting a ceiling."
  );
  const counted = crit.filter((x) => x.passed != null);
  const passed = counted.filter((x) => x.passed);
  const overallCount = `${passed.length}/25`;
  const keyMetrics = {};
  let score = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const ids = new Set(CATEGORY_CRITERIA[cat]);
    const catItems = crit.filter((x) => ids.has(x.id) && x.passed != null);
    const met = catItems.filter((x) => x.passed).length;
    const total = catItems.length;
    const frac = total ? met / total : 0;
    score += weight * frac;
    keyMetrics[cat] = { criteria_met: met, total, fraction: Math.round(frac * 1e3) / 1e3 };
  }
  score = Math.round(score * 1e3) / 1e3;
  const g = grade(score);
  const reasoning = crit.map((x) => {
    const mark = x.passed ? "\u2713" : x.passed == null ? "?" : "\u2717";
    const suffix = x.passed != null ? "" : " (data unavailable \u2014 not counted)";
    return `${mark} ${x.label} \u2014 ${x.explanation}${suffix}`;
  });
  const evaluable = counted.length / 25;
  const confidence = Math.round(
    Math.max(0.1, Math.min(0.95, 0.5 + 0.45 * evaluable - (flags.includes("limited_history_<200_bars") ? 0.1 : 0))) * 100
  ) / 100;
  return {
    skill: "momentum-screen",
    ticker: data.ticker,
    mode: data.mode ?? "momentum",
    as_of: data.as_of,
    score,
    confidence,
    rating: g,
    key_metrics: {
      overall_count: overallCount,
      criteria_passed: passed.length,
      criteria_evaluated: counted.length,
      categories: keyMetrics
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER
  };
}

// src/cli/momentum-screen.ts
runCli(screen, parseCliArgs(process.argv));
//# sourceMappingURL=momentum-screen.js.map