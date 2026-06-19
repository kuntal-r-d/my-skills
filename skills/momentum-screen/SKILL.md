---
name: momentum-screen
description: Runs the Minervini SEPA + Driehaus 25-point momentum checklist over a DSE stock and returns a pass/fail per criterion, an overall count (e.g. 18/25), a category-weighted momentum score and a Momentum Grade (A+..F). Use when the user wants a momentum screen, trend-template check, "does this stock qualify as a leader", "is GP a momentum buy", SEPA/Minervini/Driehaus screen, or a relative-strength read for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-001:REQ-026", "PRD-001:REQ-027", "PRD-001:REQ-032", "PRD-001:REQ-038"]
  mode: ["momentum"]
---

# Momentum Screen

## When to use

Activate when a user wants to know whether a DSE stock qualifies as a momentum
leader: "run the momentum checklist on GP", "does BEXIMCO pass the Minervini
trend template?", "is this a Driehaus growth setup?", "screen this for
relative strength". This is the momentum-leg companion to `technical-analysis`;
feed its grade into `signal-synthesizer` for a final call.

## What it does

Scores the 25-point momentum checklist (PRD-001 REQ-038) and groups it into the
five weighted categories of REQ-032:

1. **Trend (25%)** — the 8-rule Minervini SEPA trend template: price above the
   50/150/200-day MAs, the MAs stacked 50>150>200, the 200-day rising, price
   within 25% of its 52-week high and at least 30% above its 52-week low.
2. **Momentum Power (25%)** — RSI(14) in 40-70, MACD above signal, ROC positive
   and rising, ADX>25, MFI(14) in 20-80, Bollinger %B in 0.5-1.0.
3. **Volume (20%)** — OBV trending up, volume above its 20-day average, the
   Accumulation/Distribution line rising, Volume ROC positive.
4. **Relative Performance (15%)** — Driehaus growth: earnings acceleration,
   positive earnings surprise, institutional accumulation (relative volume),
   relative strength vs the market index.
5. **Risk (15%)** — ATR/price under 6%, within 8% of support, no major
   resistance within 10%.

Each criterion passes/fails with a beginner-friendly explanation. The category
fractions are combined (TREND 25% / MOMENTUM POWER 25% / VOLUME 20% /
RELATIVE PERFORMANCE 15% / RISK 15%) into a 0..1 momentum score and mapped to a
Momentum Grade: A+ ≥0.9, A ≥0.8, B+ ≥0.7, B ≥0.6, C ≥0.5, D ≥0.4, F <0.4.
Output is a Thinking Card (see suite README).

## How to run

```bash
# input must follow the suite data contract and include at least 30 OHLCV bars
python3 scripts/screen.py --input data.json --pretty
cat data.json | python3 scripts/screen.py
```

Reads `ohlcv` (required, ≥30 bars; ≥200 for the full MA stack), optional
`fundamentals` (`eps_history` for earnings acceleration, `earnings_surprise`)
and optional `market_index` (relative strength). Returns `score` (0..1),
`confidence`, `rating` (the grade), `key_metrics` (overall count plus
criteria_met/total per category), `reasoning` (✓/✗/? per criterion) and `flags`.

Try it now with the shared fixture:

```bash
python3 scripts/screen.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `rating` A+/A — a textbook momentum leader; B+/B — qualifying with caveats;
  C and below — momentum is incomplete or fading.
- `key_metrics.overall_count` (e.g. "18/25") is the raw count of passed
  criteria; the weighted `score` can differ because categories are weighted.
- Criteria that need missing data (e.g. no `earnings_surprise`, no
  `market_index`) are marked `?`, **not counted**, and surfaced as a
  `missing:<field>` flag — never silently dropped.

## Notes

Indicator math lives in `scripts/indicators.py` (pure Python, copied from the
suite so this skill is self-contained). All 25 criteria, with beginner
explanations and Minervini/Driehaus attribution, are in
[references/CHECKLIST.md](references/CHECKLIST.md). Output is educational
analysis only, never financial advice.
