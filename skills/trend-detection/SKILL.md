---
name: trend-detection
description: Detects trend direction, strength, and reversal risk for a DSE stock from OHLCV using moving averages, ADX, price structure (higher highs/lower lows), and multi-timeframe alignment. Use when the user asks "what's the trend", "is GP trending up or down", trend strength, MA crossover, higher-highs/lower-lows read, or reversal warning for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model computes from supplied data.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Trend Detection

> **Prompt-first, pure-prompt skill.** No script is bundled — reason directly over the data
> using the method below and emit the Thinking Card. Pairs with `technical-analysis`.

## Role & objective
Determine the prevailing trend's direction, strength and reversal risk, returning a score
(−1..+1 = down..up), confidence and a rating.

## When to use
"What's the trend on GP?", "is this trending up?", "trend strength / ADX read", "any reversal
signs?", "MA crossover". Feed the score into `signal-synthesizer` as a technical input.

## Inputs you need
**`ohlcv`** — daily bars, oldest-first, **≥50** (more for weekly/monthly context). Optional
higher-timeframe series for multi-timeframe alignment.

## Method (follow in order)
1. **Direction** — price vs 50/150/200 SMA; MA stack 50>150>200 (up) or 50<150<200 (down).
2. **Structure** — higher-highs & higher-lows (uptrend) vs lower-highs & lower-lows (downtrend).
3. **Strength** — ADX(14): ≥25 strong, 20–25 borderline, <20 weak/range; +DI vs −DI for direction.
4. **Multi-timeframe** — note daily/weekly/monthly agreement (confluence) or conflict.
5. **Reversal risk** — price-vs-momentum divergence, volume climax, break of trendline/structure.

## Scoring rubric
Combine: direction (±0.4 by MA stack & price), structure (±0.3), strength (×ADX gate: full
weight if ADX≥25, half if 20–25, near-zero if <20). Clamp to −1..+1.
Rating: ≥0.5 strong_uptrend · ≥0.15 uptrend · −0.15..0.15 sideways · ≤−0.15 downtrend · ≤−0.5 strong_downtrend.
Confidence rises with timeframe agreement and ADX; cut it on divergence or <50 bars.

## Output (emit this Thinking Card)
```json
{ "skill": "trend-detection", "ticker": "..", "mode": "..", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "uptrend|sideways|downtrend|..",
  "key_metrics": { "adx_14": 0, "ma_stack": "50>150>200", "structure": "HH/HL",
    "timeframes": {"daily": "..", "weekly": ".."} },
  "reasoning": ["..."], "flags": ["limited_history_<50_bars?", "reversal_divergence?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- Low ADX (<20) means no real trend — don't read direction into chop; say "sideways".
- Monthly trends on DSE can lag thin trading — weight daily/weekly, note the monthly caveat.
- A reversal signal without volume/structure confirmation is weak — flag, don't over-call.

## Optional precision helper
No bundled script — this is a pure-prompt skill. For exact MTF values, use the
`multi_timeframe` skill (deterministic daily/weekly/monthly confluence in momentum mode),
or `technical-analysis` for ADX/MA values.

## Worked example
Price above a rising 50>150>200 stack, ADX 30 (+DI leading), HH/HL structure, daily+weekly up,
monthly sideways → score ≈ +0.7 → **uptrend (strong)**, confidence ≈ 0.8.

## References
See `technical-analysis/references/INDICATORS.md` for indicator formulas.
Output is educational analysis only, never financial advice.
