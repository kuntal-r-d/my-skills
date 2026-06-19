---
name: value-investment-checklist
description: Runs the 30-point value-investing checklist (Buffett 10, Lynch 8, Graham 8, Quality 4) over a DSE stock's fundamentals and returns a pass/fail with the actual value per criterion, weighted bucket scores and an Investment Grade (A+..F) with a 0-4.0 GPA. Use when the user wants a value screen, "is this a good long-term investment", Buffett/Graham/Lynch quality check, margin-of-safety/intrinsic-value read, or "does GP pass the value checklist" for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-001:REQ-039", "PRD-001:REQ-041"]
  mode: ["investment"]
---

# Value Investment Checklist

## When to use

Activate when a user wants a long-term value read on a DSE stock: "run the value
checklist on GP", "is BEXIMCO a good long-term investment?", "does this pass
Buffett's filters?", "what's the margin of safety here?", "Graham/Lynch quality
check". This is the value-leg companion to `fundamental-analysis`; feed its grade
into `signal-synthesizer` for the investment-mode verdict.

## What it does

Scores the 30-point value checklist (PRD-001 REQ-039) across four buckets:

1. **Buffett (10)** — economic moat, ROE>15%, D/E<0.5, profit margin>20%,
   positive FCF, quality management, predictable earnings, ≥25% below intrinsic
   value, understandable business, sustainable advantage.
2. **Lynch GARP (8)** — PEG<1.0, earnings growth 15-30%, revenue growth
   consistent with earnings, improving inventory turnover, insider buying,
   institutional ownership<60%, buyback, P/E below the growth rate.
3. **Graham (8)** — P/E<15, P/B<1.5, P/E×P/B<22.5, current ratio>2, pays a
   dividend, long-run earnings growth, price<67% NCAV, earnings stability.
4. **Quality (4)** — revenue growth beats inflation, healthy operating margin,
   ROA>5%, interest coverage>3.

Each criterion passes/fails with its **actual value** and a beginner-friendly
explanation.

## Scoring (REQ-041)

The three methodology buckets are weighted **Buffett 35% / Lynch 30% /
Graham 35%**. **Quality** is folded in as a fourth bucket given the *average* of
those three weights (~0.333). Each bucket's score is the fraction of its
*evaluable* criteria that pass; the four bucket fractions are weight-averaged and
renormalised so the weights sum to 1.0 (so a bucket with no usable data does not
penalise the total). The resulting 0..1 score maps to an Investment Grade with a
GPA: **A+** ≥0.90 (4.0), **A** ≥0.80 (3.7), **B+** ≥0.70 (3.3), **B** ≥0.60
(3.0), **C** ≥0.50 (2.0), **D** ≥0.40 (1.0), **F** <0.40 (0.0).

## How to run

```bash
python3 scripts/checklist.py --input data.json --pretty
cat data.json | python3 scripts/checklist.py
```

Reads `fundamentals` (required) and optional `macro.inflation` (defaults to 0.06
for the "growth beats inflation" check). Returns `score` (0..1), `confidence`,
`rating` (the grade), `key_metrics` (gpa, overall count, per-bucket scores),
`reasoning` (✓/✗/? per criterion) and `flags`.

Try it now with the shared fixture:

```bash
python3 scripts/checklist.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `rating` A+/A — a high-quality compounder at a sensible price; B — solid with
  gaps; C and below — quality or valuation concerns.
- `key_metrics.gpa` is the 0-4.0 academic-style grade-point.
- Criteria that need missing data (e.g. no `intrinsic_value`,
  `inventory_turnover`) are marked `?`, **not counted**, and surfaced as
  `missing:<field>` flags — never silently dropped.

## Notes

This skill is fundamentals-only and needs no price history, so it carries no
indicator module. All 30 criteria, with beginner explanations and
Buffett/Graham/Lynch attribution, are in
[references/CRITERIA.md](references/CRITERIA.md). Output is educational analysis
only, never financial advice.
