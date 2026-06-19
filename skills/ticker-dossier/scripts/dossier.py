#!/usr/bin/env python3
"""ticker-dossier: render sibling skills' Thinking Cards into one Markdown dossier.

This script is a renderer, not an analyser. The caller runs the sibling skills first and
passes their JSON outputs under `cards`; the dossier composes a structured, PDF-ready
Markdown report with an at-a-glance verdict table and themed sections, plus a provenance
footer listing which analyses were present or missing. It never fabricates numbers: an
empty `cards` object yields a skeleton report.

Usage:
  python3 dossier.py --input dossier_input.json [--pretty]
  cat dossier_input.json | python3 dossier.py
"""
from __future__ import annotations

import argparse
import json
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

# Canonical card keys -> human label, grouped by section later.
CARD_LABELS = {
    "technical": "Technical Analysis",
    "momentum": "Momentum Screen",
    "pattern": "Pattern Miner",
    "fundamental": "Fundamental Analysis",
    "value": "Value Checklist",
    "smart_money": "Smart-Money Flow",
    "sentiment": "Sentiment & News",
    "macro": "Macro Regime",
    "synthesizer": "Signal Synthesizer",
    "risk": "Risk Manager",
}

ALL_CARDS = list(CARD_LABELS.keys())


def _fmt(x):
    if x is None:
        return "-"
    if isinstance(x, float):
        return f"{x:.3f}".rstrip("0").rstrip(".")
    return str(x)


def _verdict_row(label, card):
    if not isinstance(card, dict):
        return None
    rating = card.get("rating") or card.get("grade") or card.get("status") or "-"
    score = card.get("score")
    if score is None:
        score = card.get("composite_score") or card.get("dse_composite_score")
    conf = card.get("confidence")
    return f"| {label} | {_fmt(rating)} | {_fmt(score)} | {_fmt(conf)} |"


def _card_block(label, card):
    """Render one card's rating/score/confidence and reasoning bullets."""
    if not isinstance(card, dict):
        return [f"_{label}: not supplied._", ""]
    lines = []
    rating = card.get("rating") or card.get("grade") or card.get("status")
    score = card.get("score", card.get("composite_score"))
    conf = card.get("confidence")
    bits = []
    if rating is not None:
        bits.append(f"**Rating:** {_fmt(rating)}")
    if score is not None:
        bits.append(f"**Score:** {_fmt(score)}")
    if conf is not None:
        bits.append(f"**Confidence:** {_fmt(conf)}")
    if bits:
        lines.append(" · ".join(bits))
    # Reasoning may be a list of strings.
    reasoning = card.get("reasoning") or card.get("notes")
    if isinstance(reasoning, list) and reasoning:
        for r in reasoning[:8]:
            lines.append(f"- {r}")
    # Carry forward any flags.
    fl = card.get("flags")
    if isinstance(fl, list) and fl:
        lines.append(f"- _Flags: {', '.join(map(str, fl))}_")
    if not lines:
        lines.append(f"_{label}: card supplied but no readable fields._")
    lines.append("")
    return lines


def _section(md, title, keys, cards):
    """Append a themed section if any of its cards are present."""
    present = [k for k in keys if isinstance(cards.get(k), dict)]
    md.append(f"## {title}")
    if not present:
        md.append("_No analyses supplied for this section._")
        md.append("")
        return
    for k in keys:
        if k in cards:
            md.append(f"### {CARD_LABELS[k]}")
            md.extend(_card_block(CARD_LABELS[k], cards[k]))


def render(data: dict) -> dict:
    ticker = data.get("ticker") or "(unknown)"
    as_of = data.get("as_of") or "(date unknown)"
    cards = data.get("cards") or {}
    if not isinstance(cards, dict):
        cards = {}

    included = [k for k in ALL_CARDS if isinstance(cards.get(k), dict)]
    missing = [k for k in ALL_CARDS if k not in included]

    md = []
    md.append(f"# Ticker Dossier — {ticker}")
    md.append("")
    md.append(f"**As of:** {as_of}  ")
    md.append(f"**Disclaimer:** {DISCLAIMER}")
    md.append("")
    md.append("> This dossier consolidates the analyses supplied by Stock Buddy's component "
              "skills. It contains educational analysis only and is not individualised "
              "investment advice or an instruction to trade.")
    md.append("")

    # At-a-glance verdict table.
    md.append("## At a glance")
    if included:
        md.append("| Analysis | Rating | Score | Confidence |")
        md.append("|----------|--------|-------|------------|")
        for k in ALL_CARDS:
            if k in included:
                row = _verdict_row(CARD_LABELS[k], cards[k])
                if row:
                    md.append(row)
        md.append("")
    else:
        md.append("_No analyses supplied — this is a skeleton dossier. Run the component "
                  "skills (technical-analysis, fundamental-analysis, etc.) and pass their "
                  "Thinking Cards under `cards` to populate this report._")
        md.append("")

    # Themed sections.
    _section(md, "Investment view", ["fundamental", "value"], cards)
    _section(md, "Momentum view", ["technical", "momentum", "pattern"], cards)
    _section(md, "Risk & levels", ["risk"], cards)
    _section(md, "Smart-money & sentiment", ["smart_money", "sentiment"], cards)
    _section(md, "Macro context", ["macro"], cards)
    _section(md, "Synthesised signal", ["synthesizer"], cards)

    # Provenance footer.
    md.append("## Data provenance & missing analyses")
    md.append(f"- **Included cards ({len(included)}):** "
              f"{', '.join(CARD_LABELS[k] for k in included) if included else 'none'}")
    md.append(f"- **Missing cards ({len(missing)}):** "
              f"{', '.join(CARD_LABELS[k] for k in missing) if missing else 'none'}")
    md.append("- Verdicts above are only as current as the cards supplied; re-run the "
              "component skills to refresh.")
    md.append("")

    return {
        "skill": "ticker-dossier",
        "ticker": ticker,
        "as_of": as_of,
        "markdown": "\n".join(md),
        "included_cards": included,
        "missing_cards": missing,
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
    result = render(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
