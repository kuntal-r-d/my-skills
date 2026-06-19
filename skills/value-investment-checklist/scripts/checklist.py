#!/usr/bin/env python3
"""value-investment-checklist: run the 30-point value checklist on a DSE ticker.

Implements the Buffett (10), Lynch GARP (8), Graham (8) and Quality (4) value
criteria (PRD-001 REQ-039, REQ-041) from a `fundamentals` dict. Every criterion
is scored pass/fail with the actual value and a beginner-friendly explanation,
then combined into a weighted Investment Grade (A+..F) with a 0-4.0 GPA.

Scoring choice (REQ-041): the three methodology buckets are weighted
Buffett 35% / Lynch 30% / Graham 35%, and the Quality bucket is folded in as a
fourth bucket given the *average* of those three weights (~0.333). The four
bucket fractions are then weight-averaged and renormalised so the weights sum to
1.0. This keeps the documented 35/30/35 methodology emphasis while still letting
the four Quality criteria influence the grade. Each bucket score is the fraction
of its *evaluable* criteria that pass; criteria needing missing data are not
counted and are surfaced as `missing:<field>` flags.

Reads the shared JSON input contract: `fundamentals` (required) plus optional
`macro.inflation` for the Quality "growth beats inflation" check.

Usage:
  python3 checklist.py --input data.json [--pretty]
  cat data.json | python3 checklist.py
"""
from __future__ import annotations

import argparse
import json
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

# Methodology bucket weights (REQ-041). Quality gets the mean of the three
# methodology weights; all four are renormalised to sum to 1.0 at scoring time.
BUCKET_WEIGHTS = {
    "buffett": 0.35,
    "lynch": 0.30,
    "graham": 0.35,
    "quality": (0.35 + 0.30 + 0.35) / 3.0,  # ~0.3333
}

DEFAULT_INFLATION = 0.06


def grade_and_gpa(score):
    """Map a 0..1 score to a letter grade and a 0-4.0 GPA."""
    table = [
        (0.90, "A+", 4.0), (0.80, "A", 3.7), (0.70, "B+", 3.3),
        (0.60, "B", 3.0), (0.50, "C", 2.0), (0.40, "D", 1.0),
    ]
    for thr, g, gpa in table:
        if score >= thr:
            return g, gpa
    return "F", 0.0


