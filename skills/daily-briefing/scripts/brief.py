#!/usr/bin/env python3
"""daily-briefing: compose a DSE pre-market briefing in conditions-and-levels language.

Reads a briefing input object (portfolio, watchlist, calendar, overnight news, macro
regime) and emits a JSON Thinking Card with a `markdown` briefing plus structured
sections. Every generated line passes a no-imperative guardrail so the briefing states
*conditions and levels* and never issues buy/sell commands (PRD-002 REQ-109 constraint).

Usage:
  python3 brief.py --input briefing_input.json [--pretty]
  cat briefing_input.json | python3 brief.py
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

NEAR_PCT = 3.0          # within ~3% of a level
CONCENTRATION_PCT = 25.0  # single-name weight that trips a concentration risk note
STALE_DAYS = 2          # as_of older than this -> stale_briefing flag

# Imperative phrasing the briefing must not use. Each maps to a conditional rewrite.
_IMPERATIVE_REWRITES = [
    (r"\byou should (buy|sell|short|exit|add)\b", r"conditions relate to a possible \1 zone"),
    (r"\bif\b(.+?)\bthen consider\b", r"a condition is met when\1and a level is in view at"),
    (r"\bwatch for\b", "a level to note is"),
    (r"\bwatch\b", "in view:"),
    (r"\bbuy\b", "an entry-level condition"),
    (r"\bsell\b", "an exit-level condition"),
    (r"\bshort\b", "a downside-level condition"),
    (r"\bexit now\b", "an exit level is in view"),
    (r"\bgo long\b", "an upside-level condition"),
    (r"\btake profit\b", "a target-level condition"),
    (r"\bcut\b", "a stop-level condition"),
]
_IMPERATIVE_DETECT = re.compile(
    r"\b(buy|sell|short|exit now|go long|take profit|cut|you should|watch for)\b",
    re.IGNORECASE,
)


def strip_imperatives(text: str):
    """Rewrite imperative/command phrasing into conditional levels language.

    Returns (clean_text, was_modified). Documented in references/BRIEFING.md: the
    briefing describes conditions and levels only, never commands. Any line the agent
    generates is routed through this guardrail before it reaches the user.
    """
    original = text
    out = text
    for pat, repl in _IMPERATIVE_REWRITES:
        out = re.sub(pat, repl, out, flags=re.IGNORECASE)
    return out, (out != original)


def _guard(lines):
    """Apply the guardrail to a list of lines; return (clean_lines, n_modified)."""
    clean, modified = [], 0
    for ln in lines:
        c, was = strip_imperatives(ln)
        if was:
            modified += 1
        clean.append(c)
    return clean, modified


def _pct_diff(a, b):
    if not b:
        return None
    return abs(a - b) / b * 100.0


def _as_of_flags(as_of):
    flags = []
    if not as_of:
        return ["stale_briefing"]
    try:
        d = _dt.date.fromisoformat(str(as_of)[:10])
        today = _dt.date.today()
        if (today - d).days > STALE_DAYS:
            flags.append("stale_briefing")
    except Exception:  # noqa
        flags.append("stale_briefing")
    return flags


def _regime_section(macro):
    if not macro:
        return ("Market regime: not supplied.", None)
    rating = macro.get("rating", "unknown")
    mult = macro.get("risk_multiplier")
    mtxt = f", risk multiplier {mult}" if mult is not None else ""
    return (f"Market regime rated **{rating}**{mtxt}. Position-sizing conditions scale "
            f"with this multiplier.", {"rating": rating, "risk_multiplier": mult})


def _positions_section(positions):
    lines, items = [], []
    for p in positions:
        t = p.get("ticker", "?")
        px = p.get("current_price")
        if px is None:
            continue
        stop = p.get("stop_level")
        tgt = p.get("target_level")
        note = None
        ds = _pct_diff(px, stop) if stop else None
        dt = _pct_diff(px, tgt) if tgt else None
        if ds is not None and ds <= NEAR_PCT:
            note = (f"{t} is within {ds:.1f}% of its stop level "
                    f"(price {px} vs stop {stop}).")
            items.append({"ticker": t, "near": "stop", "distance_pct": round(ds, 1)})
        elif dt is not None and dt <= NEAR_PCT:
            note = (f"{t} is within {dt:.1f}% of its target level "
                    f"(price {px} vs target {tgt}).")
            items.append({"ticker": t, "near": "target", "distance_pct": round(dt, 1)})
        if note:
            lines.append(note)
    if not lines:
        lines.append("No held position is within ~3% of a stop or target level.")
    return lines, items


def _watchlist_section(watch):
    lines, items = [], []
    for w in watch:
        t = w.get("ticker", "?")
        px = w.get("current_price")
        entry = w.get("entry_level")
        if px is None or not entry:
            continue
        d = _pct_diff(px, entry)
        if d is not None and d <= NEAR_PCT:
            sig = w.get("signal")
            sig_txt = f" Prior signal noted: {sig}." if sig else ""
            lines.append(f"{t} is within {d:.1f}% of its entry level "
                         f"(price {px} vs entry {entry}).{sig_txt}")
            items.append({"ticker": t, "distance_pct": round(d, 1), "signal": sig})
    if not lines:
        lines.append("No watchlist name is within ~3% of its entry level.")
    return lines, items


def _calendar_section(calendar, as_of):
    lines, items = [], []
    for e in calendar:
        if str(e.get("date", ""))[:10] == str(as_of)[:10]:
            ev = e.get("event", "(unspecified event)")
            lines.append(f"Today: {ev}.")
            items.append(e)
    if not lines:
        lines.append("No economic or earnings events are dated today.")
    return lines, items


def _news_section(news, known_tickers):
    lines, items = [], []
    for n in news:
        t = n.get("ticker", "?")
        head = n.get("headline", "")
        src = n.get("source", "")
        scope = "held/watch" if t in known_tickers else "other"
        src_txt = f" (source: {src})" if src else ""
        lines.append(f"{t} [{scope}]: {head}{src_txt}.")
        items.append({"ticker": t, "scope": scope})
    if not lines:
        lines.append("No overnight news or disclosures supplied.")
    return lines, items


def _risk_section(positions, news, macro):
    lines, items = [], []
    # Concentration: single position > CONCENTRATION_PCT of book value.
    book = 0.0
    vals = []
    for p in positions:
        v = (p.get("qty") or 0) * (p.get("current_price") or 0)
        vals.append((p.get("ticker", "?"), v))
        book += v
    if book > 0:
        for t, v in vals:
            wpct = v / book * 100.0
            if wpct >= CONCENTRATION_PCT:
                lines.append(f"Concentration: {t} represents {wpct:.0f}% of book value "
                             f"(threshold {CONCENTRATION_PCT:.0f}%).")
                items.append({"type": "concentration", "ticker": t,
                              "weight_pct": round(wpct, 1)})
    # Circuit / floor / halt mentions in news headlines.
    kw = re.compile(r"\b(circuit|floor price|floor-price|halt|halted|suspend)\b", re.I)
    for n in news:
        if kw.search(n.get("headline", "")):
            lines.append(f"Microstructure note: {n.get('ticker','?')} headline mentions "
                         f"a circuit/floor/halt condition.")
            items.append({"type": "microstructure", "ticker": n.get("ticker")})
    if macro and str(macro.get("rating", "")).lower() in ("risk_off", "bearish", "red"):
        lines.append("Macro regime is risk-off; sizing conditions are tighter than usual.")
        items.append({"type": "macro_risk_off"})
    if not lines:
        lines.append("No elevated risk items detected in the supplied data.")
    return lines, items


def build(data: dict) -> dict:
    as_of = data.get("as_of")
    user = data.get("user")
    portfolio = data.get("portfolio") or {}
    positions = portfolio.get("positions") or []
    watch = data.get("watchlist") or []
    calendar = data.get("calendar") or []
    news = data.get("overnight_news") or []
    macro = data.get("macro_regime") or {}

    flags = _as_of_flags(as_of)
    if not positions:
        flags.append("fallback")

    known = {p.get("ticker") for p in positions} | {w.get("ticker") for w in watch}

    regime_line, regime_meta = _regime_section(macro)
    pos_lines, pos_items = _positions_section(positions)
    watch_lines, watch_items = _watchlist_section(watch)
    cal_lines, cal_items = _calendar_section(calendar, as_of)
    news_lines, news_items = _news_section(news, known)
    risk_lines, risk_items = _risk_section(positions, news, macro)

    # Guardrail pass over every generated line (signal text can carry commands too).
    all_groups = [[regime_line], pos_lines, watch_lines, cal_lines, news_lines, risk_lines]
    modified_total = 0
    cleaned = []
    for g in all_groups:
        cg, m = _guard(g)
        modified_total += m
        cleaned.append(cg)
    (regime_c, pos_c, watch_c, cal_c, news_c, risk_c) = cleaned
    regime_line = regime_c[0]
    if modified_total:
        flags.append("imperative_phrasing_rewritten")

    near_count = len(pos_items) + len(watch_items)
    summary = (f"Pre-market briefing for {as_of or 'unknown date'}: "
               f"{regime_meta['rating'] if regime_meta else 'regime n/a'} regime, "
               f"{near_count} name(s) near a level, "
               f"{len(cal_items)} event(s) today, {len(risk_items)} risk item(s).")
    summary, _ = strip_imperatives(summary)

    who = f" for {user}" if user else ""
    md = []
    md.append(f"# Pre-Market Briefing{who} - {as_of or 'date unknown'}")
    md.append("")
    md.append(f"> {DISCLAIMER} Conditions and levels only; no instructions to act.")
    md.append("")
    md.append("## 1. Market regime")
    md.append(regime_line)
    md.append("")
    md.append("## 2. Held positions near stop/target levels")
    md.extend(f"- {x}" for x in pos_c)
    md.append("")
    md.append("## 3. Watchlist names near entry levels")
    md.extend(f"- {x}" for x in watch_c)
    md.append("")
    md.append("## 4. Economic / earnings calendar today")
    md.extend(f"- {x}" for x in cal_c)
    md.append("")
    md.append("## 5. Overnight news & disclosures")
    md.extend(f"- {x}" for x in news_c)
    md.append("")
    md.append("## 6. Risk items")
    md.extend(f"- {x}" for x in risk_c)
    md.append("")
    markdown = "\n".join(md)

    return {
        "skill": "daily-briefing",
        "as_of": as_of,
        "summary": summary,
        "markdown": markdown,
        "sections": {
            "market_regime": {"line": regime_line, "meta": regime_meta},
            "positions_near_levels": {"lines": pos_c, "items": pos_items},
            "watchlist_near_entry": {"lines": watch_c, "items": watch_items},
            "calendar_today": {"lines": cal_c, "items": cal_items},
            "overnight_news": {"lines": news_c, "items": news_items},
            "risk_items": {"lines": risk_c, "items": risk_items},
        },
        "item_counts": {
            "positions": len(positions),
            "watchlist": len(watch),
            "positions_near_level": len(pos_items),
            "watchlist_near_entry": len(watch_items),
            "events_today": len(cal_items),
            "news": len(news),
            "risk_items": len(risk_items),
        },
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
    if not isinstance(data, dict):
        print(json.dumps({"error": "input must be a JSON object"}))
        sys.exit(1)
    result = build(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
