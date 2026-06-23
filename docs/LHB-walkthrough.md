# LHB walkthrough — Stock Buddy Data Platform

Complete end-to-end guide for **LafargeHolcim Bangladesh (LHB)** using PostgreSQL, scheduled ingest, dual MCP servers, and `analyze_ticker`.

> Educational analysis only — not financial advice.

## What you will do

1. Start Postgres and load the schema
2. Ingest LHB market data from DSE (with fallbacks)
3. Configure **two** MCP servers in Cursor
4. Fetch an analysis-ready contract from **stock-buddy-data**
5. Run **stock-buddy** `analyze_ticker` on that contract
6. Maintain your portfolio manually via data MCP write tools

## Architecture

```mermaid
flowchart LR
  DSE[DSE / StockAnalysis] --> Ingest[npm run ingest]
  Ingest --> PG[(PostgreSQL)]
  PG --> DataMCP[stock-buddy-data MCP]
  DataMCP -->|get_ticker_contract_for_analysis| Agent[Cursor / Agent]
  Agent -->|analyze_ticker JSON| AnalysisMCP[stock-buddy MCP]
  User[You manual updates] -->|upsert_position| DataMCP
```

| Server | Role | Network |
|--------|------|---------|
| **stock-buddy-data** | Read/write Postgres; build contracts | DB only |
| **stock-buddy** | Run 14 analysis skills + `analyze_ticker` | None |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | `node -v` |
| Docker Desktop | For Postgres container |
| Repo built | `npm ci && npm run build` from repo root |
| Repo root | All commands below assume you are in the `stock-buddy` directory |

```bash
cd /path/to/stock-buddy
npm ci && npm run build
```

---

## Step 0 — Environment file

Copy the example env file. Migrate, seed, and ingest scripts **auto-load** `.env` from the repo root — you do not need to `export DATABASE_URL` manually.

```bash
cp .env.example .env
```

Default contents (dev only):

```env
DATABASE_URL=postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy
STOCK_BUDDY_DATA_ADMIN=1
STOCK_BUDDY_SKILLS_DIR=./skills
```

---

## Step 1 — Start Postgres

```bash
docker compose up -d postgres
```

Wait until healthy:

```bash
docker compose ps postgres
# STATUS should show "healthy"
```

Apply schema and seed tickers + default portfolio account:

```bash
npm run db:migrate
npm run db:seed
```

Expected seed output:

```
Seeded 29 tickers
Created default portfolio account   # first run only
Seed complete.
```

LHB is included in the seed watchlist.

---

## Step 2 — Ingest LHB market data

Full ingest (OHLCV, fundamentals, shareholding, news; macro is seeded globally):

```bash
npm run ingest -- --ticker LHB --job all --days 365
```

Expected output when DSE is reachable:

```
All jobs complete for LHB
```

### What gets stored

| Entity | Source | Typical LHB result |
|--------|--------|-------------------|
| OHLCV | DSE HTML archive (~240 bars) | 200+ daily bars |
| Fundamentals | DSE company page + StockAnalysis fallback | `price`, `eps_ttm`, `pe`, `roe`, … |
| Shareholding | DSE nested holding blocks | 3+ monthly snapshots |
| Macro | Seed snapshot | Policy rate, inflation, FX |
| News | DSE price-sensitive link | 0–1 items (varies) |

### Individual jobs (optional)

```bash
npm run ingest -- --ticker LHB --job ohlcv --days 365
npm run ingest -- --ticker LHB --job fundamentals
npm run ingest -- --ticker LHB --job shareholding
npm run ingest -- --ticker LHB --job macro
npm run ingest -- --ticker LHB --job news
```

### Verify ingest in the database

```bash
npm run ingest -- --ticker LHB --job ohlcv --days 30
# Should print "239 OHLCV rows" or similar after a full run
```

Or inspect via data MCP (after Step 3):

```
get_data_status({ ticker: "LHB" })
get_ohlcv({ ticker: "LHB", limit: 5 })
get_fundamentals({ ticker: "LHB" })
get_shareholding({ ticker: "LHB", months: 4 })
list_tickers()
```

---

## Step 3 — Configure dual MCP in Cursor

Build the MCP servers if you have not already:

```bash
npm run build -w @stock-buddy/data-mcp-server
npm run build -w @stock-buddy/mcp-server
```

Edit [`.cursor/mcp.json`](../.cursor/mcp.json) (or merge from [`client-config/stock-buddy-data.json`](../client-config/stock-buddy-data.json)). Replace `/ABSOLUTE/PATH/TO/stock-buddy` with your clone path:

