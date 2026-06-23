---
name: dse-data-acquisition
description: Instructions for an MCP client / agent on how to gather public Dhaka Stock Exchange (DSE) data for a ticker and assemble the shared data-contract JSON that the Stock Buddy analysis skills require. Use this FIRST whenever a user asks to analyze, screen, or get a signal for a DSE ticker (e.g. "analyze LHB") — the analysis tools do not fetch data, the client must supply it. Covers where to source OHLCV, fundamentals, shareholding, news and macro, the exact JSON shape, and the order to call the analysis tools.
license: Apache-2.0
compatibility: Client-side instructions. No script; the agent uses its own data tools.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-001:REQ-001"]
  mode: ["momentum", "investment"]
---

# DSE Data Acquisition (read me before analyzing any ticker)

## Why this skill exists

The Stock Buddy skills **analyse data; they do not fetch it** (by design — the
server is a thin, no-network instruction/analysis layer). So a call like
`analyze_ticker` with only a ticker name returns *nothing* — every stage is
skipped for "missing ohlcv / fundamentals / news". **You (the MCP client/agent)
must gather the data and pass it in.** This skill tells you how.

## The workflow

1. **Identify the ticker** — confirm the DSE trade code (e.g. `LHB` =
   LafargeHolcim Bangladesh PLC).
2. **Gather public data** using your own tools (web fetch, a DSE scraper, a
   database, a file). Sources, in order of authority:
   - **Prices / OHLCV & disclosures:** dsebd.org / dse.com.bd (official). For a
     historical daily series, use the DSE historical-data page or any data
     provider that exposes it. You need **≥30 daily bars** for technical
     analysis (≥200 for the full moving-average stack) and **≥15** for risk
     sizing.
   - **Fundamentals:** the company's financial statements / annual report, or a
     financial-data site (e.g. stockanalysis.com, lankabd.com, amarstock.com).
   - **Shareholding pattern:** DSE company page (public monthly snapshots).
   - **News / disclosures:** DSE news feed, amarstock, business press.
   - **Macro:** Bangladesh Bank (inflation, policy rate), official FX.
3. **Assemble the contract JSON** (shape below). Include only what you have;
   each skill validates its own required fields and flags (never silently drops)
   what's missing.
4. **Call the analysis tools** with that JSON (see "Call sequence").
5. **Interpret** the returned Thinking Cards for the user, always keeping the
   educational-only framing.

## The shared data contract (assemble this)

```json
{
  "ticker": "LHB",
  "as_of": "2026-06-16",
  "mode": "investment",                      // or "momentum"
  "ohlcv": [
    {"date": "2026-05-01", "open": 51.2, "high": 51.9, "low": 50.8, "close": 51.5, "volume": 740000}
    // ... oldest-first, >=30 daily bars (>=200 ideal)
  ],
  "fundamentals": {
    "price": 54.3, "eps_ttm": 4.17, "eps_history": [3.09, 4.17],
    "earnings_growth": 0.351, "book_value_per_share": 17.33,
    "debt_to_equity": 0.0, "current_ratio": 1.11, "interest_coverage": null,
    "free_cash_flow": 2990000000, "profit_margin": 0.168, "roe": 0.241,
    "pe": 13.03, "pb": 3.13, "dividend_yield": 0.073, "sector_median_pe": 15.0
  },
  "shareholding": [ {"date": "2026-05-31", "sponsor": 0.6, "institution": 0.0002, "public": 0.40} ],
  "news": [ {"date": "2026-06-10", "headline": "...", "source": "DSE", "category": "disclosure"} ],
  "macro": { "inflation": 0.09, "policy_rate": 0.10 },
  "microstructure": { "circuit_limit_hit": false, "floor_price": false },
  "account": { "equity": 500000, "risk_per_trade_pct": 1.0 }
}
```

Minimum to get *something* useful: `fundamentals` (→ fundamental &
value-investment skills) **or** `ohlcv` with ≥30 bars (→ technical & momentum).
For the full `analyze_ticker` pipeline + risk sizing, supply both plus
`account`.

## Call sequence

- One-shot: pass the whole contract to **`analyze_ticker`** — it runs the leaf
  analyses, fuses them (`signal_synthesizer`), and risk-checks (`risk_manager`).
- Or call leaves individually: `technical_analysis` (ohlcv), `fundamental_analysis`
  / `value_investment_checklist` (fundamentals), `smart_money_flow` (shareholding),
  `sentiment_news` (news), `macro_regime` (macro) → then `signal_synthesizer`
  (their score/confidence) → `risk_manager` (ohlcv + account) → `ticker_dossier`.

## Notes

- **Public data only.** No private broker books; smart-money flow uses disclosed
  shareholding deltas.
- Pass numbers as numbers (not strings); dates as `YYYY-MM-DD`; OHLCV oldest-first.
- If you call an analysis tool with missing data it returns a structured
  `error`/`flags` (and `analyze_ticker` returns an `instructions` block) telling
  you what to gather — re-call once you have it.
- Output is educational analysis only, never financial advice.
