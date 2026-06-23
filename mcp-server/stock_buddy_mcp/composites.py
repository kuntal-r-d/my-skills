"""Composite tools that orchestrate the skill pipeline server-side (TAD ADR-007).

analyze_ticker: leaf skills -> signal-synthesizer -> risk-manager, in one call.
screen_market:  thin wrapper over stock-screener.

Each composite degrades gracefully: if a leaf errors, it records the failing
stage in `stages` and continues, rather than dropping the result silently.
"""
from __future__ import annotations

from typing import Any, Dict

from .dispatch import run_skill, SkillError

# leaf tool -> agent key consumed by signal_synthesizer
_LEAVES = {
    "technical_analysis": "technical",
    "fundamental_analysis": "fundamental",
    "smart_money_flow": "smart_money",
    "sentiment_news": "sentiment",
    "macro_regime": "macro",
}


def _score_conf(card: Dict[str, Any]) -> Dict[str, float]:
    return {
        "score": float(card.get("score", 0.0) or 0.0),
        "confidence": float(card.get("confidence", 0.5) or 0.5),
    }


# What each leaf needs from the payload. Drives the instructions returned to the
# client when data is absent — the server never fetches, it tells the client what
# to gather (see the dse-data-acquisition skill).
_LEAF_NEEDS = {
    "technical_analysis": "ohlcv (>=30 daily bars, oldest-first)",
    "fundamental_analysis": "fundamentals (eps_ttm, eps_history, book_value_per_share, "
                            "debt_to_equity, roe, pe, price, ...)",
    "smart_money_flow": "shareholding (public shareholding-pattern snapshots)",
    "sentiment_news": "news (recent headlines/disclosures)",
    "macro_regime": "macro (Bangladesh inflation, policy_rate, fx, ...)",
}


def _missing_fields(payload: Dict[str, Any]) -> list:
    needed = {"ohlcv": "technical + risk", "fundamentals": "fundamental"}
    return [f for f in needed if not payload.get(f)]


def _acquisition_instructions(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Tell the client how to gather the data this pipeline needs. The MCP server
    does not fetch — the client assembles the contract and calls again."""
    return {
        "message": "No analysable data was supplied. This server does not fetch market "
                   "data; assemble the shared data contract for the ticker and call again.",
        "how_to": "Follow the `dse-data-acquisition` skill: gather public DSE data, shape it "
                  "into the contract JSON, then re-call analyze_ticker with it.",
        "needs": _LEAF_NEEDS,
        "minimal_payload_example": {
            "ticker": payload.get("ticker") or "LHB",
            "as_of": payload.get("as_of") or "YYYY-MM-DD",
            "mode": payload.get("mode") or "investment",
            "ohlcv": [{"date": "YYYY-MM-DD", "open": 0, "high": 0, "low": 0,
                       "close": 0, "volume": 0}, "... >=30 daily bars, oldest-first ..."],
            "fundamentals": {"eps_ttm": 0, "eps_history": [], "book_value_per_share": 0,
                             "debt_to_equity": 0, "roe": 0, "pe": 0, "price": 0},
        },
        "suggested_public_sources": [
            "dsebd.org / dse.com.bd (official prices, disclosures)",
            "company financial statements / annual report (fundamentals)",
        ],
    }


def analyze_ticker(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run the full pipeline for one ticker.

    `payload` is the shared data-contract object (ohlcv, fundamentals,
    shareholding, news, macro, microstructure, account, ...).
    """
    ticker = payload.get("ticker")
    stages: Dict[str, str] = {}
    agents: Dict[str, Dict[str, float]] = {}
    cards: Dict[str, Any] = {}

    for tool, agent_key in _LEAVES.items():
        try:
            card = run_skill(tool, payload)
            if "error" in card:
                stages[tool] = f"skipped: {card['error']}"
                continue
            cards[agent_key] = card
            agents[agent_key] = _score_conf(card)
            stages[tool] = "ok"
        except SkillError as e:
            stages[tool] = f"error: {e}"

    if not agents:
        return {"skill": "analyze_ticker", "ticker": ticker,
                "error": "no leaf analyses succeeded — no usable data was supplied",
                "stages": stages,
                "instructions": _acquisition_instructions(payload)}

    # Synthesize dual-mode signal.
    syn_payload = {"ticker": ticker, "as_of": payload.get("as_of"),
                   "agents": agents, "microstructure": payload.get("microstructure")}
    try:
        synthesis = run_skill("signal_synthesizer", syn_payload)
        stages["signal_synthesizer"] = "ok" if "error" not in synthesis else f"error: {synthesis['error']}"
    except SkillError as e:
        synthesis = {"error": str(e)}
        stages["signal_synthesizer"] = f"error: {e}"

    # Risk-check (uses ohlcv + account from the original payload).
    try:
        risk = run_skill("risk_manager", payload)
        stages["risk_manager"] = "ok" if "error" not in risk else f"error: {risk['error']}"
    except SkillError as e:
        risk = {"error": str(e)}
        stages["risk_manager"] = f"error: {e}"

    result = {
        "skill": "analyze_ticker",
        "ticker": ticker,
        "as_of": payload.get("as_of"),
        "synthesis": synthesis,
        "risk": risk,
        "agent_cards": cards,
        "stages": stages,
        "disclaimer": "Educational analysis only. Not financial advice.",
    }
    # If core data is missing, the result is thin — tell the client what to gather
    # rather than leaving it to guess from skipped stages.
    missing = _missing_fields(payload)
    if missing:
        instr = _acquisition_instructions(payload)
        instr["missing_core_fields"] = missing
        result["instructions"] = instr
    return result


def screen_market(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Thin wrapper over stock-screener (kept as a composite for a stable name)."""
    return run_skill("stock_screener", payload)


COMPOSITES = {
    "analyze_ticker": {
        "fn": analyze_ticker,
        "description": "End-to-end: run technical, fundamental, smart-money, sentiment and macro "
                       "analyses, fuse them via signal-synthesizer (dual-mode 1-10 composite), and "
                       "risk-check via risk-manager. One call, full pipeline, for a DSE ticker.",
        "reads": ["ticker", "ohlcv", "fundamentals", "shareholding", "news", "macro",
                  "microstructure", "account", "market_index", "as_of"],
    },
    "screen_market": {
        "fn": screen_market,
        "description": "Scan a universe of DSE stocks for Investment or Momentum candidates via "
                       "filters, a named template, or a natural-language query.",
        "reads": ["universe", "filters", "template", "query", "mode", "limit"],
    },
}
