# Value Investment Checklist — 30 Criteria

The 30 criteria implemented by `scripts/checklist.py` (PRD-001 REQ-039), grouped
into four buckets. Each row gives the rule, the `fundamentals` field(s) it reads,
and the beginner explanation.

**Attribution.** Bucket 1 follows Warren **Buffett's** quality-and-moat
philosophy (*Berkshire Hathaway* letters). Bucket 2 follows Peter **Lynch's**
Growth-At-a-Reasonable-Price (GARP) approach (*One Up on Wall Street*). Bucket 3
follows Benjamin **Graham's** deep-value, margin-of-safety rules (*The
Intelligent Investor* / *Security Analysis*). Bucket 4 adds modern quality
filters.

## Scoring (REQ-041)

Methodology buckets are weighted **Buffett 35% / Lynch 30% / Graham 35%**, and
**Quality** is folded in as a fourth bucket given the *average* of those three
weights (~0.333). Each bucket score is the fraction of its *evaluable* criteria
that pass. The four bucket fractions are weight-averaged and renormalised to sum
to 1.0, then mapped to a grade and GPA:

| Score | Grade | GPA |
|-------|-------|-----|
| ≥0.90 | A+ | 4.0 |
| ≥0.80 | A | 3.7 |
| ≥0.70 | B+ | 3.3 |
| ≥0.60 | B | 3.0 |
| ≥0.50 | C | 2.0 |
| ≥0.40 | D | 1.0 |
| <0.40 | F | 0.0 |

Criteria needing data that is absent are **not counted** and are reported as a
`missing:<field>` flag.

## Buffett (35%)

| # | Criterion | Fields | Beginner explanation |
|---|-----------|--------|----------------------|
| 1 | Economic moat present | `moat` | A durable competitive advantage protects long-term profits. |
| 2 | ROE > 15% | `roe` | High return on equity means the company compounds shareholder money well. |
| 3 | Debt/Equity < 0.5 | `debt_to_equity` | Low debt makes the business resilient in downturns. |
| 4 | Profit margin > 20% | `profit_margin` | Fat margins signal pricing power and efficiency. |
| 5 | Free cash flow positive | `free_cash_flow` | Real cash left after spending is the lifeblood of intrinsic value. |
| 6 | Quality management (proxy) | `roe`, `profit_margin` | Proxy: ROE>15% and margin>15% — consistent returns point to capable management. |
| 7 | Predictable earnings | `eps_history` | All EPS-history years positive — easier to value with confidence. |
| 8 | ≥25% below intrinsic value | `price`, `intrinsic_value` | A margin of safety: buy a dollar of value for 75 cents or less. |
| 9 | Business understandable | — | Assumed true unless flagged; Buffett only buys what he can explain. |
| 10 | Sustainable advantage | `moat` | The moat must persist for years, not just this quarter. |

## Lynch GARP (30%)

| # | Criterion | Fields | Beginner explanation |
|---|-----------|--------|----------------------|
| 11 | PEG < 1.0 | `peg` | Paying less than 1x growth for earnings is the GARP sweet spot. |
| 12 | Earnings growth 15-30% | `earnings_growth` | Fast but sustainable — not so hot it can't last. |
| 13 | Revenue growth ≈ earnings (within 10pp) | `revenue_growth`, `earnings_growth` | Growth backed by sales is real, not just cost-cutting. |
| 14 | Inventory turnover improving | `inventory_turnover`, `inventory_turnover_prev` | Faster turns mean products sell briskly. If absent → unknown, not counted, flagged. |
| 15 | Insider buying | `insider_buying` | Insiders buying their own stock signals genuine confidence. |
| 16 | Institutional ownership < 60% | `institution_ownership` | Low ownership leaves room for the crowd to discover it. |
| 17 | Share buyback | `buyback` | Buybacks return cash and lift per-share value. |
| 18 | P/E < earnings-growth rate | `pe`, `earnings_growth` | Lynch's rule: a fair P/E sits below the growth percentage. |

## Graham (35%)

| # | Criterion | Fields | Beginner explanation |
|---|-----------|--------|----------------------|
| 19 | P/E < 15 | `pe` | A low P/E limits what you overpay for earnings. |
| 20 | P/B < 1.5 | `pb` | Buying near book value gives an asset cushion. |
| 21 | P/E × P/B < 22.5 | `pe`, `pb` | Graham's combined cheapness test for earnings and assets. |
| 22 | Current ratio > 2 | `current_ratio` | Twice the short-term assets vs liabilities means strong liquidity. |
| 23 | Pays a dividend | `dividend_yield` | A dividend record shows real, distributable profits. |
| 24 | Long-run earnings growth | `eps_history` | First EPS < last EPS — earnings higher than a decade ago. |
| 25 | Price < 67% of NCAV | `price`, `ncav_per_share` | Buying below liquidation value is Graham's deepest margin of safety. |
| 26 | Earnings stability | `eps_history` | No negative EPS year — dependable, defensive earnings. |

## Quality (folded in, ~33%)

| # | Criterion | Fields | Beginner explanation |
|---|-----------|--------|----------------------|
| 27 | Revenue growth > inflation | `revenue_growth`, `macro.inflation` (default 0.06) | Sales must outpace inflation to grow in real terms. |
| 28 | Operating margin healthy (>10%) | `operating_margin` | A solid operating margin shows the core business is profitable. |
| 29 | Return on assets > 5% | `return_on_assets` | Good ROA means assets are deployed efficiently. |
| 30 | Interest coverage > 3 | `interest_coverage` | Earnings comfortably cover interest — low default risk. |

## DSE notes

Values are in BDT. Shareholding data is reported monthly, so
`institution_ownership` and `insider_buying` reflect the latest filing.
Intrinsic value and NCAV should come from `fundamental-analysis` (DCF / net
current asset value) for consistency across the suite.
