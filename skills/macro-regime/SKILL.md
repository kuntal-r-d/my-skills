---
name: macro-regime
description: Assesses the Bangladesh (DSE) macro regime — policy rate, FX reserves, inflation, BDT, politics, regulation — and emits a risk multiplier and regime label (risk_on/neutral/cautious/risk_off) that scales risk appetite across signals. Use when the user asks about the market regime, macro backdrop, "is now a risk-on or risk-off market", rate/reserve/inflation impact, or wants a macro multiplier to feed signal-synthesizer or risk-manager.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Macro Regime

> **Prompt-first skill.** Build the risk multiplier by the additive rules below.
> `scripts/regime.py` is OPTIONAL. Output is a regime label + a multiplier in [0.5, 1.2].

## Role & objective
You assess the Bangladesh market regime and emit a **risk multiplier** (0.5–1.2) that
downstream skills use to scale risk appetite, plus a regime label and a normalised score.

## When to use
"Is it risk-on or risk-off?", "macro backdrop", "rate/reserve/inflation impact", "macro
multiplier". Feed into `signal-synthesizer` and `risk-manager`.

## Inputs you need
**`macro`** — object with any of: `policy_rate` (decimal), `inflation` (decimal),
`reserves_trend` (`rising`/`stable`/`falling`), `politics` (`stable`/`tense`/`crisis`),
`regulatory` (`normal`/`tightening`/`floor_prices`). Missing fields → flag `stale_macro`.

## Method — start at 1.0, add each factor
- **Policy rate:** ≥ 9% → −0.10 (tight); else +0.07 (accommodative).
- **Inflation:** > 8% → −0.10 (risk-off); else +0.05.
- **Reserves:** falling → −0.12; rising → +0.10; stable → 0.
- **Politics:** crisis → −0.20; tense → −0.10; stable → +0.05.
- **Regulatory:** floor_prices → −0.15; tightening → −0.08; normal → 0.

Clamp the multiplier to **[0.5, 1.2]**.

## Scoring rubric
Regime label: mult ≥ 1.05 → **risk_on** · ≥ 0.85 → **neutral** · ≥ 0.70 → **cautious** · else **risk_off**.

Normalised **score** = clamp((mult − 1.0) / 0.2, −1, +1).

**Confidence** = clamp(0.85 − 0.12·(#missing fields), 0.2, 0.9); if any field missing, cap at 0.6.

## Output (emit this Thinking Card)
```json
{ "skill": "macro-regime", "ticker": "..", "mode": "both", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "risk_on|neutral|cautious|risk_off",
  "key_metrics": { "risk_multiplier": 1.0, "drivers": { "policy_rate": 0.0, "inflation": 0.0 } },
  "reasoning": ["each factor's effect"], "flags": ["stale_macro?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Floor prices** are a Bangladesh-specific regime breaker — they trap liquidity and break
  price discovery; weight them as a strong risk-off factor (−0.15).
- **Reserves / BDT pressure** drives the DSE more than rates alone — don't ignore the external balance.
- Missing macro fields are common — flag `stale_macro` and cap confidence rather than assuming neutral.

## Optional precision helper
```bash
python3 scripts/regime.py --input data.json --pretty
```
Returns the multiplier, per-driver contributions, regime label and score.

## Worked example
policy_rate 10% (−0.10), inflation 9.5% (−0.10), reserves falling (−0.12), politics tense
(−0.10), regulatory normal (0) → mult ≈ 0.58 → **risk_off**, score ≈ −1.0.

## References
Regime model: [references/REGIME.md](references/REGIME.md).
Output is educational analysis only, never financial advice.
