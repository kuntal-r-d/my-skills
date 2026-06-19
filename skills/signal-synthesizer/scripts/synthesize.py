#!/usr/bin/env python3
"""signal-synthesizer: fuse per-agent DSE sub-scores into Investment + Momentum signals.

Reads an `agents` map (agent name -> {score in [-1,+1], confidence in [0,1]}) plus
`ticker`/`as_of` and optional `microstructure`, and emits ONE Thinking Card holding two
synthesized signals:

  investment  - long-term, fundamentals-weighted
  momentum    - short-term, technical-weighted (fundamentals act as a VETO only)

Governance applied on top of the weighted averages (PRD-002 REQ-022 / REQ-111 / REQ-097):
  - Confluence: high conviction (|w|>=0.5) needs >=2 agents agreeing in sign (|s|>=0.3).
  - Strong conflict: a strong bull (>=0.5) AND a strong bear (<=-0.5) -> stand_aside.
  - Microstructure: circuit limit / floor price / halt -> momentum suppressed.
  - DSE Composite Score: weighted (-1..+1) mapped to 1..10; contributions decomposable.

Usage:
  python3 synthesize.py --input data.json [--pretty]
  cat data.json | python3 synthesize.py
"""
from __future__ import annotations

import argparse
import json
import sys

DISCLAIMER = "Educational analysis only. Not financial advice."
SKILL = "signal-synthesizer"

# Agents read by the synthesizer (volume_flow is optional / derivable).
AGENT_KEYS = ("technical", "fundamental", "smart_money", "sentiment", "macro", "volume_flow")

INVESTMENT_WEIGHTS = {
    "fundamental": 0.40, "smart_money": 0.20, "macro": 0.15,
    "sentiment": 0.15, "technical": 0.10,
}
MOMENTUM_WEIGHTS = {
    "technical": 0.45, "volume_flow": 0.20, "smart_money": 0.15,
    "sentiment": 0.12, "fundamental": 0.08,
}

