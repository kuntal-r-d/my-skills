#!/usr/bin/env python3
"""momentum-screen: run the 25-point momentum checklist on one DSE ticker.

Implements the Minervini SEPA trend template, classic momentum indicators,
volume confirmation, Driehaus growth/relative-strength checks and risk filters
(PRD-001 REQ-026, REQ-027, REQ-032, REQ-038). Each criterion is scored
pass/fail with a beginner-friendly explanation; an overall count (e.g. 18/25)
and a category-weighted momentum score (REQ-032) are mapped to a Momentum Grade
(A+..F).

Reads the shared JSON input contract:
  ohlcv          required, >=30 bars (>=200 for full MA stack)
  fundamentals   optional (eps_history for earnings acceleration)
  market_index   optional (relative strength vs the index)

Usage:
  python3 screen.py --input data.json [--pretty]
  cat data.json | python3 screen.py
"""
from __future__ import annotations

import argparse
import json
import sys

import indicators as ind

DISCLAIMER = "Educational analysis only. Not financial advice."

# Category weights (REQ-032). Each category contributes the fraction of its
# criteria that pass, multiplied by its weight, summed to a 0..1 score.
CATEGORY_WEIGHTS = {
    "trend": 0.25,            # criteria 1-8  (Minervini SEPA)
    "momentum_power": 0.25,   # criteria 9-14 (momentum indicators)
    "volume": 0.20,           # criteria 15-18
    "relative_performance": 0.15,  # criteria 19-22 (Driehaus)
    "risk": 0.15,             # criteria 23-25
}

# Which criterion indices belong to each weighted category.
CATEGORY_CRITERIA = {
    "trend": [1, 2, 3, 4, 5, 6, 7, 8],
    "momentum_power": [9, 10, 11, 12, 13, 14],
    "volume": [15, 16, 17, 18],
    "relative_performance": [19, 20, 21, 22],
    "risk": [23, 24, 25],
}


def _slope_rising(series, lookback=21):
    """True if a series rose over roughly the last `lookback` bars."""
    vals = [x for x in series if x is not None]
    if len(vals) < 2:
        return None
    a = vals[-min(lookback, len(vals))]
    b = vals[-1]
    return b > a


def grade(score):
    if score >= 0.9:
        return "A+"
    if score >= 0.8:
        return "A"
    if score >= 0.7:
        return "B+"
    if score >= 0.6:
        return "B"
    if score >= 0.5:
        return "C"
    if score >= 0.4:
        return "D"
    return "F"


