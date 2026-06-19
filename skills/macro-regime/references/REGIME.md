# Macro Regime — methodology

The Macro Agent (PRD-002 REQ-020) converts a snapshot of Bangladesh macro conditions
into a single **risk multiplier** that scales risk appetite across every other signal.

## Inputs (`macro` object)

| Field | Type | Meaning |
|-------|------|---------|
| `policy_rate` | float (fraction) | Bangladesh Bank policy/repo rate, e.g. `0.10` = 10% |
| `inflation` | float (fraction) | Headline CPI inflation, e.g. `0.095` = 9.5% |
| `fx_reserves_bn` | float | Gross FX reserves (USD bn) — context only |
| `reserves_trend` | `rising`/`falling`/`stable` | Direction of reserves (drives the score) |
| `bdt_usd` | float | BDT per USD — context only |
| `remittances_bn` | float | Monthly remittances (USD bn) — context only |
| `politics` | `stable`/`tense`/`crisis` | Political stability |
| `regulatory` | `normal`/`tightening`/`floor_prices` | DSE regulatory stance |

Missing fields raise a `stale_macro` flag and cap confidence; a wholly missing
`macro` object returns `{"error": ...}` with exit code 1.

## Multiplier construction

Start at `1.0`. Apply each factor's adjustment, then clamp to `[0.5, 1.2]`.

| Factor | Condition | Adjustment | Bangladesh rationale |
|--------|-----------|-----------:|----------------------|
| Policy rate | `>= 0.09` | **−0.10** | Tight money raises cost of capital, pressures valuations |
| Policy rate | `< 0.09` | **+0.07** | Accommodative stance supports risk appetite |
| Inflation | `> 0.08` | **−0.10** | Erodes real returns; invites further tightening |
| Inflation | `<= 0.08` | **+0.05** | Contained inflation is supportive |
| Reserves | `falling` | **−0.12** | Import-cover stress, BDT depreciation pressure |
| Reserves | `rising` | **+0.10** | Easing external pressure |
| Reserves | `stable` | 0.00 | Neutral external backdrop |
| Politics | `crisis` | **−0.20** | Sharp uncertainty; largest single drag |
| Politics | `tense` | **−0.10** | Elevated headline risk |
| Politics | `stable` | **+0.05** | Supportive backdrop |
| Regulatory | `floor_prices` | **−0.15** | Broken price discovery, trapped liquidity |
| Regulatory | `tightening` | **−0.08** | Added market friction |
| Regulatory | `normal` | 0.00 | No policy drag |

The reserves and politics legs carry the most weight because, on the DSE, external
balance and political stability dominate foreign-investor and local sentiment.

## Multiplier → regime label

| Multiplier | Regime |
|-----------:|--------|
| `>= 1.05` | `risk_on` |
| `0.85` – `1.05` | `neutral` |
| `0.70` – `0.85` | `cautious` |
| `< 0.70` | `risk_off` |

## Multiplier → score (`-1..+1`)

`score = clamp((multiplier - 1.0) / 0.2, -1, +1)`

So `mult 1.2 → +1.0`, `mult 1.0 → 0.0`, `mult 0.8 → -1.0`, and anything down to the
`0.5` floor also reports `-1.0`. The `score` is the normalised signal; the
`risk_multiplier` is the actionable scalar.

## How downstream skills consume it

- **signal-synthesizer** multiplies the macro risk multiplier into the DSE Composite
  Score so a risk-off backdrop tempers otherwise-bullish confluence.
- **risk-manager** scales the per-trade risk budget: `effective_risk = base_risk_pct *
  risk_multiplier`, so position sizes shrink in `cautious`/`risk_off` regimes and can
  expand modestly (capped at 1.2x) in `risk_on`.

## Confidence

Confidence starts at `0.85` and is reduced for each missing macro field; when any
field is missing it is additionally capped at `0.60`. This keeps a partial macro
snapshot from masquerading as a high-conviction read.
