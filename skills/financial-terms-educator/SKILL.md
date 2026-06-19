---
name: financial-terms-educator
description: Explains financial and DSE-trading terms bilingually (English + Bangla) with dual-strategy impact for long-term investors versus momentum traders, good/bad thresholds, a Bengali-context analogy, and what-to-do notes. Use when the user asks "what is ROE/PE/RSI/MACD", "explain this metric in Bangla", "is a PEG of 0.8 good or bad", wants a glossary, or wants their stock's fundamentals/indicators annotated with plain-language meaning for a Dhaka Stock Exchange context.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-001:REQ-040", "PRD-001:REQ-045", "PRD-001:REQ-047", "PRD-002:REQ-038", "PRD-002:REQ-050"]
  mode: ["education"]
---

# Financial Terms Educator

## When to use

Activate when a user wants a term explained or a metric interpreted: "what does ROE mean?",
"explain P/E in Bangla", "is debt-to-equity of 1.4 bad?", "annotate these fundamentals",
"give me the glossary". This is the bilingual education layer (PRD-001 REQ-040/045/047;
PRD-002 REQ-038/050) — it teaches the *why* behind the numbers other skills produce.

## What it does

Looks up a curated, bilingual glossary (`assets/glossary.json`). Each entry carries:
`term` / `term_bn`, `one_liner` / `one_liner_bn`, an `analogy` in a Bangladesh/DSE context
(GP, Square, BRAC Bank, BATBC), a **dual-strategy split** (`for_investor` vs `for_trader`),
`good_vs_bad` thresholds, and `what_to_do`. The dual split is the core philosophy: the same
metric means different things to a long-term holder and a momentum trader (PRD-001
REQ-045/047). See [references/GLOSSARY.md](references/GLOSSARY.md).

The core set is ~38 key terms (ROE, ROA, PE, PB, PEG, EPS, debt_to_equity, current_ratio,
free_cash_flow, dividend_yield, margin_of_safety, economic_moat, RSI, MACD, ADX, ATR,
moving_average, OBV, MFI, ROC, bollinger_bands, support_resistance, breakout, momentum,
volatility, market_cap, NAV, NCAV, intrinsic_value, beta, circuit_breaker, floor_price,
DSEX, book_value, earnings_growth, operating_margin, interest_coverage, position_sizing) —
**extensible toward the 120+ target** documented in the references.

## How to run

```bash
echo '{"term":"ROE"}'                  | python3 scripts/lookup.py --pretty
echo '{"terms":["PE","PEG"]}'          | python3 scripts/lookup.py
echo '{"metrics":{"roe":0.23,"pe":14.2}}' | python3 scripts/lookup.py --pretty
echo '{"list":true}'                   | python3 scripts/lookup.py
```

- `{"term": "..."}` — one entry (case-insensitive; metric aliases like `rsi_14` resolve).
- `{"terms": [...]}` — several entries.
- `{"metrics": {...}}` — annotate each value with its entry **and** a good/bad verdict.
- `{"list": true}` — all term keys.

## Interpreting output

Returns `results[]`, `count`, `language: "en+bn"`, and `disclaimer`. In `metrics` mode each
result adds `verdict` (good/fair/weak/n-a) and an `assessment` string. Educational analysis
only, never financial advice.
