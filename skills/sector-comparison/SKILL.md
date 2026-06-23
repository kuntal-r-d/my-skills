---
name: sector-comparison
description: Compares a DSE stock against its sector and peer group — relative performance, valuation (P/E, P/B, EV/EBITDA) vs sector, fundamental rankings (ROE/margins/growth), and sector money-flow/momentum — to gauge relative strength and over/undervaluation. Use when the user asks how a stock stacks up vs peers/sector, sector rotation, relative strength, "is GP cheap vs other banks", or peer ranking on the Dhaka Stock Exchange.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — no bundled script; the model compares supplied peer data.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Sector Comparison

> **Prompt-first, pure-prompt skill.** No script — compare the stock against the supplied peer
> set and sector aggregates.

## Role & objective
Rank a stock within its sector/peer group on performance, valuation and fundamentals, and judge
relative strength and over/undervaluation — returning a relative score (−1..+1), confidence, rating.

## When to use
"How does GP stack up vs other banks?", "is it cheap vs the sector?", "peer ranking", "sector
rotation / relative strength". Pairs with `fundamental-analysis` for the absolute view.

## Inputs you need
- **Target** `{ticker, sector, fundamentals, recent return}`.
- **`peers[]`** — same fields for ≥5 peers, and/or **sector aggregates** (sector P/E, sector return).
- Optional market return for relative strength.

## Method (follow in order)
1. **Relative performance** — stock return vs sector and market; relative strength ratio; momentum.
2. **Peer ranking** — percentile rank within peers on each metric; overall standing.
3. **Valuation vs sector** — P/E, P/B, P/S, EV/EBITDA, PEG relative to sector median → premium/discount.
4. **Fundamental ranking** — ROE/ROA/ROIC, margins, growth, leverage ranks within the group.
5. **Sector trend** — money flow, institutional positioning, regulatory backdrop.

## Scoring rubric
score = clamp(0.4·valuation_discount + 0.3·fundamental_rank + 0.3·relative_strength, −1, 1)
(percentiles centred so median = 0). Rating: ≥0.5 strong_outperform · ≥0.15 outperform ·
−0.15..0.15 in_line · ≤−0.15 underperform. Confidence rises with ≥5 comparable peers and complete metrics.

## Output (emit this Thinking Card)
```json
{ "skill": "sector-comparison", "ticker": "..", "mode": "..", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "outperform|in_line|underperform|..",
  "key_metrics": { "sector": "..", "peer_rank": "3/15", "percentile": 80,
    "stock_pe": 0, "sector_pe": 0, "valuation": "undervalued|fair|overvalued",
    "relative_strength": 0.0 },
  "reasoning": ["..."], "flags": ["too_few_peers?", "missing_metrics?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE sectors are small and concentrated — a "peer group" may be 3–4 names; flag thin comparison.
- Sector P/E can be skewed by one giant or by loss-makers — prefer medians, and note outliers.
- Relative strength is only meaningful over a consistent window — state the lookback.

## Optional precision helper
No bundled script — pure-prompt skill. Use `stock-screener` to assemble a peer universe and
`fundamental-analysis` for each peer's metrics.

## Worked example
GP vs 15 banks: return +12% vs sector +9% (RS 1.25), P/E 12.3 vs sector 15.7 (−21% discount),
ROE rank 2/15 → score ≈ +0.5 → **outperform / undervalued**, confidence ≈ 0.75.

## References
See `stock-screener/references/SCREENS.md` for sector keys.
Output is educational analysis only, never financial advice.
