---
name: daily-briefing
description: Produces a DSE pre-market daily briefing for a user's portfolio and watchlist using conditions-and-levels phrasing (never buy/sell commands). Use when the user asks for a morning briefing, pre-market summary, "what should I watch today", overnight news/disclosure recap, or a rundown of positions near stops/targets, watchlist names near entry, today's economic/earnings calendar, and risk items for Dhaka Stock Exchange holdings.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-109", "PRD-001:REQ-050"]
  mode: ["momentum", "investment"]
---

# Daily Briefing

## When to use

Activate when a user wants a pre-market read on their book: "give me my morning briefing",
"what's near my stops today?", "any overnight news on my holdings?", "watchlist names close
to entry?", "what's on the DSE calendar today?". This is the **Daily Briefing Agent**
(PRD-002 REQ-109; PRD-001 REQ-050). It composes the outputs of other skills' levels into a
single readable card on a **post-close / pre-market dual schedule** (see references).

## Critical tone rule

The briefing **never issues commands**. It describes *conditions and levels* only:
"GP is within 2% of its stop level (price 178.0 vs stop 182.0)" — **not** "sell GP".
Every generated line passes a no-imperative guardrail (`strip_imperatives` in
`scripts/brief.py`) that rewrites or flags command verbs ("buy", "sell", "watch for",
"if X then consider"). See [references/BRIEFING.md](references/BRIEFING.md).

## What it does

Builds six sections from the input:

1. **Market regime** — one line from `macro_regime` (rating + risk multiplier).
2. **Held positions near levels** — positions whose `current_price` is within ~3% of a
   `stop_level` or `target_level`.
3. **Watchlist near entry** — watchlist names within ~3% of their `entry_level`.
4. **Calendar today** — economic/earnings events dated `as_of`.
5. **Overnight news / disclosures** — headlines mapped to held/watch tickers.
6. **Risk items** — circuit/floor/halt mentions and single-name concentration.

## How to run

```bash
python3 scripts/brief.py --input briefing_input.json --pretty
cat briefing_input.json | python3 scripts/brief.py
```

Input fields: `as_of`, optional `user`, `portfolio.positions[]`
(`ticker, qty, avg_cost, current_price, stop_level?, target_level?`), `watchlist[]`
(`ticker, current_price, entry_level?, signal?`), `calendar[]` (`date, event`),
`overnight_news[]` (`ticker, headline, source`), `macro_regime` (`rating, risk_multiplier`).

## Interpreting output

Returns `summary` (1–2 sentences), `markdown` (the full briefing), `sections{...}`,
`item_counts{}`, and `flags[]`: `stale_briefing` (missing/old `as_of`), `fallback`
(no positions supplied). All phrasing is conditional — treat as situational awareness,
not instructions. Educational analysis only, never financial advice.
