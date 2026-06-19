---
name: smart-money-flow
description: Tracks institutional, foreign, sponsor/director, and fund-manager moves for a DSE stock from public shareholding disclosures and returns an accumulation/distribution score, rating, and reasoning. Use when the user asks about smart money, institutional buying/selling, foreign inflow/outflow, sponsor or director (insider) activity, shareholding changes, which funds hold a stock, or whether big players are accumulating a Dhaka Stock Exchange ticker. Public data only.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-021", "PRD-002:REQ-106", "PRD-001:REQ-051"]
  mode: ["momentum", "investment"]
---

# Smart Money Flow

## When to use

Activate when a user asks who is moving a DSE stock: "is smart money accumulating GP?",
"any foreign inflow into BEXIMCO?", "did sponsors sell?", "which funds hold this?",
"institutional buying or selling?". This is the flow leg of the dual-mode signal — feed
its score into `signal-synthesizer`, or pair it with `sentiment-news`.

## What it does

Implements the Smart Money Agent and Fund Manager Tracker (PRD-002 REQ-021/106) using
**public disclosure data only**:

1. **Shareholding deltas** — month-over-month change in sponsor / govt / institution /
   foreign / public percentages. Moves >= 2pp (institution, foreign, sponsor) are
   significant.
2. **Directional rules**:
   - Foreign **inflow** is positive (confidence/governance signal); outflow negative.
   - Institutional **accumulation** positive; distribution negative.
   - Sponsor/director **selling** is a RED FLAG (strong negative); buying positive.
3. **Fund manager featuring** — from the optional `funds` array, funds raising their
   weight are positive, scaled by `track_record_3y`; funds cutting weight are negative.

Output is a Thinking Card (see suite README) with the accumulation/distribution score.

## Guardrails (critical, PRD-002 REQ-021)

- Uses **only** the public disclosure data present in the input.
- **Never** fabricates or infers a private/non-public "broker book". Missing data is
  reported in `reasoning` and lowers `confidence`.
- Monthly cadence is stale by nature -> confidence is **capped at 0.7** and the flag
  `monthly_disclosure_lag` is always present.
- No `shareholding` -> `score` 0, low confidence, flag `no_disclosure_data`, and the
  reasoning explains the data is unavailable (nothing is invented).

## How to run

```bash
python3 scripts/analyze.py --input data.json --pretty
cat data.json | python3 scripts/analyze.py
```

Reads `shareholding` (monthly array) and optional `funds`. Returns `score` (-1..+1),
`confidence` (0..1, capped 0.7), `rating` (`accumulation` / `neutral` / `distribution`),
`key_metrics` (latest deltas, named funds featuring) and dated `reasoning`.

Try it now with the shared fixture:

```bash
python3 scripts/analyze.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `rating accumulation` with foreign + institutional inflow and no sponsor selling is
  the strongest constructive read.
- A `sponsor_director_selling` flag is the single most important warning — it dominates
  the score even amid other inflow.
- `flags` carry confidence penalties (`monthly_disclosure_lag`, `single_month_no_trend`,
  `no_disclosure_data`) — never silently dropped.

## Notes

The rules, the 2pp threshold, the public-data-only guardrail, and DSE monthly
shareholding disclosure context are documented in
[references/METHODOLOGY.md](references/METHODOLOGY.md). Output is educational analysis
only, never financial advice.
