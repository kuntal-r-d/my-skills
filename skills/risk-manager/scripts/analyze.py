#!/usr/bin/env python3
"""risk-manager: turn a DSE signal + price data into a risk-checked BDT recommendation.

Reads the shared JSON input contract (needs `ohlcv` and `account`; optional `signal`,
`microstructure`, `fundamentals.sector`, `portfolio`) and emits a Thinking Card with
concrete BDT levels (buy zone, stop-loss, target), an ATR/Kelly position size, the
risk:reward, and four pass/fail risk gates.

Position sizing (PRD-001 REQ-029):
  risk_amount   = capital * risk_per_trade_pct/100
  shares        = risk_amount / (entry - stop)
  capped by Kelly 25% of capital and a 5% per-position cap (min of the two),
  halved when ATR/price > 6% (volatility scaling).

Risk gates (PRD-001 REQ-053, PRD-002 REQ-108/097):
  liquidity (>1 crore avg daily value), sector concentration (<=30%),
  portfolio heat (<=6%), circuit/floor/halt suppression.

Usage:
  python3 analyze.py --input data.json [--pretty]
  cat data.json | python3 analyze.py
"""
from __future__ import annotations

import argparse
import json
import sys

import indicators as ind

DISCLAIMER = "Educational analysis only. Not financial advice."
SKILL = "risk-manager"

# Rule constants.
ATR_PERIOD = 14
BUY_ZONE_ATR = 0.25       # buy zone = entry - 0.25*ATR .. entry
STOP_ATR = 2.0            # stop = entry - 2*ATR
TARGET_ATR = 3.0          # target = entry + 3*ATR
KELLY_CAP = 0.25          # position value <= 25% of capital
PER_POSITION_CAP = 0.05   # position value <= 5% of capital (PRD-002)
VOL_SCALE_THRESHOLD = 0.06  # ATR/price > 6% -> halve size
VOL_SCALE_FACTOR = 0.5
LIQUIDITY_FLOOR_BDT = 10_000_000   # 1 crore
SECTOR_CAP = 0.30         # sector exposure <= 30% of portfolio
HEAT_CAP = 0.06           # total portfolio heat <= 6%
PROXY_POSITION_RISK = 0.01  # 1% risk proxy per existing position when unknown


