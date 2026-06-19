#!/usr/bin/env python3
"""fundamental-analysis: balance-sheet red flags + multi-method fair value + synthesis.

Reads the shared JSON input contract (needs `fundamentals`; price comes from
`fundamentals.price` or the last `ohlcv` close) and emits a Thinking Card with a
fundamental score in [-1, +1], confidence, a rating and plain-language reasoning.

Three logical stages (PRD-002 REQ-104/105/018):
  (a) balance_sheet_reader  -> extract key line items, emit RED FLAGS
  (b) valuation_extractor   -> DCF (Graham earnings formula), Graham number, PE-based;
                               returns a fair-value RANGE + explicit assumptions
  (c) fundamental_synthesizer -> combine earnings trend, flags, valuation gap,
                               disclosure quality into score / confidence / rating

Usage:
  python3 analyze.py --input data.json [--pretty]
  cat data.json | python3 analyze.py
"""
from __future__ import annotations

import argparse
import json
import math
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

# --- Documented default assumptions (see references/VALUATION.md) -------------
DISCOUNT_RATE = 0.15        # r: required return for a DSE equity (frontier risk premium)
TERMINAL_GROWTH = 0.03      # g_terminal: long-run growth after the 5y explicit window
PROJECTION_YEARS = 5        # explicit FCF projection horizon
MAX_GROWTH = 0.15           # cap on near-term growth used in projections
DEFAULT_SECTOR_PE = 15.0    # fallback sector-median P/E when sector P/E unknown


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _r(x, n=2):
    return round(x, n) if _num(x) else x


# --- (a) Balance Sheet Reader ------------------------------------------------
def balance_sheet_reader(f: dict) -> dict:
    """Extract key line items and emit balance-sheet red flags."""
    de = f.get("debt_to_equity")
    fcf = f.get("free_cash_flow")
    cr = f.get("current_ratio")
    ic = f.get("interest_coverage")
    pm = f.get("profit_margin")
    eps_hist = f.get("eps_history") or []

    red_flags = []
    if _num(de) and de > 1.0:
        red_flags.append(f"high_leverage_de_{de:.2f}")
    if _num(fcf) and fcf <= 0:
        red_flags.append("negative_or_zero_free_cash_flow")
    if len(eps_hist) >= 2 and _num(eps_hist[-1]) and _num(eps_hist[-2]) and eps_hist[-1] < eps_hist[-2]:
        red_flags.append("declining_earnings_last_vs_prev")
    if _num(cr) and cr < 1.0:
        red_flags.append(f"current_ratio_below_1_{cr:.2f}")
    if _num(ic) and ic < 2.0:
        red_flags.append(f"weak_interest_coverage_{ic:.2f}")
    if _num(pm) and pm < 0:
        red_flags.append("negative_profit_margin")

    line_items = {
        "debt_to_equity": de, "free_cash_flow": fcf, "current_ratio": cr,
        "interest_coverage": ic, "profit_margin": pm, "roe": f.get("roe"),
        "book_value_per_share": f.get("book_value_per_share"),
    }
    return {"line_items": line_items, "red_flags": red_flags}


# --- (b) Valuation Extractor -------------------------------------------------
def valuation_extractor(f: dict) -> dict:
    """Multi-method fair value with explicit assumptions; returns a range."""
    eps = f.get("eps_ttm")
    bvps = f.get("book_value_per_share")
    eg = f.get("earnings_growth")
    sector_pe = f.get("sector_median_pe")

    g = MAX_GROWTH
    if _num(eg):
        g = min(eg, MAX_GROWTH)
    g = max(g, 0.0)

    assumptions = [
        f"Near-term growth g = min(earnings_growth, {MAX_GROWTH:.0%}) = {g:.1%}",
        f"Discount rate r = {DISCOUNT_RATE:.0%} (DSE frontier-market required return)",
        f"Terminal growth = {TERMINAL_GROWTH:.0%} after a {PROJECTION_YEARS}-year window",
        f"Sector-median P/E = {sector_pe if _num(sector_pe) else DEFAULT_SECTOR_PE} "
        f"({'supplied' if _num(sector_pe) else 'default'})",
    ]

    methods = {}

    # Method 1: simplified earnings-based DCF via the Graham growth formula.
    # intrinsic = eps_ttm * (8.5 + 2 * g * 100).  g expressed as a percentage.
    if _num(eps) and eps > 0:
        graham_growth = eps * (8.5 + 2.0 * g * 100.0)
        methods["dcf_graham_formula"] = round(graham_growth, 2)

    # Method 2: Graham number = sqrt(22.5 * eps * bvps).
    if _num(eps) and _num(bvps) and eps > 0 and bvps > 0:
        methods["graham_number"] = round(math.sqrt(22.5 * eps * bvps), 2)

    # Method 3: PE-based fair value = eps * sector_median_pe.
    pe_used = sector_pe if _num(sector_pe) else DEFAULT_SECTOR_PE
    if _num(eps) and eps > 0:
        methods["pe_based"] = round(eps * pe_used, 2)

    vals = sorted(v for v in methods.values() if _num(v))
    if vals:
        n = len(vals)
        median = vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2.0
        fair = {"low": round(vals[0], 2), "median": round(median, 2), "high": round(vals[-1], 2)}
    else:
        fair = {"low": None, "median": None, "high": None}

    aggressive = _num(eg) and eg >= MAX_GROWTH  # growth pinned at the cap
    return {"methods": methods, "fair_value": fair, "assumptions": assumptions,
            "aggressive_assumptions": aggressive}


