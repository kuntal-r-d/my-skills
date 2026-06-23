---
name: ticker-dossier
description: Consolidates the Thinking Cards from sibling Stock Buddy skills into one PDF-ready Markdown dossier for a DSE ticker. Use when the user asks for a full report, one-pager, "everything on this stock", a consolidated/printable analysis, an investment memo, or a single document combining technical, momentum, fundamental, value, smart-money, sentiment, macro, synthesizer, and risk views for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-001:REQ-017"]
  mode: ["momentum", "investment"]
---

# Ticker Dossier

> **Prompt-first skill.** This is a **renderer, not an analyser** — never fabricate numbers.
> Run the sibling skills first, then compose their Thinking Cards into one report.
> `scripts/dossier.py` is OPTIONAL and produces the canonical Markdown deterministically.

## Role & objective
You consolidate the supplied analysis cards into one PDF-ready Markdown dossier: an
at-a-glance verdict table, themed sections, and a provenance footer noting what was missing.

## When to use
"Full report / one-pager / investment memo on GP", "everything on this stock", "a single
printable analysis". Run **last**, after the component skills have produced their cards.

## Inputs you need
- **`ticker`**, **`as_of`**.
- **`cards`** — a map of the sibling outputs keyed by: `technical`, `momentum`, `pattern`,
  `fundamental`, `value`, `smart_money`, `sentiment`, `macro`, `synthesizer`, `risk`.
  Only the cards present are rendered; absent ones are listed as missing. Empty `cards` → a
  labelled skeleton report (never invented content).

## Method (follow in order)
1. **At-a-glance table** — one row per present card: rating (or grade/status), score (or
   composite), confidence.
2. **Themed sections** — Investment view (fundamental, value); Momentum view (technical,
   momentum, pattern); Risk & levels (risk); Smart-money & sentiment; Macro context;
   Synthesised signal. Each renders rating/score/confidence + up to ~8 reasoning bullets + flags.
3. **Provenance footer** — list included vs missing cards; note verdicts are only as fresh as
   the supplied cards.

## Scoring rubric
None — the dossier does not score. It faithfully transcribes each card's existing
rating/score/confidence; if a field is absent it shows "-". Verdicts are inherited, never recomputed.

## Output
```json
{ "skill": "ticker-dossier", "ticker": "..", "as_of": "..",
  "markdown": "# Ticker Dossier — .. (full report)",
  "included_cards": ["fundamental", ".."], "missing_cards": ["pattern", ".."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Never invent** a verdict for a missing analysis — show it as missing in the footer.
- The dossier is only as current as the cards passed in — re-run the component skills to refresh.
- Keep the educational-only framing at the top; this is not individualised advice.

## Optional precision helper
```bash
python3 scripts/dossier.py --input dossier_input.json --pretty
```
Input: `{"ticker":"..","as_of":"..","cards":{"technical":{...},"fundamental":{...}}}`.
Returns the assembled Markdown plus included/missing card lists.

## Worked example
Cards for fundamental (buy) + technical (bullish) + risk (reduced) supplied; pattern/sentiment
missing → table shows 3 rows, sections render those three, footer lists 7 missing cards.

## References
Dossier layout: [references/DOSSIER.md](references/DOSSIER.md).
Output is educational analysis only, never financial advice.
