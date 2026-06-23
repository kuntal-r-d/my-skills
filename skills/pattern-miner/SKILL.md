---
name: pattern-miner
description: Discovers and out-of-sample validates recurring price patterns for one DSE ticker with anti-overfitting safeguards (train/holdout split, minimum occurrences, Bonferroni multiple-testing correction, auto-retirement of degraded patterns, manipulation-footprint warnings). Use when the user asks to mine, backtest, or validate chart patterns/setups, "which patterns actually work on this stock", "is this breakout signal reliable", or wants historical edge and forward-return statistics for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum"]
---

# Pattern Miner

> **Prompt-first skill.** Test the pattern library by the safeguards below. `scripts/mine.py`
> is OPTIONAL but recommended here — the train/holdout arithmetic is fiddly; use it for exact
> forward-return stats. The discipline matters more than any single number: never report an
> in-sample edge without an out-of-sample check.

## Role & objective
You mine a fixed library of rule-based price patterns on one ticker's history and report each
pattern's occurrence count, train/holdout success and forward return, with anti-overfitting
safeguards — so the user trusts only patterns that survive out-of-sample.

## When to use
"Which patterns actually work on GP?", "is this breakout signal reliable?", "backtest this
setup", "historical edge / forward returns". Pair with `technical-analysis` for the live read.

## Inputs you need
**`ohlcv`** — daily bars, **≥60** (≥120 recommended; flag `limited_history_<120_bars` below).
Optional **`params`**: `min_occurrences` (8), `forward_days` (5), `success_threshold` (0.6).

## Method (follow in order)
1. **Split** history: train = first 70%, holdout = last 30% (out-of-sample).
2. **Detect** four candidate patterns: 20-day high breakout; RSI(14) cross up through 30
   (oversold bounce); golden cross (MA50 crosses above MA200); close above upper Bollinger band.
3. For each occurrence with a full forward window, record the `forward_days` return; success =
   return > 0.
4. **Flag manipulation footprints** (don't drop): volume > 5× trailing avg, or a daily move ≥ 9.5%
   (circuit-sized).

## Scoring rubric (validation, not a single score)
Raise the success bar by a Bonferroni bump for 4 tests: `adj_threshold = min(0.95,
success_threshold + 0.0375)`. Per pattern:
- **validated** if occurrences ≥ min_occurrences AND train_success ≥ adj AND holdout_success ≥ adj;
- **retired** if it passes in-sample but fails the holdout (or fails outright);
- **insufficient_data** if too few occurrences or an empty window.

## Output
```json
{ "skill": "pattern-miner", "ticker": "..", "as_of": "..",
  "patterns": [ { "name": "..", "occurrences": 0, "train_occurrences": 0, "holdout_occurrences": 0,
    "train_success": 0.0, "holdout_success": 0.0, "avg_forward_return_pct": 0.0,
    "status": "validated|retired|insufficient_data", "warnings": [] } ],
  "validated_count": 0, "methodology_note": "..", "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Overfitting is the enemy** — a great train success means nothing without the holdout; report both.
- **Manipulation footprints** (volume spikes, circuit-sized moves) inflate apparent edges on DSE —
  always surface the warning.
- Short histories (<120 bars) give too few occurrences to trust — flag and lower conviction.

## Optional precision helper
```bash
python3 scripts/mine.py --input data.json --pretty
```
Returns each pattern's exact train/holdout success, forward returns, status and warnings.

## Worked example
240 bars: "20-day high breakout" 14 occ, train 0.71 / holdout 0.64 (both ≥ 0.6375) → **validated**,
avg forward +2.1%. "Golden cross" 3 occ → **insufficient_data**.

## References
Pattern library & safeguards: [references/PATTERNS.md](references/PATTERNS.md).
Output is educational analysis only, never financial advice.
