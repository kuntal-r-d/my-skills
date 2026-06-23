"""Registry mapping MCP tool names to Stock Buddy skill scripts.

The MCP server exposes one tool per skill. Each entry records the skill folder,
its entry script, a short description (reused as the MCP tool description), and
the top-level input fields the skill reads (used to build a helpful inputSchema).

Skills live in ../skills relative to the repo root. SKILLS_DIR is resolved at
import time but can be overridden with the STOCK_BUDDY_SKILLS_DIR env var so the
server works regardless of where it is installed.
"""
from __future__ import annotations

import os
from pathlib import Path

# repo_root/mcp-server/stock_buddy_mcp/registry.py -> repo_root/skills
_DEFAULT_SKILLS_DIR = Path(__file__).resolve().parents[2] / "skills"
SKILLS_DIR = Path(os.environ.get("STOCK_BUDDY_SKILLS_DIR", _DEFAULT_SKILLS_DIR))

# tool_name -> spec
SKILLS = {
    "technical_analysis": {
        "skill": "technical-analysis", "script": "analyze.py",
        "description": "Run the DSE Technical Committee over OHLCV history; returns a weighted "
                       "technical score, rating, and reasoning (RSI/MACD/ADX/Bollinger/volume).",
        "reads": ["ohlcv", "mode", "microstructure", "ticker", "as_of"],
    },
    "momentum_screen": {
        "skill": "momentum-screen", "script": "screen.py",
        "description": "Score a stock against the 25-point momentum checklist (Minervini SEPA + "
                       "Driehaus) and return a Momentum Grade A+..F.",
        "reads": ["ohlcv", "fundamentals", "market_index", "ticker", "as_of"],
    },
    "fundamental_analysis": {
        "skill": "fundamental-analysis", "script": "analyze.py",
        "description": "Balance-sheet read, valuation (DCF/Graham/PE) fair-value range, and a "
                       "fundamental score with red flags.",
        "reads": ["fundamentals", "ticker", "as_of"],
    },
    "value_investment_checklist": {
        "skill": "value-investment-checklist", "script": "checklist.py",
        "description": "Score a stock against the 30-point Buffett/Graham/Lynch value checklist "
                       "and return an Investment Grade.",
        "reads": ["fundamentals", "ticker", "as_of"],
    },
    "smart_money_flow": {
        "skill": "smart-money-flow", "script": "analyze.py",
        "description": "Accumulation/distribution from public shareholding deltas and disclosed "
                       "fund moves (public data only).",
        "reads": ["shareholding", "funds", "ticker", "as_of"],
    },
    "sentiment_news": {
        "skill": "sentiment-news", "script": "sentiment.py",
        "description": "News sentiment with rumour-vs-fundamentals separation for a DSE ticker.",
        "reads": ["news", "mode", "ticker", "as_of"],
    },
    "macro_regime": {
        "skill": "macro-regime", "script": "regime.py",
        "description": "Assess Bangladesh market regime and emit a risk-appetite multiplier.",
        "reads": ["macro", "ticker", "as_of"],
    },
    "signal_synthesizer": {
        "skill": "signal-synthesizer", "script": "synthesize.py",
        "description": "Fuse per-agent sub-scores into dual-mode (Investment/Momentum) signals "
                       "with a 1-10 DSE Composite Score and confluence/stand-aside logic.",
        "reads": ["agents", "microstructure", "ticker", "as_of"],
    },
    "risk_manager": {
        "skill": "risk-manager", "script": "analyze.py",
        "description": "Convert a signal + price data into a risk-checked recommendation: ATR buy "
                       "zone, stop, target, position size in BDT, and pass/fail risk gates.",
        "reads": ["ohlcv", "account", "signal", "microstructure", "fundamentals", "portfolio"],
    },
    "stock_screener": {
        "skill": "stock-screener", "script": "screen.py",
        "description": "Screen a universe of DSE stocks by fundamental/technical filters, a named "
                       "template, or a natural-language query.",
        "reads": ["universe", "filters", "template", "query", "mode", "limit"],
    },
    "pattern_miner": {
        "skill": "pattern-miner", "script": "mine.py",
        "description": "Discover and validate recurring price patterns for one ticker with "
                       "anti-overfitting safeguards (train/holdout, min occurrences).",
        "reads": ["ohlcv", "params", "ticker", "as_of"],
    },
    "daily_briefing": {
        "skill": "daily-briefing", "script": "brief.py",
        "description": "Produce a pre-market briefing (levels, events, risk items) in conditional, "
                       "non-imperative language.",
        "reads": ["portfolio", "watchlist", "calendar", "overnight_news", "macro_regime", "as_of"],
    },
    "ticker_dossier": {
        "skill": "ticker-dossier", "script": "dossier.py",
        "description": "Consolidate analysis Thinking Cards into one Markdown dossier (PDF-ready).",
        "reads": ["cards", "data", "ticker", "as_of"],
    },
    "financial_terms_educator": {
        "skill": "financial-terms-educator", "script": "lookup.py",
        "description": "Explain financial terms bilingually (EN/BN) with dual-strategy impact; "
                       "look up a term, annotate metrics, or list all terms.",
        "reads": ["term", "terms", "metrics", "list"],
    },
}


