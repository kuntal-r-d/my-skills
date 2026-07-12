---
name: momentum-screen
description: Deprecated shim — returns Minervini SEPA only. Use minervini-sepa, can-slim, darvas-box, livermore-pivot, or analyze_ticker momentum/full mode for all four master strategies.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-026", "PRD-001:REQ-027", "PRD-001:REQ-032"]
  mode: ["momentum"]
---

# Momentum Screen

> **Prompt-first skill.** Score the 25-point checklist by reasoning over the data.
> `scripts/screen.py` is OPTIONAL — run it for exact indicator values; the screen is
> valid without it. Score only criteria you can evaluate; mark the rest "not counted".

## Role & objective
You are a momentum screener (Minervini SEPA + Driehaus). Goal: check 25 criteria across 5
categories, report pass/fail with a beginner-friendly reason each, and map a
category-weighted score (0..1) to a Momentum Grade A+..F.

## When to use
"Is GP a momentum buy?", "does this qualify as a leader?", "trend-template / SEPA check",
"relative-strength read". Pair with `technical-analysis`; size entries with `risk-manager`.

## Inputs you need
Gather via `dse-data-acquisition`:
- **`ohlcv`** — daily bars, oldest-first, **≥30** (≥200 for the full MA stack).
- *(optional)* **`fundamentals.eps_history`**, `earnings_surprise` (Driehaus checks).
- *(optional)* **`market_index`** close series (relative strength).

## Method — 25 criteria in 5 weighted categories
Each criterion is pass/fail; if its data is missing, mark it "not counted" (don't guess).

**Trend — Minervini SEPA (weight 0.25):** 1) close > 50-MA; 2) close > 150-MA; 3) close >
200-MA; 4) 50-MA > 150-MA; 5) 150-MA > 200-MA; 6) 200-MA rising (~1 month); 7) within 25%
of 52-week high; 8) ≥30% above 52-week low.

**Momentum power (weight 0.25):** 9) RSI 40–70; 10) MACD > signal; 11) ROC positive and
rising; 12) ADX > 25; 13) MFI 20–80; 14) Bollinger %B 0.5–1.0.

**Volume (weight 0.20):** 15) OBV trending up; 16) volume > 20-day avg; 17) Accumulation/
Distribution rising; 18) Volume-ROC positive.

**Relative performance — Driehaus (weight 0.15):** 19) earnings acceleration (each year's
EPS growth beats the last); 20) positive recent earnings surprise; 21) institutional
accumulation (relative volume > 1.2×); 22) relative strength vs index positive (stock ROC >
index ROC).

**Risk (weight 0.15):** 23) ATR/price < 6%; 24) distance from 60-bar support < 8%; 25) no
major resistance within 10%.

## Scoring rubric
For each category, fraction = (criteria passed)/(criteria evaluable). 
`score = 0.25·trend + 0.25·momentum_power + 0.20·volume + 0.15·relative_performance + 0.15·risk`.

Grade: **≥0.9** A+ · **≥0.8** A · **≥0.7** B+ · **≥0.6** B · **≥0.5** C · **≥0.4** D · else **F**.

**Confidence** = clamp(0.5 + 0.45·(evaluable/25) − (0.1 if <200 bars), 0.1, 0.95).

## Output (emit this Thinking Card)
```json
{ "skill": "momentum-screen", "ticker": "..", "mode": "momentum", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "B+",
  "key_metrics": { "overall_count": "18/25", "criteria_passed": 18, "criteria_evaluated": 23,
    "categories": { "trend": {"criteria_met": 0, "total": 0, "fraction": 0.0} } },
  "reasoning": ["✓/✗/? criterion — why"], "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- Many DSE names lack `earnings_surprise` / clean `eps_history` and there's no index series —
  mark those Driehaus criteria "not counted" (flag `missing:earnings_surprise`,
  `missing:market_index`) instead of failing them.
- `limited_history_<200_bars` weakens the SEPA stack — flag and reduce confidence.
- A high grade on thin volume is suspect — volume criteria must genuinely pass.

## Optional precision helper
```bash
python3 scripts/screen.py --input data.json --pretty
```
Returns each criterion's pass/fail, the per-category fractions, the 0..1 score and the grade.
Use it to verify counts; trust the script if your tally differs.

## Worked example
22 of 25 criteria evaluable, 18 pass — trend 7/8, momentum 5/6, volume 4/4, Driehaus 1/3,
risk 1/3 → score ≈ 0.71 → **B+**, confidence ≈ 0.84.

## References
Checklist detail: [references/CHECKLIST.md](references/CHECKLIST.md).
Output is educational analysis only, never financial advice.
