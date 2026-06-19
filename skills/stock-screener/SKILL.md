---
name: stock-screener
description: Screens a universe of DSE stocks by fundamental ratios, technical signals, pre-built templates, or a natural-language query, then ranks survivors. Use when the user wants to find/screen/filter stocks, asks "show me cheap stocks", "value stocks under P/E 15", "dividend champions", "momentum stocks breaking 52-week highs", "profitable banks", or wants a custom multi-criteria screen across many Dhaka Stock Exchange tickers.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-039", "PRD-002:REQ-040", "PRD-002:REQ-114", "PRD-001:REQ-024", "PRD-001:REQ-066"]
  mode: ["momentum", "investment"]
---

# Stock Screener

## When to use

Activate when a user wants to scan a **universe** of DSE stocks rather than analyse
one ticker: "find cheap stocks", "screen for dividend champions", "momentum stocks
breaking 52-week highs with volume surge", "profitable banks with P/E under 15", or a
hand-built filter set. Pair survivors with `technical-analysis`, `fundamental-analysis`
or `signal-synthesizer` for a deeper read.

## What it does

Takes a universe and applies three composable filter sources (PRD-002 REQ-039/040/114):

1. **Filters** — explicit fundamental and technical criteria.
2. **Templates** — named, pre-built filter bundles (REQ-040).
3. **Natural language** — a rule-based parser maps phrases to filters (REQ-114) and
   reports back exactly what it parsed.

Precedence: **template seeds → NL query adds → explicit `filters` override.** Survivors
are ranked by a composite score (quality via ROE + momentum via 52-week position and
RSI), sorted descending, and truncated to `limit` (default 25).

**Fundamental filters:** `pe_max`, `pb_max`, `roe_min`, `de_max`, `div_yield_min`,
`market_cap_min`, `sector`.
**Technical filters** (need `ohlcv`): `rsi_min`, `rsi_max`, `ma_cross`
(`golden`/`death`, 50d vs 200d), `pos_52w_min`/`pos_52w_max` (position in 52-week
range), `breakout` (close >= prior 40-bar high), `rel_volume_min`.

## How to run

```bash
python3 scripts/screen.py --input universe.json --pretty
cat universe.json | python3 scripts/screen.py
```

Input:

```json
{
  "universe": [
    {"ticker": "GP", "sector": "Telecom", "fundamentals": {...}, "ohlcv": [...]}
  ],
  "template": "value",
  "query": "profitable banks with p/e under 15",
  "filters": {"roe_min": 0.15},
  "limit": 25
}
```

`ohlcv` per stock is optional but is required for any technical filter. Output is a
**multi-ticker** card (not a single Thinking Card): `applied` (resolved
template/query/filters), `count`, ranked `results[]` (each with `ticker`, `passes`,
`score`, `matched_filters`, `key_metrics{pe,roe,rsi,pos_52w}`), `reasoning`, and
`disclaimer`.

## Interpreting output

- `applied.filters` is the *effective* filter set after composition — always check it
  to confirm an NL query parsed as intended.
- `score` ranks survivors only; a stock absent from `results` failed at least one
  filter.
- An empty `results` with `count: 0` means nothing passed — loosen the filters.

## Notes

Every filter, all five templates, and the natural-language phrase mappings are
documented in [references/SCREENS.md](references/SCREENS.md). Indicator math is the
shared `scripts/indicators.py`. Output is educational analysis only, never financial
advice.
