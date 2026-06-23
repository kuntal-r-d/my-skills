---
name: volume-analysis
description: Analyzes trading-volume patterns for a DSE stock — OBV, relative volume, volume spikes/divergence, Chaikin money flow and a simple volume profile — to confirm or question price moves and flag accumulation/distribution. Use when the user asks "is volume confirming this move", OBV/money-flow read, volume spike, accumulation vs distribution, or whether a breakout has volume behind it for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model computes from supplied data.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum"]
---

# Volume Analysis

> **Prompt-first, pure-prompt skill.** No script — reason over the supplied volume/price history.

## Role & objective
Judge whether volume confirms the price move and whether flow looks like accumulation or
distribution, returning a score (−1 distribution .. +1 accumulation), confidence and rating.

## When to use
"Is volume confirming this breakout?", "OBV read", "volume spike?", "accumulation or
distribution?". Feed into `technical-analysis`/`signal-synthesizer` as a flow input.

## Inputs you need
**`ohlcv`** — daily bars with volume, oldest-first, **≥20** (≥60 for profile). Higher-frequency
volume improves spike/block detection but isn't required.

## Method (follow in order)
1. **Relative volume** — today vs 20-day average: ≥1.5× confirms, <0.7× is thin.
2. **OBV trend** — rising = accumulation, falling = distribution (last ~10 bars).
3. **Volume–price divergence** — price up on falling volume (weak) or down on rising volume (distribution).
4. **Money flow** — Chaikin/MFI direction as accumulation/distribution corroboration.
5. **Profile (if enough bars)** — point of control and value area; note high/low-volume nodes.

## Scoring rubric
score = clamp(0.3·OBV_direction + 0.3·rel_volume_signal + 0.2·money_flow + 0.2·(−divergence), −1, 1).
Rating: ≥0.2 accumulation · ≤−0.2 distribution · else neutral. Confidence rises with history
length and clear (non-divergent) signals.

## Output (emit this Thinking Card)
```json
{ "skill": "volume-analysis", "ticker": "..", "mode": "momentum", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "accumulation|neutral|distribution",
  "key_metrics": { "rel_volume": 0.0, "obv_trend": "rising|falling", "divergence": false,
    "point_of_control": 0 },
  "reasoning": ["..."], "flags": ["thin_volume?", "limited_history?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE volume is spiky and can be manipulated — a single huge bar isn't a trend; flag suspected
  spikes (>5× average) rather than treating them as clean accumulation.
- Breakouts on thin volume are the classic DSE fake-out — withhold confirmation.
- Volume profile needs enough bars; with <60 say so and lean on OBV + relative volume.

## Optional precision helper
No bundled script — pure-prompt skill. For exact OBV/MFI/rel-volume use the
`technical-analysis` indicators (same definitions).

## Worked example
Breakout day on 1.8× average volume, OBV rising, no divergence, MFI 62 → score ≈ +0.6 →
**accumulation**, confidence ≈ 0.7; volume confirms the move.

## References
See `technical-analysis/references/INDICATORS.md`.
Output is educational analysis only, never financial advice.
