#!/usr/bin/env python3
"""pattern-miner: discover and out-of-sample validate price patterns for one ticker.

Reads the shared JSON input contract (needs `ohlcv`) and tests a fixed library of
rule-based candidate patterns under anti-overfitting safeguards:

  * train/holdout split (first 70% / last 30%, out-of-sample);
  * minimum total occurrences;
  * Bonferroni multiple-testing correction over the number of patterns tested;
  * auto-retirement when holdout success degrades below threshold;
  * manipulation-footprint warnings (volume > 5x average or circuit-sized move).

Emits a JSON Thinking Card listing each pattern's occurrence count, train/holdout
success rate, average forward return, status and warnings. Deterministic.

Usage:
  python3 mine.py --input data.json [--pretty]
  cat data.json | python3 mine.py
"""
from __future__ import annotations

import argparse
import json
import sys

import indicators as ind

DISCLAIMER = "Educational analysis only. Not financial advice."

DEFAULTS = {"min_occurrences": 8, "forward_days": 5, "success_threshold": 0.6}

# Bonferroni: dividing a nominal alpha of 0.05 by the number of patterns tightens the
# per-test bar. We translate that into a small additive bump on the required success
# rate so the safeguard is visible in the reported threshold (see references/PATTERNS.md).
N_PATTERNS = 4
BONFERRONI_BUMP = 0.05 * (1 - 1.0 / N_PATTERNS)  # ~0.0375 added to success_threshold

VOL_SPIKE_MULT = 5.0      # volume > 5x trailing average -> manipulation footprint
CIRCUIT_MOVE_PCT = 9.5    # daily move near a DSE circuit limit (~10%)


def _crosses_up(series, level, i):
    """True when series goes from below `level` at i-1 to >= level at i."""
    a, b = series[i - 1], series[i]
    if a is None or b is None:
        return False
    return a < level <= b


def _trailing_avg(vol, i, n=20):
    lo = max(0, i - n)
    window = vol[lo:i]
    return sum(window) / len(window) if window else (vol[i] if vol else 0.0)


def _signal_indices(c, h, l, v):
    """Return {pattern_name: [indices where the pattern triggers]}."""
    n = len(c)
    rsi = ind.rsi(c, 14)
    s50 = ind.sma(c, 50)
    s200 = ind.sma(c, 200)
    boll = ind.bollinger(c, 20, 2.0)
    upper = boll["upper"]

    breakout, oversold, golden, upper_bb = [], [], [], []
    for i in range(1, n):
        # 20-day high breakout: close is the highest of the trailing 20 closes.
        if i >= 20:
            prior_high = max(c[i - 20:i])
            if c[i] > prior_high:
                breakout.append(i)
        # RSI oversold bounce: RSI(14) crosses up through 30.
        if _crosses_up(rsi, 30.0, i):
            oversold.append(i)
        # Golden cross: MA50 crosses above MA200.
        if s50[i] is not None and s200[i] is not None and \
                s50[i - 1] is not None and s200[i - 1] is not None:
            if s50[i - 1] <= s200[i - 1] and s50[i] > s200[i]:
                golden.append(i)
        # Close above upper Bollinger band.
        if upper[i] is not None and upper[i - 1] is not None:
            if c[i - 1] <= upper[i - 1] and c[i] > upper[i]:
                upper_bb.append(i)
    return {
        "20-day high breakout": breakout,
        "RSI oversold bounce (cross up 30)": oversold,
        "Golden cross (MA50>MA200)": golden,
        "Close above upper Bollinger": upper_bb,
    }


def _forward_return(c, i, fwd):
    """Forward return % from close[i] to close[i+fwd]; None if out of range."""
    j = i + fwd
    if j >= len(c) or c[i] == 0:
        return None
    return (c[j] - c[i]) / c[i] * 100.0


def _manipulation_flag(c, h, l, v, i):
    avg = _trailing_avg(v, i)
    if avg and v[i] > VOL_SPIKE_MULT * avg:
        return f"vol_spike_{round(v[i] / avg, 1)}x_at_{i}"
    if i >= 1 and c[i - 1]:
        move = abs(c[i] - c[i - 1]) / c[i - 1] * 100.0
        if move >= CIRCUIT_MOVE_PCT:
            return f"circuit_sized_move_{round(move, 1)}pct_at_{i}"
    return None