def script_path(tool_name: str) -> Path:
    spec = SKILLS[tool_name]
    return SKILLS_DIR / spec["skill"] / "scripts" / spec["script"]


# Per-field JSON Schemas for the shared data contract. These MUST be declared
# explicitly: a spec-compliant MCP client only forwards arguments that appear in
# a tool's inputSchema `properties`, so an empty/`additionalProperties`-only
# schema causes the client to strip `ohlcv`, `fundamentals`, etc. before the call
# ever reaches the skill (the skill then reports "missing required ..."). The
# server still does NOT fetch anything — the client gathers this data (see the
# `dse-data-acquisition` skill) and passes it in here.
_OHLCV_BAR = {
    "type": "object",
    "properties": {
        "date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
        "open": {"type": "number"}, "high": {"type": "number"},
        "low": {"type": "number"}, "close": {"type": "number"},
        "volume": {"type": "number"},
    },
    "required": ["date", "close"],
}

_FIELD_SCHEMAS = {
    "ticker": {"type": "string", "description": "DSE trade code, e.g. 'LHB'."},
    "as_of": {"type": "string", "description": "Analysis date, ISO YYYY-MM-DD."},
    "mode": {"type": "string", "enum": ["momentum", "investment"],
             "description": "Analysis mode."},
    "ohlcv": {"type": "array", "items": _OHLCV_BAR,
              "description": "Daily price bars, oldest-first. Technical needs >=30 "
                             "(>=200 for the full MA stack); risk needs >=15."},
    "fundamentals": {"type": "object", "additionalProperties": True,
                     "description": "eps_ttm, eps_history[], book_value_per_share, "
                                    "debt_to_equity, current_ratio, interest_coverage, "
                                    "free_cash_flow, profit_margin, roe, pe, price, "
                                    "earnings_growth, sector_median_pe, dividend_yield, pb."},
    "shareholding": {"type": "array", "items": {"type": "object", "additionalProperties": True},
                     "description": "Public shareholding-pattern snapshots over time."},
    "funds": {"type": "array", "items": {"type": "object", "additionalProperties": True},
              "description": "Disclosed institutional/fund holdings (public data only)."},
    "news": {"type": "array", "items": {"type": "object", "additionalProperties": True},
             "description": "News/disclosure items: {date, headline, source, category, url}."},
    "macro": {"type": "object", "additionalProperties": True,
              "description": "Bangladesh macro inputs: inflation, policy_rate, fx, etc."},
    "microstructure": {"type": "object", "additionalProperties": True,
                       "description": "Circuit-limit / floor-price / liquidity flags."},
    "account": {"type": "object", "additionalProperties": True,
                "description": "Sizing inputs: equity (BDT), risk_per_trade_pct, etc."},
    "portfolio": {"type": "array", "items": {"type": "object", "additionalProperties": True},
                  "description": "Current holdings (for heat/concentration gates)."},
    "market_index": {"type": "object", "additionalProperties": True,
                     "description": "DSEX/DSE30 series or latest values."},
    "signal": {"type": "object", "additionalProperties": True,
               "description": "A synthesized signal card (from signal_synthesizer)."},
    "agents": {"type": "object", "additionalProperties": True,
               "description": "Per-agent {score, confidence} keyed by technical/fundamental/"
                              "smart_money/sentiment/macro."},
    "watchlist": {"type": "array", "items": {"type": "string"}},
    "calendar": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
    "overnight_news": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
    "macro_regime": {"type": "object", "additionalProperties": True},
    "cards": {"type": "array", "items": {"type": "object", "additionalProperties": True},
              "description": "Thinking Cards to consolidate into a dossier."},
    "data": {"type": "object", "additionalProperties": True},
    "universe": {"type": "array", "items": {"type": "object", "additionalProperties": True},
                 "description": "Candidate stocks to screen, each with its metrics."},
    "filters": {"type": "object", "additionalProperties": True},
    "template": {"type": "string"},
    "query": {"type": "string"},
    "limit": {"type": "integer"},
    "params": {"type": "object", "additionalProperties": True},
    "term": {"type": "string"},
    "terms": {"type": "array", "items": {"type": "string"}},
    "metrics": {"type": "object", "additionalProperties": True},
    "list": {"type": "boolean"},
}


def input_schema(tool_name: str) -> dict:
    """Explicit object schema built from the fields this skill reads.

    Declaring `properties` is what lets MCP clients actually pass data through;
    `additionalProperties` stays True so the full contract is still accepted.
    Skills validate their own required fields and return a structured
    {"error": ...} when inputs are insufficient."""
    reads = SKILLS[tool_name]["reads"]
    properties = {f: _FIELD_SCHEMAS[f] for f in reads if f in _FIELD_SCHEMAS}
    return {
        "type": "object",
        "description": "Stock Buddy shared data-contract object. The client assembles this "
                       "(the server does not fetch) — see the dse-data-acquisition skill. "
                       "Fields this skill reads: " + ", ".join(reads) + ".",
        "properties": properties,
        "additionalProperties": True,
    }
