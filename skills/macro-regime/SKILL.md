---
name: macro-regime
description: Assesses the Bangladesh (DSE) macro regime — policy rate, FX reserves, inflation, BDT, politics, regulation — and emits a risk multiplier and regime label (risk_on/neutral/cautious/risk_off) that scales risk appetite across signals. Use when the user asks about the market regime, macro backdrop, "is now a risk-on or risk-off market", rate/reserve/inflation impact, or wants a macro multiplier to feed signal-synthesizer or risk-manager.
license: Apache-2.0
compatibility: Python 3.8+, standard library only. No network. No third-party packages.
metadata:
  author: stock-buddy
  version: "0.1.0"
  prd_refs: ["PRD-002:REQ-020"]
  mode: ["momentum", "investment"]
---

# Macro Regime

## When to use

Activate when a user wants the macro read on the Dhaka Stock Exchange: "what's the
market regime?", "is this a risk-on environment?", "how do rates and reserves affect
risk?", "give me a macro multiplier". This is the Macro Agent (PRD-002 REQ-020). Its
risk multiplier is meant to be consumed downstream by `signal-synthesizer` (to scale
the composite score) and `risk-manager` (to scale position sizing).

## What it does

Reads the shared contract's `macro` block and computes a single **risk multiplier**
in `[0.5, 1.2]`, starting from `1.0` (neutral) and adjusting for each factor:

- **Policy rate** — tight money (>=9%) lowers the multiplier; accommodative raises it.
- **Inflation** — above 8% lowers it (real-return erosion, tightening risk).
- **FX reserves trend** — `falling` lowers it (import-cover stress, BDT pressure);
  `rising` raises it; `stable` is neutral.
- **Politics** — `crisis`/`tense` lower it; `stable` raises it.
- **Regulatory** — `floor_prices`/`tightening` lower it; `normal` is neutral.

The clamped multiplier maps to a **regime label** and to a normalised `score` in
`[-1, +1]`. Output is a Thinking Card (see suite README).

## How to run

```bash
python3 scripts/regime.py --input data.json --pretty
cat data.json | python3 scripts/regime.py
```

Reads `macro` (required) and optional `mode`/`ticker`/`as_of`. Returns `score`
(-1..+1), `confidence`, `rating` (regime label), `key_metrics.risk_multiplier`,
per-factor `drivers`, plain-language `reasoning`, and `flags`.

Try it now with the shared fixture:

```bash
python3 scripts/regime.py --input ../_fixtures/sample_input.json --pretty
```

## Interpreting output

- `rating`: `risk_on` (mult >=1.05), `neutral` (0.85–1.05), `cautious` (0.70–0.85),
  `risk_off` (<0.70).
- `key_metrics.risk_multiplier` is the value downstream skills multiply into their
  risk budget — e.g. risk-manager sizes positions at `base_risk * risk_multiplier`.
- `flags`: `stale_macro` appears when one or more `macro` fields are missing and
  confidence is capped accordingly — never a silent drop.

## Notes

Factor weights, the multiplier→regime mapping, the score mapping, and how downstream
skills consume the multiplier are documented in [references/REGIME.md](references/REGIME.md).
Output is educational analysis only, never financial advice.
