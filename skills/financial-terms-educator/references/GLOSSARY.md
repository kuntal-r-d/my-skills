# Financial Terms Educator — structure, philosophy & extension

This skill is Stock Buddy's education layer (PRD-001 REQ-040/045/047; PRD-002 REQ-038/050).
Where the analytical skills produce numbers, this one explains what they mean — bilingually,
and from both investing lenses Stock Buddy serves.

## Glossary structure (`assets/glossary.json`)

```json
{
  "_meta": { "version": "...", "language": "en+bn",
             "term_count_note": "...", "metric_key_map": { "rsi_14": "RSI", ... } },
  "terms": {
    "ROE": {
      "term": "Return on Equity (ROE)",
      "term_bn": "ইকুইটির উপর রিটার্ন (ROE)",
      "one_liner": "...", "one_liner_bn": "...",
      "analogy": "Bengali-context analogy (GP / Square / BRAC Bank / BATBC)",
      "for_investor": "...", "for_trader": "...",
      "good_vs_bad": "thresholds with DSE context",
      "what_to_do": "actionable, educational guidance"
    }
  }
}
```

`_meta.metric_key_map` lets the script resolve raw metric keys from other skills' Thinking
Cards (e.g. `rsi_14`, `roc_12`, `book_value_per_share`, `return_on_assets`) to the right
glossary entry, so `{"metrics": {...}}` can annotate a fundamentals or technical card
directly.

## Dual-impact philosophy (PRD-001 REQ-045/047)

Every entry splits its meaning into `for_investor` and `for_trader`. This is deliberate: the
same metric carries different weight under each of Stock Buddy's two modes.

- A **long-term investor** treats ROE, FCF, moat, and margin of safety as primary, and
  treats RSI/MACD as minor timing aids.
- A **momentum trader** treats RSI, ADX, breakout, and volume as primary, and treats
  fundamentals as background context that can fuel or cap a move.

Presenting both prevents a user from mis-applying a trader's tool to a 5-year hold (or vice
versa), which is a core education goal of the PRD.

## Bilingual requirement

Each entry ships English and Bangla for the term and one-liner (`term`/`term_bn`,
`one_liner`/`one_liner_bn`) so the glossary is usable by the broad DSE retail audience. The
script prints with `ensure_ascii=False` so Bangla renders correctly. Analogies use familiar
Bangladeshi tickers (GP, Square Pharma, BRAC Bank, BATBC) and DSE mechanics (circuit
breakers, floor prices, DSEX) for local relevance.

## Good/bad verdicts in `metrics` mode

When a metric **value** is supplied, the script applies a threshold rule (`_VERDICTS` in
`lookup.py`) and returns a `verdict` (`good`/`fair`/`weak`/`n/a`) plus an `assessment`
sentence. Rules exist for ROE, ROA, P/E, P/B, PEG, debt_to_equity, current_ratio,
dividend_yield, operating_margin, earnings_growth, interest_coverage, RSI and ADX. Terms
without a numeric rule return `n/a` and point the user to the entry's `good_vs_bad` text.
Thresholds are DSE-tuned and documented inline; they are educational heuristics, not advice.

## Extending toward 120+ terms

The core set is ~38 high-traffic terms. To grow toward the 120+ target:

1. Add an entry under `terms` with all eight fields (keep both `*_bn` fields populated).
2. If other skills emit the metric under a different key, add an alias to
   `_meta.metric_key_map`.
3. If the term has a sensible numeric cutoff, add a `_verdict_*` function and register it in
   `_VERDICTS` so `metrics` mode can score it.
4. No code change is needed for plain `term`/`terms`/`list` lookups — they read the JSON
   directly.

Candidate additions toward 120+: quick ratio, gross margin, net margin, asset turnover,
inventory turnover, payout ratio, retained earnings, EBITDA, enterprise value, EV/EBITDA,
working capital, DCF, WACC, terminal value, Sharpe ratio, drawdown, stop-loss, trailing
stop, risk-reward ratio, Kelly fraction, VWAP, pivot points, Fibonacci retracement,
divergence, accumulation/distribution, short interest, free float, lock-in period, rights
issue, bonus share, record date, ex-dividend, price discovery, bid-ask spread, liquidity,
turnover ratio, sector rotation, mean reversion, and so on.
