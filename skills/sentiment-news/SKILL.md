---
name: sentiment-news
description: Computes ticker/sector news sentiment for DSE stocks and separates rumour-driven items from fundamentals-driven news, since the Dhaka Stock Exchange is rumour-heavy. Use when the user asks about news sentiment, "what's the news saying about GP", headline tone, rumour vs real news, or wants a sentiment score to feed signal-synthesizer.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-019", "PRD-001:REQ-023"]
  mode: ["momentum", "investment"]
---

# Sentiment & News

## When to use

Activate when a user wants the news read on a DSE stock or sector: "what's the
sentiment on GP?", "is the news good or bad?", "is this just a rumour?", "score the
headlines". This is the Sentiment Agent (PRD-002 REQ-019). Its score is designed to
feed `signal-synthesizer` alongside the technical and fundamental legs.

## What it does

Reads the shared contract's `news` array and produces an aggregate sentiment score in
`[-1, +1]`. Because the DSE is rumour-heavy (PRD-001 REQ-023), it explicitly
**separates rumour-driven from fundamentals-driven items**:

- **Lexicon scoring** — each headline is scored from positive vs negative keyword
  counts (stdlib only; no NLP libraries).
- **Rumour detection** — an item is a `RUMOUR` if its `source` is social/forum/
  unconfirmed/rumour, its category is rumour-like, or its headline mentions
  rumour/unconfirmed/speculation. Rumours are down-weighted to **x0.3** and, when
  they are the *only* material signal, the score is capped to `[-0.4, +0.4]` so a
  rumour alone can never drive a strong signal.
- **Fundamental classification** — items in `earnings`, `regulatory`,
  `corporate_action`, or `macro` carry full weight.

Output is a Thinking Card (see suite README).

## How to run

```bash
python3 scripts/sentiment.py --input data.json --pretty
cat data.json | python3 scripts/sentiment.py
```

Reads `news` (required) and optional `mode`/`ticker`/`as_of`. Returns `score`
(-1..+1, fundamental-weighted), `confidence`, `rating` (positive/neutral/negative),
`key_metrics` (item/fundamental/rumour counts, average fundamental sentiment),
per-item `reasoning`, and `flags`.

Try it now with the shared fixture:

```bash
python3 scripts/sentiment.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `rating`: `positive` (score >=0.2), `negative` (<=-0.2), else `neutral`.
- `flags`: `rumour_dominated` (no fundamental items, score capped) and
  `thin_coverage` (<2 items) both lower confidence — never silent drops.
- Compare `avg_fundamental_sentiment` against the headline `score` to see how much of
  the read is fundamentals vs noise.

## Notes

The lexicon, rumour-vs-news separation rationale, and DSE rumour context are
documented in [references/SENTIMENT.md](references/SENTIMENT.md). Output is
educational analysis only, never financial advice.
