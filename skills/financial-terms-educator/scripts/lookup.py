#!/usr/bin/env python3
"""financial-terms-educator: bilingual (EN+BN) glossary lookup with dual-strategy impact.

Reads a small JSON request and returns glossary entries explaining DSE/financial terms for
both long-term investors and momentum traders, with thresholds, a Bengali-context analogy,
and what-to-do notes. The glossary lives in assets/glossary.json (stdlib json only).

Request modes:
  {"term": "ROE"}                  -> one entry
  {"terms": ["ROE", "PE"]}         -> several entries
  {"metrics": {"roe": 0.23, ...}}  -> annotate each provided metric with its entry + verdict
  {"list": true}                   -> all term keys

Usage:
  python3 lookup.py --input request.json [--pretty]
  cat request.json | python3 lookup.py
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

_GLOSSARY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "..", "assets", "glossary.json")


def _load():
    with open(_GLOSSARY_PATH) as f:
        return json.load(f)


def _resolve_key(query, terms, key_map):
    """Match a user query/metric key to a glossary term key (case-insensitive)."""
    if query in terms:
        return query
    q = str(query).strip()
    lo = q.lower()
    if lo in key_map:          # metric_key_map entries (lower-case)
        return key_map[lo]
    for k in terms:            # case-insensitive direct key match
        if k.lower() == lo:
            return k
    return None


# Threshold rules used to render a good/bad verdict for a supplied metric value.
# Each: (term_key, comparator). Comparator returns ("good"/"fair"/"weak", text).
def _verdict_roe(v):
    pct = v * 100 if v <= 1 else v
    if pct >= 20:
        return "good", f"{pct:.0f}% is excellent (>20%)."
    if pct >= 15:
        return "good", f"{pct:.0f}% is good (>15%)."
    if pct >= 10:
        return "fair", f"{pct:.0f}% is fair (10-15%)."
    return "weak", f"{pct:.0f}% is weak (<10%)."


def _verdict_pe(v):
    if v < 12:
        return "good", f"P/E {v:.1f} is on the cheap side (<12 for DSE)."
    if v <= 20:
        return "fair", f"P/E {v:.1f} is fair (12-20)."
    if v <= 25:
        return "fair", f"P/E {v:.1f} is fullish (20-25)."
    return "weak", f"P/E {v:.1f} is rich (>25); growth must justify it."


def _verdict_pb(v):
    if v < 1:
        return "good", f"P/B {v:.1f} is below book (<1) — potentially cheap."
    if v <= 3:
        return "fair", f"P/B {v:.1f} is normal (1-3)."
    return "weak", f"P/B {v:.1f} is high (>3); needs strong growth/ROE."


def _verdict_peg(v):
    if v < 1:
        return "good", f"PEG {v:.2f} is attractive (<1)."
    if v <= 2:
        return "fair", f"PEG {v:.2f} is fair (~1-2)."
    return "weak", f"PEG {v:.2f} is expensive for the growth (>2)."


def _verdict_de(v):
    if v < 0.5:
        return "good", f"D/E {v:.2f} is conservative (<0.5)."
    if v <= 1.0:
        return "fair", f"D/E {v:.2f} is moderate (0.5-1.0)."
    return "weak", f"D/E {v:.2f} is elevated (>1.0) — leverage risk."


def _verdict_current(v):
    if v < 1:
        return "weak", f"Current ratio {v:.1f} is below 1 — liquidity warning."
    if v <= 3:
        return "good", f"Current ratio {v:.1f} is healthy (1.5-3)."
    return "fair", f"Current ratio {v:.1f} is high (>3) — possibly idle assets."


def _verdict_div(v):
    pct = v * 100 if v <= 1 else v
    if 4 <= pct <= 7:
        return "good", f"Yield {pct:.1f}% is attractive (4-7%) if covered."
    if pct > 7:
        return "fair", f"Yield {pct:.1f}% is high (>7%) — check it is sustainable."
    return "fair", f"Yield {pct:.1f}% is modest (<4%)."


def _verdict_margin(v):
    pct = v * 100 if v <= 1 else v
    if pct >= 20:
        return "good", f"Margin {pct:.0f}% is strong (>=20%)."
    if pct >= 10:
        return "fair", f"Margin {pct:.0f}% is moderate (10-20%)."
    return "weak", f"Margin {pct:.0f}% is thin (<10%)."


def _verdict_growth(v):
    pct = v * 100 if abs(v) <= 1 else v
    if pct >= 15:
        return "good", f"Growth {pct:.0f}% is strong (>=15%)."
    if pct >= 5:
        return "fair", f"Growth {pct:.0f}% is moderate (5-15%)."
    return "weak", f"Growth {pct:.0f}% is slow/negative (<5%)."


def _verdict_coverage(v):
    if v >= 4:
        return "good", f"Interest coverage {v:.1f}x is safe (>=4x)."
    if v >= 2:
        return "fair", f"Interest coverage {v:.1f}x is moderate (2-4x)."
    return "weak", f"Interest coverage {v:.1f}x is risky (<2x)."


def _verdict_rsi(v):
    if v > 70:
        return "weak", f"RSI {v:.0f} is overbought (>70)."
    if v < 30:
        return "weak", f"RSI {v:.0f} is oversold (<30)."
    return "good", f"RSI {v:.0f} is in a healthy band (30-70)."


def _verdict_adx(v):
    if v >= 25:
        return "good", f"ADX {v:.0f} shows a strong trend (>=25)."
    if v >= 20:
        return "fair", f"ADX {v:.0f} is a borderline trend (20-25)."
    return "weak", f"ADX {v:.0f} is choppy/range-bound (<20)."


# Map the canonical glossary key -> verdict function.
_VERDICTS = {
    "ROE": _verdict_roe, "ROA": _verdict_roe, "PE": _verdict_pe, "PB": _verdict_pb,
    "PEG": _verdict_peg, "debt_to_equity": _verdict_de, "current_ratio": _verdict_current,
    "dividend_yield": _verdict_div, "operating_margin": _verdict_margin,
    "earnings_growth": _verdict_growth, "interest_coverage": _verdict_coverage,
    "RSI": _verdict_rsi, "ADX": _verdict_adx,
}


def _entry(terms, key):
    e = dict(terms[key])
    e["key"] = key
    return e


def run(req: dict) -> dict:
    g = _load()
    terms = g["terms"]
    key_map = {k.lower(): v for k, v in g["_meta"]["metric_key_map"].items()}
    results = []

    if req.get("list") is True:
        results = sorted(terms.keys())
        return {"skill": "financial-terms-educator", "results": results,
                "count": len(results), "language": "en+bn", "disclaimer": DISCLAIMER}

    if "term" in req:
        key = _resolve_key(req["term"], terms, key_map)
        if key:
            results.append(_entry(terms, key))
        else:
            results.append({"query": req["term"], "error": "term not found"})

    elif "terms" in req and isinstance(req["terms"], list):
        for q in req["terms"]:
            key = _resolve_key(q, terms, key_map)
            results.append(_entry(terms, key) if key
                           else {"query": q, "error": "term not found"})

    elif "metrics" in req and isinstance(req["metrics"], dict):
        for mkey, val in req["metrics"].items():
            key = _resolve_key(mkey, terms, key_map)
            ann = {"metric": mkey, "value": val}
            if key:
                ann["entry"] = _entry(terms, key)
                vf = _VERDICTS.get(key)
                if vf is not None and isinstance(val, (int, float)):
                    try:
                        verdict, note = vf(float(val))
                        ann["verdict"] = verdict
                        ann["assessment"] = note
                    except Exception:  # noqa
                        ann["verdict"] = "n/a"
                        ann["assessment"] = "value not numeric/assessable"
                else:
                    ann["verdict"] = "n/a"
                    ann["assessment"] = ("No threshold rule for this term; see entry's "
                                         "good_vs_bad field.")
            else:
                ann["error"] = "no glossary entry for this metric key"
            results.append(ann)

    else:
        return {"skill": "financial-terms-educator",
                "error": "request must include one of: term, terms, metrics, list"}

    return {
        "skill": "financial-terms-educator",
        "results": results,
        "count": len(results),
        "language": "en+bn",
        "disclaimer": DISCLAIMER,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="path to JSON request; omit to read stdin")
    ap.add_argument("--pretty", action="store_true")
    args = ap.parse_args()
    try:
        raw = open(args.input).read() if args.input else sys.stdin.read()
        req = json.loads(raw)
    except Exception as e:  # noqa
        print(json.dumps({"error": f"bad input: {e}"}))
        sys.exit(1)
    if not isinstance(req, dict):
        print(json.dumps({"error": "request must be a JSON object"}))
        sys.exit(1)
    result = run(req)
    print(json.dumps(result, indent=2 if args.pretty else None, ensure_ascii=False))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