# Confluence / conviction thresholds.
HIGH_CONVICTION = 0.50      # |weighted| at/above which we *want* a strong rating
AGREE_SCORE = 0.30          # an agent "agrees" if |score| >= this and sign matches
STRONG_AGENT = 0.50         # a single agent is "strong" bull/bear at this magnitude
FUNDAMENTAL_VETO = -0.50    # momentum capped at stand_aside if fundamental below this


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _num(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def normalize_agents(raw: dict) -> dict:
    """Return {key: {'score': clamped, 'confidence': clamped}} for known agents present."""
    out = {}
    for k in AGENT_KEYS:
        a = raw.get(k)
        if not isinstance(a, dict):
            continue
        out[k] = {
            "score": clamp(_num(a.get("score"))),
            "confidence": clamp(_num(a.get("confidence"), 0.5), 0.0, 1.0),
        }
    return out


def composite_1_10(weighted: float) -> int:
    """Map weighted score (-1..+1) to a 1..10 DSE Composite Score (rounded)."""
    # -1 -> 1, 0 -> 5.5->5/6, +1 -> 10. Linear: 5.5 + 4.5*w.
    return int(round(clamp(5.5 + 4.5 * weighted, 1.0, 10.0)))


def _weighted(agents: dict, weights: dict):
    """Return (weighted_score, contributions{}) over weights, renormalised for missing agents."""
    present = {k: w for k, w in weights.items() if k in agents}
    total_w = sum(present.values()) or 1.0
    contributions = {}
    weighted = 0.0
    for k, w in weights.items():
        if k not in agents:
            contributions[k] = 0.0
            continue
        nw = w / total_w  # renormalise so missing agents don't deflate the score
        c = round(nw * agents[k]["score"], 4)
        contributions[k] = c
        weighted += nw * agents[k]["score"]
    return clamp(weighted), contributions


def _confidence(agents: dict, weights: dict) -> float:
    """Weight-blended agent confidence over the agents that participate."""
    present = {k: w for k, w in weights.items() if k in agents}
    total_w = sum(present.values()) or 1.0
    conf = sum((w / total_w) * agents[k]["confidence"] for k, w in present.items())
    return round(clamp(conf, 0.0, 1.0), 2)


def _agreers(agents: dict, sign: int):
    """Agents that agree with `sign` at |score| >= AGREE_SCORE."""
    return [k for k, a in agents.items()
            if a["score"] * sign > 0 and abs(a["score"]) >= AGREE_SCORE]


def _strong_conflict(agents: dict):
    bulls = [k for k, a in agents.items() if a["score"] >= STRONG_AGENT]
    bears = [k for k, a in agents.items() if a["score"] <= -STRONG_AGENT]
    return bulls, bears


def _rating_from_score(w: float) -> str:
    if w >= 0.50:
        return "strong_buy"
    if w >= 0.15:
        return "buy"
    if w <= -0.50:
        return "sell"
    if w <= -0.15:
        return "sell"
    return "hold"


def _downgrade(rating: str) -> str:
    """Soften a high-conviction rating to a moderate one when confluence fails."""
    if rating == "strong_buy":
        return "buy"
    if rating == "sell":
        return "hold"  # weak bearish without confluence -> hold (no conviction to sell)
    return rating


def _build_signal(agents, weights, reasoning_seed):
    """Common scaffolding: weighted score, contributions, base rating + confluence."""
    weighted, contributions = _weighted(agents, weights)
    conf = _confidence(agents, weights)
    reasoning = list(reasoning_seed)

    bulls, bears = _strong_conflict(agents)
    rating = _rating_from_score(weighted)
    conflict = bool(bulls and bears)

    if conflict:
        rating = "stand_aside"
        reasoning.append(
            f"Strong conflict: {', '.join(bulls)} strongly bullish vs "
            f"{', '.join(bears)} strongly bearish — standing aside instead of averaging.")
        conf = round(max(0.1, conf - 0.2), 2)
    elif abs(weighted) >= HIGH_CONVICTION:
        sign = 1 if weighted > 0 else -1
        agreers = _agreers(agents, sign)
        if len(agreers) >= 2:
            reasoning.append(
                f"High conviction confirmed by confluence: {', '.join(agreers)} "
                f"agree (|score|>=0.3, same direction).")
        else:
            rating = _downgrade(rating)
            reasoning.append(
                "High weighted score but only "
                f"{len(agreers)} agent(s) independently agree (need 2) — "
                "downgraded to a moderate rating.")
            conf = round(max(0.1, conf - 0.1), 2)

    return weighted, contributions, conf, rating, reasoning, conflict


def synthesize(data: dict) -> dict:
    raw_agents = data.get("agents")
    if not isinstance(raw_agents, dict) or not raw_agents:
        return {"skill": SKILL, "error": "missing 'agents' object"}

    agents = normalize_agents(raw_agents)
    if "technical" not in agents and "fundamental" not in agents:
        return {"skill": SKILL,
                "error": "need at least 'technical' or 'fundamental' agent score"}

    flags = []
    # Derive volume_flow from technical if it was not supplied.
    if "volume_flow" not in agents and "technical" in agents:
        agents["volume_flow"] = {
            "score": round(0.8 * agents["technical"]["score"], 4),
            "confidence": round(0.8 * agents["technical"]["confidence"], 2),
        }
        flags.append("volume_flow_derived_from_technical")

    ms = data.get("microstructure") or {}
    suppressed = (ms.get("circuit_state") in ("limit_up", "limit_down")
                  or bool(ms.get("floor_price")) or bool(ms.get("halted")))

    # ---- Investment signal ----
    inv_w, inv_contrib, inv_conf, inv_rating, inv_reason, _ = _build_signal(
        agents, INVESTMENT_WEIGHTS,
        ["Investment lens weights fundamentals (.40), smart-money (.20), "
         "macro (.15), sentiment (.15), technical (.10)."])
    if suppressed:
        inv_reason.append(
            "Microstructure note: price discovery interrupted (circuit/floor/halt); "
            "investment thesis still valid but defer execution until normal trading.")
        if "microstructure_circuit_or_floor" not in flags:
            flags.append("microstructure_circuit_or_floor")

    fund = agents.get("fundamental", {}).get("score")
    fv_note = ("Accumulate near support / fair-value zone; scale in on weakness."
               if inv_w > 0 else
               "No discount to fair value — wait for a better entry or a thesis change.")
    investment = {
        "score": round(inv_w, 3),
        "composite_1_10": composite_1_10(inv_w),
        "rating": inv_rating,
        "confidence": inv_conf,
        "contributions": inv_contrib,
        "fair_value_note": fv_note,
        "thesis": _thesis(inv_rating, inv_contrib, fund),
        "exit_conditions": _exit_conditions(inv_rating),
        "reasoning": inv_reason,
    }

    # ---- Momentum signal ----
    mom_w, mom_contrib, mom_conf, mom_rating, mom_reason, mom_conflict = _build_signal(
        agents, MOMENTUM_WEIGHTS,
        ["Momentum lens weights technical (.45), volume-flow (.20), "
         "smart-money (.15), sentiment (.12), fundamental (.08 veto-only)."])

    # Fundamental veto.
    if fund is not None and fund < FUNDAMENTAL_VETO and mom_rating not in ("stand_aside",):
        mom_rating = "stand_aside"
        mom_reason.append(
            f"Fundamental veto: fundamental score {fund:.2f} < {FUNDAMENTAL_VETO} — "
            "business is broken; momentum trade capped at stand_aside.")

    # Microstructure suppression takes priority for momentum.
    if suppressed:
        state = ms.get("circuit_state")
        why = (f"circuit_state={state}" if state in ("limit_up", "limit_down")
               else ("floor_price set" if ms.get("floor_price") else "trading halted"))
        mom_rating = "suppressed"
        mom_reason.append(
            f"Momentum suppressed: {why}. Price discovery is interrupted, so technical "
            "signals are unreliable — no momentum entry until normal trading resumes.")
        if "microstructure_circuit_or_floor" not in flags:
            flags.append("microstructure_circuit_or_floor")

    momentum = {
        "score": round(mom_w, 3),
        "composite_1_10": composite_1_10(mom_w),
        "rating": mom_rating,
        "confidence": mom_conf,
        "contributions": mom_contrib,
        "entry_trigger": _entry_trigger(mom_rating),
        "stop_note": "Place stop below the breakout base / recent swing low "
                     "(see risk-manager for ATR-based levels).",
        "reasoning": mom_reason,
    }

    return {
        "skill": SKILL,
        "ticker": data.get("ticker"),
        "as_of": data.get("as_of"),
        "investment": investment,
        "momentum": momentum,
        "flags": flags,
        "disclaimer": DISCLAIMER,
    }


def _thesis(rating, contrib, fund):
    top = sorted(contrib.items(), key=lambda kv: abs(kv[1]), reverse=True)[:2]
    drivers = ", ".join(f"{k} ({v:+.2f})" for k, v in top if v)
    if rating in ("strong_buy", "buy"):
        return (f"Constructive long-term thesis driven by {drivers or 'mixed inputs'}; "
                "hold for fundamental compounding.")
    if rating == "stand_aside":
        return "Inputs conflict materially — no clear long-term thesis; wait for resolution."
    if rating == "sell":
        return f"Deteriorating fundamentals/flows ({drivers}); avoid or exit."
    return f"Balanced inputs ({drivers or 'neutral'}); no edge for a new investment."


def _exit_conditions(rating):
    if rating in ("strong_buy", "buy"):
        return ["Thesis break: fundamentals deteriorate (earnings miss, margin collapse)",
                "Smart-money distribution (sponsor/institution selling for 2+ months)",
                "Valuation overshoots fair value materially"]
    return ["Re-enter only when conflict resolves or fundamentals improve"]


def _entry_trigger(rating):
    if rating in ("strong_buy", "buy"):
        return "Enter on confirmed breakout above the base on above-average volume."
    if rating == "suppressed":
        return "No entry — wait for circuit/floor/halt to clear and price discovery to resume."
    if rating == "stand_aside":
        return "No entry — wait for the conflict/veto to resolve."
    return "No momentum edge — stand aside."


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
    result = synthesize(data)
    print(json.dumps(result, indent=2 if args.pretty else None))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