def _eps_slope(eps_hist):
    """Normalised slope of EPS history in [-1, +1]-ish via average % change."""
    pts = [e for e in eps_hist if _num(e)]
    if len(pts) < 2:
        return None
    changes = []
    for a, b in zip(pts, pts[1:]):
        if a != 0:
            changes.append((b - a) / abs(a))
    if not changes:
        return None
    return sum(changes) / len(changes)


# --- (c) Fundamental Synthesizer ---------------------------------------------
def analyze(data: dict) -> dict:
    f = data.get("fundamentals")
    if not isinstance(f, dict) or not f:
        return {"skill": "fundamental-analysis", "error": "missing required `fundamentals` object"}

    price = f.get("price")
    if not _num(price):
        ohlcv = data.get("ohlcv") or []
        if ohlcv and _num(ohlcv[-1].get("close")):
            price = ohlcv[-1]["close"]

    flags = []
    reasoning = []

    bs = balance_sheet_reader(f)
    val = valuation_extractor(f)
    red_flags = bs["red_flags"]
    fair = val["fair_value"]

    # Earnings trend component.
    slope = _eps_slope(f.get("eps_history") or [])
    if slope is None:
        trend_score = 0.0
        flags.append("no_eps_history")
        reasoning.append("No usable EPS history — earnings trend unscored.")
    else:
        trend_score = clamp(slope / 0.15)  # ~15% avg growth -> full credit
        reasoning.append(
            f"EPS history avg change {slope:+.1%} -> trend component {trend_score:+.2f}.")

    # Valuation gap component.
    gap = None
    if _num(fair["median"]) and _num(price) and price > 0:
        gap = (fair["median"] - price) / price
        gap_score = clamp(gap / 0.5)  # +50% undervalued -> full credit
        reasoning.append(
            f"Fair-value median {fair['median']} vs price {price} -> "
            f"valuation gap {gap:+.1%} (component {gap_score:+.2f}).")
    else:
        gap_score = 0.0
        flags.append("no_price_or_fair_value")
        reasoning.append("Price or fair value unavailable — valuation gap unscored.")

    # Quality (red-flag) component.
    flag_penalty = min(len(red_flags) * 0.2, 0.8)
    quality_score = -flag_penalty
    if red_flags:
        reasoning.append(
            f"{len(red_flags)} balance-sheet red flag(s): {', '.join(red_flags)} "
            f"-> quality component {quality_score:+.2f}.")
    else:
        quality_score = 0.1
        reasoning.append("No balance-sheet red flags -> clean quality component +0.10.")

    # Disclosure quality: how many of the core fields were actually present.
    core = ["eps_ttm", "eps_history", "book_value_per_share", "debt_to_equity",
            "current_ratio", "interest_coverage", "free_cash_flow", "profit_margin", "roe"]
    present = sum(1 for k in core if f.get(k) is not None)
    disclosure = present / len(core)
    if disclosure < 0.6:
        flags.append("limited_disclosure")
        reasoning.append(f"Only {present}/{len(core)} core fields disclosed — confidence reduced.")

    # Weighted composite.
    composite = clamp(0.35 * gap_score + 0.30 * trend_score + 0.35 * quality_score)

    # Confidence: high when data complete & assumptions not aggressive & few flags.
    confidence = 0.5 + 0.25 * disclosure
    confidence -= 0.07 * len(red_flags)
    if val["aggressive_assumptions"]:
        confidence -= 0.1
        reasoning.append("Growth pinned at the assumption cap — aggressive; confidence reduced.")
    if "no_price_or_fair_value" in flags:
        confidence -= 0.15
    confidence = round(clamp(confidence, 0.1, 0.9), 2)

    # Rating from valuation gap + flags.
    nflags = len(red_flags)
    if gap is not None and gap >= 0.30 and nflags == 0:
        rating = "strong_buy"
    elif gap is not None and gap >= 0.10 and nflags <= 1:
        rating = "buy"
    elif gap is not None and gap <= -0.15 or nflags >= 3:
        rating = "sell"
    else:
        rating = "hold"

    key_metrics = {
        "fair_value_low": fair["low"],
        "fair_value_median": fair["median"],
        "fair_value_high": fair["high"],
        "valuation_gap_pct": round(gap * 100, 1) if gap is not None else None,
        "red_flags": red_flags,
        "pe": f.get("pe"),
        "roe": f.get("roe"),
        "de": f.get("debt_to_equity"),
        "valuation_methods": val["methods"],
        "assumptions": val["assumptions"],
        "price": price,
    }

    return {
        "skill": "fundamental-analysis",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "investment"),
        "as_of": data.get("as_of"),
        "score": round(composite, 3),
        "confidence": confidence,
        "rating": rating,
        "key_metrics": key_metrics,
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
