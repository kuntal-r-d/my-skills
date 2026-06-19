# Indicator Reference

Formulas implemented in `scripts/indicators.py`. All are computed in pure Python and
return series aligned to the input length (`None` during warm-up).

## Trend

- **SMA(n)** — `mean(close[i-n+1 .. i])`.
- **EMA(n)** — `EMA_i = close_i·k + EMA_{i-1}·(1-k)`, `k = 2/(n+1)`, seeded with SMA(n).
- **ADX(14)** — Wilder. `+DI = 100·smoothed(+DM)/ATR`, `-DI` likewise,
  `DX = 100·|+DI − −DI|/(+DI + −DI)`, `ADX = Wilder-smoothed DX`. ADX ≥ 25 = strong trend.

## Momentum / Oscillators

- **RSI(14)** — Wilder. `RSI = 100 − 100/(1 + avgGain/avgLoss)`. Healthy band 40–70; >70
  overbought, <30 oversold.
- **MACD(12,26,9)** — `MACD = EMA12 − EMA26`; `signal = EMA9(MACD)`; `hist = MACD − signal`.
- **ROC(n)** — `((close_i − close_{i−n}) / close_{i−n})·100`. Pure momentum (Driehaus).
- **MFI(14)** — volume-weighted RSI on typical price `(H+L+C)/3`. Band 20–80.

## Volatility / Bands

- **ATR(14)** — Wilder average of True Range `max(H−L, |H−C_{-1}|, |L−C_{-1}|)`. Used for
  position sizing (`risk-manager`) and stops.
- **Bollinger(20,2)** — `mid = SMA20`, bands `mid ± 2·stdev`, `%B = (C − lower)/(upper − lower)`.

## Volume / Flow

- **OBV** — cumulative volume signed by close direction. Rising OBV = accumulation.
- **VROC(n)** — Volume Rate of Change, percent.
- **A/D line** — cumulative `((C−L) − (H−C))/(H−L) · volume`.

## DSE caveats

- **Circuit-limit closes** (limit up/down) distort candles and momentum — `analyze.py`
  flags `microstructure_circuit_or_floor`; `signal-synthesizer`/`risk-manager` suppress
  momentum signals in those states (PRD-002 FR-AG-12).
- **Thin trading**: many DSE names have low volume; relative-volume and OBV signals are
  noisier — treat with lower confidence.
- **Sun–Thu week, BST**: "20-day" means 20 trading sessions, holiday-aware upstream.
- Minimum history: ≥30 bars to run, ≥200 for the full 200-day MA trend stack.
