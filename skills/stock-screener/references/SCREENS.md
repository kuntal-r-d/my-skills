# Stock Screener — filters, templates, and natural-language mappings

The screener (PRD-002 REQ-039/040/114, PRD-001 REQ-024/066) filters a universe and
ranks survivors. Filter sources compose with this precedence:

> **template seeds → natural-language query adds → explicit `filters` override**

The effective set is echoed back in `applied.filters`.

## Input shape

```json
{
  "universe": [
    {"ticker": "GP", "sector": "Telecom",
     "fundamentals": {"pe": 14.2, "pb": 1.3, "roe": 0.23, "debt_to_equity": 0.15,
                      "dividend_yield": 0.04, "market_cap": 4.2e11, "sector": "Telecom"},
     "ohlcv": [{"date": "...", "open": ..., "high": ..., "low": ..., "close": ..., "volume": ...}]}
  ],
  "template": "value",
  "query": "profitable banks with p/e under 15",
  "filters": {"roe_min": 0.15},
  "limit": 25
}
```

`sector` may live at the top level of a stock or inside `fundamentals`.

## Fundamental filters

| Filter | Field read | Pass condition |
|--------|-----------|----------------|
| `pe_max` | `fundamentals.pe` | `pe <= pe_max` |
| `pb_max` | `fundamentals.pb` | `pb <= pb_max` |
| `roe_min` | `fundamentals.roe` | `roe >= roe_min` |
| `de_max` | `fundamentals.debt_to_equity` | `de <= de_max` |
| `div_yield_min` | `fundamentals.dividend_yield` | `dy >= div_yield_min` |
| `market_cap_min` | `fundamentals.market_cap` | `mc >= market_cap_min` (always passes when min `<= 0`) |
| `sector` | top-level or `fundamentals.sector` | case-insensitive substring match either way |

A filter on a field that is missing/`None` fails that stock (except `market_cap_min <= 0`).

## Technical filters (require `ohlcv`)

Indicators come from the shared `indicators.py`.

| Filter | Derivation | Pass condition |
|--------|-----------|----------------|
| `rsi_min` | RSI(14) of closes | `rsi >= rsi_min` |
| `rsi_max` | RSI(14) of closes | `rsi <= rsi_max` |
| `ma_cross` | `golden` if SMA50 > SMA200 else `death` | equals requested value |
| `pos_52w_min` | `(close - low_252) / (high_252 - low_252)` | `pos >= pos_52w_min` |
| `pos_52w_max` | as above | `pos <= pos_52w_max` |
| `breakout` | `close >= max(prior 40 bars)` | breakout is `true` (only enforced when `breakout: true`) |
| `rel_volume_min` | `last_volume / SMA20(volume)` | `rel_volume >= rel_volume_min` |

`pos_52w` uses up to the last 252 bars (or all bars if fewer). Stocks lacking enough
OHLCV for a metric fail any filter that needs it.

## Pre-built templates (REQ-040)

| Template | Seeds |
|----------|-------|
| `dividend_champions` | `div_yield_min 0.04`, `roe_min 0.12` |
| `value` | `pe_max 15`, `pb_max 1.5`, `roe_min 0.12` |
| `momentum_leaders` | `rsi_min 55`, `breakout true`, `pos_52w_min 0.7` |
| `oversold_quality` | `rsi_max 35`, `roe_min 0.15`, `de_max 0.6` |
| `small_cap_growth` | `market_cap_min 0`, `roe_min 0.15` |

A template only *seeds* filters; an explicit `filters` key overrides any overlapping
seed, and an unknown template name returns an error listing the valid names.

## Natural-language parser (REQ-114)

Rule-based, deterministic, and reported back via `applied.query` / `applied.filters`.

| Phrase / pattern | Effect |
|------------------|--------|
| `cheap` / `value` / `undervalued` | applies the `value` template seeds |
| `dividend` / `income` | applies the `dividend_champions` seeds |
| `momentum` / `breaking` / `breakout` | applies the `momentum_leaders` seeds |
| `oversold` | applies the `oversold_quality` seeds |
| sector words (`bank(s)`, `telecom`, `pharma`, `cement`, `textile`, `fuel`, `power`, `insurance`, `food`, `engineering`) | sets `sector` |
| `profitable` / `profit` / `quality` | `roe_min 0.10` (unless already set) |
| `p/e under N` / `pe below N` / `< N` | `pe_max N` |
| `roe above N%` / `roe over N` | `roe_min N/100` |
| `52-week high(s)` / `52w high` | `pos_52w_min 0.9` + `breakout true` |
| `volume surge` / `volume spike` / `high volume` | `rel_volume_min 1.5` |

Examples:

- `"profitable banks with p/e under 15"` → `{sector: Bank, roe_min: 0.10, pe_max: 15}`
- `"momentum stocks breaking 52-week highs with volume surge"` →
  `{rsi_min: 55, breakout: true, pos_52w_min: 0.9, rel_volume_min: 1.5}`
- `"cheap dividend stocks"` → value seeds + dividend seeds merged.

Later rules override earlier ones on key collisions (e.g. an explicit `p/e under 12`
beats the `pe_max 15` from a `value`/`cheap` template seed).

## Ranking

Survivors are scored by a composite of quality and momentum:

```
score = 0.5 * min(roe, 0.40)/0.40          # quality, capped at ROE 40%
      + 0.3 * pos_52w                       # momentum: position in 52-week range
      + 0.2 * clamp((rsi - 30)/50, 0, 1)    # RSI 30..80 -> 0..1
```

Missing inputs contribute 0. Results are sorted by `score` descending and truncated to
`limit` (default 25). `count` reflects the returned (post-limit) result count.

## Output shape

```json
{
  "skill": "stock-screener",
  "as_of": "2026-06-19",
  "applied": {"template": "value", "query": null, "filters": {...}},
  "count": 2,
  "results": [
    {"ticker": "GP", "passes": true, "score": 0.77,
     "matched_filters": {"pe_max": true, "pb_max": true, "roe_min": true},
     "key_metrics": {"pe": 14.2, "roe": 0.23, "rsi": 75.8, "pos_52w": 0.99}}
  ],
  "reasoning": ["Template 'value' applied: ...", "2 of 3 stocks passed; ..."],
  "disclaimer": "Educational analysis only. Not financial advice."
}
```

This is a multi-ticker card; per-ticker Thinking Cards come from the single-stock
skills you run on the survivors.