def _num(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _round_bdt(x):
    if x is None:
        return None
    return round(x, 2)


def analyze(data: dict) -> dict:
    ohlcv = data.get("ohlcv") or []
    if len(ohlcv) < ATR_PERIOD + 1:
        return {"skill": SKILL,
                "error": f"need >={ATR_PERIOD + 1} OHLCV bars for ATR({ATR_PERIOD})",
                "bars_supplied": len(ohlcv)}

    account = data.get("account") or {}
    capital = _num(account.get("capital_bdt"))
    if capital <= 0:
        return {"skill": SKILL, "error": "account.capital_bdt must be > 0"}
    risk_pct = _num(account.get("risk_per_trade_pct"), 1.0)
    if risk_pct <= 0:
        risk_pct = 1.0

    o, h, l, c, v = ind.split_ohlcv(ohlcv)
    atr_v = ind.last_valid(ind.atr(h, l, c, ATR_PERIOD))
    if not atr_v or atr_v <= 0:
        return {"skill": SKILL, "error": "could not compute a positive ATR"}

    signal = data.get("signal") or {}
    mode = signal.get("mode") or data.get("mode") or "momentum"
    entry = _num(signal.get("entry")) or c[-1]
    if entry <= 0:
        return {"skill": SKILL, "error": "entry price must be > 0"}

    flags = []
    reasoning = []

    # ---- Levels ----
    buy_low = entry - BUY_ZONE_ATR * atr_v
    buy_high = entry
    stop = entry - STOP_ATR * atr_v
    target = entry + TARGET_ATR * atr_v
    risk_per_share = entry - stop          # = 2*ATR
    reward_per_share = target - entry      # = 3*ATR
    risk_reward = reward_per_share / risk_per_share if risk_per_share else 0.0
    trade_risk_pct = risk_per_share / entry * 100 if entry else 0.0

    reasoning.append(
        f"ATR({ATR_PERIOD})={_round_bdt(atr_v)} BDT. Buy zone "
        f"{_round_bdt(buy_low)}-{_round_bdt(buy_high)} (entry - 0.25*ATR).")
    reasoning.append(
        f"Stop {_round_bdt(stop)} (entry - 2*ATR), target {_round_bdt(target)} "
        f"(entry + 3*ATR) -> risk:reward 1:{round(risk_reward, 2)}.")

    # ---- Position sizing (REQ-029) ----
    risk_amount = capital * risk_pct / 100.0
    raw_shares = risk_amount / risk_per_share if risk_per_share else 0.0

    # Caps: Kelly 25% and per-position 5% -> take the min.
    kelly_value = KELLY_CAP * capital
    pos_cap_value = PER_POSITION_CAP * capital
    cap_value = min(kelly_value, pos_cap_value)
    cap_shares = cap_value / entry if entry else 0.0

    capped = False
    shares = raw_shares
    if shares > cap_shares:
        shares = cap_shares
        capped = True
        reasoning.append(
            f"Size capped by min(Kelly 25%={_round_bdt(kelly_value)}, "
            f"5% per-position={_round_bdt(pos_cap_value)} BDT) -> "
            f"{_round_bdt(cap_value)} BDT ceiling.")

    # Volatility scaling.
    atr_ratio = atr_v / entry
    if atr_ratio > VOL_SCALE_THRESHOLD:
        shares *= VOL_SCALE_FACTOR
        flags.append("high_volatility_size_halved")
        reasoning.append(
            f"ATR/price {round(atr_ratio * 100, 1)}% > 6% — position halved (volatility scaling).")

    shares = int(shares)  # whole shares
    position_value = shares * entry
    pct_of_capital = position_value / capital * 100 if capital else 0.0
    # Actual BDT risk on the (whole-share) position.
    actual_risk_amount = shares * risk_per_share
    actual_risk_pct_of_capital = actual_risk_amount / capital * 100 if capital else 0.0

    if shares <= 0:
        flags.append("size_rounds_to_zero")
        reasoning.append("Computed size rounds to 0 shares at this risk budget.")

    # ---- Risk gates ----
    gates = {}
    rating = "approved"

    # 1. Liquidity.
    ms = data.get("microstructure") or {}
    adv = _num(ms.get("avg_daily_value_bdt"), 0.0)
    if adv > LIQUIDITY_FLOOR_BDT:
        gates["liquidity"] = {"pass": True,
                              "detail": f"Avg daily value {_round_bdt(adv)} BDT > 1 crore floor."}
    else:
        gates["liquidity"] = {"pass": False,
                              "detail": f"Avg daily value {_round_bdt(adv)} BDT <= 1 crore floor "
                                        "— too illiquid; trade rejected."}
        rating = "rejected"
        reasoning.append("Liquidity gate FAILED — illiquid name, slippage/exit risk too high.")

    # 2. Sector concentration.
    portfolio = data.get("portfolio") or {}
    total_value = _num(portfolio.get("total_value_bdt"), 0.0)
    sector = (data.get("fundamentals") or {}).get("sector")
    if portfolio and total_value > 0:
        existing_sector = sum(_num(p.get("value_bdt"))
                              for p in portfolio.get("positions", [])
                              if sector and p.get("sector") == sector)
        sector_pct = (existing_sector + position_value) / total_value * 100
        if sector_pct <= SECTOR_CAP * 100:
            gates["sector"] = {"pass": True,
                               "detail": f"Sector '{sector}' exposure would be "
                                         f"{round(sector_pct, 1)}% <= 30%."}
        else:
            gates["sector"] = {"pass": False,
                               "detail": f"Sector '{sector}' exposure would be "
                                         f"{round(sector_pct, 1)}% > 30% — concentration limit."}
            if rating != "rejected":
                rating = "reduced"
            flags.append("sector_concentration_breach")
            reasoning.append("Sector gate FAILED — over-concentrated; reduce or skip.")
    else:
        gates["sector"] = {"pass": True, "detail": "No portfolio supplied — sector gate skipped."}

    # 3. Portfolio heat.
    if portfolio:
        n_positions = len(portfolio.get("positions", []))
        existing_heat = n_positions * PROXY_POSITION_RISK  # 1% proxy each
        this_heat = (actual_risk_amount / capital) if capital else 0.0
        total_heat = existing_heat + this_heat
        if total_heat <= HEAT_CAP:
            gates["heat"] = {"pass": True,
                             "detail": f"Portfolio heat {round(total_heat * 100, 1)}% <= 6% "
                                       f"({n_positions} existing @1% proxy + this trade)."}
        else:
            gates["heat"] = {"pass": False,
                             "detail": f"Portfolio heat {round(total_heat * 100, 1)}% > 6% "
                                       "— too much aggregate risk."}
            if rating != "rejected":
                rating = "reduced"
            flags.append("portfolio_heat_breach")
            reasoning.append("Heat gate FAILED — aggregate open risk exceeds 6%.")
    else:
        gates["heat"] = {"pass": True, "detail": "No portfolio supplied — heat gate skipped."}

    # 4. Circuit / floor / halt (REQ-097) — suppress momentum recommendation.
    circuit_hit = (ms.get("circuit_state") in ("limit_up", "limit_down")
                   or bool(ms.get("floor_price")) or bool(ms.get("halted")))
    if circuit_hit:
        why = (f"circuit_state={ms.get('circuit_state')}"
               if ms.get("circuit_state") in ("limit_up", "limit_down")
               else ("floor_price set" if ms.get("floor_price") else "trading halted"))
        gates["circuit"] = {"pass": False,
                            "detail": f"{why} — price discovery interrupted."}
        if mode == "momentum":
            rating = "suppressed"
            reasoning.append(
                f"Circuit gate: {why}. Momentum recommendation SUPPRESSED — "
                "no reliable price discovery, do not enter until normal trading resumes.")
        else:
            flags.append("microstructure_circuit_or_floor")
            reasoning.append(
                f"Circuit gate: {why}. Investment levels stand but defer execution "
                "until normal trading resumes.")
    else:
        gates["circuit"] = {"pass": True, "detail": "Normal trading — no circuit/floor/halt."}

    if capped and rating == "approved":
        rating = "reduced"

    # ---- Setup confidence (score) ----
    # Better R:R and lower trade risk -> higher confidence; failing gates drag it down.
    score = 0.5 + min(0.3, max(0.0, (risk_reward - 1.0) * 0.2))
    score -= 0.05 * sum(1 for g in gates.values() if not g["pass"])
    if "high_volatility_size_halved" in flags:
        score -= 0.1
    score = round(max(0.1, min(0.95, score)), 2)

    key_metrics = {
        "atr": _round_bdt(atr_v),
        "entry": _round_bdt(entry),
        "buy_zone_low": _round_bdt(buy_low),
        "buy_zone_high": _round_bdt(buy_high),
        "stop_loss": _round_bdt(stop),
        "target": _round_bdt(target),
        "risk_reward": round(risk_reward, 2),
        "suggested_shares": shares,
        "position_value_bdt": _round_bdt(position_value),
        "pct_of_capital": round(pct_of_capital, 2),
        "trade_risk_pct": round(trade_risk_pct, 2),
        "risk_amount_bdt": _round_bdt(actual_risk_amount),
        "risk_pct_of_capital": round(actual_risk_pct_of_capital, 2),
    }

    return {
        "skill": SKILL,
        "ticker": data.get("ticker"),
        "mode": mode,
        "as_of": data.get("as_of"),
        "score": score,
        "confidence": score,
        "rating": rating,
        "key_metrics": key_metrics,
        "gates": gates,
        "reasoning": reasoning,
        "flags": flags,
        "disclaimer": DISCLAIMER,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="path to JSON input; omit to read stdin")
    ap.add_argument("--pretty", action="store_true")
    args = ap.parse_args()
    try:
        raw = open(args.input).read() if args.input else sys.stdin.read()
        data = json.loads(raw)
    except Exception as e:  # noqa
        print(json.dumps({"error": f"bad input: {e}"}))
        sys.exit(1)
    result = analyze(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
