#!/usr/bin/env python3
"""macro-regime: assess the Bangladesh market regime and emit a risk multiplier.

Reads the shared JSON input contract's `macro` block and produces a Thinking
Card whose key output is a *risk multiplier* in [0.5, 1.2] that downstream skills
(signal-synthesizer, risk-manager) use to scale risk appetite across all signals.

The multiplier starts at 1.0 (neutral). Each macro factor pushes it up (easing
rates, strong/rising reserves, stable politics, normal regulation) or down (rising
rates, high inflation, falling reserves, tense/crisis politics, regulatory
tightening or floor prices). The clamped multiplier maps to a regime label and to
a normalised score in [-1, +1].

Usage:
  python3 regime.py --input data.json [--pretty]
  cat data.json | python3 regime.py
"""
from __future__ import annotations

import argparse
import json
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

# Multiplier bounds and per-factor adjustment magnitudes.
MULT_LO, MULT_HI = 0.5, 1.2
HIGH_INFLATION = 0.08
HIGH_POLICY_RATE = 0.09   # contractionary stance reference for BD


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def assess(data: dict) -> dict:
    macro = data.get("macro")
    flags = []
    if not isinstance(macro, dict) or not macro:
        return {"skill": "macro-regime", "error": "missing `macro` object"}

    mult = 1.0
    reasoning = []
    drivers = {}

    # --- Policy rate (monetary stance) ---
    rate = macro.get("policy_rate")
    if rate is None:
        flags.append("stale_macro")
    else:
        if rate >= HIGH_POLICY_RATE:
            d = -0.10
            reasoning.append(f"Policy rate {rate*100:.1f}% — tight money raises cost of capital, risk-off pressure")
        else:
            d = +0.07
            reasoning.append(f"Policy rate {rate*100:.1f}% — accommodative stance supports risk appetite")
        mult += d
        drivers["policy_rate"] = round(d, 3)

    # --- Inflation ---
    infl = macro.get("inflation")
    if infl is None:
        flags.append("stale_macro")
    else:
        if infl > HIGH_INFLATION:
            d = -0.10
            reasoning.append(f"Inflation {infl*100:.1f}% — above 8% erodes real returns and invites tightening, risk-off")
        else:
            d = +0.05
            reasoning.append(f"Inflation {infl*100:.1f}% — contained, supportive of equities")
        mult += d
        drivers["inflation"] = round(d, 3)

    # --- FX reserves trend (import-cover / external stability) ---
    trend = macro.get("reserves_trend")
    if trend is None:
        flags.append("stale_macro")
    elif trend == "falling":
        d = -0.12
        reasoning.append("Reserves falling — import-cover stress and BDT pressure, strong risk-off pressure")
        mult += d; drivers["reserves_trend"] = round(d, 3)
    elif trend == "rising":
        d = +0.10
        reasoning.append("Reserves rising — easing external pressure, risk-on")
        mult += d; drivers["reserves_trend"] = round(d, 3)
    else:  # stable
        reasoning.append("Reserves stable — neutral external backdrop")
        drivers["reserves_trend"] = 0.0

    # --- Politics ---
    pol = macro.get("politics")
    if pol is None:
        flags.append("stale_macro")
    elif pol == "crisis":
        d = -0.20
        reasoning.append("Political crisis — heightened uncertainty, sharp risk-off")
        mult += d; drivers["politics"] = round(d, 3)
    elif pol == "tense":
        d = -0.10
        reasoning.append("Political tension — elevated headline risk, risk-off pressure")
        mult += d; drivers["politics"] = round(d, 3)
    else:  # stable
        d = +0.05
        reasoning.append("Politics stable — supportive backdrop")
        mult += d; drivers["politics"] = round(d, 3)

    # --- Regulatory regime ---
    reg = macro.get("regulatory")
    if reg is None:
        flags.append("stale_macro")
        reasoning.append("Regulatory stance unknown — assuming neutral")
    elif reg == "floor_prices":
        d = -0.15
        reasoning.append("Floor prices in force — broken price discovery and trapped liquidity, risk-off")
        mult += d; drivers["regulatory"] = round(d, 3)
    elif reg == "tightening":
        d = -0.08
        reasoning.append("Regulatory tightening — added market friction, mild risk-off")
        mult += d; drivers["regulatory"] = round(d, 3)
    else:  # normal
        reasoning.append("Regulatory regime normal — no policy drag")
        drivers["regulatory"] = 0.0

    mult = clamp(mult, MULT_LO, MULT_HI)

    # Regime label from multiplier.
    if mult >= 1.05:
        regime = "risk_on"
    elif mult >= 0.85:
        regime = "neutral"
    elif mult >= 0.70:
        regime = "cautious"
    else:
        regime = "risk_off"

    # Normalised score: (mult - 1) / 0.2 clamped to [-1, +1].
    # mult 1.2 -> +1.0, mult 1.0 -> 0.0, mult 0.8 -> -1.0, mult 0.5 -> clamped -1.0.
    score = clamp((mult - 1.0) / 0.2, -1.0, 1.0)

    # Confidence: high when data is complete; each missing field penalises.
    stale = "stale_macro" in flags
    confidence = clamp(0.85 - 0.12 * sum(1 for f in flags if f == "stale_macro"), 0.2, 0.9)
    if stale:
        confidence = clamp(confidence, 0.2, 0.6)

    return {
        "skill": "macro-regime",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "both"),
        "as_of": data.get("as_of"),
        "score": round(score, 3),
        "confidence": round(confidence, 2),
        "rating": regime,
        "key_metrics": {
            "risk_multiplier": round(mult, 3),
            "drivers": drivers,
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
    result = assess(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
