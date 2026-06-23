---
name: smart-money-flow
description: Tracks institutional, foreign, sponsor/director, and fund-manager moves for a DSE stock from public shareholding disclosures and returns an accumulation/distribution score, rating, and reasoning. Use when the user asks about smart money, institutional buying/selling, foreign inflow/outflow, sponsor or director (insider) activity, shareholding changes, which funds hold a stock, or whether big players are accumulating a Dhaka Stock Exchange ticker. Public data only.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-002:REQ-021"]
  mode: ["investment"]
---

# Smart-Money Flow

> **Prompt-first skill.** Read public disclosures by the rules below. `scripts/analyze.py`
> is OPTIONAL. **Hard guardrail: PUBLIC disclosure data only — never infer or fabricate a
> private broker book.** If data is missing, say so and lower confidence.

## Role & objective
You assess accumulation vs distribution from public shareholding-pattern changes and
disclosed fund moves, returning a score (−1..+1), confidence and rating.

## When to use
"Are institutions accumulating GP?", "any foreign inflow?", "sponsor/insider selling?",
"which funds hold this?". Feed the score into `signal-synthesizer`.

## Inputs you need
- **`shareholding`** — array of monthly snapshots with `month` and `%` for `sponsor`,
  `govt`, `institution`, `foreign`, `public`. Need ≥2 months for a trend.
- *(optional)* **`funds`** — `{name, ticker_weight_pct, prev_weight_pct, track_record_3y, manager}`.

If no `shareholding`: return score 0, confidence 0.1, rating neutral, flag `no_disclosure_data`.

## Method — month-over-month deltas (significance = ±2.0 pp)
Compare the latest two months. For each holder type:
- **Institution:** ≥ +2pp → +0.3 (accumulation); ≤ −2pp → −0.3 (distribution).
- **Foreign:** ≥ +2pp → +0.3 (inflow); ≤ −2pp → −0.3 (outflow); else small +0.1 / −0.1 by sign.
- **Sponsor/director:** ≤ −2pp → **−0.4 + flag `sponsor_director_selling` (RED FLAG)**;
  small cut −0.15; ≥ +2pp → +0.25 (insider buying); small rise +0.1.
- **Funds (optional):** weight raised → up to +0.3 scaled by 3-year track record; weight cut → −0.1.

Clamp the total to [−1, +1].

## Scoring rubric
Rating: score ≥ 0.2 → **accumulation** · ≤ −0.2 → **distribution** · else **neutral**.

**Confidence** starts 0.6, **capped at 0.70** (monthly cadence is stale → always flag
`monthly_disclosure_lag`); −0.25 if only one month (`single_month_no_trend`); −0.05 if no fund data.

## Output (emit this Thinking Card)
```json
{ "skill": "smart-money-flow", "ticker": "..", "mode": "investment", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "accumulation|distribution|neutral",
  "key_metrics": { "latest_deltas": {}, "latest_month": "..", "funds_featuring": [],
    "significance_threshold_pp": 2.0 },
  "reasoning": ["dated MoM moves"], "flags": ["monthly_disclosure_lag", "..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Monthly lag:** DSE shareholding is disclosed monthly — it's stale by construction; never
  present it as real-time and keep confidence ≤ 0.70.
- **Sponsor selling is the strongest negative** — insiders know most; weight it heavily.
- **No private data:** if foreign/institution fields are absent, score them as unknown, not zero-bad.

## Optional precision helper
```bash
python3 scripts/analyze.py --input data.json --pretty
```
Returns the per-holder deltas, fund featuring, score/confidence/rating.

## Worked example
Latest month: institution +3pp, foreign +2.5pp, sponsor flat → +0.3 +0.3 = +0.6 → **accumulation**,
confidence 0.6 (capped), flag `monthly_disclosure_lag`.

## References
Methodology & guardrails: [references/METHODOLOGY.md](references/METHODOLOGY.md).
Output is educational analysis only, never financial advice.
