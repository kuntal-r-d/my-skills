#!/usr/bin/env python3
"""smart-money-flow: institutional & fund-manager flow from PUBLIC disclosure only.

Reads the shared JSON input contract (`shareholding` monthly array; optional `funds`
array) and emits a Thinking Card with an accumulation/distribution score in [-1, +1],
confidence, a rating and reasoning tied to dated months.

GUARDRAILS (PRD-002 REQ-021):
  - Uses ONLY public disclosure data present in the input.
  - NEVER fabricates or infers a private/non-public "broker book". If data is
    missing it says so in reasoning and lowers confidence.
  - Monthly cadence is stale by nature -> confidence capped at 0.7 and flagged
    `monthly_disclosure_lag`.
  - No `shareholding` -> score 0, low confidence, flag `no_disclosure_data`.

Rules:
  - Moves >= 2% MoM (institution / foreign / sponsor) are significant.
  - Foreign inflow positive (governance/confidence); foreign outflow negative.
  - Institutional accumulation positive; distribution negative.
  - Sponsor/director SELLING is a RED FLAG (strong negative); buying positive.
  - Fund managers raising weight (scaled by 3y track record) positive.

Usage:
  python3 analyze.py --input data.json [--pretty]
  cat data.json | python3 analyze.py
"""
from __future__ import annotations

import argparse
import json
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

SIGNIFICANCE_THRESHOLD = 2.0   # percentage points MoM
CONFIDENCE_CAP = 0.7           # monthly cadence is inherently stale


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _no_data_card(data):
    return {
        "skill": "smart-money-flow",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "investment"),
        "as_of": data.get("as_of"),
        "score": 0.0,
        "confidence": 0.1,
        "rating": "neutral",
        "key_metrics": {"latest_deltas": {}, "funds_featuring": []},
        "reasoning": [
            "No `shareholding` disclosure present in the input. Smart-money flow cannot "
            "be assessed from public data; no private broker book is ever inferred.",
        ],
        "flags": ["no_disclosure_data"],
        "disclaimer": DISCLAIMER,
    }


