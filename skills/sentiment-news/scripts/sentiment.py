#!/usr/bin/env python3
"""sentiment-news: rule-based DSE news sentiment with rumour separation.

Reads the shared JSON input contract's `news` array and produces a Thinking Card
with an aggregate sentiment score in [-1, +1]. Because the Dhaka Stock Exchange is
notoriously rumour-heavy, this skill explicitly *separates rumour-driven items from
fundamentals-driven items*: rumours are down-weighted heavily (x0.3) and can never
on their own drive a strong signal, while earnings/regulatory/corporate-action/macro
items carry full weight.

Sentiment is lexicon based (stdlib only): each headline is scored by counting
positive vs negative keywords. No network, no third-party NLP.

Usage:
  python3 sentiment.py --input data.json [--pretty]
  cat data.json | python3 sentiment.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."

POSITIVE = {
    "profit", "record", "growth", "grow", "dividend", "beats", "beat", "upgrade",
    "upgraded", "expansion", "expand", "surge", "surges", "wins", "win", "won",
    "rises", "rise", "rally", "jump", "gain", "gains", "strong", "high", "highs",
    "outperform", "approval", "approved", "award", "bonus", "buyback", "rebound",
}
NEGATIVE = {
    "loss", "losses", "fraud", "probe", "decline", "declines", "downgrade",
    "downgraded", "default", "halt", "halted", "suspension", "suspended",
    "penalty", "fall", "falls", "fell", "drop", "drops", "plunge", "plunges",
    "weak", "miss", "misses", "missed", "lawsuit", "scandal", "delist",
    "delisting", "warning", "cut", "cuts", "slump",
}

# Sources / phrases that mark an item as rumour-driven.
RUMOUR_SOURCES = {"social", "unconfirmed", "forum", "rumour", "rumor"}
RUMOUR_TERMS = {"rumour", "rumor", "unconfirmed", "speculation", "speculative", "alleged"}

# Categories that mark an item as fundamentals-driven.
FUNDAMENTAL_CATEGORIES = {"earnings", "regulatory", "corporate_action", "macro"}

RUMOUR_WEIGHT = 0.3
_WORD = re.compile(r"[a-zA-Z]+")


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _item_sentiment(headline: str):
    words = [w.lower() for w in _WORD.findall(headline or "")]
    pos = sum(1 for w in words if w in POSITIVE)
    neg = sum(1 for w in words if w in NEGATIVE)
    if pos == 0 and neg == 0:
        return 0.0
    raw = (pos - neg) / (pos + neg)
    return clamp(raw)


def _is_rumour(item: dict) -> bool:
    src = str(item.get("source", "")).lower()
    cat = str(item.get("category", "")).lower()
    head = str(item.get("headline", "")).lower()
    if src in RUMOUR_SOURCES or cat in RUMOUR_TERMS:
        return True
    if any(t in head for t in RUMOUR_TERMS):
        return True
    return False


def analyze(data: dict) -> dict:
    news = data.get("news")
    flags = []
    if not isinstance(news, list):
        return {"skill": "sentiment-news", "error": "missing `news` array"}

    item_count = len(news)
    if item_count == 0:
        return {"skill": "sentiment-news", "error": "empty `news` array"}

    reasoning = []
    fundamental_sents = []
    rumour_count = 0
    fundamental_count = 0
    weighted_sum = 0.0
    weight_total = 0.0

    for it in news:
        s = _item_sentiment(it.get("headline", ""))
        rumour = _is_rumour(it)
        cat = str(it.get("category", "")).lower()
        is_fundamental = (not rumour) and (cat in FUNDAMENTAL_CATEGORIES)

        if rumour:
            label = "RUMOUR"
            weight = RUMOUR_WEIGHT
            rumour_count += 1
        elif is_fundamental:
            label = "FUNDAMENTAL"
            weight = 1.0
            fundamental_count += 1
            fundamental_sents.append(s)
        else:
            label = "general"
            weight = 0.7

        weighted_sum += s * weight
        weight_total += weight

        if abs(s) >= 0.5 or rumour:
            tone = "positive" if s > 0 else ("negative" if s < 0 else "neutral")
            reasoning.append(
                f"[{label}] {it.get('headline','')!r} ({it.get('source','?')}) "
                f"-> {tone} ({s:+.2f})"
            )

    score = clamp(weighted_sum / weight_total) if weight_total else 0.0
    avg_fund = (sum(fundamental_sents) / len(fundamental_sents)) if fundamental_sents else 0.0

    # If the only material signal comes from rumours, never report a strong score.
    rumour_dominated = rumour_count > 0 and fundamental_count == 0
    if rumour_dominated:
        score = clamp(score, -0.4, 0.4)
        flags.append("rumour_dominated")
    if item_count < 2:
        flags.append("thin_coverage")

    # Confidence: more items and more fundamental coverage => higher.
    confidence = 0.4 + 0.1 * min(fundamental_count, 4) + 0.05 * min(item_count, 4)
    if rumour_dominated:
        confidence -= 0.2
    if "thin_coverage" in flags:
        confidence -= 0.15
    confidence = clamp(confidence, 0.15, 0.9)

    if score >= 0.2:
        rating = "positive"
    elif score <= -0.2:
        rating = "negative"
    else:
        rating = "neutral"

    if not reasoning:
        reasoning.append("No headline carried decisive sentiment keywords — neutral read.")

    return {
        "skill": "sentiment-news",
        "ticker": data.get("ticker"),
        "mode": data.get("mode", "both"),
        "as_of": data.get("as_of"),
        "score": round(score, 3),
        "confidence": round(confidence, 2),
        "rating": rating,
        "key_metrics": {
            "item_count": item_count,
            "fundamental_count": fundamental_count,
            "rumour_count": rumour_count,
            "avg_fundamental_sentiment": round(avg_fund, 3),
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