```json
{
  "mcpServers": {
    "stock-buddy-data": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/stock-buddy/packages/data-mcp-server/dist/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy",
        "STOCK_BUDDY_DATA_ADMIN": "1"
      }
    },
    "stock-buddy": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/stock-buddy/packages/mcp-server/dist/server.js"],
      "env": {
        "STOCK_BUDDY_HTTP": "0",
        "STOCK_BUDDY_SKILLS_DIR": "/ABSOLUTE/PATH/TO/stock-buddy/skills"
      }
    }
  }
}
```

**Restart Cursor completely** after saving (Quit, not just close the window). Both servers must appear in the MCP tools list.

### Claude Desktop

Merge the same two entries into `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS. See [`client-config/README.md`](../client-config/README.md).

---

## Step 4 — Set up portfolio (manual)

Portfolio is **never scraped**. Configure your account and LHB holding on **stock-buddy-data**:

```
set_account({
  capital_bdt: 1000000,
  risk_per_trade_pct: 1
})

upsert_position({
  ticker: "LHB",
  qty: 500,
  avg_cost: 54.3,
  sector: "Cement",
  stop_level: 50.0,
  target_level: 62.0
})

get_portfolio()
```

Expected `get_portfolio` shape:

```json
{
  "account": { "capital_bdt": 1000000, "risk_per_trade_pct": 1, "label": "default" },
  "portfolio": {
    "total_value_bdt": 27150,
    "positions": [{
      "ticker": "LHB",
      "qty": 500,
      "price": 54.3,
      "sector": "Cement",
      "stop_level": 50.0,
      "target_level": 62.0
    }]
  }
}
```

To remove or update a position later:

```
remove_position({ ticker: "LHB" })
upsert_position({ ticker: "LHB", qty: 600, avg_cost: 53.5, sector: "Cement" })
```

---

## Step 5 — Fetch the analysis contract

On **stock-buddy-data**, call:

```
get_ticker_contract_for_analysis({
  ticker: "LHB",
  mode: "investment",
  include_portfolio: true,
  ohlcv_days: 260
})
```

### Parameters

| Field | Value | Why |
|-------|-------|-----|
| `ticker` | `"LHB"` | Required |
| `mode` | `"investment"` or `"momentum"` | Routes synthesizer weighting |
| `include_portfolio` | `true` | Enables risk-manager sector/heat gates |
| `ohlcv_days` | `260` | Full MA stack for momentum; min 30 for basic technical |

Use **`get_ticker_contract_for_analysis`**, not `get_ticker_contract`. The `_meta` block (sources, missing fields, freshness) must be stripped before analysis.

To inspect freshness without analyzing:

```
get_ticker_contract({ ticker: "LHB", include_portfolio: true })
```

Check `_meta.missing` — empty array means all major fields are present.

### Contract shape (abbreviated)

Matches [`SkillInputSchema`](../packages/core/src/contract.ts):

```json
{
  "ticker": "LHB",
  "as_of": "2026-06-24",
  "mode": "investment",
  "ohlcv": [{ "date": "2025-06-24", "open": 45.2, "high": 45.6, "low": 45.0, "close": 45.3, "volume": 440608 }],
  "fundamentals": { "price": 54.3, "eps_ttm": 4.17, "pe": 13.0, "roe": 0.24 },
  "shareholding": [{ "month": "2026-05", "sponsor": 63.39, "institution": 22.58, "foreign": 0.78, "public": 13.25 }],
  "macro": { "policy_rate": 0.1, "inflation": 0.086, "bdt_usd": 122.0 },
  "news": [{ "date": "2026-06-24", "headline": "...", "source": "dse" }],
  "microstructure": { "avg_daily_value_bdt": 41000000, "circuit_state": "normal" },
  "portfolio": { "total_value_bdt": 27150, "positions": [{ "ticker": "LHB", "qty": 500, "price": 54.3, "sector": "Cement" }] },
  "account": { "capital_bdt": 1000000, "risk_per_trade_pct": 1 }
}
```

---

## Step 6 — Run full analysis

Copy the **entire JSON** from Step 5 and pass it unchanged to **stock-buddy**:

```
analyze_ticker(<paste contract JSON here>)
```

Do not wrap it in a string or re-key fields — pass the object as the tool argument.

### Expected response structure

```json
{
  "skill": "analyze_ticker",
  "ticker": "LHB",
  "stages": {
    "technical_analysis": "ok",
    "fundamental_analysis": "ok",
    "smart_money_flow": "ok",
    "sentiment_news": "ok",
    "macro_regime": "ok",
    "signal_synthesizer": "ok",
    "risk_manager": "ok"
  },
  "synthesis": {
    "investment": { "score": 7, "rating": "...", "reasoning": "..." },
    "momentum": { "score": 6, "rating": "...", "reasoning": "..." }
  },
  "risk": {
    "position_size": "...",
    "stop_loss": "...",
    "risk_gates": "..."
  },
  "agent_cards": { "...": "..." }
}
```

Individual stages may show `"error: ..."` when a data field is missing — check `_meta.missing` and re-ingest.

---

## Step 7 — Optional: run individual skills

If you prefer granular control instead of `analyze_ticker`, pass the **same contract** to any analysis skill on **stock-buddy**:

```
technical_analysis({ ticker: "LHB", ... })      # use full contract fields
fundamental_analysis({ ... })
smart_money_flow({ ... })
sentiment_news({ ... })
macro_regime({ ... })
signal_synthesizer({ ... })
risk_manager({ ... })
```

The contract from Step 5 contains all required nested fields (`ohlcv`, `fundamentals`, etc.).

---

## Step 8 — Refresh data

### CLI (from repo root)

```bash
npm run ingest -- --ticker LHB --job ohlcv --days 30    # daily delta
npm run ingest -- --ticker LHB --job all --days 365     # full refresh
npm run ingest -- --watchlist                           # all watchlist tickers
```

### MCP admin tools

Requires `STOCK_BUDDY_DATA_ADMIN=1` in the data MCP env:

```
trigger_ingest({ ticker: "LHB", job: "all", days: 365 })
trigger_ingest({ ticker: "LHB", job: "ohlcv", days: 30 })
register_ticker({ ticker: "GP", sector: "Telecom" })
```

### Scheduled worker (Docker)

Run the full stack including the ingest cron worker:

```bash
docker compose up -d
```

The `ingest-worker` service runs daily OHLCV + weekly full watchlist ingest automatically.

---

## Step 9 — Success checklist

- [ ] `docker compose ps postgres` shows **healthy**
- [ ] `npm run db:migrate && npm run db:seed` completes without errors
- [ ] `npm run ingest -- --ticker LHB --job all --days 365` completes
- [ ] `get_ohlcv({ ticker: "LHB" })` returns 30+ bars (200+ ideal)
- [ ] `get_fundamentals({ ticker: "LHB" })` returns non-null payload
- [ ] Both MCP servers visible in Cursor after restart
- [ ] `get_ticker_contract_for_analysis({ ticker: "LHB", include_portfolio: true })` returns valid JSON
- [ ] `analyze_ticker(<contract>)` returns `synthesis` and `risk` without input validation errors

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `DATABASE_URL is not set` | Running outside repo or missing `.env` | `cd` to repo root; ensure `.env` exists (`cp .env.example .env`) |
| `npm run ingest` fails immediately | Old stale `dist/` build | Pull latest; scripts use `tsx` and auto-load `.env` |
| Empty OHLCV (0 rows) | Stale scraper cache | Delete `data/cache/LHB_history.json` or set `INGEST_CACHE_DIR=/tmp/sb-ingest` |
| OHLCV count stuck at ~83 | Partial cache from earlier run | Clear cache; re-run `--job ohlcv --days 365` |
| TLS / certificate errors to dsebd.org | DSE incomplete cert chain | Handled automatically in scraper for `dsebd.org` |
| Yahoo fallback empty | `LHB.DHA` not on Yahoo Finance | Normal — DSE HTML archive is the primary source |
| Shareholding 0 rows | DSE page layout change | Re-run `--job shareholding`; check `get_data_status` |
| News 0 rows | No `displayNews` links on company page | Optional field — analysis still runs |
| `analyze_ticker` schema error | Passed `get_ticker_contract` with `_meta` | Use `get_ticker_contract_for_analysis` instead |
| MCP tool not found | Cursor not restarted | Quit Cursor fully; verify both servers in `mcp.json` |
| Postgres connection refused | Container not running | `docker compose up -d postgres` |
| Risk gates ignore holdings | Portfolio not in contract | Set positions via MCP; fetch with `include_portfolio: true` |

### Clear scraper cache manually

```bash
rm -f data/cache/LHB_history.json
npm run ingest -- --ticker LHB --job ohlcv --days 365
```

### Confirm Postgres has data (psql)

```bash
docker exec -it stock-buddy-postgres psql -U stockbuddy -d stockbuddy -c \
  "SELECT COUNT(*) FROM ohlcv_daily od JOIN tickers t ON t.id = od.ticker_id WHERE t.symbol = 'LHB';"
```

---

## Related docs

- [`client-config/README.md`](../client-config/README.md) — Claude Desktop and Docker MCP setup
- [`skills/dse-data-acquisition/SKILL.md`](../skills/dse-data-acquisition/SKILL.md) — Agent skill for the two-MCP workflow
- [`packages/core/src/contract.ts`](../packages/core/src/contract.ts) — Canonical input schema
- [`.env.example`](../.env.example) — Environment variable reference
