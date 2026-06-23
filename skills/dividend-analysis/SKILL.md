---
name: dividend-analysis
description: Assesses dividend yield, payout sustainability, and growth for a DSE stock — current/forward yield, payout ratio, FCF coverage, dividend CAGR and consistency — for income-focused investors. Use when the user asks about dividend yield, is the dividend safe/sustainable, payout ratio, dividend growth/streak, income from a stock, or "is GP a good dividend stock" on the Dhaka Stock Exchange.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model computes from supplied fundamentals.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["investment"]
---

# Dividend Analysis

> **Prompt-first, pure-prompt skill.** No script — compute from the supplied dividend/earnings data.

## Role & objective
Judge a dividend's attractiveness and **safety**, returning a score (−1..+1), confidence and rating.

## When to use
"Is GP's dividend safe?", "dividend yield / payout ratio", "dividend growth streak", "income
from this stock". Pairs with `fundamental-analysis` and `value-investment-checklist`.

## Inputs you need
**`fundamentals`** — `price`, `annual_dividend`/`dividend_yield`, `eps_ttm`, `payout_ratio`,
`free_cash_flow`, `debt_to_equity`, and a `dividend_history[]` (years) for growth/consistency.

## Method (follow in order)
1. **Yield** — current = annual dividend / price; compare to 5-year average and the sector.
2. **Sustainability** — payout ratio (div/EPS); FCF coverage (FCF ≥ dividends?); debt burden;
   earnings stability. High payout (>80%) or FCF not covering it = risk.
3. **Growth** — dividend CAGR (1/3/5y), consistency, and streak of non-cut years; correlation
   with earnings growth.
4. **Income view** — total return (price + dividends); projected income.

## Scoring rubric
score = clamp(0.4·sustainability + 0.3·yield_attractiveness + 0.3·growth, −1, 1), where
sustainability is negative when payout >80% or FCF coverage <1. Rating: ≥0.5 strong_income ·
≥0.15 attractive · −0.15..0.15 fair · ≤−0.15 at_risk. Confidence rises with ≥5y history; cut it
when payout/coverage data is missing.

## Output (emit this Thinking Card)
```json
{ "skill": "dividend-analysis", "ticker": "..", "mode": "investment", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "strong_income|attractive|fair|at_risk",
  "key_metrics": { "dividend_yield": 0.0, "payout_ratio": 0.0, "fcf_coverage": 0.0,
    "cagr_5y": 0.0, "streak_years": 0 },
  "reasoning": ["..."], "flags": ["missing:payout_ratio?", "payout_above_80pct?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE firms often pay **stock dividends/bonus shares**, not just cash — separate cash yield from
  bonus issues; only cash covers income needs.
- A very high yield (>10%) often signals a falling price or an unsustainable payout — treat as a
  warning, not a positive.
- Payout >100% of earnings or uncovered by FCF is a red flag even with a long streak.

## Optional precision helper
No bundled script — pure-prompt skill. `fundamental-analysis` and `financial-terms-educator`
provide the underlying ratios and their good/bad bands.

## Worked example
Yield 7.3%, payout 88%, FCF coverage 1.1×, 5y CAGR 5%, no cuts → attractive yield but high
payout → sustainability modest → score ≈ +0.25 → **attractive** (watch payout), confidence ≈ 0.65.

## References
See `financial-terms-educator` glossary for dividend-yield/payout bands.
Output is educational analysis only, never financial advice.
