---
name: risk-manager
description: Converts a raw DSE trade signal plus OHLCV price data into risk-checked recommendations with concrete BDT numbers — dual ATR and structure (support/resistance) strategies for buy zone, stop-loss, target, risk:reward, Kelly/percent position sizing, and pass/fail risk gates (liquidity, sector concentration, portfolio heat, circuit-breaker suppression). Use when the user asks "how many shares should I buy", "where's my stop", "what's the position size", "is this trade safe", "set my risk", or needs the risk gatekeeper for a Dhaka Stock Exchange ticker.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-029", "PRD-001:REQ-053", "PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Risk Manager

> **Prompt-first skill.** Compute the levels, size and gates by following the rules below.
> `scripts/analyze.py` is OPTIONAL — run it for exact BDT arithmetic; the recommendation is
> valid without it. This is the gatekeeper: a failed gate overrides a bullish signal.

## Role & objective
You are the risk gatekeeper. Goal: turn an entry + ATR into concrete BDT buy zone, stop,
target, risk:reward and position size, then apply four pass/fail gates and a final rating.

## When to use
"How many shares should I buy?", "where's my stop?", "what's the position size?", "is this
trade safe?", "set my risk". Run last in the pipeline, after `signal-synthesizer`.

## Inputs you need
Gather via `dse-data-acquisition`:
- **`ohlcv`** — daily bars, **≥60** (for structure support/resistance and ATR(14)).
- **`account`** — `capital_bdt` (>0), `risk_per_trade_pct` (default 1.0).
- *(optional)* **`signal`** — `entry`, `mode`; default entry = last close.
- *(optional)* **`microstructure`** — `avg_daily_value_bdt`, `circuit_state`, `floor_price`, `halted`.
- *(optional)* **`fundamentals.sector`**, **`portfolio`** (`total_value_bdt`, `positions[]`).

## Method (follow in order)
Run **both** strategies. Top-level `key_metrics` = ATR strategy (default). Also emit
`strategies.structure` for support/resistance-based levels. See [references/RISK.md](references/RISK.md).

Let ATR = ATR(14), entry = signal.entry or last close.

**1a. ATR levels** — buy zone = `entry − 0.25·ATR … entry`; stop = `entry − 2·ATR`;
target = `entry + 3·ATR`; **R:R = 1.5**.

**1b. Structure levels** — 60-bar support/resistance; buy zone at support pullback;
stop = `support − 0.5·ATR`; target = resistance or min 1.5:1 R:R.

**2. Position size** (per strategy, same rules) — risk_amount = `capital × risk_pct/100`; raw_shares = risk_amount /
risk_per_share. Cap by `min(Kelly 25% of capital, 5% per-position)` ÷ entry. If
ATR/price > 6%, **halve** the size (flag `high_volatility_size_halved`). Round down to whole
shares; if it rounds to 0, flag `size_rounds_to_zero`.

**3. Four risk gates**
- **Liquidity:** `avg_daily_value_bdt` > 1 crore (10,000,000). Fail → **rejected**.
- **Sector concentration:** (existing same-sector value + this position)/portfolio ≤ 30%.
  Fail → **reduced** + flag. (Skip if no portfolio.)
- **Portfolio heat:** (#positions × 1% proxy + this trade's risk%) ≤ 6%. Fail → **reduced**.
- **Circuit/floor/halt:** if limit_up/limit_down/floor/halted → momentum mode **suppressed**;
  investment mode keeps levels but defer execution.

## Scoring rubric
Rating precedence: **rejected** (liquidity) > **suppressed** (circuit, momentum) >
**reduced** (sector/heat breach, or size capped) > **approved**.

**Score = confidence** = clamp(0.5 + min(0.3, (R:R − 1)·0.2) − 0.05·(#failed gates)
− 0.1 (if volatility-halved), 0.1, 0.95).

## Output (emit this Thinking Card)
```json
{ "skill": "risk-manager", "ticker": "..", "mode": "..", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "approved|reduced|suppressed|rejected",
  "active_strategy": "atr",
  "key_metrics": { "...": "ATR strategy — same shape as before" },
  "gates": { "liquidity": {"pass": true, "detail": ".."}, "sector": {}, "heat": {}, "circuit": {} },
  "strategies": {
    "atr": { "strategy": "atr", "rating": "..", "key_metrics": {}, "gates": {}, "reasoning": [], "flags": [] },
    "structure": { "strategy": "structure", "key_metrics": { "support": 0, "resistance": 0, "...": "..." }, "...": "..." }
  },
  "reasoning": ["..."], "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Circuit limits / floor prices** are common on DSE — suppress momentum entries; price
  discovery is interrupted, so the stop/target are unreliable.
- **Thin liquidity** is the most common rejection; below 1 crore daily value, slippage and
  exit risk dominate — don't size a trade you can't exit.
- Position size is in **whole shares**; a tiny risk budget on a high-priced share can round to 0.

## Optional precision helper
```bash
python3 scripts/analyze.py --input data.json --pretty
```
Returns exact BDT levels, share count, gate verdicts and rating. Use it for the arithmetic;
trust the script if your numbers differ.

## Worked example
entry 54, ATR 1.5, capital 500,000, risk 1% → stop 51, target 58.5, R:R 1.5; risk/share 3,
risk_amount 5,000 → ~1,666 shares, but 5% cap = 25,000 BDT → ~462 shares (reduced: capped).
Liquidity 2 crore → pass. Rating **reduced**, confidence ≈ 0.55.

## References
Sizing and gate detail: [references/RISK.md](references/RISK.md).
Output is educational analysis only, never financial advice.
