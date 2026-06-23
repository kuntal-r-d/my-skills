---
name: earnings-forecast
description: Projects future earnings for a DSE stock from historical EPS/revenue trends, seasonality and growth drivers, with an earnings-quality check and an explicit confidence band. Use when the user asks to forecast/project earnings or EPS, next-quarter or next-year estimate, earnings growth outlook, earnings quality, or "what will GP earn" on the Dhaka Stock Exchange.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model projects from supplied history.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["investment"]
---

# Earnings Forecast

> **Prompt-first, pure-prompt skill.** No script — project from the supplied earnings history.
> Always state assumptions and a confidence band; never present a point estimate as certain.

## Role & objective
Project near-term earnings (next quarter / next year) with a growth rate, an earnings-quality
read, and an explicit uncertainty band. Output a normalised score for the earnings outlook.

## When to use
"Forecast GP's EPS", "next-year earnings estimate", "earnings growth outlook", "is the earnings
quality good?". Feed the growth view into `fundamental-analysis`.

## Inputs you need
**`fundamentals`** — `eps_history[]` (≥12 quarters ideal), `revenue_history[]`, `eps_ttm`,
margins, and optional analyst `estimates`/`earnings_surprise` history.

## Method (follow in order)
1. **Historical trend** — growth rate from EPS history; detect seasonality and cyclicality.
2. **Projection** — simple trend/exponential-smoothing projection of next quarter & year; widen
   the band when history is short or volatile.
3. **Earnings quality** — accruals vs cash earnings, one-time items, core vs reported EPS.
4. **Growth drivers** — revenue growth, margin trend, operating leverage.
5. **Estimate context** — consensus, revision trend, surprise/beat history if supplied.

## Scoring rubric
score = clamp(projected growth / 0.15, −1, 1) (≈15% growth → full positive), adjusted down for
poor earnings quality. Rating: ≥0.5 strong_growth · ≥0.15 growth · −0.15..0.15 flat · ≤−0.15
declining. **Confidence** is low by default (forecasting is uncertain): higher with ≥12 quarters,
stable margins, and consistent beats; lower with short/volatile history (state the band).

## Output (emit this Thinking Card)
```json
{ "skill": "earnings-forecast", "ticker": "..", "mode": "investment", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "strong_growth|growth|flat|declining",
  "key_metrics": { "ttm_eps": 0, "next_year_eps": 0, "growth_rate": 0.0,
    "band_low": 0, "band_high": 0, "earnings_quality": 0.0 },
  "reasoning": ["assumptions + drivers"], "flags": ["short_history?", "low_earnings_quality?"],
  "disclaimer": "Educational analysis only. Not financial advice. Forecasts are uncertain." }
```

## DSE pitfalls
- DSE disclosure is often annual/semi-annual and lumpy — short history → wide band, low confidence.
- One-off gains (asset sales, revaluations) inflate reported EPS — strip them for core earnings.
- Don't extrapolate a single strong quarter; weight the trend and seasonality.

## Optional precision helper
No bundled script — pure-prompt skill. Use `fundamental-analysis` for the valuation that
consumes this growth estimate.

## Worked example
8 quarters, EPS CAGR ~16%, stable margins, 2 recent beats, clean accruals → next-year EPS +16%
(band ±5%) → score ≈ +1.0 capped → **strong_growth**, confidence ≈ 0.6 (state the band).

## References
See `fundamental-analysis/references/VALUATION.md` for how growth feeds fair value.
Output is educational analysis only, never financial advice.