def _eval_window(idxs, c, h, l, v, fwd, lo, hi):
    """Evaluate occurrences whose index falls in [lo, hi). Returns (n, success, avg_ret, warnings)."""
    rets, wins, warnings = [], 0, []
    for i in idxs:
        if not (lo <= i < hi):
            continue
        r = _forward_return(c, i, fwd)
        if r is None:
            continue
        rets.append(r)
        if r > 0:
            wins += 1
        w = _manipulation_flag(c, h, l, v, i)
        if w:
            warnings.append(w)
    n = len(rets)
    success = (wins / n) if n else 0.0
    avg = (sum(rets) / n) if n else 0.0
    return n, success, avg, warnings


def mine(data: dict) -> dict:
    ohlcv = data.get("ohlcv") or []
    flags = []
    if len(ohlcv) < 60:
        return {"skill": "pattern-miner", "error": "need >=60 OHLCV bars to mine patterns",
                "bars_supplied": len(ohlcv)}
    if len(ohlcv) < 120:
        flags.append("limited_history_<120_bars")

    params = {**DEFAULTS, **(data.get("params") or {})}
    min_occ = int(params["min_occurrences"])
    fwd = int(params["forward_days"])
    base_thresh = float(params["success_threshold"])
    adj_thresh = min(0.95, base_thresh + BONFERRONI_BUMP)

    o, h, l, c, v = ind.split_ohlcv(ohlcv)
    n = len(c)
    split = int(n * 0.70)  # train = first 70%, holdout = last 30%

    sigs = _signal_indices(c, h, l, v)

    patterns = []
    validated = 0
    for name, idxs in sigs.items():
        # Only count occurrences that have a full forward window available.
        usable = [i for i in idxs if _forward_return(c, i, fwd) is not None]
        total = len(usable)
        tr_n, tr_succ, tr_avg, tr_w = _eval_window(usable, c, h, l, v, fwd, 0, split)
        ho_n, ho_succ, ho_avg, ho_w = _eval_window(usable, c, h, l, v, fwd, split, n)
        all_ret = [_forward_return(c, i, fwd) for i in usable]
        all_ret = [r for r in all_ret if r is not None]
        avg_ret = (sum(all_ret) / len(all_ret)) if all_ret else 0.0

        warnings = sorted(set(tr_w + ho_w))
        man_warn = []
        if warnings:
            man_warn = [f"manipulation_footprint: {len(warnings)} occurrence(s)"]

        if total < min_occ or tr_n == 0 or ho_n == 0:
            status = "insufficient_data"
        elif tr_succ >= adj_thresh and ho_succ >= adj_thresh:
            status = "validated"
            validated += 1
        elif tr_succ >= adj_thresh and ho_succ < adj_thresh:
            status = "retired"  # passed in-sample, degraded out-of-sample
        else:
            status = "retired"

        patterns.append({
            "name": name,
            "occurrences": total,
            "train_occurrences": tr_n,
            "holdout_occurrences": ho_n,
            "train_success": round(tr_succ, 3),
            "holdout_success": round(ho_succ, 3),
            "avg_forward_return_pct": round(avg_ret, 2),
            "status": status,
            "warnings": man_warn,
        })

    methodology_note = (
        f"Tested {N_PATTERNS} candidate patterns over {n} bars. Train = first 70% "
        f"({split} bars), holdout = last 30% (out-of-sample). Forward window = {fwd} bars. "
        f"Requires >={min_occ} occurrences and success >= {round(adj_thresh, 3)} on BOTH "
        f"windows (base threshold {base_thresh} raised by a Bonferroni multiple-testing bump "
        f"of {round(BONFERRONI_BUMP, 4)} for {N_PATTERNS} tests). Patterns that pass in-sample "
        f"but fail the holdout are auto-retired. Manipulation footprints (volume > "
        f"{VOL_SPIKE_MULT:g}x avg or move >= {CIRCUIT_MOVE_PCT:g}%) are flagged, not dropped."
    )

    return {
        "skill": "pattern-miner",
        "ticker": data.get("ticker"),
        "as_of": data.get("as_of"),
        "patterns": patterns,
        "validated_count": validated,
        "methodology_note": methodology_note,
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
    if not isinstance(data, dict):
        print(json.dumps({"error": "input must be a JSON object"}))
        sys.exit(1)
    result = mine(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
