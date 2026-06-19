#!/usr/bin/env python3
"""technical-analysis: run the DSE Technical Committee on one ticker.

Reads the shared JSON input contract (needs `ohlcv`; optional `market_index`,
`microstructure`) and emits a Thinking Card with a committee technical score in
[-1, +1], confidence, a rating, per-member sub-scores and plain-language reasoning.

Committee members (PRD-002 FR-AG-13..18):
  trend, momentum_oscillator, chart_pattern, candlestick, levels, volume_flow
Aggregated by a Technical Chair (FR-AG-2) that notes agreement/conflict.

Usage:
  python3 analyze.py --input data.json [--pretty]
  cat data.json | python3 analyze.py
"""
from __future__ import annotations

import argparse
import json
import sys

import indicators as ind

DISCLAIMER = "Educational analysis only. Not financial advice."


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _trend(c, h, l):
    s50, s150, s200 = ind.sma(c, 50), ind.sma(c, 150), ind.sma(c, 200)
    px = c[-1]
    a = ind.adx(h, l, c, 14)
    adx_v = ind.last_valid(a["adx"]) or 0.0
    pdi = ind.last_valid(a["plus_di"]) or 0.0
    mdi = ind.last_valid(a["minus_di"]) or 0.0
    score, notes = 0.0, []
    m50, m150, m200 = ind.last_valid(s50), ind.last_valid(s150), ind.last_valid(s200)
    if m200:
        if px > m200:
            score += 0.3; notes.append("Price above 200-day MA (long-term uptrend)")
        else:
            score -= 0.3; notes.append("Price below 200-day MA (long-term downtrend)")
    if m50 and m150 and m200 and m50 > m150 > m200:
        score += 0.3; notes.append("MA stack 50>150>200 (textbook uptrend)")
    if adx_v >= 25:
        bump = 0.4 if pdi >= mdi else -0.4
        score += bump
        notes.append(f"ADX {adx_v:.0f} strong trend, {'+DI leads' if pdi>=mdi else '-DI leads'}")
    else:
        notes.append(f"ADX {adx_v:.0f} weak/!trending")
    return clamp(score), {"adx_14": round(adx_v, 1), "sma_50": _r(m50), "sma_200": _r(m200)}, notes


def _momentum_osc(c, h, l, v):
    r = ind.last_valid(ind.rsi(c, 14)) or 50.0
    mac = ind.macd(c)
    hist = ind.last_valid(mac["hist"])
    line = ind.last_valid(mac["macd"])
    sig = ind.last_valid(mac["signal"])
    rc = ind.last_valid(ind.roc(c, 12)) or 0.0
    mf = ind.last_valid(ind.mfi(h, l, c, v, 14)) or 50.0
    score, notes = 0.0, []
    if 40 <= r <= 70:
        score += 0.25; notes.append(f"RSI {r:.0f} healthy (40-70)")
    elif r > 70:
        score -= 0.15; notes.append(f"RSI {r:.0f} overbought")
    else:
        score -= 0.2; notes.append(f"RSI {r:.0f} weak/oversold")
    if line is not None and sig is not None:
        if line > sig:
            score += 0.25; notes.append("MACD above signal (bullish)")
        else:
            score -= 0.2; notes.append("MACD below signal (bearish)")
    if rc > 0:
        score += 0.2; notes.append(f"ROC +{rc:.1f}% (positive momentum)")
    else:
        score -= 0.2; notes.append(f"ROC {rc:.1f}% (negative momentum)")
    if 20 <= mf <= 80:
        score += 0.1
    return clamp(score), {"rsi_14": round(r, 1), "macd_hist": _r(hist), "roc_12": round(rc, 1),
                          "mfi_14": round(mf, 1)}, notes


def _chart_pattern(c, h, l):
    # Lightweight breakout / consolidation heuristic over the last 40 bars.
    window = c[-40:] if len(c) >= 40 else c
    hi = max(window[:-1]) if len(window) > 1 else window[-1]
    px = c[-1]
    rng = (max(window) - min(window)) / (sum(window) / len(window)) if window else 0
    score, notes = 0.0, []
    if px >= hi:
        score += 0.5; notes.append("Breakout above 40-bar high")
    if rng < 0.12:
        notes.append("Tight consolidation (low range) — coiling")
        score += 0.1
    if px <= min(window):
        score -= 0.5; notes.append("Breakdown below 40-bar low")
    return clamp(score), {"breakout_ref_high": _r(hi), "range_ratio": round(rng, 3)}, notes


def _candlestick(o, h, l, c):
    if len(c) < 2:
        return 0.0, {}, ["Insufficient bars for candlestick read"]
    body = c[-1] - o[-1]
    rng = h[-1] - l[-1] or 1e-9
    lower_wick = min(o[-1], c[-1]) - l[-1]
    upper_wick = h[-1] - max(o[-1], c[-1])
    score, notes = 0.0, []
    if body > 0 and lower_wick > 2 * abs(body):
        score += 0.4; notes.append("Hammer-like (bullish rejection of lows)")
    if body < 0 and upper_wick > 2 * abs(body):
        score -= 0.4; notes.append("Shooting-star-like (bearish rejection of highs)")
    if c[-1] > o[-1] and c[-2] < o[-2] and c[-1] > o[-2] and o[-1] < c[-2]:
        score += 0.3; notes.append("Bullish engulfing")
    if not notes:
        notes.append("No decisive candlestick signal")
    return clamp(score), {"body_pct_range": round(body / rng, 2)}, notes


