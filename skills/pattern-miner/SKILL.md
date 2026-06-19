---
name: pattern-miner
description: Discovers and out-of-sample validates recurring price patterns for one DSE ticker with anti-overfitting safeguards (train/holdout split, minimum occurrences, Bonferroni multiple-testing correction, auto-retirement of degraded patterns, manipulation-footprint warnings). Use when the user asks to mine, backtest, or validate chart patterns/setups, "which patterns actually work on this stock", "is this breakout signal reliable", or wants historical edge and forward-return statistics for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-107", "PRD-001:REQ-052"]
  mode: ["momentum"]
---

# Pattern Miner

## When to use

Activate when a user wants to know which rule-based price patterns have a *validated* edge
on a specific DSE stock: "mine patterns for GP", "backtest the 20-day breakout on BEXIMCO",
"does the oversold RSI bounce work here?", "which of my setups survive out-of-sample?".
This is the **Pattern Miner with anti-overfitting** (PRD-002 REQ-107; PRD-001 REQ-052).

## What it does

Tests a fixed library of rule-based candidate patterns and reports only those that survive
the safeguards in [references/PATTERNS.md](references/PATTERNS.md):

- **20-day high breakout** — close makes a new 20-bar high.
- **RSI oversold bounce** — RSI(14) crosses up through 30.
- **Golden cross** — MA50 crosses above MA200.
- **Upper-Bollinger close** — close above the upper 20/2 Bollinger band.

For each pattern it finds every historical occurrence, splits the series into a **train**
window (first 70%) and an out-of-sample **holdout** window (last 30%), and computes the
forward return over `forward_days` and the success rate (P(forward return > 0)) on each
window. A pattern is `validated` only if total occurrences ≥ `min_occurrences` **and** the
success rate clears `success_threshold` on **both** train and holdout. Degradation on the
holdout triggers `retired` (auto-retirement). A **Bonferroni** correction tightens the
threshold by the number of patterns tested. Occurrences with volume > 5× average or a
circuit-limit-sized move raise a `manipulation_footprint` warning.

## How to run

```bash
python3 scripts/mine.py --input data.json --pretty
cat data.json | python3 scripts/mine.py
```

Reads `ohlcv` (required, ≥120 bars recommended) and optional `params`
(`min_occurrences` default 8, `forward_days` default 5, `success_threshold` default 0.6).
Indicator math lives in `scripts/indicators.py`.

## Interpreting output

Returns `patterns[]` each with `occurrences`, `train_success`, `holdout_success`,
`avg_forward_return_pct`, `status` (`validated` / `retired` / `insufficient_data`), and
`warnings[]`; plus `validated_count`, a `methodology_note`, and `flags[]`. If nothing
survives, `validated_count` is 0 — the skill is deliberately honest about a null result.
Educational analysis only, never financial advice.
