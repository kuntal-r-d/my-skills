---
name: <skill-id>
description: <one trigger-rich sentence — what it does + "Use when the user asks ..." with verbs and synonyms so the right skill activates>
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the optional script absent. Script (if any) is stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.1.0"
  mode: ["momentum", "investment"]
---

# <Skill Title>

> **Prompt-first skill.** This SKILL.md is the source of truth — follow the method
> below with your own reasoning. The `scripts/` helper (if present) is OPTIONAL: run
> it only for exact math, then interpret its output per "Optional precision helper".

## Role & objective
You are <analyst persona>. Goal: <single-sentence outcome>.

## When to use
<trigger phrases the user might say>.

## Inputs you need
Gather these via the `dse-data-acquisition` skill, then use: <fields + minimums,
e.g. `ohlcv` ≥30 daily bars>. If a required input is missing, state what's missing
and stop — **never invent data**.

## Method (follow in order)
1. **<Step name>** — <exactly what to compute/check> → <how to read it / score contribution>.
2. **<Step name>** — ...
   <Keep each step concrete: thresholds, comparisons, what bullish vs bearish looks like.>

## Scoring rubric
<Per-step weights that sum to 1.0> → combine to a composite score in −1..+1 →
map to a rating with explicit thresholds. Note agreement vs conflict and downgrade
confidence when steps disagree. State the confidence formula.

## Output (emit this Thinking Card)
```json
{ "skill": "<skill-id>", "ticker": "..", "mode": "..", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "..",
  "key_metrics": { }, "reasoning": ["..."], "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
<Circuit limits, floor prices, thin liquidity, limited history, etc. → flag and
downgrade confidence rather than dropping silently.>

## Optional precision helper
`python3 scripts/<x>.py --input data.json --pretty` returns <fields>. Run it for
exact numbers; interpret <field> as <meaning>. **The analysis is valid without it** —
the script must agree with the method above, not replace it.

## Worked example
<short input → expected reasoning + resulting Thinking Card>

## References
See [references/METHODOLOGY.md](references/METHODOLOGY.md) for formulas and DSE caveats.
