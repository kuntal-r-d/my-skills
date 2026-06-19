# Daily Briefing — methodology & constraints

The Daily Briefing Agent (PRD-002 REQ-109; PRD-001 REQ-050) produces a readable
situational-awareness card for the start of a trading session. It does **not** generate
new signals — it surfaces the *levels and conditions* already present in the user's book,
watchlist, calendar, and overnight information.

## Dual schedule context (post-close / pre-market)

Stock Buddy runs the briefing engine on two cadences against the DSE Sun–Thu week:

- **Post-close briefing** — after the 14:30 close: recaps the session, updates levels,
  flags positions that moved through stops/targets intraday, and stages tomorrow's calendar.
- **Pre-market briefing** — before the 10:00 open: re-reads overnight news/disclosures and
  refreshed prices so the user starts the day knowing which names sit near a level.

This script renders the **pre-market** variant. Both share the same section schema below;
only the framing line and freshness window differ. A briefing whose `as_of` is missing or
older than two days is flagged `stale_briefing`.

## Section structure

| # | Section | Trigger |
|---|---------|---------|
| 1 | Market regime | `macro_regime.rating` + `risk_multiplier` |
| 2 | Held positions near levels | `current_price` within ~3% of `stop_level` or `target_level` |
| 3 | Watchlist near entry | `current_price` within ~3% of `entry_level` |
| 4 | Calendar today | `calendar[].date == as_of` |
| 5 | Overnight news & disclosures | every `overnight_news[]` item, scoped held/watch vs other |
| 6 | Risk items | concentration ≥ 25% of book value; circuit/floor/halt keywords; risk-off regime |

`item_counts` reports the raw and near-level tallies; `flags` carries
`stale_briefing`, `fallback` (no positions), and `imperative_phrasing_rewritten`.

## Conditional-language guardrail (PRD-002 constraint)

The briefing is **conditions-and-levels only**. It must never tell the user to act
("buy GP", "sell now", "watch for a breakout then consider adding"). `strip_imperatives()`
in `scripts/brief.py` enforces this:

1. It scans each generated line for command verbs and phrases
   (`buy`, `sell`, `short`, `exit now`, `go long`, `take profit`, `cut`,
   `you should …`, `watch for …`, `if … then consider …`).
2. It rewrites each into a neutral conditional form — e.g. `watch for` → `a level to note is`,
   `buy` → `an entry-level condition`, `if X then consider` → `a condition is met when X and a
   level is in view at`.
3. Every line in every section is routed through the guardrail before assembly; if any line
   was rewritten the card adds the `imperative_phrasing_rewritten` flag so the change is
   auditable (glass-box, never silent).

This keeps the briefing on the correct side of the PRD boundary: Stock Buddy provides
educational analysis and situational awareness, never individualised instructions to trade.

## Extending

- Tune `NEAR_PCT`, `CONCENTRATION_PCT`, and `STALE_DAYS` at the top of `brief.py`.
- Add rewrite pairs to `_IMPERATIVE_REWRITES` as new command phrasings appear.
- Feed the other skills' Thinking Cards in via `watchlist[].signal` to carry context
  without importing their imperative-free phrasing obligations.