def _levels(c, h, l):
    px = c[-1]
    lookback = c[-60:] if len(c) >= 60 else c
    support = min(lookback)
    resistance = max(lookback)
    span = resistance - support or 1e-9
    pos = (px - support) / span
    score, notes = 0.0, []
    dist_sup = (px - support) / px * 100
    if dist_sup < 8:
        score += 0.3; notes.append(f"Near support (+{dist_sup:.1f}% above) — favourable entry")
    if (resistance - px) / px * 100 < 3:
        score -= 0.2; notes.append("Pressing resistance — overhead supply")
    return clamp(score), {"support": _r(support), "resistance": _r(resistance),
                          "range_position": round(pos, 2)}, notes


def _volume_flow(c, v, h, l):
    o = ind.obv(c, v)
    obv_slope = (o[-1] - o[-min(10, len(o))]) if len(o) >= 2 else 0.0
    avg20 = ind.last_valid(ind.sma(v, 20)) or (sum(v) / len(v) if v else 0)
    rel_vol = v[-1] / avg20 if avg20 else 1.0
    score, notes = 0.0, []
    if obv_slope > 0:
        score += 0.3; notes.append("OBV rising (accumulation)")
    else:
        score -= 0.2; notes.append("OBV falling (distribution)")
    if rel_vol >= 1.5:
        score += 0.3; notes.append(f"Volume {rel_vol:.1f}x 20-day avg (confirms move)")
    elif rel_vol < 0.7:
        score -= 0.1; notes.append("Thin volume — weak confirmation")
    return clamp(score), {"rel_volume": round(rel_vol, 2)}, notes


def _r(x):
    return round(x, 2) if isinstance(x, (int, float)) else x


WEIGHTS = {
    "trend": 0.25, "momentum_oscillator": 0.22, "volume_flow": 0.20,
    "levels": 0.13, "chart_pattern": 0.12, "candlestick": 0.08,
}


def analyze(data: dict) -> dict:
    ohlcv = data.get("ohlcv") or []
    flags = []
    if len(ohlcv) < 30:
        return {"skill": "technical-analysis", "error": "need >=30 OHLCV bars",
                "bars_supplied": len(ohlcv)}
    o, h, l, c, v = ind.split_ohlcv(ohlcv)
    if len(c) < 200:
        flags.append("limited_history_<200_bars")

    members = {
        "trend": _trend(c, h, l),
        "momentum_oscillator": _momentum_osc(c, h, l, v),
        "chart_pattern": _chart_pattern(c, h, l),
        "candlestick": _candlestick(o, h, l, c),
        "levels": _levels(c, h, l),
        "volume_flow": _volume_flow(c, v, h, l),
    }

    composite = sum(WEIGHTS[k] * members[k][0] for k in members)
    metrics = {}
    reasoning = []
    sub_scores = {}
    for name, (sc, mx, notes) in members.items():
        sub_scores[name] = round(sc, 3)
        metrics.update(mx)
        reasoning.extend(notes)

    # Chair: agreement / conflict note.
    bulls = [k for k, val in members.items() if val[0] > 0.15]
    bears = [k for k, val in members.items() if val[0] < -0.15]
    if bulls and bears:
        chair = (f"Mixed: {', '.join(bulls)} bullish vs {', '.join(bears)} bearish — "
                 "confidence downgraded for internal conflict.")
        conflict_penalty = 0.2
    elif bulls and not bears:
        chair = f"Broad agreement bullish across {len(bulls)} members."
        conflict_penalty = 0.0
    elif bears and not bulls:
        chair = f"Broad agreement bearish across {len(bears)} members."
        conflict_penalty = 0.0
    else:
        chair = "No member shows a decisive signal — neutral."
        conflict_penalty = 0.1

    # Circuit-breaker context (momentum unreliable when price discovery interrupted).
    ms = data.get("microstructure") or {}
    if ms.get("circuit_state") in ("limit_up", "limit_down") or ms.get("floor_price"):
        flags.append("microstructure_circuit_or_floor")

    confidence = clamp(0.55 + 0.4 * abs(composite) - conflict_penalty
                       - (0.15 if "limited_history_<200_bars" in flags else 0), 0.1, 0.95)

    if composite >= 0.5:
        rating = "strong_bullish"
    elif composite >= 0.15:
        rating = "bullish"
    elif composite <= -0.5:
        rating = "strong_bearish"
    elif composite <= -0.15:
        rating = "bearish"
    else:
        rating = "neutral"

    return {
        "skill": "technical-analysis",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "momentum"),
        "as_of": data.get("as_of"),
        "score": round(composite, 3),
        "confidence": round(confidence, 2),
        "rating": rating,
        "sub_scores": sub_scores,
        "chair_note": chair,
        "key_metrics": metrics,
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
    result = analyze(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
