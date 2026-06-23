---
name: signal-synthesizer
description: Combines per-agent DSE sub-scores (technical, fundamental, smart-money, sentiment, macro, volume-flow) into two synthesized signals — a long-term Investment signal and a short-term Momentum signal — each with a 1-10 DSE Composite Score, rating, confluence/conflict logic, and microstructure suppression. Use when the user wants to fuse multiple analyses into a final call, asks "what's the overall signal", "combine the agent scores", "should I invest or trade this", or needs the Mode Router / composite score for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-002:REQ-022"]
  mode: ["momentum", "investment"]
---

# Signal Synthesizer

> **Prompt-first skill.** Fuse the agent scores by following the rules below.
> `scripts/synthesize.py` is OPTIONAL — run it for exact weighting; the synthesis is valid
> without it. Produce ONE card holding two signals (investment + momentum).

## Role & objective
You are the Mode Router. Goal: blend per-agent sub-scores into a long-term **Investment**
signal and a short-term **Momentum** signal, each with a rating, confidence, a 1–10
Composite Score, and confluence/conflict governance.

## When to use
"What's the overall signal?", "combine the agent scores", "should I invest or trade this?".
Run after the leaf skills; feed the chosen signal into `risk-manager`.

## Inputs you need
**`agents`** — a map of `{score −1..+1, confidence 0..1}` for any of: `technical`,
`fundamental`, `smart_money`, `sentiment`, `macro`, `volume_flow`. Need at least `technical`
**or** `fundamental`. Optional `microstructure`. If `volume_flow` is absent, derive it as
0.8× technical (flag `volume_flow_derived_from_technical`).

## Method (follow in order)
**1. Weighted score per lens** (renormalise weights over agents actually present):
- **Investment:** fundamental .40, smart_money .20, macro .15, sentiment .15, technical .10.
- **Momentum:** technical .45, volume_flow .20, smart_money .15, sentiment .12, fundamental .08 (veto-only).

**2. Base rating** from weighted w: ≥0.50 strong_buy · ≥0.15 buy · −0.15..0.15 hold ·
≤−0.15 sell.

**3. Governance**
- **Strong conflict:** any agent ≥0.50 AND any ≤−0.50 → **stand_aside** (don't average); −0.2 confidence.
- **Confluence:** if |w| ≥ 0.50, need ≥2 agents agreeing in sign at |score| ≥ 0.30; else
  downgrade (strong_buy→buy, sell→hold) and −0.1 confidence.
- **Momentum fundamental veto:** if fundamental < −0.50 → momentum capped at **stand_aside**.
- **Microstructure:** circuit limit / floor / halt → momentum **suppressed**; investment keeps
  thesis but defer execution.

**4. Composite 1–10** = round(clamp(5.5 + 4.5·w, 1, 10)).

**Confidence** per lens = weight-blended agent confidence (after the governance penalties above).

## Scoring rubric
Per lens: weighted score w (renormalised weights) → rating (≥0.50 strong_buy · ≥0.15 buy ·
−0.15..0.15 hold · ≤−0.15 sell), then apply governance (strong-conflict → stand_aside;
confluence shortfall → downgrade + −0.1 conf; momentum fundamental veto; microstructure
suppression). Composite 1–10 = round(clamp(5.5 + 4.5·w, 1, 10)). Report both Investment and
Momentum signals even when they disagree.

## Output (emit this Thinking Card)
```json
{ "skill": "signal-synthesizer", "ticker": "..", "as_of": "..",
  "investment": { "score": 0.0, "composite_1_10": 5, "rating": "..", "confidence": 0.0,
    "contributions": {}, "fair_value_note": "..", "thesis": "..", "exit_conditions": [], "reasoning": [] },
  "momentum": { "score": 0.0, "composite_1_10": 5, "rating": "..", "confidence": 0.0,
    "contributions": {}, "entry_trigger": "..", "stop_note": "..", "reasoning": [] },
  "flags": ["..."], "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Circuit/floor/halt** suppress momentum entirely — technicals are unreliable without price discovery.
- A high average that lacks confluence is a false-confidence trap — downgrade it.
- Investment and momentum can legitimately disagree (e.g. cheap but no momentum) — report both honestly.

## Optional precision helper
```bash
python3 scripts/synthesize.py --input data.json --pretty
```
Input shape: `{"ticker":"..","agents":{"technical":{"score":..,"confidence":..}, ...}}`.
Returns both signals with exact contributions and composite scores.

## Worked example
agents technical +0.55/0.77, fundamental +0.44/0.62, smart_money +0.2, macro 0, sentiment +0.1
→ investment w ≈ +0.32 → **buy**, composite ≈ 7; momentum w ≈ +0.45, ≥2 agents agree → **buy**, composite ≈ 8.

## References
Synthesis & governance detail: [references/SYNTHESIS.md](references/SYNTHESIS.md).
Output is educational analysis only, never financial advice.
