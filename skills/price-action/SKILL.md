---
name: price-action
description: Reads pure price action for a DSE stock — candlestick patterns, market structure (swing highs/lows, phase), and bar types (pin/inside/outside) — with location and trend context to rate setup quality, no indicators required. Use when the user asks about candlestick patterns, price action, market structure, "is there a hammer/engulfing/pin bar", swing highs/lows, or a no-indicator chart read for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model reasons over OHLC.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum"]
---

# Price Action

> **Prompt-first, pure-prompt skill.** No script — read the raw OHLC bars directly. Patterns
> only matter **in context** (location vs structure), so always weigh where the pattern occurs.

## Role & objective
Identify candlestick patterns and market structure and rate the resulting setup quality
(−1 bearish .. +1 bullish), confidence and rating — purely from price, no indicators.

## When to use
"Any candlestick pattern on GP?", "price action read", "market structure / swing points", "is
that a pin bar / engulfing?", "no-indicator chart read".

## Inputs you need
**`ohlcv`** — daily bars (need ≥3 for patterns; more for structure). Optional volume and
support/resistance levels for context.

## Method (follow in order)
1. **Candlestick patterns** — reversal (hammer, shooting star, engulfing, morning/evening star),
   continuation (three soldiers/crows), indecision (doji, spinning top, harami).
2. **Market structure** — swing highs/lows; phase (trending vs ranging); last swing high/low; is
   structure intact or broken?
3. **Bar types** — inside/outside bars, pin/rejection bars, momentum vs exhaustion bars.
4. **Context (weigh ~60%)** — pattern location vs support/resistance and trend; a hammer at
   support in an uptrend is strong; the same mid-range is weak.

## Scoring rubric
Base each pattern's signal by reliability, then multiply by context (location + trend
alignment). score = clamp(context-weighted pattern signal, −1, 1). Rating: ≥0.5 strong_bullish ·
≥0.15 bullish · −0.15..0.15 neutral · ≤−0.15 bearish · ≤−0.5 strong_bearish. Confidence rises
with multi-bar confirmation and supportive context.

## Output (emit this Thinking Card)
```json
{ "skill": "price-action", "ticker": "..", "mode": "momentum", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "..",
  "key_metrics": { "patterns": [{"pattern": "Bullish Engulfing", "location": "support",
    "reliability": 0.0}], "phase": "uptrend|range", "last_swing_high": 0, "last_swing_low": 0 },
  "reasoning": ["..."], "flags": ["insufficient_bars?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- Circuit-limited days produce distorted candles (truncated wicks/bodies) — don't read normal
  patterns into limit-up/limit-down bars; flag them.
- A pattern with no location/trend context is noise — context dominates the score.
- Thin trading creates erratic single bars — require confirmation before calling a reversal.

## Optional precision helper
No bundled script — pure-prompt skill. The `technical-analysis` script scores the latest
candlestick (hammer/star/engulfing) numerically if you want a cross-check.

## Worked example
Bullish engulfing at a tested support in an uptrend, confirmed next bar → reliability high ×
favourable context → score ≈ +0.6 → **strong_bullish**, confidence ≈ 0.7.

## References
See `technical-analysis/references/INDICATORS.md` (candlestick section).
Output is educational analysis only, never financial advice.
