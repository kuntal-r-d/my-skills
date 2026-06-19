# Momentum Screen — 25-Point Checklist

The 25 criteria implemented by `scripts/screen.py` (PRD-001 REQ-038), grouped
into the five weighted categories of REQ-032. Each row gives the rule, the
beginner explanation, and the methodology it comes from.

**Attribution.** Criteria 1-8 are Mark **Minervini's** SEPA *Trend Template*
(*Trade Like a Stock Market Wizard*). Criteria 9-18 are classic technical
momentum/volume indicators. Criteria 19-22 follow Richard **Driehaus's** growth
philosophy (earnings acceleration + relative strength = "buy high, sell higher").
Criteria 23-25 are risk filters layered on top.

## Grading

Each category contributes the fraction of its criteria that pass, weighted:

| Category | Weight | Criteria |
|----------|--------|----------|
| Trend | 25% | 1-8 |
| Momentum Power | 25% | 9-14 |
| Volume | 20% | 15-18 |
| Relative Performance | 15% | 19-22 |
| Risk | 15% | 23-25 |

The weighted sum is a 0..1 score → Grade: **A+** ≥0.90, **A** ≥0.80,
**B+** ≥0.70, **B** ≥0.60, **C** ≥0.50, **D** ≥0.40, **F** <0.40.
Criteria with missing data are not counted toward their category total.

## Trend — Minervini SEPA (25%)

| # | Criterion | Beginner explanation |
|---|-----------|----------------------|
| 1 | Close > 50-day MA | Price above its 50-day average shows recent strength. |
| 2 | Close > 150-day MA | Above the 150-day average confirms the medium-term uptrend. |
| 3 | Close > 200-day MA | Above the 200-day average marks a long-term uptrend. |
| 4 | 50-day MA > 150-day MA | Short average over the medium one means momentum is improving. |
| 5 | 150-day MA > 200-day MA | Medium average over the long one confirms the stack is aligned up. |
| 6 | 200-day MA rising (~1 month) | A rising long-term average means the trend is still building. |
| 7 | Within 25% of 52-week high | Leaders trade near their highs, not deep in a hole. |
| 8 | ≥ 30% above 52-week low | A big rise off the lows shows real recovery, not a falling knife. |

## Momentum Power — Indicators (25%)

| # | Criterion | Beginner explanation |
|---|-----------|----------------------|
| 9 | RSI between 40 and 70 | The "strong but not exhausted" momentum zone. |
| 10 | MACD above signal line | A classic bullish trigger when the fast line leads. |
| 11 | ROC positive and rising | Positive *and* accelerating rate-of-change means momentum is speeding up. |
| 12 | ADX > 25 | Confirms a genuine trend rather than sideways chop. |
| 13 | MFI between 20 and 80 | Money Flow Index shows healthy buying without a blow-off top. |
| 14 | Bollinger %B in 0.5-1.0 | Price in the upper half of the bands (but not bursting out) signals strength. |

## Volume (20%)

| # | Criterion | Beginner explanation |
|---|-----------|----------------------|
| 15 | OBV trending up | Rising On-Balance Volume means volume backs the advance. |
| 16 | Volume > 20-day average | Above-average volume shows real participation behind the move. |
| 17 | Accumulation/Distribution rising | A rising A/D line means buyers control the day's range. |
| 18 | Volume ROC positive | Growing volume vs a month ago signals fresh interest. |

## Relative Performance — Driehaus (15%)

| # | Criterion | Beginner explanation |
|---|-----------|----------------------|
| 19 | Earnings acceleration | Each year's earnings growth beating the last is the Driehaus signature. Uses `fundamentals.eps_history`: latest YoY growth > prior YoY growth. |
| 20 | Positive earnings surprise | Beating estimates often sparks the next leg up. Needs `fundamentals.earnings_surprise`; if absent it is marked unknown, **not counted**, and flagged. |
| 21 | Institutional accumulation | Proxied by relative volume > 1.2 — volume well above normal hints big institutions are buying. |
| 22 | Relative strength vs market | Outperforming the index (price ROC > `market_index` ROC) means money is rotating in. Needs `market_index`. |

## Risk (15%)

| # | Criterion | Beginner explanation |
|---|-----------|----------------------|
| 23 | ATR/price < 6% | Lower volatility means tighter, safer stops. |
| 24 | Distance from support < 8% | Close to support gives a low-risk entry with a nearby stop. |
| 25 | No major resistance within 10% | Clear overhead room lets the stock run without hitting a ceiling. |

## DSE notes

Prices are in BDT and the trading week is Sun-Thu. Relative-strength and
institutional-accumulation proxies use only public OHLCV/volume data. A
circuit-limit or floor-price regime distorts volume and momentum reads; pair
with `macro-regime` and `risk-manager` before acting.
