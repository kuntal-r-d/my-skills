---
name: portfolio-optimization
description: Optimizes allocation across a portfolio of DSE stocks using Modern Portfolio Theory — expected return/covariance, the efficient frontier, max-Sharpe and min-variance portfolios, risk parity and Kelly sizing — plus correlation/diversification analysis and rebalancing gaps. Use when the user asks how to allocate/weight a portfolio, optimize allocation, efficient frontier, Sharpe-optimal weights, diversification, or rebalancing for Dhaka Stock Exchange holdings.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Pure-prompt — math-heavy; for exact optimisation prefer a numeric tool.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027", "PRD-001:REQ-007"]
  mode: ["investment"]
---

# Portfolio Optimization

> **Prompt-first, pure-prompt skill.** No script is bundled. The matrix math (covariance,
> efficient frontier) is heavy — reason carefully and **state assumptions**; for precise weights,
> compute the covariance/optimisation in a numeric environment and feed results back.

## Role & objective
Recommend a risk-aware target allocation across supplied holdings and quantify the portfolio's
risk/return, returning the optimal weights, key risk metrics and rebalancing gaps.

## When to use
"How should I weight my portfolio?", "optimize my allocation", "efficient frontier",
"Sharpe-optimal weights", "am I diversified?", "rebalancing". Use `risk-manager` for per-trade sizing.

## Inputs you need
- **`portfolio`** — holdings `{ticker, qty, price}` (and current weights).
- **`ohlcv` per holding** (or a returns series) for expected return + covariance.
- **`risk_free_rate`**; optional **constraints** (min/max weight per name), transaction costs.

## Method (follow in order)
1. **Inputs** — per-asset expected return and volatility; pairwise correlations → covariance matrix.
2. **Frontier** — describe the efficient frontier; identify the **max-Sharpe** and **min-variance** portfolios.
3. **Strategy** — present the objective the user wants: max-Sharpe, min-variance, risk-parity
   (equal risk contribution), or Kelly-scaled sizing.
4. **Diversification** — correlation clusters, diversification ratio, concentration.
5. **Rebalancing** — gap between current and target weights; note transaction-cost drag.

## Scoring rubric
No single −1..+1 score; the deliverable is the **target weights** plus risk metrics (Sharpe,
volatility, VaR, max drawdown, beta). Rank candidate portfolios by Sharpe for the chosen risk
level. Confidence depends on history length (≥252 trading days) and return-estimate stability.

## Output (emit this Thinking Card)
```json
{ "skill": "portfolio-optimization", "as_of": "..",
  "key_metrics": { "expected_return": 0.0, "volatility": 0.0, "sharpe_ratio": 0.0,
    "max_drawdown": 0.0, "diversification_ratio": 0.0, "var_95": 0.0 },
  "optimal_allocation": { "TICKER1": 0.0, "TICKER2": 0.0 },
  "rebalancing_actions": [ { "ticker": "..", "from_weight": 0.0, "to_weight": 0.0 } ],
  "reasoning": ["assumptions + objective used"], "flags": ["short_history?", "estimates_unstable?"],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- DSE correlations spike in stress (everything falls together) and liquidity is uneven — a
  mean-variance optimum can be untradeable; sanity-check weights against daily traded value.
- Expected returns from short, noisy DSE history are unreliable — prefer min-variance/risk-parity
  and wide assumptions over precise max-Sharpe point estimates.
- Respect single-name and sector caps; don't output a concentrated "optimal" weight.

## Optional precision helper
No bundled script — pure-prompt skill. For exact covariance/efficient-frontier solving, run a
numeric optimiser (e.g. NumPy/cvxpy) and pass the weights back for interpretation.

## Worked example
3 holdings, 1y returns, rf 6.5% → max-Sharpe weights ~ {A 0.45, B 0.35, C 0.20}, portfolio
Sharpe ≈ 0.6, vol ≈ 23%; current over-weights A by 10pp → rebalance toward target (note costs).

## References
See `risk-manager/references/RISK.md` for sizing/Kelly context.
Output is educational analysis only, never financial advice.
