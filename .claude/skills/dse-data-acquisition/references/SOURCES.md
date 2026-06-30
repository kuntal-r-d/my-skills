# DSE data sources — Stock Buddy implementation map

Stock Buddy is a **TypeScript/Node** monorepo (not Python `bdshare`), but follows the same
source hierarchy documented in the research brief. This file maps each category to what the
ingest layer actually calls.

## Legal note

DSE asserts copyright over market data. Use scraped data for personal analysis only; do not
redistribute raw feeds commercially without permission.

---

## OHLCV (Category 1)

| Priority | Source | Stock Buddy ID | Endpoint / module |
|----------|--------|----------------|-------------------|
| 1 | DSE `day_end_archive.php` | `dse` | `fetchDseArchiveOhlcv()` — `dsebd.org` + `dsebd.com.bd` fallback |
| 2 | StockAnalysis history | `stockanalysis` | `fetchStockAnalysisOhlcv()` |
| 3 | Yahoo Finance `.DHA` | `yahoo` | `fetchYahooOhlcv()` (often empty; kept as fallback) |

**Env:** `INGEST_OHLCV_SOURCES=dse,stockanalysis,yahoo`  
**Daily worker:** `INGEST_DAILY_OHLCV_DAYS=90` (calendar days; DSE Sun–Thu ≈ 60+ trading bars)

**Not yet wired:** AmarStock EOD CSV (`api.amarstock.com/csv-data-download`) — requires
session/auth capture via browser DevTools; use for bulk backfill when available.

**Paid alternative:** DSE iMDS/EOD commercial feed (true real-time).

---

## Fundamentals (Category 2)

| Priority | Source | ID | Module |
|----------|--------|-----|--------|
| 1 | DSE `displayCompany.php` | `dse` | `DSEScraper.fetchFundamentalsAndShareholding()` |
| 2 | StockAnalysis quote | `stockanalysis` | `fetchStockAnalysisFundamentals()` |
| 3 | StockAnalysis statistics | `stockanalysis_statistics` | `fetchStockAnalysisStatistics()` |
| 4 | LankaBangla DataMatrix | `lankabd` | `fetchLankabdFundamentals()` |
| 5 | AmarStock API | `amarstock` | `fetchAmarStockFundamentals()` |

**Env:** `INGEST_FUNDAMENTALS_SOURCES=dse,stockanalysis,stockanalysis_statistics,lankabd,amarstock`

Bulk universe: `npm run ingest -- --job fundamentals-universe` (LankaBD DataMatrix).

---

## Shareholding (Category 3)

| Source | Module |
|--------|--------|
| DSE `displayCompany.php` | `ingestShareholding()` → `parseDseShareholdingHtml()` |

Monthly sponsor/institution/foreign/public % from the company page.

---

## News & PSI (Category 4)

| Priority | Source | ID | Module |
|----------|--------|-----|--------|
| 1 | DSE `old_news.php` PSI | `dse_psn` | `fetchDseNewsArchive({ criteria: 1 })` |
| 2 | DSE corporate | `dse_corporate` | `fetchDseNewsArchive({ criteria: 2 })` |
| 3 | DSE company page | per-ticker | `ingestNews()` → `parseDseNewsHtml()` |
| 4 | Newspapers / RSS | `tbs_stocks`, `financial_express`, … | `fetchMarketNews()` |

**Env:** `INGEST_NEWS_SOURCES` — defaults now include `dse_psn,dse_corporate` first.

> **Note (Jun 2026):** DSE `old_news.php` currently returns a 302 shell page without
> news tables for unauthenticated POSTs. The scraper is wired (bdshare-compatible); when
> DSE restores the archive or requires a session cookie flow, it will activate automatically.
> Per-ticker PSI still comes from `displayCompany.php` via `ingestNews()`.

---

## Macro (Category 5)

| Field | Primary source | Stock Buddy |
|-------|----------------|-------------|
| `inflation` | Bangladesh Bank CPI page | `fetchBangladeshBankMacro()` |
| `policy_rate`, `fx_reserves_bn`, `bdt_usd` | Seed defaults | `DEFAULT_MACRO` until BB Excel parser added |

**Future:** Bangladesh Bank Open Data Excel (`bb.org.bd/en/index.php/econdata/index`), BBS PDFs,
World Bank / FRED APIs as convenience overlays.

---

## Commands

```bash
# Full ticker backfill
docker compose run --rm -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy \
  stock-buddy-mcp node packages/ingest/dist/cli.js -- --ticker GP --job all --days 365

# Market news + DSE PSI
npm run ingest -- --job news-market

# Macro (BB inflation + seed defaults)
npm run ingest -- --job macro

# Automated daily
docker compose up -d ingest-worker
```

---

## bdshare equivalence (Python → TypeScript)

| bdshare function | Stock Buddy equivalent |
|------------------|------------------------|
| `get_basic_hist_data()` | `fetchDseArchiveOhlcv()` |
| `get_company_info()` | `DSEScraper.fetchFundamentalsAndShareholding()` |
| `get_price_sensitive_news()` | `fetchDsePriceSensitiveNews()` |
| `get_corporate_announcements()` | `fetchDseCorporateNews()` |
| `get_latest_pe()` | `fundamentals-universe` via LankaBD (partial) |

We do **not** embed Python `bdshare` in the MCP server; patterns are ported to TypeScript
for a single deployable Node image.
