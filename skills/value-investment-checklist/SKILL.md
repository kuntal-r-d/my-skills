---
name: value-investment-checklist
description: Runs the 30-point value-investing checklist (Buffett 10, Lynch 8, Graham 8, Quality 4) over a DSE stock's fundamentals and returns a pass/fail with the actual value per criterion, weighted bucket scores and an Investment Grade (A+..F) with a 0-4.0 GPA. Use when the user wants a value screen, "is this a good long-term investment", Buffett/Graham/Lynch quality check, margin-of-safety/intrinsic-value read, or "does GP pass the value checklist" for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-001:REQ-039", "PRD-001:REQ-041"]
  mode: ["investment"]
---

# Value-Investment Checklist

> **Prompt-first skill.** Score the 30 criteria by reasoning over `fundamentals`.
> `scripts/checklist.py` is OPTIONAL. Score only criteria you can evaluate; surface the rest
> as `missing:<field>` and don't count them.

## Role & objective
You run a 30-point value checklist across four schools — Buffett, Lynch (GARP), Graham, and
Quality — and return a weighted Investment Grade (A+..F) with a 0–4.0 GPA.

## When to use
"Is this a good long-term investment?", "does GP pass the value checklist?", "Buffett/Graham
quality check", "margin of safety". Pair with `fundamental-analysis` for the fair-value range.

## Inputs you need
Gather via `dse-data-acquisition` → **`fundamentals`** (roe, debt_to_equity, profit_margin,
free_cash_flow, eps_history, pe, pb, peg, earnings_growth, current_ratio, dividend_yield,
institutional_ownership, intrinsic/fair value, etc.). Optional `macro.inflation` (Quality check).

## Method — score each criterion pass/fail, grouped in 4 weighted buckets
Mark a criterion `?` (not counted) when its field is missing.

**Buffett (weight 0.35):** economic moat; ROE > 15%; Debt/Equity < 0.5; profit margin > 20%;
free cash flow positive; quality management (ROE>15% & margin>15%); predictable earnings (all
EPS history positive); ≥25% below intrinsic value (margin of safety); business understandable;
sustainable competitive advantage.

**Lynch / GARP (weight 0.30):** PEG < 1.0; earnings growth 15–30%; revenue growth consistent
with earnings (±10pp); inventory turnover improving; insider buying; institutional ownership
< 60%; share buyback in place; P/E < earnings-growth rate.

**Graham (weight 0.35):** P/E < 15; P/B < 1.5; P/E × P/B < 22.5 (Graham number); current
ratio > 2; pays a dividend; (plus the remaining classic safety/earnings-stability checks).

**Quality (weight ≈0.333):** the four quality criteria, including growth beats inflation
(uses `macro.inflation`, default 6%).

## Scoring rubric
Each bucket score = (criteria passed)/(criteria evaluable). The four bucket fractions are
weight-averaged (Buffett .35, Lynch .30, Graham .35, Quality ≈.333) and renormalised to sum
to 1.0 → overall 0..1 score.

Grade & GPA: **≥0.90** A+ (4.0) · **≥0.80** A (3.7) · **≥0.70** B+ (3.3) · **≥0.60** B (3.0) ·
**≥0.50** C (2.0) · **≥0.40** D (1.0) · else **F** (0.0).

**Confidence** rises with the fraction of criteria evaluable; lower it when many fields are missing.

## Output (emit this Thinking Card)
```json
{ "skill": "value-investment-checklist", "ticker": "..", "mode": "investment", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "B+",
  "key_metrics": { "gpa": 3.3, "overall_count": "10/30", "criteria_passed": 0,
    "criteria_evaluated": 0, "buckets": { "buffett": {"criteria_met": 0, "total": 0, "fraction": 0.0} } },
  "reasoning": ["✓/✗/? criterion — beginner-friendly why"], "flags": ["missing:<field>"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE disclosure is patchy — many criteria will be `?` (not counted); grade on what's
  evaluable and surface `missing:<field>` rather than failing unknowns.
- US-calibrated thresholds (P/E<15, margin>20%) are strict for DSE sectors — report the actual
  values so the user can judge in local context.
- A high grade on 8/30 evaluable criteria is low-confidence — say so.

## Optional precision helper
```bash
python3 scripts/checklist.py --input data.json --pretty
```
Returns each criterion's pass/fail with its actual value, the bucket fractions, GPA and grade.

## Worked example
LHB (partial data): Buffett 6/7, Lynch 1/2, Graham 3/4, Quality 0/0 evaluable → weighted ≈ 0.71
→ **B+**, GPA 3.3, with several `?` criteria flagged for missing fields.

## References
Full 30 criteria & thresholds: [references/CRITERIA.md](references/CRITERIA.md).
Output is educational analysis only, never financial advice.
