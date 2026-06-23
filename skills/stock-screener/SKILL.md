---
name: stock-screener
description: Screens a universe of DSE stocks by fundamental ratios, technical signals, pre-built templates, or a natural-language query, then ranks survivors. Use when the user wants to find/screen/filter stocks, asks "show me cheap stocks", "value stocks under P/E 15", "dividend champions", "momentum stocks breaking 52-week highs", "profitable banks", or wants a custom multi-criteria screen across many Dhaka Stock Exchange tickers.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-001:REQ-040", "PRD-001:REQ-114"]
  mode: ["momentum", "investment"]
---

# Stock Screener

> **Prompt-first skill.** Filter and rank by the rules below. `scripts/screen.py` is OPTIONAL
> (handles large universes deterministically). Output is a multi-ticker list, not a single card.

## Role & objective
You screen a supplied universe of DSE stocks against filters (explicit, template, or parsed
from natural language), then rank the survivors by a quality+momentum score.

## When to use
"Show me cheap stocks", "value stocks under P/E 15", "dividend champions", "momentum names
breaking 52-week highs", "profitable banks". Hand the top tickers to `analyze_ticker`.

## Inputs you need
**`universe`** — array of `{ticker, fundamentals{pe,pb,roe,debt_to_equity,dividend_yield,
market_cap}, ohlcv[], sector}`. Optional: **`filters`**, **`template`**, **`query`**, **`limit`** (25).

## Method (follow in order)
1. **Compose filters:** template seeds → NL query adds → explicit `filters` override.
   - Templates: `value` (pe≤15, pb≤1.5, roe≥0.12), `dividend_champions` (div≥4%, roe≥0.12),
     `momentum_leaders` (rsi≥55, breakout, pos_52w≥0.7), `oversold_quality` (rsi≤35, roe≥0.15,
     de≤0.6), `small_cap_growth` (roe≥0.15).
   - NL parse: "cheap/value"→value; "dividend/income"→dividend; "momentum/breakout"→momentum;
     "oversold"→oversold; sector keywords; "p/e under N", "roe over N%", "52-week high",
     "volume surge"→rel_volume≥1.5.
2. **Evaluate each stock** against every active filter (fundamental + technical derived from
   ohlcv: RSI, MA50/200 cross, 52-week position, breakout vs 40-bar high, rel-volume). A stock
   passes only if it satisfies **all** active filters.

## Scoring rubric (rank score)
`rank = 0.5·(min(ROE,0.4)/0.4) + 0.3·pos_52w + 0.2·clamp((RSI−30)/50, 0, 1)`.
Sort survivors descending; return the top `limit`.

## Output
```json
{ "skill": "stock-screener", "as_of": "..",
  "applied": { "template": null, "query": "..", "filters": {} },
  "count": 0, "results": [ { "ticker": "..", "passes": true, "score": 0.0,
    "matched_filters": {}, "key_metrics": { "pe": 0, "roe": 0, "rsi": 0, "pos_52w": 0 } } ],
  "reasoning": ["filters applied; N of M passed; top K returned"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- Stocks with missing fields **fail** a filter that needs them — don't pass unknowns; say which
  filter excluded them if asked.
- Thin ohlcv means technical filters can't evaluate — those stocks drop out of technical screens.
- US-style P/E≤15 is strict for some DSE sectors — adjust thresholds via explicit `filters` when relevant.

## Optional precision helper
```bash
python3 scripts/screen.py --input universe.json --pretty
```
Returns the passing tickers ranked, with matched filters and key metrics.

## Worked example
query "profitable banks with p/e under 15" → {sector:Bank, roe_min:0.10, pe_max:15}; 4 of 30
pass; ranked by ROE + 52-week position.

## References
Templates & NL grammar: [references/SCREENS.md](references/SCREENS.md).
Output is educational analysis only, never financial advice.
