# Valuation methodology (fundamental-analysis)

This skill estimates intrinsic value with three independent methods and reports a
**range** (low / median / high) rather than a single false-precision number. Each
method carries explicit, documented assumptions so the output stays glass-box.

## Default assumptions

| Symbol | Default | Meaning | Rationale |
|--------|---------|---------|-----------|
| `r` (discount rate) | **15%** | Required return for a DSE equity | Frontier-market risk premium: BDT policy rate (~10%) plus an equity premium. Higher than a typical US ~9–10% WACC. |
| `g` (near-term growth) | `min(earnings_growth, 15%)`, floored at 0 | Explicit-window growth | Caps optimism; avoids extrapolating a hot year forever. |
| `g_terminal` | **3%** | Perpetual growth after year 5 | Roughly long-run nominal GDP; never exceeds `r`. |
| Projection horizon | **5 years** | Explicit FCF window | Standard two-stage DCF convention. |
| `sector_median_pe` | **15** (if not supplied) | Multiple for the PE method | Conservative DSE blue-chip anchor; override with `fundamentals.sector_median_pe`. |

If `earnings_growth` lands at or above the 15% cap, the run is marked
`aggressive_assumptions` and confidence is reduced.

## Method 1 — DCF via the Graham growth formula

A simplified earnings-based DCF that sidesteps the need for share count and a full
free-cash-flow schedule:

```
intrinsic = eps_ttm * (8.5 + 2 * g * 100)
```

- `8.5` is the base P/E Graham assigned to a no-growth company.
- `2 * g * 100` adds value for growth, with `g` expressed as a percentage
  (e.g. `g = 0.12` contributes `2 * 12 = 24`).

A two-stage cash-flow DCF (project FCF at `g` for 5 years, terminal value at
`g_terminal`, discount at `r`, divide by shares) is the conceptual model behind this;
the Graham earnings form is used as the deterministic, share-count-free proxy.

## Method 2 — Graham number

The classic defensive-investor ceiling, balancing earnings and book value:

```
graham_number = sqrt(22.5 * eps_ttm * book_value_per_share)
```

`22.5 = 15 (max P/E) * 1.5 (max P/B)`. Requires positive EPS and book value.

## Method 3 — PE-based fair value

```
pe_fair_value = eps_ttm * sector_median_pe
```

Anchors value to what the market typically pays for a taka of earnings in the sector.

## Fair-value range

The three method outputs are sorted; `low` / `median` / `high` are the min, median, and
max. A wide range signals method disagreement — treat the median cautiously.

## Balance-sheet red flags

Emitted by the Balance Sheet Reader; each adds a quality penalty and lowers confidence:

- `high_leverage` — debt/equity > 1.0
- `negative_or_zero_free_cash_flow` — FCF <= 0
- `declining_earnings` — latest EPS < prior EPS
- `current_ratio_below_1` — short-term liquidity strain
- `weak_interest_coverage` — interest coverage < 2
- `negative_profit_margin` — unprofitable operations

## DSE caveats (PRD-001 REQ-044)

- **P/E benchmarks run higher on the DSE** than US markets. A "cheap" US screen at
  P/E < 15 will exclude many sound DSE names; the default sector P/E of 15 is a
  conservative anchor and should be overridden with a real sector median where known.
- **BDT reporting and frontier liquidity** justify the elevated 15% discount rate.
- **Disclosure cadence is uneven** — when core fields are missing the skill raises
  `limited_disclosure` and lowers confidence rather than guessing.
- All output is educational analysis only, never financial advice.
