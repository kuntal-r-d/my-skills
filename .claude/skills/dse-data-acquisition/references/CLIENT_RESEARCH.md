# Client-side research fallback (Claude Code / Codex / Gemini / Cursor)

Use this when **stock-buddy-data MCP cannot connect** to PostgreSQL, or when the contract
returned has `_meta.missing` fields, or when **stock-buddy** `analyze_ticker` returns
`instructions` / `insufficient_data_contract`.

The analysis MCP server **never fetches**. The **client agent** must research public data.

## Source policy (important)

**You may use ANY credible public source** — web search, browser, PDFs, news, aggregators,
exchange pages, company sites, broker portals, social posts with linked filings, etc.

Example sites in this doc and in MCP `instructions.example_public_sources` are **hints only**,
not a required list. Pick whatever source actually has the data.

Always record **URL, publisher, and as_of** when you save citations.

## When to trigger

| Signal | Action |
|--------|--------|
| `stock-buddy-data` error: connect / ECONNREFUSED / DATABASE_URL | Follow **DB offline** path |
| `get_ticker_contract._meta.missing` non-empty | Research those fields only |
| `analyze_ticker` → `error: insufficient_data_contract` | You passed ticker-only; assemble full JSON |
| `analyze_ticker` → `partial_data_warning` | Analysis ran on partial data; research missing fields for next run |
| Individual skill → `missing \`fundamentals\` object` | Same as above — pass full contract to `analyze_ticker` |

## Call order

```
1. stock-buddy-data.get_ticker_contract({ ticker: "GP" })
   → if OK: stock-buddy-data.get_ticker_contract_for_analysis({ ticker: "GP" })
   → if _meta.missing or error: go to step 2

2. Client agent researches missing fields via web search / any public source

3. Merge DB partial JSON + researched fields into ONE object

4. stock-buddy.analyze_ticker({ ticker, as_of, ohlcv[], fundamentals{}, shareholding[], macro{}, news[] })

5. Optional: stock-buddy-data.upsert_research_sources + upsert_research_memo
```

## Minimum fields by skill leg

| Field | Minimum | Used by |
|-------|---------|---------|
| `ohlcv` | **30 bars** (260 for momentum MA stack) | technical, momentum, risk-manager |
| `fundamentals` | object with `price`, ratios, optional `eps_history` | fundamental, value checklist |
| `shareholding` | ≥1 monthly row | smart-money-flow |
| `news` | ≥1 headline | sentiment-news |
| `macro` | `policy_rate`, `inflation` | macro-regime |

## Example sources (not exhaustive)

Use these **or anything else** that provides the required fields.

### OHLCV (daily)
- Exchange company pages, financial portals, chart sites, broker terminals, company IR
- Fields: `date`, `open`, `high`, `low`, `close`, `volume`

### Fundamentals
- Annual reports, PSI/disclosures, financial portals, news citing audited numbers
- Map to: `eps_ttm`, `eps_history[]`, `book_value_per_share`, `pe`, `pb`, `roe`, `debt_to_equity`, `profit_margin`, `dividend_yield`, `price`

### Shareholding (monthly)
- Exchange disclosures, portal breakdowns, credible news on sponsor/institution/foreign/public %
- Fields: `month` (YYYY-MM), `sponsor`, `institution`, `foreign`, `public`

### Macro (Bangladesh)
- Central bank, statistics office, business news, FX sites
- Fields: `policy_rate` (decimal), `inflation` (decimal), `bdt_usd`, `fx_reserves_bn`

### News
- Any finance headline with date and source URL
- Fields: `date`, `headline`, `source`, optional `category`

## MCP transport note

Some clients strip nested JSON when calling tools. If `analyze_ticker` receives only scalars:

- Pass **all contract keys at the top level** of the tool arguments object
- Do **not** nest under a single `data` or `payload` key unless your client preserves it
- Prefer `get_ticker_contract_for_analysis` output pasted **verbatim** into `analyze_ticker`

## Persist research

After web research, save lineage (from whatever sources you used):

```
upsert_research_sources({ ticker, session_id, sources: [{ url, title, publisher, category, extracted_facts }] })
upsert_research_memo({ ticker, title, body_md, summary_json, link_all_ticker_sources: true })
```

## Do not

- Limit yourself to a fixed site list when another source has better data
- Hand-score skills manually when the server can run — assemble the contract instead
- Fabricate shareholding or insider data
- Treat web figures as live without `as_of` dates

Educational analysis only. Not financial advice.
