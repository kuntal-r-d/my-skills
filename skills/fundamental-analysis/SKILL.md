---
name: fundamental-analysis
description: Reads a DSE stock's fundamentals, flags balance-sheet risks, derives a multi-method fair-value range, and returns a fundamental score, rating, and reasoning. Use when the user asks for fundamental analysis, intrinsic/fair value, DCF or Graham valuation, balance-sheet health, red flags, "is this stock cheap/overvalued", P/E, ROE, or whether a Dhaka Stock Exchange ticker is a good long-term buy.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-018", "PRD-002:REQ-104", "PRD-002:REQ-105", "PRD-001:REQ-006", "PRD-001:REQ-044"]
  mode: ["investment"]
---

# Fundamental Analysis

## When to use

Activate when a user wants a fundamental read on a DSE stock: "is GP fundamentally
strong?", "what's the fair value of BEXIMCO?", "run a DCF", "any balance-sheet red
flags?", "is this overvalued?". This is the fundamental leg of the dual-mode signal —
feed its score into `signal-synthesizer`, or pair it with `value-investment-checklist`.

## What it does

Runs three logical stages in one pass (PRD-002 REQ-104/105/018):

1. **Balance Sheet Reader** (`balance_sheet_reader`) — extracts key line items and
   emits RED FLAGS: D/E > 1.0 (high leverage), free cash flow <= 0, declining earnings
   (latest EPS < prior), current ratio < 1, interest coverage < 2, profit margin < 0.
2. **Valuation Extractor** (`valuation_extractor`) — three methods with explicit
   assumptions and a fair-value **range** (low / median / high):
   - **DCF (Graham growth formula)** — `eps_ttm * (8.5 + 2 * g * 100)` where
     `g = min(earnings_growth, 15%)`.
   - **Graham number** — `sqrt(22.5 * eps_ttm * book_value_per_share)`.
   - **PE-based** — `eps_ttm * sector_median_pe` (default 15 if unknown).
3. **Fundamental Synthesizer** (`analyze`) — combines earnings trend (EPS slope),
   red-flag count, valuation gap `(fair_median - price) / price`, and disclosure
   quality into a score in [-1, +1]. Confidence drops with red flags, aggressive
   assumptions, or thin disclosure. Rating: `strong_buy` / `buy` / `hold` / `sell`.

Output is a Thinking Card (see suite README).

## How to run

```bash
python3 scripts/analyze.py --input data.json --pretty
cat data.json | python3 scripts/analyze.py
```

Reads `fundamentals` (required). Price is taken from `fundamentals.price`, falling back
to the last `ohlcv` close. Returns `score` (-1..+1), `confidence` (0..1), `rating`,
`key_metrics` (fair_value_low/median/high, valuation_gap_pct, red_flags, pe, roe, de,
methods, assumptions) and `reasoning`.

Try it now with the shared fixture:

```bash
python3 scripts/analyze.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- A large positive `valuation_gap_pct` means price sits below the fair-value median
  (potentially undervalued); a negative gap means the opposite.
- `rating` blends the valuation gap with the red-flag count — `sell` triggers on a
  negative gap or three-plus red flags regardless of cheapness.
- `flags` carry confidence penalties (`limited_disclosure`, `no_eps_history`,
  `no_price_or_fair_value`) — never silently dropped.

## Notes

Valuation methods, the Graham formulas, default assumptions (r = 15%, terminal
g = 3%, sector P/E = 15), and DSE caveats are documented in
[references/VALUATION.md](references/VALUATION.md) — including why DSE P/E benchmarks
run higher than US comparables (PRD-001 REQ-044). Output is educational analysis only,
never financial advice.
