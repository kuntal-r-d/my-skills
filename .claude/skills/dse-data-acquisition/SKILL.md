---
name: dse-data-acquisition
description: Guides assembly of the Stock Buddy data contract from the stock-buddy-data MCP server (PostgreSQL) and the two-call workflow with analyze_ticker. Use when gathering DSE OHLCV, fundamentals, shareholding, macro, news, or portfolio data before running analysis skills.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Requires stock-buddy-data MCP server with DATABASE_URL.
metadata:
  author: stock-buddy
  version: "1.0.0"
  prd_refs: ["PRD-001:REQ-026", "PRD-001:REQ-002"]
  mode: ["momentum", "investment"]
---

# DSE Data Acquisition

> **Two MCP servers.** Market data lives in PostgreSQL and is exposed by **stock-buddy-data** MCP.
> Analysis runs on **stock-buddy** MCP (no network, no fetch). Never hand-build JSON when the data MCP is available.

## Standard workflow

1. **Fetch contract** — call `get_ticker_contract_for_analysis` on **stock-buddy-data**:
   - `ticker` (required), e.g. `LHB`
   - `include_portfolio: true` when risk-manager sector/heat gates are needed
   - `ohlcv_days: 260` for full momentum MA stack (minimum 30 for basic technical)

2. **Analyze** — pass the returned JSON to `analyze_ticker` on **stock-buddy** unchanged.

3. **Portfolio updates** (manual only) — use stock-buddy-data write tools:
   - `upsert_position`, `remove_position`, `set_account`, `get_portfolio`

## Data MCP read tools

| Tool | Purpose |
|------|---------|
| `get_ticker_contract` | Full contract + `_meta` (sources, missing, freshness) |
| `get_ticker_contract_for_analysis` | Contract without `_meta` — use before `analyze_ticker` |
| `get_ohlcv` | Price history only |
| `get_fundamentals` | Latest fundamentals snapshot |
| `get_shareholding` | Monthly sponsor/institution/foreign/public |
| `get_macro` | Bangladesh macro (rates, inflation) |
| `get_news` | Recent headlines |
| `get_data_status` | Freshness / stale flags |
| `list_tickers` | Symbols in database |

## Ingest (populate database)

Run locally after `docker compose up postgres`:

```bash
npm run db:migrate
npm run db:seed
npm run ingest -- --ticker LHB --job all --days 365
npm run ingest -- --watchlist
```

Admin MCP tools (`trigger_ingest`, `register_ticker`) require `STOCK_BUDDY_DATA_ADMIN=1`.

## Contract shape

Matches [skills/README.md](../README.md#shared-data-contract): `ticker`, `as_of`, `mode`, `ohlcv[]`, `fundamentals`, `shareholding[]`, `macro`, `news[]`, `microstructure`, optional `portfolio` + `account`.

## DSE pitfalls

- OHLCV needs **≥30 bars** (≥200 for full momentum template).
- Shareholding is **monthly and lagging** — smart-money caps confidence.
- Portfolio is **never scraped** — you maintain it via MCP write tools.
- If `_meta.missing` lists fields, analysis still runs but some skills skip or flag gaps.

## Worked example (LHB)

```
1. stock-buddy-data.get_ticker_contract_for_analysis({ ticker: "LHB", include_portfolio: true })
2. stock-buddy.analyze_ticker(<result from step 1>)
```

Output is educational analysis only, not financial advice.
