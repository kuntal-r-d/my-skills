# Risk-Management Methodology

The Risk Manager (PRD-002 REQ-108) is the gatekeeper between a directional signal and an
actual trade. It produces concrete BDT levels and either **approves**, **reduces**,
**rejects**, or **suppresses** the trade against hard rules. All numbers are deterministic for
a given input.

## Inputs

- `ohlcv` — required, **≥15 bars** so ATR(14) is defined.
- `account` — required: `capital_bdt`, `risk_per_trade_pct` (default **1.0**).
- `signal` — optional: `entry` (defaults to last close), `mode` (`momentum`/`investment`).
- `microstructure` — optional: `circuit_state`, `floor_price`, `halted`,
  `avg_daily_value_bdt`.
- `fundamentals.sector` and `portfolio` (`total_value_bdt`, `positions[]`) — optional, enable
  the concentration and heat gates.

## ATR-based levels (PRD-001 REQ-004/005)

ATR(14) uses Wilder smoothing (see `scripts/indicators.py`). With `entry` = `signal.entry`
or the last close:

| Level | Formula | Rationale |
|-------|---------|-----------|
| Buy zone | `entry - 0.25×ATR` … `entry` | Buy *near support*, not into strength; a range, not a point. |
| Stop-loss | `entry - 2×ATR` | 2×ATR sits beyond normal noise so you are not shaken out by routine volatility. |
| Target | `entry + 3×ATR` | 3×ATR gives a structurally favourable payoff. |
| Risk:Reward | `3×ATR / 2×ATR = 1.5` | Floor of ~1.5:1; reported per trade. |

`trade_risk_pct = (entry - stop) / entry × 100` is the % the price must fall to hit the stop.

## Position sizing (PRD-001 REQ-029)

Risk a fixed fraction of capital per trade:

```
risk_amount = capital × risk_per_trade_pct / 100      # e.g. 1% of capital
shares      = risk_amount / (entry - stop)            # so a stop-out loses exactly risk_amount
position_value = shares × entry
```

### Caps (take the minimum)

- **Kelly cap** — `position_value ≤ 25% of capital`. A conservative fractional-Kelly ceiling
  that prevents any single name from dominating the book.
- **Per-position cap** — `position_value ≤ 5% of capital` (PRD-002).

The smaller of the two ceilings is binding (the 5% cap is normally tighter). If the
risk-derived size exceeds it, size is trimmed and the rating becomes **`reduced`**.

### Volatility scaling

If `ATR / price > 6%`, the position is **halved** (`high_volatility_size_halved`). Very
volatile names get a smaller footprint so the BDT risk stays controlled even when stops are
wide.

Shares are floored to a whole number; `risk_amount_bdt` is recomputed on the actual whole-share
position.

## Risk gates (PRD-001 REQ-053) — each pass/fail and explained

1. **Liquidity** — `avg_daily_value_bdt` must exceed **BDT 10,000,000 (1 crore)**. Below the
   floor the trade is **rejected** (slippage and exit risk are unacceptable on the DSE for
   thin names).
2. **Sector concentration** — when a portfolio is supplied, existing same-sector exposure plus
   this position must stay **≤ 30%** of `total_value_bdt`. A breach reduces the trade.
3. **Portfolio heat** — aggregate open risk must stay **≤ 6%**. Existing positions are charged
   a **1% risk proxy** each (used when their real stops are unknown); this trade's actual BDT
   risk is added. A breach reduces the trade.
4. **Circuit / floor / halt (PRD-002 REQ-097)** — if `circuit_state` is `limit_up`/`limit_down`,
   a `floor_price` is set, or `halted` is true, price discovery is interrupted. A **momentum**
   recommendation is **suppressed** (rating `suppressed`); an investment recommendation keeps
   its levels but is flagged to defer execution.

## Ratings

| Rating | Meaning |
|--------|---------|
| `approved` | All gates pass, size within caps. |
| `reduced` | A cap or a soft gate (sector/heat) trimmed the size. |
| `rejected` | A hard gate failed (liquidity floor). |
| `suppressed` | Circuit/floor/halt — momentum trade not actionable. |

## Worked example

Capital 1,000,000 BDT, 1% risk, entry 304, ATR 6 → stop 292 (risk 12/share), target 322.
`risk_amount` = 10,000 BDT → 833 shares by risk, but 5% cap = 50,000 BDT ≈ 164 shares is
binding, so size is reduced. Position value ≈ 49,856 BDT (≈5% of capital), R:R 1:1.5.

All output is educational analysis only — never financial advice.
