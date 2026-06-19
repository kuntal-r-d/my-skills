# Signal Synthesis Methodology

The synthesizer (Mode Router + Synthesizer, PRD-002 REQ-022; DSE Composite Score, REQ-111)
fuses per-agent sub-scores into two independent signals — **Investment** and **Momentum** —
so a single ticker can be evaluated for both long-term holding and short-term trading at once.

## Input

```json
"agents": {
  "technical":   {"score": 0.40, "confidence": 0.70},
  "fundamental": {"score": 0.60, "confidence": 0.80},
  "smart_money": {"score": 0.30, "confidence": 0.60},
  "sentiment":   {"score": 0.20, "confidence": 0.50},
  "macro":       {"score": -0.10, "confidence": 0.60},
  "volume_flow": {"score": 0.35, "confidence": 0.65}
}
```

- Each `score` is in **[-1, +1]**, each `confidence` in **[0, 1]** (clamped on intake).
- `volume_flow` is **optional**. If absent it is derived from `technical`
  (`0.8 × technical`) and the flag `volume_flow_derived_from_technical` is raised.
- At least one of `technical` / `fundamental` must be present.

## Weights

Missing agents are dropped and the remaining weights are **renormalised** so an absent agent
does not silently deflate the score.

### Investment (long-term)

| Agent | Weight |
|-------|--------|
| fundamental | 0.40 |
| smart_money | 0.20 |
| macro | 0.15 |
| sentiment | 0.15 |
| technical | 0.10 |

### Momentum (short-term)

| Agent | Weight |
|-------|--------|
| technical | 0.45 |
| volume_flow | 0.20 |
| smart_money | 0.15 |
| sentiment | 0.12 |
| fundamental | 0.08 (**veto only**) |

**Fundamental veto:** in momentum, the 0.08 weight is small by design. Additionally, if
`fundamental.score < -0.5` the momentum rating is **capped at `stand_aside`** regardless of
technicals — a broken business is not a tradeable momentum name.

## Confluence rule

A *high-conviction* call requires more than a high weighted average — it requires breadth:

- If **|weighted| ≥ 0.5**, the call is only kept at its strong rating when **≥ 2 independent
  agents agree in sign** with **|score| ≥ 0.3**.
- Otherwise the rating is **downgraded** to a moderate one (`strong_buy → buy`) and
  confidence is reduced by 0.1.

This prevents one loud agent from manufacturing false conviction.

## Strong-conflict rule (stand_aside, not average)

If a **strongly bullish** agent (score ≥ 0.5) and a **strongly bearish** agent
(score ≤ -0.5) are present at the same time, the synthesizer does **not** blend them into a
misleading mid-score. It outputs **`stand_aside`** and names the conflicting agents in the
reasoning. Averaging a +0.7 and a -0.7 into "≈0, hold" would hide a real disagreement; the
honest output is "the committee is split — stand aside."

## DSE Composite Score (1-10)

Each weighted score (-1..+1) is mapped linearly to a 1-10 composite:

```
composite = round( clamp(5.5 + 4.5 * weighted, 1, 10) )
```

So -1 → 1, 0 → 5/6, +1 → 10. The score is **decomposable**: `contributions{}` reports each
agent's `renormalised_weight × score`, and the contributions sum to the weighted score, so a
reader can see exactly which agent moved the composite.

## Microstructure suppression (REQ-097)

When price discovery is interrupted, momentum signals are unreliable:

- If `microstructure.circuit_state` is `limit_up` or `limit_down`, **or** `floor_price` is
  set, **or** `halted` is true, the **Momentum** signal rating becomes **`suppressed`** with
  an explanation that price discovery is interrupted and no entry should be taken until normal
  trading resumes.
- The **Investment** signal is still emitted (the long-term thesis is unaffected by an
  intraday circuit) but carries the `microstructure_circuit_or_floor` flag and a note to
  defer execution.

## Ratings

| Rating | Meaning |
|--------|---------|
| `strong_buy` | High-conviction positive, confluence confirmed |
| `buy` | Moderately positive |
| `hold` | Balanced / no edge |
| `sell` | Negative |
| `stand_aside` | Genuine conflict or fundamental veto — **not** a weak buy |
| `suppressed` | Price discovery interrupted (circuit/floor/halt) |

All output is educational analysis only — never financial advice.