def checklist(data: dict) -> dict:
    f = data.get("fundamentals")
    if not isinstance(f, dict) or not f:
        return {"skill": "value-investment-checklist",
                "error": "fundamentals object is required"}

    macro = data.get("macro") or {}
    inflation = macro.get("inflation", DEFAULT_INFLATION)
    flags = []

    crit = []  # each: id, bucket, label, passed(bool/None), value, explanation

    def add(cid, bucket, label, passed, value, expl):
        crit.append({"id": cid, "bucket": bucket, "label": label,
                     "passed": passed, "value": value, "explanation": expl})

    def need(field):
        """Record a missing-data flag and return None for an uncounted criterion."""
        flags.append(f"missing:{field}")
        return None

    # convenience getters
    g = f.get
    eps_hist = g("eps_history") or []
    price = g("price")
    moat = g("moat")
    roe = g("roe")
    de = g("debt_to_equity")
    pm = g("profit_margin")
    fcf = g("free_cash_flow")

    # ---------------- BUFFETT (10) ----------------
    add(1, "buffett", "Economic moat present", bool(moat) if moat is not None else need("moat"),
        moat, "A durable competitive advantage protects long-term profits.")
    add(2, "buffett", "ROE > 15%", (roe > 0.15) if roe is not None else need("roe"),
        roe, "High return on equity means the company compounds shareholder money well.")
    add(3, "buffett", "Debt/Equity < 0.5", (de < 0.5) if de is not None else need("debt_to_equity"),
        de, "Low debt makes the business resilient in downturns.")
    add(4, "buffett", "Profit margin > 20%", (pm > 0.20) if pm is not None else need("profit_margin"),
        pm, "Fat margins signal pricing power and efficiency.")
    add(5, "buffett", "Free cash flow positive",
        (fcf > 0) if fcf is not None else need("free_cash_flow"),
        fcf, "Real cash left after spending is the lifeblood of intrinsic value.")
    mgmt = None
    if roe is not None and pm is not None:
        mgmt = (roe > 0.15 and pm > 0.15)
    add(6, "buffett", "Quality management (proxy: ROE>15% & margin>15%)",
        mgmt if mgmt is not None else need("roe/profit_margin"),
        {"roe": roe, "profit_margin": pm},
        "Consistently high returns and margins point to capable management.")
    predictable = None
    if eps_hist:
        predictable = all(e > 0 for e in eps_hist)
    add(7, "buffett", "Predictable earnings (all EPS history positive)",
        predictable if predictable is not None else need("eps_history"),
        eps_hist, "Steady, never-negative earnings are easier to value with confidence.")
    iv = g("intrinsic_value")
    below_iv = None
    if iv is not None and price is not None and iv:
        below_iv = price <= 0.75 * iv
    elif iv is None:
        below_iv = need("intrinsic_value")
    elif price is None:
        below_iv = need("price")
    add(8, "buffett", "Trading >= 25% below intrinsic value",
        below_iv, {"price": price, "intrinsic_value": iv},
        "A margin of safety means buying a dollar of value for 75 cents or less.")
    add(9, "buffett", "Business understandable", True, True,
        "Assumed true unless flagged — Buffett only buys what he can explain.")
    add(10, "buffett", "Sustainable competitive advantage",
        bool(moat) if moat is not None else need("moat"), moat,
        "The moat must persist for years, not just this quarter.")

    # ---------------- LYNCH GARP (8) ----------------
    peg = g("peg")
    eg = g("earnings_growth")
    rg = g("revenue_growth")
    pe = g("pe")
    add(11, "lynch", "PEG < 1.0", (peg < 1.0) if peg is not None else need("peg"),
        peg, "Paying less than 1x growth for earnings is the GARP sweet spot.")
    add(12, "lynch", "Earnings growth 15-30%",
        (0.15 <= eg <= 0.30) if eg is not None else need("earnings_growth"),
        eg, "Fast but sustainable growth — not so hot it can't last.")
    rev_consistent = None
    if eg is not None and rg is not None:
        rev_consistent = abs(rg - eg) <= 0.10
    add(13, "lynch", "Revenue growth consistent with earnings (within 10pp)",
        rev_consistent if rev_consistent is not None else need("revenue_growth/earnings_growth"),
        {"revenue_growth": rg, "earnings_growth": eg},
        "Earnings growth backed by sales is real, not just cost-cutting.")
    inv = g("inventory_turnover")
    inv_prev = g("inventory_turnover_prev")
    if inv is None or inv_prev is None:
        inv_pass = need("inventory_turnover")
    else:
        inv_pass = inv > inv_prev
    add(14, "lynch", "Inventory turnover improving", inv_pass,
        {"current": inv, "previous": inv_prev},
        "Faster inventory turns mean products sell briskly and cash isn't stuck.")
    insider = g("insider_buying")
    add(15, "lynch", "Insider buying", bool(insider) if insider is not None else need("insider_buying"),
        insider, "Insiders buying their own stock signals genuine confidence.")
    inst = g("institution_ownership")
    add(16, "lynch", "Institutional ownership < 60%",
        (inst < 0.6) if inst is not None else need("institution_ownership"),
        inst, "Low institutional ownership leaves room for the crowd to discover it.")
    buyback = g("buyback")
    add(17, "lynch", "Share buyback in place",
        bool(buyback) if buyback is not None else need("buyback"),
        buyback, "Buybacks return cash and lift per-share value.")
    pe_lt_growth = None
    if pe is not None and eg is not None:
        pe_lt_growth = pe < eg * 100
    add(18, "lynch", "P/E < earnings-growth rate",
        pe_lt_growth if pe_lt_growth is not None else need("pe/earnings_growth"),
        {"pe": pe, "growth_pct": (eg * 100 if eg is not None else None)},
        "Lynch's rule: a fair P/E should be below the growth percentage.")

    # ---------------- GRAHAM (8) ----------------
    pb = g("pb")
    cr = g("current_ratio")
    dy = g("dividend_yield")
    add(19, "graham", "P/E < 15", (pe < 15) if pe is not None else need("pe"),
        pe, "A low P/E limits what you overpay for earnings.")
    add(20, "graham", "P/B < 1.5", (pb < 1.5) if pb is not None else need("pb"),
        pb, "Buying near book value gives an asset cushion.")
    graham_num = None
    if pe is not None and pb is not None:
        graham_num = (pe * pb) < 22.5
    add(21, "graham", "P/E x P/B < 22.5 (Graham number)",
        graham_num if graham_num is not None else need("pe/pb"),
        {"pe": pe, "pb": pb, "product": (pe * pb if (pe is not None and pb is not None) else None)},
        "Graham's combined cheapness test for earnings and assets.")
    add(22, "graham", "Current ratio > 2",
        (cr > 2) if cr is not None else need("current_ratio"),
        cr, "Twice the short-term assets vs liabilities means strong liquidity.")
    add(23, "graham", "Pays a dividend", (dy > 0) if dy is not None else need("dividend_yield"),
        dy, "A dividend record shows real, distributable profits.")
    ten_y = None
    if len(eps_hist) >= 2:
        ten_y = eps_hist[0] < eps_hist[-1]
    add(24, "graham", "Long-run earnings growth (first EPS < last)",
        ten_y if ten_y is not None else need("eps_history"),
        eps_hist, "Earnings should be meaningfully higher than a decade ago.")
    ncav = g("ncav_per_share")
    below_ncav = None
    if ncav is not None and price is not None:
        below_ncav = price < 0.67 * ncav
    elif ncav is None:
        below_ncav = need("ncav_per_share")
    elif price is None:
        below_ncav = need("price")
    add(25, "graham", "Price < 67% of NCAV", below_ncav,
        {"price": price, "ncav_per_share": ncav},
        "Buying below liquidation value is Graham's deepest margin of safety.")
    stability = None
    if eps_hist:
        stability = all(e >= 0 for e in eps_hist)
    add(26, "graham", "Earnings stability (no negative EPS year)",
        stability if stability is not None else need("eps_history"),
        eps_hist, "No loss years means dependable, defensive earnings.")

    # ---------------- QUALITY (4) ----------------
    add(27, "quality", "Revenue growth > inflation",
        (rg > inflation) if rg is not None else need("revenue_growth"),
        {"revenue_growth": rg, "inflation": inflation},
        "Sales must outpace inflation to grow in real terms.")
    om = g("operating_margin")
    add(28, "quality", "Operating margin healthy (>10%)",
        (om > 0.10) if om is not None else need("operating_margin"),
        om, "A solid operating margin shows the core business is profitable.")
    roa = g("return_on_assets")
    add(29, "quality", "Return on assets > 5%",
        (roa > 0.05) if roa is not None else need("return_on_assets"),
        roa, "Good ROA means assets are deployed efficiently.")
    ic = g("interest_coverage")
    add(30, "quality", "Interest coverage > 3",
        (ic > 3) if ic is not None else need("interest_coverage"),
        ic, "Earnings comfortably cover interest — low default risk.")

    # ---------------- scoring ----------------
    buckets = ["buffett", "lynch", "graham", "quality"]
    bucket_scores = {}
    weighted_sum = 0.0
    weight_total = 0.0
    for b in buckets:
        items = [x for x in crit if x["bucket"] == b and x["passed"] is not None]
        met = sum(1 for x in items if x["passed"])
        total = len(items)
        frac = (met / total) if total else 0.0
        bucket_scores[b] = {"criteria_met": met, "total": total,
                            "fraction": round(frac, 3)}
        if total:
            w = BUCKET_WEIGHTS[b]
            weighted_sum += w * frac
            weight_total += w

    score = round((weighted_sum / weight_total) if weight_total else 0.0, 3)
    g_letter, gpa = grade_and_gpa(score)

    counted = [x for x in crit if x["passed"] is not None]
    passed = [x for x in counted if x["passed"]]

    reasoning = []
    for x in crit:
        mark = "✓" if x["passed"] else ("?" if x["passed"] is None else "✗")
        suffix = "" if x["passed"] is not None else " (data unavailable — not counted)"
        reasoning.append(f"{mark} {x['label']} — {x['explanation']}{suffix}")

    evaluable = len(counted) / 30.0
    confidence = round(max(0.1, min(0.95, 0.5 + 0.45 * evaluable)), 2)

    return {
        "skill": "value-investment-checklist",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "investment"),
        "as_of": data.get("as_of"),
        "score": score,
        "confidence": confidence,
        "rating": g_letter,
        "key_metrics": {
            "gpa": gpa,
            "overall_count": f"{len(passed)}/30",
            "criteria_passed": len(passed),
            "criteria_evaluated": len(counted),
            "buckets": bucket_scores,
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
    result = checklist(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
