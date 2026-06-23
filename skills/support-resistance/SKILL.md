---
name: support-resistance
description: Identifies key support and resistance price levels for a DSE stock from price pivots, volume nodes, round numbers, Fibonacci retracements and dynamic levels (MAs/VWAP/Bollinger), with level strength and breakout context. Use when the user asks "where's support/resistance", key levels, where to put a stop, breakout level, or "what price matters" for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model computes from supplied data.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Support & Resistance

> **Prompt-first, pure-prompt skill.** No script — derive levels from the supplied price/volume
> history using the method below.

## Role & objective
Find significant support/resistance levels and zones, rate their strength, and locate the
stock relative to the nearest level, with breakout context.

## When to use
"Where's support/resistance for GP?", "key levels", "where should my stop go?", "breakout
level", "what price matters". Pairs with `risk-manager` for stop placement.

## Inputs you need
**`ohlcv`** — daily bars, oldest-first, **≥100** for reliable levels. Volume informs level strength.

## Method (follow in order)
1. **Static levels** — prior swing highs/lows (pivots); high-volume price nodes; round-number
   psychological levels; Fibonacci retracements of the last major swing.
2. **Strength** — score each level by touch count, volume transacted there, time spent, and
   bounce magnitude.
3. **Dynamic levels** — 50/200 SMA, VWAP, Bollinger band extremes as moving S/R.
4. **Zones** — cluster nearby levels into zones (±2–3% of price); note confluence.
5. **Breakout context** — is price pressing a level? what volume would confirm a break vs a fake-out?

## Scoring rubric
This skill outputs **levels**, not a directional score; report `score` as the normalised
range-position (0 at support, 1 at resistance) for downstream use. Rank levels by the strength
score above (touches + volume + time + bounce). Confidence rises with touch count and history length.

## Output (emit this Thinking Card)
```json
{ "skill": "support-resistance", "ticker": "..", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "near_support|mid_range|near_resistance",
  "key_metrics": { "support_levels": [{"price": 0, "strength": 0.0, "touches": 0}],
    "resistance_levels": [{"price": 0, "strength": 0.0, "touches": 0}],
    "nearest_support": 0, "nearest_resistance": 0, "range_position": 0.0 },
  "reasoning": ["..."], "flags": ["limited_history_<100_bars?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE round numbers and circuit-limit prices act as strong psychological levels — include them.
- Thin volume makes a "level" unreliable — weight volume-confirmed levels higher.
- Treat levels as zones, not exact prices; price rarely respects a single tick.

## Optional precision helper
No bundled script — pure-prompt skill. For exact MA/Bollinger/VWAP values use the
`technical-analysis` indicators.

## Worked example
60-bar support 98.8 (5 touches, high volume) and resistance 112.3 (4 touches); price 105.7 →
range_position ≈ 0.51 (**mid_range**); a close >112.3 on >1.5× volume would confirm a breakout.

## References
See `technical-analysis/references/INDICATORS.md`.
Output is educational analysis only, never financial advice.
