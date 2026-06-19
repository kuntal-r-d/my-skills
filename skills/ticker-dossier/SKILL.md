---
name: ticker-dossier
description: Consolidates the Thinking Cards from sibling Stock Buddy skills into one PDF-ready Markdown dossier for a DSE ticker. Use when the user asks for a full report, one-pager, "everything on this stock", a consolidated/printable analysis, an investment memo, or a single document combining technical, momentum, fundamental, value, smart-money, sentiment, macro, synthesizer, and risk views for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-116"]
  mode: ["momentum", "investment"]
---

# Ticker Dossier

## When to use

Activate when a user wants one consolidated document for a stock: "make a full dossier for
GP", "give me the one-pager on BEXIMCO", "compile everything into a printable report",
"build an investment memo I can export to PDF". This is the **one-click PDF ticker dossier**
(PRD-002 REQ-116).

## What it does

This skill is a **renderer, not an analyser**. To stay composable, the caller runs the
sibling skills first and passes their Thinking Cards in under `cards`. The dossier renders:

- a header (ticker, `as_of`, disclaimer banner);
- an **at-a-glance verdict table** (each available card's rating / score / confidence);
- **Investment view** (fundamental + value cards);
- **Momentum view** (technical + momentum + pattern cards);
- **Risk & levels** (risk-manager card);
- **Smart-money & sentiment** (smart_money + sentiment cards);
- **Macro context** (macro card);
- a **data provenance / missing analyses** footer listing which cards were absent.

If `cards` is empty it still produces a skeleton noting that no analyses were supplied —
it never fabricates numbers.

## How to run

```bash
python3 scripts/dossier.py --input dossier_input.json --pretty
cat dossier_input.json | python3 scripts/dossier.py
```

Input: `{ticker, as_of, data?, cards:{technical?, momentum?, fundamental?, value?,
smart_money?, sentiment?, macro?, synthesizer?, risk?, pattern?}}` where each card value is
the JSON output of the corresponding sibling skill. See
[references/DOSSIER.md](references/DOSSIER.md) for the card map and PDF export recipe.

## Interpreting output

Returns `markdown` (the full dossier), `included_cards[]`, `missing_cards[]`, and
`disclaimer`. Convert `markdown` to PDF with any Markdown→PDF tool (e.g. `pandoc`) — not
required at runtime. Educational analysis only, never financial advice.