def screen(data: dict) -> dict:
    ohlcv = data.get("ohlcv") or []
    if len(ohlcv) < 30:
        return {"skill": "momentum-screen", "error": "need >=30 OHLCV bars",
                "bars_supplied": len(ohlcv)}

    o, h, l, c, v = ind.split_ohlcv(ohlcv)
    px = c[-1]
    flags = []
    fundamentals = data.get("fundamentals") or {}
    mkt = data.get("market_index") or []

    if len(c) < 200:
        flags.append("limited_history_<200_bars")

    # --- indicator series ----------------------------------------------------
    s50 = ind.sma(c, 50)
    s150 = ind.sma(c, 150)
    s200 = ind.sma(c, 200)
    m50, m150, m200 = ind.last_valid(s50), ind.last_valid(s150), ind.last_valid(s200)

    hi_52 = max(c[-252:]) if len(c) >= 1 else px
    lo_52 = min(c[-252:]) if len(c) >= 1 else px

    rsi_v = ind.last_valid(ind.rsi(c, 14))
    mac = ind.macd(c)
    macd_line = ind.last_valid(mac["macd"])
    macd_sig = ind.last_valid(mac["signal"])
    roc_series = ind.roc(c, 12)
    roc_v = ind.last_valid(roc_series)
    adx_v = ind.last_valid(ind.adx(h, l, c, 14)["adx"])
    mfi_v = ind.last_valid(ind.mfi(h, l, c, v, 14))
    boll = ind.bollinger(c, 20)
    pctb = ind.last_valid(boll["pct_b"])

    obv_series = ind.obv(c, v)
    ad_series = ind.accum_dist(h, l, c, v)
    avg20_vol = ind.last_valid(ind.sma(v, 20)) or (sum(v) / len(v) if v else 0.0)
    vroc_v = ind.last_valid(ind.vroc(v, 14))
    rel_vol = (v[-1] / avg20_vol) if avg20_vol else 1.0

    atr_v = ind.last_valid(ind.atr(h, l, c, 14)) or 0.0

    support = min(c[-60:]) if len(c) >= 1 else px
    resistance = max(c[-60:]) if len(c) >= 1 else px

    # relative strength vs market index (ROC over same period)
    mkt_roc = None
    if len(mkt) >= 13:
        mc = [float(b["close"]) for b in mkt]
        prev = mc[-13]
        if prev:
            mkt_roc = (mc[-1] - prev) / prev * 100.0

    # --- criteria evaluation -------------------------------------------------
    # Each entry: (id, category, label, passed(bool/None for unknown), explanation)
    crit = []

    def add(cid, cat, label, passed, expl):
        crit.append({"id": cid, "category": cat, "label": label,
                     "passed": passed, "explanation": expl})

    # MINERVINI SEPA (1-8)
    add(1, "trend", "Close > 50-day MA",
        (m50 is not None and px > m50) if m50 is not None else None,
        "Price trading above its 50-day average shows recent strength.")
    add(2, "trend", "Close > 150-day MA",
        (m150 is not None and px > m150) if m150 is not None else None,
        "Above the 150-day average confirms the medium-term uptrend.")
    add(3, "trend", "Close > 200-day MA",
        (m200 is not None and px > m200) if m200 is not None else None,
        "Above the 200-day average marks a long-term uptrend.")
    add(4, "trend", "50-day MA > 150-day MA",
        (m50 is not None and m150 is not None and m50 > m150) if (m50 and m150) else None,
        "Short average over the medium one means momentum is improving.")
    add(5, "trend", "150-day MA > 200-day MA",
        (m150 is not None and m200 is not None and m150 > m200) if (m150 and m200) else None,
        "Medium average over the long one confirms the stack is aligned up.")
    rising200 = _slope_rising(s200, 21)
    add(6, "trend", "200-day MA rising (~1 month)",
        rising200,
        "A rising long-term average means the trend is still building.")
    near_high = (px >= 0.75 * hi_52)
    add(7, "trend", "Within 25% of 52-week high",
        near_high,
        "Leaders trade near their highs, not deep in a hole.")
    above_low = (lo_52 > 0 and px >= 1.30 * lo_52)
    add(8, "trend", ">= 30% above 52-week low",
        above_low,
        "A big rise off the lows shows real recovery, not a falling knife.")

    # MOMENTUM INDICATORS (9-14)
    add(9, "momentum_power", "RSI between 40 and 70",
        (40 <= rsi_v <= 70) if rsi_v is not None else None,
        "RSI 40-70 is the 'strong but not exhausted' momentum zone.")
    add(10, "momentum_power", "MACD above signal line",
        (macd_line is not None and macd_sig is not None and macd_line > macd_sig)
        if (macd_line is not None and macd_sig is not None) else None,
        "MACD over its signal line is a classic bullish trigger.")
    roc_rising = _slope_rising(roc_series, 5)
    add(11, "momentum_power", "ROC positive and rising",
        (roc_v is not None and roc_v > 0 and bool(roc_rising))
        if roc_v is not None else None,
        "Positive and accelerating rate-of-change means momentum is speeding up.")
    add(12, "momentum_power", "ADX > 25",
        (adx_v > 25) if adx_v is not None else None,
        "ADX above 25 confirms a genuine trend rather than chop.")
    add(13, "momentum_power", "MFI between 20 and 80",
        (20 <= mfi_v <= 80) if mfi_v is not None else None,
        "Money Flow Index 20-80 shows healthy buying without blow-off.")
    add(14, "momentum_power", "Bollinger %B favourable (0.5-1.0)",
        (0.5 <= pctb <= 1.0) if pctb is not None else None,
        "Price in the upper half of the bands (but not bursting out) signals strength.")

    # VOLUME (15-18)
    obv_up = _slope_rising(obv_series, 10)
    add(15, "volume", "OBV trending up",
        bool(obv_up) if obv_up is not None else None,
        "Rising On-Balance Volume means volume backs the advance.")
    add(16, "volume", "Volume > 20-day average",
        (avg20_vol > 0 and v[-1] > avg20_vol) if avg20_vol else None,
        "Above-average volume shows real participation behind the move.")
    ad_up = _slope_rising(ad_series, 10)
    add(17, "volume", "Accumulation/Distribution rising",
        bool(ad_up) if ad_up is not None else None,
        "A rising A/D line means buyers control the day's range.")
    add(18, "volume", "Volume ROC positive",
        (vroc_v is not None and vroc_v > 0) if vroc_v is not None else None,
        "Growing volume vs a month ago signals fresh interest.")

    # DRIEHAUS (19-22)
    eps_hist = fundamentals.get("eps_history") or []
    earn_accel = None
    if len(eps_hist) >= 3 and eps_hist[-2] and eps_hist[-3]:
        latest_g = (eps_hist[-1] - eps_hist[-2]) / abs(eps_hist[-2])
        prior_g = (eps_hist[-2] - eps_hist[-3]) / abs(eps_hist[-3])
        earn_accel = latest_g > prior_g
    add(19, "relative_performance", "Earnings acceleration",
        earn_accel,
        "Each year's earnings growth beating the last is the Driehaus signature.")

    surprise = fundamentals.get("earnings_surprise")
    if surprise is None:
        surprise_pass = None
        flags.append("missing:earnings_surprise")
    else:
        surprise_pass = float(surprise) > 0
    add(20, "relative_performance", "Positive recent earnings surprise",
        surprise_pass,
        "Beating analyst estimates often sparks the next leg up.")

    add(21, "relative_performance", "Institutional accumulation (rel. volume > 1.2)",
        (rel_vol > 1.2),
        "Volume well above normal hints big institutions are buying.")

    rel_strength = None
    if roc_v is not None and mkt_roc is not None:
        rel_strength = roc_v > mkt_roc
    elif roc_v is not None and mkt_roc is None:
        flags.append("missing:market_index")
    add(22, "relative_performance", "Relative strength vs market positive",
        rel_strength,
        "Outperforming the index means money is rotating into this name.")

    # RISK (23-25)
    atr_ratio = (atr_v / px) if px else None
    add(23, "risk", "ATR within acceptable range (ATR/price < 6%)",
        (atr_ratio is not None and atr_ratio < 0.06) if atr_ratio is not None else None,
        "Lower volatility means tighter, safer stops.")
    dist_support = ((px - support) / px * 100) if px else None
    add(24, "risk", "Distance from support < 8%",
        (dist_support is not None and dist_support < 8) if dist_support is not None else None,
        "Close to support gives a low-risk entry with a nearby stop.")
    dist_resist = ((resistance - px) / px * 100) if px else None
    add(25, "risk", "No major resistance within 10%",
        (dist_resist is not None and dist_resist >= 10) if dist_resist is not None else None,
        "Clear overhead room lets the stock run without hitting a ceiling.")

    # --- scoring -------------------------------------------------------------
    counted = [x for x in crit if x["passed"] is not None]
    passed = [x for x in counted if x["passed"]]
    overall_count = f"{len(passed)}/25"

    key_metrics = {}
    score = 0.0
    for cat, weight in CATEGORY_WEIGHTS.items():
        ids = set(CATEGORY_CRITERIA[cat])
        cat_items = [x for x in crit if x["id"] in ids and x["passed"] is not None]
        met = sum(1 for x in cat_items if x["passed"])
        total = len(cat_items)
        frac = (met / total) if total else 0.0
        score += weight * frac
        key_metrics[cat] = {"criteria_met": met, "total": total,
                            "fraction": round(frac, 3)}

    score = round(score, 3)
    g = grade(score)

    reasoning = [
        f"{'✓' if x['passed'] else ('?' if x['passed'] is None else '✗')} "
        f"{x['label']} — {x['explanation']}"
        + ("" if x["passed"] is not None else " (data unavailable — not counted)")
        for x in crit
    ]

    # confidence: more criteria evaluable -> higher confidence.
    evaluable = len(counted) / 25.0
    confidence = round(max(0.1, min(0.95, 0.5 + 0.45 * evaluable
                                    - (0.1 if "limited_history_<200_bars" in flags else 0))), 2)

    return {
        "skill": "momentum-screen",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "momentum"),
        "as_of": data.get("as_of"),
        "score": score,
        "confidence": confidence,
        "rating": g,
        "key_metrics": {
            "overall_count": overall_count,
            "criteria_passed": len(passed),
            "criteria_evaluated": len(counted),
            "categories": key_metrics,
        },
        "reasoning": reasoning,
        "flags": flags,
        "disclaimer": DISCLAIMER,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="path to JSON input; omit to read stdin")
    ap.add_argument("--pretty", action="store_true")
    args = ap.parse_args()
    try:
        raw = open(args.input).read() if args.input else sys.stdin.read()
        data = json.loads(raw)
    except Exception as e:  # noqa
        print(json.dumps({"error": f"bad input: {e}"}))
        sys.exit(1)
    result = screen(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