def analyze(data: dict) -> dict:
    sh = data.get("shareholding")
    if not isinstance(sh, list) or len(sh) < 1:
        return _no_data_card(data)

    flags = ["monthly_disclosure_lag"]
    reasoning = []
    score = 0.0

    if len(sh) < 2:
        flags.append("single_month_no_trend")
        reasoning.append(
            f"Only one disclosure month ({sh[0].get('month')}) available — no "
            "month-over-month trend computable; confidence reduced.")
        latest = sh[-1]
        deltas = {}
    else:
        prev, latest = sh[-2], sh[-1]
        pm, lm = prev.get("month"), latest.get("month")
        deltas = {}
        for key in ("sponsor", "govt", "institution", "foreign", "public"):
            if _num(latest.get(key)) and _num(prev.get(key)):
                deltas[key] = round(latest[key] - prev[key], 2)

        # Institutional flow.
        di = deltas.get("institution")
        if di is not None:
            if di >= SIGNIFICANCE_THRESHOLD:
                score += 0.3
                reasoning.append(
                    f"{lm}: institutional ownership +{di:.1f}pp MoM (vs {pm}) — "
                    "significant accumulation (positive).")
            elif di <= -SIGNIFICANCE_THRESHOLD:
                score -= 0.3
                reasoning.append(
                    f"{lm}: institutional ownership {di:.1f}pp MoM (vs {pm}) — "
                    "significant distribution (negative).")
            else:
                reasoning.append(
                    f"{lm}: institutional ownership {di:+.1f}pp MoM (vs {pm}) — "
                    "below the 2pp significance threshold.")

        # Foreign flow.
        df = deltas.get("foreign")
        if df is not None:
            if df >= SIGNIFICANCE_THRESHOLD:
                score += 0.3
                reasoning.append(
                    f"{lm}: foreign holding +{df:.1f}pp MoM (vs {pm}) — significant "
                    "foreign INFLOW (confidence/governance signal, positive).")
            elif df <= -SIGNIFICANCE_THRESHOLD:
                score -= 0.3
                reasoning.append(
                    f"{lm}: foreign holding {df:.1f}pp MoM (vs {pm}) — significant "
                    "foreign OUTFLOW (negative).")
            elif df > 0:
                score += 0.1
                reasoning.append(
                    f"{lm}: foreign holding +{df:.1f}pp MoM (vs {pm}) — modest inflow.")
            elif df < 0:
                score -= 0.1
                reasoning.append(
                    f"{lm}: foreign holding {df:.1f}pp MoM (vs {pm}) — modest outflow.")

        # Sponsor / director flow — selling is a RED FLAG.
        ds = deltas.get("sponsor")
        if ds is not None:
            if ds <= -SIGNIFICANCE_THRESHOLD:
                score -= 0.4
                flags.append("sponsor_director_selling")
                reasoning.append(
                    f"{lm}: sponsor/director holding {ds:.1f}pp MoM (vs {pm}) — "
                    "significant insider SELLING (RED FLAG, strong negative).")
            elif ds < 0:
                score -= 0.15
                reasoning.append(
                    f"{lm}: sponsor/director holding {ds:.1f}pp MoM (vs {pm}) — "
                    "minor insider reduction (caution).")
            elif ds >= SIGNIFICANCE_THRESHOLD:
                score += 0.25
                reasoning.append(
                    f"{lm}: sponsor/director holding +{ds:.1f}pp MoM (vs {pm}) — "
                    "insider buying (positive).")
            elif ds > 0:
                score += 0.1
                reasoning.append(
                    f"{lm}: sponsor/director holding +{ds:.1f}pp MoM (vs {pm}) — "
                    "modest insider accumulation.")

    # Fund manager featuring (optional, public fund disclosures).
    funds = data.get("funds")
    funds_featuring = []
    if isinstance(funds, list) and funds:
        for fd in funds:
            name = fd.get("name")
            w = fd.get("ticker_weight_pct")
            pw = fd.get("prev_weight_pct")
            tr = fd.get("track_record_3y")
            if not (_num(w) and _num(pw)):
                continue
            dw = round(w - pw, 2)
            tr_scale = clamp(tr, 0.0, 1.0) if _num(tr) else 0.3
            if dw > 0:
                bump = round(0.25 * dw / 1.0 * (0.5 + tr_scale), 3)
                bump = min(bump, 0.3)
                score += bump
                reasoning.append(
                    f"Fund {name} raised weight {pw:.1f}%->{w:.1f}% (+{dw:.1f}pp), "
                    f"3y track record {tr if _num(tr) else 'n/a'} — positive (+{bump}).")
            elif dw < 0:
                score -= 0.1
                reasoning.append(
                    f"Fund {name} cut weight {pw:.1f}%->{w:.1f}% ({dw:.1f}pp) — negative.")
            funds_featuring.append({"name": name, "weight_pct": w,
                                    "weight_delta_pp": dw, "manager": fd.get("manager"),
                                    "track_record_3y": tr})
    else:
        reasoning.append(
            "No public fund-holding (`funds`) data supplied — fund-manager featuring "
            "not assessed (no private data inferred).")

    score = round(clamp(score), 3)

    # Confidence: capped by monthly lag; reduced by thin data.
    confidence = 0.6
    if "single_month_no_trend" in flags:
        confidence -= 0.25
    if not funds_featuring:
        confidence -= 0.05
    confidence = round(min(CONFIDENCE_CAP, clamp(confidence, 0.1, 0.95)), 2)

    if score >= 0.2:
        rating = "accumulation"
    elif score <= -0.2:
        rating = "distribution"
    else:
        rating = "neutral"

    return {
        "skill": "smart-money-flow",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "investment"),
        "as_of": data.get("as_of"),
        "score": score,
        "confidence": confidence,
        "rating": rating,
        "key_metrics": {
            "latest_deltas": deltas,
            "latest_month": (sh[-1].get("month") if sh else None),
            "funds_featuring": funds_featuring,
            "significance_threshold_pp": SIGNIFICANCE_THRESHOLD,
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
    result = analyze(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
