---
name: dse-data-acquisition
description: Guides assembly of the Stock Buddy data contract from stock-buddy-data MCP (PostgreSQL) or client-side web research when DB/MCP is unavailable, then analyze_ticker. Use when gathering DSE OHLCV, fundamentals, shareholding, macro, news, when analyze_ticker returns instructions, or when stock-buddy-data cannot connect.
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

## Fallback: DB offline or missing contract fields

If **stock-buddy-data** fails (Postgres down, MCP disconnected) or `_meta.missing` is non-empty, or **analyze_ticker** returns `instructions` / `insufficient_data_contract`:

> **YOU are the data agent** (Claude Code, Codex, Gemini, Cursor). Use web search or any credible public source to gather missing contract fields (listed sites in `instructions` are examples only), assemble the contract, then call `analyze_ticker` with the **full nested object** — never ticker-only.

1. Read the `instructions` block (from data MCP error, `_meta.research_instructions`, or analyze_ticker response). Note `source_selection_policy`.
2. Research only the **missing** fields from **any source you find useful** — see [references/CLIENT_RESEARCH.md](references/CLIENT_RESEARCH.md).
3. Merge any partial DB contract + researched fields into one JSON.
4. `stock-buddy.analyze_ticker(<full contract>)`.
5. Save citations: `upsert_research_sources` / `upsert_research_memo`.

| Trigger | Client action |
|---------|----------------|
| DB connection error | Research all core fields from any credible public sources |
| `_meta.missing: ["fundamentals"]` | Research fundamentals only; keep DB ohlcv/shareholding |
| `analyze_ticker({ ticker })` only | Re-call with full contract — MCP does not auto-fetch |
| MCP strips nested objects | Pass ohlcv/fundamentals/etc. as **top-level** tool args |

4. **Portfolio updates** (manual only) — use stock-buddy-data write tools:
   - `upsert_position`, `remove_position`, `set_account`, `get_portfolio`

5. **Save research citations** — after web search or manual research, persist sources for audit lineage:
   - `upsert_research_sources` — URLs, titles, publisher, optional `extracted_facts`
   - `get_research_sources` — retrieve by ticker, session, or category
   - Optional `promote_shareholding` when verified % are extracted from disclosures

6. **Save full research memos** — persist markdown reports:
   - `upsert_research_memo` — `{ title, body_md, summary_json, as_of, session_id }`
   - `get_research_memo` — fetch memo (+ optional linked sources via `include_sources`)
   - `list_research_memos` — history for a ticker

## Data MCP read tools

| Tool | Purpose |
|------|---------|
| `get_ticker_contract` | Full contract + `_meta` (sources, missing, freshness) |
| `get_ticker_contract_for_analysis` | Contract without `_meta` — use before `analyze_ticker` |
| `get_ohlcv` | Price history only |
| `get_fundamentals` | Latest fundamentals snapshot |
| `get_shareholding` | Monthly sponsor/institution/foreign/public |
| `get_macro` | Latest Bangladesh macro (rates, inflation) |
| `get_news` | Recent headlines |
| `get_data_status` | Freshness / stale flags |
| `list_tickers` | Symbols in database |

## Data MCP write tools (research & portfolio)

| Tool | Purpose |
|------|---------|
| `upsert_research_memo` | Save full markdown report + optional summary_json |
| `get_research_memo` | Fetch memo body and linked citations |
| `list_research_memos` | List memo history for a ticker |
| `upsert_research_sources` | Save web/agent citations + optional extracted facts |
| `get_research_sources` | List saved citations |
| `upsert_position` | Add/update portfolio position |
| `remove_position` | Remove portfolio position |
| `set_account` | Update capital/risk settings |

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

## Worked example (save research)

After web research on WALTONHIL shareholding:

```
stock-buddy-data.upsert_research_sources({
  ticker: "WALTONHIL",
  session_id: "cursor-chat-2026-06-25",
  client_id: "cursor",
  query_context: "WALTONHIL sponsor director institutional foreign public shareholding",
  sources: [
    {
      url: "https://www.tbsnews.net/economy/stocks/walton-chairman-transfer-shares",
      title: "Walton chairman to transfer 3.64cr shares to family members",
      publisher: "The Business Standard",
      category: "shareholding",
      extracted_facts: { event: "director_transfer", shares_cr: 3.64 }
    },
    {
      url: "https://stocknow.com.bd/stocks/WALTONHIL",
      title: "WALTONHIL shareholding position",
      publisher: "StockNow",
      category: "shareholding",
      extracted_facts: { sponsor_pct: 61.09, public_pct: 38.15, as_of: "2025-08" }
    }
  ],
  promote_shareholding: {
    month: "2025-08",
    sponsor: 61.09,
    public: 38.15,
    source: "stocknow_research"
  }
})
```

Retrieve later: `get_research_sources({ ticker: "WALTONHIL", category: "shareholding" })`

## Worked example (save markdown memo)

```
stock-buddy-data.upsert_research_memo({
  ticker: "WALTONHIL",
  session_id: "cursor-chat-2026-06-25-waltonhil-equity-memo",
  client_id: "cursor",
  title: "Walton Hi-Tech Industries PLC — Educational Equity Analysis",
  as_of: "2026-06-21",
  body_md: "<full markdown report>",
  summary_json: { price_tk: 384, pe_ratio: 11.5, rating: "cheap_with_governance_overhang" },
  link_all_ticker_sources: true
})
```

Fetch: `get_research_memo({ ticker: "WALTONHIL", include_sources: true })`

Output is educational analysis only, not financial advice.
