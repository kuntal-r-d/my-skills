---
name: technical-analysis
description: Runs a DSE Technical Analysis Committee over a stock's OHLCV history and returns a weighted technical score, rating, and reasoning. Use when the user asks for technical analysis, momentum/trend read, chart signal, RSI/MACD/ADX/Bollinger/volume analysis, or "is this stock technically bullish/bearish" for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-017", "PRD-002:REQ-098..103", "PRD-001:REQ-003", "PRD-001:REQ-013", "PRD-001:REQ-021", "PRD-001:REQ-028", "PRD-001:REQ-032"]
  mode: ["momentum", "investment"]
---

# Technical Analysis

## When to use

Activate when a user wants a technical read on a DSE stock: "analyze the chart for GP",
"is BEXIMCO technically bullish?", "what do RSI and MACD say?", "run technical analysis".
This skill is the technical leg of the dual-mode signal — pair it with `momentum-screen`
for trade setups, or feed its score into `signal-synthesizer`.

## What it does

Implements the six-member Technical Committee plus a Chair (PRD-002 FR-AG-2, FR-AG-13..18):

1. **Trend** — 50/150/200 SMA stack, price vs 200-day, ADX trend strength (+DI/-DI).
2. **Momentum & Oscillator** — RSI(14), MACD, ROC(12), MFI(14).
3. **Chart Pattern** — breakout/breakdown vs 40-bar range, consolidation tightness.
4. **Candlestick** — hammer, shooting star, bullish engulfing on the latest bars.
5. **Levels** — 60-bar support/resistance, distance-to-support, range position.
6. **Volume & Flow** — OBV slope (accumulation/distribution), relative volume vs 20-day avg.

The Chair aggregates members with the weights in `scripts/analyze.py` (`WEIGHTS`), notes
agreement vs conflict (e.g. "pattern bullish but volume not confirming → downgraded"), and
downgrades confidence when members disagree. Output is a Thinking Card (see suite README).

## How to run

```bash
# input must follow the suite data contract and include at least 30 OHLCV bars
python3 scripts/analyze.py --input data.json --pretty
cat data.json | python3 scripts/analyze.py
```

Reads `ohlcv` (required, ≥30 bars; ≥200 for full MA stack), optional `microstructure`
(flags circuit-limit / floor-price conditions) and `mode`. Returns `score` (-1..+1),
`confidence` (0..1), `rating`, `sub_scores` per member, `key_metrics`, and `reasoning`.

Try it now with the shared fixture:

```bash
python3 scripts/analyze.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `score ≥ 0.5` strong_bullish, `0.15..0.5` bullish, `-0.15..0.15` neutral, etc.
- Low `confidence` with a `chair_note` about conflict means members disagree — treat as
  "stand aside" rather than a weak buy.
- `flags` carry confidence penalties (e.g. `limited_history_<200_bars`,
  `microstructure_circuit_or_floor`) — never silently dropped.

## Notes

Indicator math lives in `scripts/indicators.py` (pure Python, reusable). Formula definitions
and DSE-specific caveats are in [references/INDICATORS.md](references/INDICATORS.md).
Output is educational analysis only, never financial advice.
