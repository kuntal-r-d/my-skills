---
name: daily-briefing
description: Produces a DSE pre-market daily briefing for a user's portfolio and watchlist using conditions-and-levels phrasing (never buy/sell commands). Use when the user asks for a morning briefing, pre-market summary, "what should I watch today", overnight news/disclosure recap, or a rundown of positions near stops/targets, watchlist names near entry, today's economic/earnings calendar, and risk items for Dhaka Stock Exchange holdings.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-002:REQ-109"]
  mode: ["momentum", "investment"]
---

# Daily Briefing

> **Prompt-first skill.** Compose the briefing in **conditions-and-levels language — never
> issue buy/sell/exit commands** (hard constraint). `scripts/brief.py` is OPTIONAL and enforces
> the no-imperative guardrail; if you write by hand, self-check every line for commands.

## Role & objective
You produce a pre-market briefing over the user's positions, watchlist, calendar, overnight
news and macro regime — stating what is *near a level* and *what to note*, not what to do.

## When to use
"Morning briefing", "pre-market summary", "what should I watch today", "overnight recap",
"positions near stops/targets". Good as a scheduled task.

## Inputs you need
- **`portfolio.positions[]`** — `{ticker, current_price, qty, stop_level, target_level}`.
- **`watchlist[]`** — `{ticker, current_price, entry_level, signal}`.
- **`calendar[]`** — `{date, event}`; **`overnight_news[]`** — `{ticker, headline, source}`;
  **`macro_regime`** — `{rating, risk_multiplier}`; **`as_of`**.

## Method (follow in order)
1. **Market regime** — state rating + risk multiplier; sizing conditions scale with it.
2. **Positions near levels** — flag any held name within ~3% of its stop or target.
3. **Watchlist near entry** — flag any within ~3% of its entry level (note prior signal).
4. **Calendar today** — events dated `as_of`.
5. **Overnight news** — tag each as held/watch vs other.
6. **Risk items** — single-name concentration ≥ 25% of book; circuit/floor/halt mentions in
   headlines; risk-off macro.

## Scoring rubric
None — this is a briefing, not a score. The "rubric" is the **language guardrail**: rewrite any
imperative ("buy/sell/exit/watch for") into conditional levels phrasing; flag
`imperative_phrasing_rewritten` if you had to. Flag `stale_briefing` if `as_of` is missing or >2 days old.

## Output
```json
{ "skill": "daily-briefing", "as_of": "..", "summary": "..", "markdown": "# Pre-Market Briefing ..",
  "sections": { "market_regime": {}, "positions_near_levels": {}, "watchlist_near_entry": {},
    "calendar_today": {}, "overnight_news": {}, "risk_items": {} },
  "item_counts": {}, "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **No commands** — DSE briefings must describe conditions/levels only; "buy GP" becomes "an
  entry-level condition for GP is in view at …".
- **Circuit/floor/halt** headlines are first-class risk items on DSE — surface them.
- A stale briefing (weekend/holiday gap) is misleading — flag it rather than implying it's fresh.

## Optional precision helper
```bash
python3 scripts/brief.py --input briefing_input.json --pretty
```
Returns the Markdown briefing, structured sections, item counts, and guardrail flags.

## Worked example
3 positions, 1 within 2% of its stop; 1 watch name within 1.5% of entry; 1 earnings event today;
macro neutral → summary "neutral regime, 2 names near a level, 1 event today, 0 risk items".

## References
Briefing structure & guardrail: [references/BRIEFING.md](references/BRIEFING.md).
Output is educational analysis only, never financial advice.
