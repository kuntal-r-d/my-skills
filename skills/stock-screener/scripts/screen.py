#!/usr/bin/env python3
"""stock-screener: filter a universe of DSE stocks by fundamental, technical, and
natural-language criteria, then rank survivors.

Reads a universe of stocks plus optional `filters`, a pre-built `template`, and/or a
natural-language `query`. Templates seed filters; explicit `filters` override; the NL
parser also contributes filters and reports back what it parsed.

INPUT:
  {
    "universe": [
      {"ticker": "GP", "fundamentals": {...}, "ohlcv": [...], "sector": "Telecom"}
    ],
    "filters":  {pe_max, pb_max, roe_min, de_max, div_yield_min, market_cap_min,
                 sector, rsi_min, rsi_max, ma_cross, pos_52w_min, pos_52w_max,
                 breakout, rel_volume_min},
    "template": "value" | "dividend_champions" | ...,
    "query":    "profitable banks with p/e under 15",
    "mode":     "both",
    "limit":    25
  }

OUTPUT: a multi-ticker card (see references/SCREENS.md) — not a single Thinking Card.

Usage:
  python3 screen.py --input universe.json [--pretty]
  cat universe.json | python3 screen.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys

import indicators as ind

DISCLAIMER = "Educational analysis only. Not financial advice."
DEFAULT_LIMIT = 25

# --- Pre-built templates (REQ-040): each seeds a set of filters. ---
TEMPLATES = {
    "dividend_champions": {"div_yield_min": 0.04, "roe_min": 0.12},
    "value": {"pe_max": 15, "pb_max": 1.5, "roe_min": 0.12},
    "momentum_leaders": {"rsi_min": 55, "breakout": True, "pos_52w_min": 0.7},
    "oversold_quality": {"rsi_max": 35, "roe_min": 0.15, "de_max": 0.6},
    "small_cap_growth": {"market_cap_min": 0, "roe_min": 0.15},
}


# ---------------------------------------------------------------------------
# Technical helpers (derived per stock from its ohlcv, when provided).
# ---------------------------------------------------------------------------
def _technicals(ohlcv):
    """Return a dict of technical metrics, or {} if not enough data."""
    if not ohlcv or len(ohlcv) < 2:
        return {}
    o, h, l, c, v = ind.split_ohlcv(ohlcv)
    tech = {}
    tech["rsi"] = ind.last_valid(ind.rsi(c, 14))
    m50 = ind.last_valid(ind.sma(c, 50))
    m200 = ind.last_valid(ind.sma(c, 200))
    tech["ma50"] = m50
    tech["ma200"] = m200
    if m50 is not None and m200 is not None:
        tech["ma_cross"] = "golden" if m50 > m200 else "death"
    else:
        tech["ma_cross"] = None

    # 52-week (use up to last 252 bars) range position in [0, 1].
    window = c[-252:] if len(c) >= 252 else c
    hi52, lo52 = max(window), min(window)
    span = (hi52 - lo52) or 1e-9
    tech["pos_52w"] = (c[-1] - lo52) / span
    tech["high_52w"] = hi52
    tech["low_52w"] = lo52

    # Breakout: close >= prior 40-bar high.
    prior = c[-41:-1] if len(c) >= 41 else c[:-1]
    tech["breakout"] = bool(prior) and c[-1] >= max(prior)

    # Relative volume vs 20-day average.
    avg20 = ind.last_valid(ind.sma(v, 20)) or (sum(v) / len(v) if v else 0)
    tech["rel_volume"] = (v[-1] / avg20) if avg20 else 1.0
    return tech


# ---------------------------------------------------------------------------
# Filter evaluation. Returns (passes: bool, matched: dict of passed filters).
# ---------------------------------------------------------------------------
def _evaluate(stock, filters):
    f = stock.get("fundamentals") or {}
    sector = stock.get("sector") or f.get("sector")
    tech = _technicals(stock.get("ohlcv"))
    matched = {}
    passes = True

    def check(name, ok):
        nonlocal passes
        if ok:
            matched[name] = True
        else:
            passes = False

    # --- Fundamental filters ---
    if "pe_max" in filters:
        pe = f.get("pe")
        check("pe_max", pe is not None and pe <= filters["pe_max"])
    if "pb_max" in filters:
        pb = f.get("pb")
        check("pb_max", pb is not None and pb <= filters["pb_max"])
    if "roe_min" in filters:
        roe = f.get("roe")
        check("roe_min", roe is not None and roe >= filters["roe_min"])
    if "de_max" in filters:
        de = f.get("debt_to_equity")
        check("de_max", de is not None and de <= filters["de_max"])
    if "div_yield_min" in filters:
        dy = f.get("dividend_yield")
        check("div_yield_min", dy is not None and dy >= filters["div_yield_min"])
    if "market_cap_min" in filters:
        mc = f.get("market_cap")
        # market_cap may be absent; treat 0-min as always-pass.
        check("market_cap_min", filters["market_cap_min"] <= 0 or (mc is not None and mc >= filters["market_cap_min"]))
    if "sector" in filters:
        want = str(filters["sector"]).lower()
        have = str(sector or "").lower()
        check("sector", want in have or have in want)

    # --- Technical filters ---
    if "rsi_min" in filters:
        check("rsi_min", tech.get("rsi") is not None and tech["rsi"] >= filters["rsi_min"])
    if "rsi_max" in filters:
        check("rsi_max", tech.get("rsi") is not None and tech["rsi"] <= filters["rsi_max"])
    if "ma_cross" in filters:
        check("ma_cross", tech.get("ma_cross") == filters["ma_cross"])
    if "pos_52w_min" in filters:
        check("pos_52w_min", tech.get("pos_52w") is not None and tech["pos_52w"] >= filters["pos_52w_min"])
    if "pos_52w_max" in filters:
        check("pos_52w_max", tech.get("pos_52w") is not None and tech["pos_52w"] <= filters["pos_52w_max"])
    if "breakout" in filters and filters["breakout"]:
        check("breakout", tech.get("breakout") is True)
    if "rel_volume_min" in filters:
        check("rel_volume_min", tech.get("rel_volume") is not None and tech["rel_volume"] >= filters["rel_volume_min"])

    return passes, matched, f, tech


# ---------------------------------------------------------------------------
# Rank score: composite of quality (ROE) and momentum (52w position + RSI).
# ---------------------------------------------------------------------------
def _rank_score(f, tech):
    roe = f.get("roe") or 0.0
    pos = tech.get("pos_52w")
    rsi = tech.get("rsi")
    score = 0.0
    score += min(roe, 0.4) / 0.4 * 0.5          # quality, capped at ROE 40%
    if pos is not None:
        score += pos * 0.3                       # momentum: where in 52w range
    if rsi is not None:
        score += min(max((rsi - 30) / 50.0, 0), 1) * 0.2  # RSI 30..80 -> 0..1
    return round(score, 4)


# ---------------------------------------------------------------------------
# Natural-language parser (REQ-114): rule-based phrase -> filter mapping.
# ---------------------------------------------------------------------------
SECTOR_KEYWORDS = {
    "bank": "Bank", "banks": "Bank", "banking": "Bank",
    "telecom": "Telecom", "telco": "Telecom",
    "pharma": "Pharma", "pharmaceutical": "Pharma",
    "cement": "Cement", "textile": "Textile", "fuel": "Fuel", "power": "Power",
    "insurance": "Insurance", "food": "Food", "engineering": "Engineering",
}


def parse_query(query: str):
    """Map a natural-language query to a filter dict. Rule-based, documented."""
    q = (query or "").lower()
    filters = {}
    if not q:
        return filters

    # Template-like intents.
    if "cheap" in q or "value" in q or "undervalued" in q:
        filters.update(TEMPLATES["value"])
    if "dividend" in q or "income" in q:
        filters.update(TEMPLATES["dividend_champions"])
    if "momentum" in q or "breaking" in q or "breakout" in q:
        filters.update(TEMPLATES["momentum_leaders"])
    if "oversold" in q:
        filters.update(TEMPLATES["oversold_quality"])

    # Sector.
    for kw, sec in SECTOR_KEYWORDS.items():
        if re.search(r"\b" + re.escape(kw) + r"\b", q):
            filters["sector"] = sec
            break

    # Profitability.
    if "profitable" in q or "profit" in q or "quality" in q:
        filters.setdefault("roe_min", 0.10)

    # "p/e under N" / "pe below N".
    m = re.search(r"p\s*/?\s*e\s*(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)", q)
    if m:
        filters["pe_max"] = float(m.group(1))

    # "roe above N%" / "roe over N".
    m = re.search(r"roe\s*(?:above|over|greater than|>)\s*(\d+(?:\.\d+)?)\s*%?", q)
    if m:
        filters["roe_min"] = float(m.group(1)) / 100.0

    # "52-week high(s)".
    if "52-week high" in q or "52 week high" in q or "52w high" in q:
        filters["pos_52w_min"] = 0.9
        filters["breakout"] = True

    # "volume surge".
    if "volume surge" in q or "volume spike" in q or "high volume" in q:
        filters["rel_volume_min"] = 1.5

    return filters


def screen(data: dict) -> dict:
    universe = data.get("universe")
    if not isinstance(universe, list) or not universe:
        return {"skill": "stock-screener", "error": "missing or empty `universe` array"}

    template = data.get("template")
    query = data.get("query")
    explicit = data.get("filters") or {}
    limit = data.get("limit", DEFAULT_LIMIT)
    reasoning = []

    # Compose filters: template seeds, NL adds, explicit overrides.
    filters = {}
    if template:
        if template not in TEMPLATES:
            return {"skill": "stock-screener", "error": f"unknown template: {template}",
                    "available_templates": sorted(TEMPLATES)}
        filters.update(TEMPLATES[template])
        reasoning.append(f"Template '{template}' applied: {TEMPLATES[template]}")
    if query:
        parsed = parse_query(query)
        filters.update(parsed)
        reasoning.append(f"Parsed query {query!r} -> {parsed}")
    if explicit:
        filters.update(explicit)
        reasoning.append(f"Explicit filters override: {explicit}")
    if not filters:
        reasoning.append("No filters supplied — ranking the full universe.")

    results = []
    for stock in universe:
        passes, matched, f, tech = _evaluate(stock, filters)
        if not passes:
            continue
        results.append({
            "ticker": stock.get("ticker"),
            "passes": True,
            "score": _rank_score(f, tech),
            "matched_filters": matched,
            "key_metrics": {
                "pe": f.get("pe"),
                "roe": f.get("roe"),
                "rsi": round(tech["rsi"], 1) if tech.get("rsi") is not None else None,
                "pos_52w": round(tech["pos_52w"], 3) if tech.get("pos_52w") is not None else None,
            },
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    total = len(results)
    if isinstance(limit, int) and limit > 0:
        results = results[:limit]

    reasoning.append(f"{total} of {len(universe)} stocks passed; returning top {len(results)} by rank score.")

    return {
        "skill": "stock-screener",
        "as_of": data.get("as_of"),
        "applied": {"template": template, "query": query, "filters": filters},
        "count": len(results),
        "results": results,
        "reasoning": reasoning,
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
