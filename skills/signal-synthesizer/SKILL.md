---
name: signal-synthesizer
description: Combines per-agent DSE sub-scores (technical, fundamental, smart-money, sentiment, macro, volume-flow) into two synthesized signals — a long-term Investment signal and a short-term Momentum signal — each with a 1-10 DSE Composite Score, rating, confluence/conflict logic, and microstructure suppression. Use when the user wants to fuse multiple analyses into a final call, asks "what's the overall signal", "combine the agent scores", "should I invest or trade this", or needs the Mode Router / composite score for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-022", "PRD-002:REQ-111", "PRD-002:REQ-097"]
  mode: ["investment", "momentum"]
---

# Signal Synthesizer

## When to use

Activate when individual committee skills (`technical-analysis`, `fundamental-analysis`,
`smart-money-flow`, `sentiment-news`, `macro-regime`, …) have each produced a score and the
user wants the *final fused call*: "combine these into one signal", "what's the overall
rating for GP", "is this an investment or a trade", "give me the composite score". This skill
is the Mode Router + Synthesizer (PRD-002 REQ-022) and emits the DSE Composite Score
(REQ-111) for **both** modes at once.

## What it does

Takes an `agents` map of sub-scores and produces two independent signals:

1. **Investment** — weighted toward fundamentals/smart-money/macro. Emits a rating,
   fair-value/entry-zone note, a thesis, and exit conditions.
2. **Momentum** — weighted toward technical/volume-flow. Fundamentals act as a **veto**
   (a strongly broken business caps a momentum trade at `stand_aside`).

It applies three governance rules on top of the weighted averages:

- **Confluence** — a high-conviction call (|weighted| ≥ 0.5) is only kept if **≥ 2
  independent agents agree in sign** with |score| ≥ 0.3; otherwise it is downgraded to a
  moderate rating.
- **Strong conflict** — if a strongly bullish agent (≥ 0.5) and a strongly bearish agent
  (≤ -0.5) coexist, the signal is **`stand_aside`** (not a diluted average), and the
  conflict is explained.
- **Microstructure suppression (REQ-097)** — if the stock is at a circuit limit
  (`limit_up`/`limit_down`), on a floor price, or halted, the **Momentum** signal is
  `suppressed` (price discovery is interrupted); the Investment signal is still emitted with
  a microstructure flag.

Each weighted score (-1..+1) maps to a **DSE Composite Score 1-10** (rounded), and per-agent
contributions (weight × score) are returned so the composite is fully decomposable.

## How to run

```bash
python3 scripts/synthesize.py --input data.json --pretty
cat data.json | python3 scripts/synthesize.py
```

Input shape:

```json
{
  "ticker": "GP",
  "as_of": "2026-06-19",
  "agents": {
    "technical":   {"score": 0.40, "confidence": 0.70},
    "fundamental": {"score": 0.60, "confidence": 0.80},
    "smart_money": {"score": 0.30, "confidence": 0.60},
    "sentiment":   {"score": 0.20, "confidence": 0.50},
    "macro":       {"score": -0.10, "confidence": 0.60},
    "volume_flow": {"score": 0.35, "confidence": 0.65}
  },
  "microstructure": {"circuit_state": "normal", "floor_price": null, "halted": false}
}
```

`volume_flow` is optional — if absent it is derived from the `technical` score.
Scores are clamped to [-1, +1] and confidences to [0, 1].

## Interpreting output

- `investment` and `momentum` blocks each carry `score` (-1..+1), `composite_1_10`,
  `rating`, `confidence`, and decomposable `contributions`.
- Ratings: `strong_buy`, `buy`, `hold`, `sell`, `stand_aside`, `suppressed`.
- `stand_aside` means the synthesizer found a genuine conflict — do **not** read it as a weak
  buy. `suppressed` means price discovery is interrupted (circuit/floor/halt).
- `flags` carry penalties and microstructure notes; they are never silently dropped.

## Notes

Weights, the confluence/conflict logic, the composite-score mapping, and microstructure
suppression are documented in [references/SYNTHESIS.md](references/SYNTHESIS.md).
Output is educational analysis only, never financial advice.
