# Stock Buddy Skills

A suite of [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
for analysing Dhaka Stock Exchange (DSE) securities for **long-term investment** and
**short-term momentum trading**. Every skill follows the Agent Skills format (a `SKILL.md`
with YAML frontmatter plus optional `scripts/`, `references/`, `assets/` folders) so that any
MCP client or agent runtime can discover and invoke it.

These skills are derived from the Stock Buddy PRDs (`PRD-001.json`, `prd-002.json`). They are
**educational analysis tools, not financial advice** and never execute trades.

## Skill index

| Skill | Purpose | Mode |
|-------|---------|------|
| `technical-analysis` | Trend, oscillators, patterns, levels, volume → technical score | Momentum + Investment |
| `momentum-screen` | Minervini SEPA + Driehaus 25-point checklist → momentum grade | Momentum |
| `fundamental-analysis` | Ratios, balance-sheet red flags, DCF fair value | Investment |
| `value-investment-checklist` | 30-point Buffett/Graham/Lynch → investment grade | Investment |
| `smart-money-flow` | Shareholding deltas, institutional & fund-manager moves (public data only) | Both |
| `sentiment-news` | News sentiment, rumour vs fundamentals separation | Both |
| `macro-regime` | Market regime multiplier (rates, reserves, FX, regulation) | Both |
| `signal-synthesizer` | Mode Router + confluence rule + DSE Composite Score (1–10) | Both |
| `risk-manager` | ATR/Kelly position sizing, stop/target, circuit-breaker suppression | Both |
| `stock-screener` | Fundamental + technical + natural-language screens | Both |
| `pattern-miner` | Anti-overfitting validated per-ticker price patterns | Momentum |
| `daily-briefing` | Pre-market briefing (levels, events, risk items) | Both |
| `ticker-dossier` | One-shot consolidated ticker report (Markdown/PDF-ready) | Both |
| `financial-terms-educator` | Bilingual (EN/BN) glossary with dual-strategy impact | Education |

## Shared data contract

To stay portable across MCP clients, every executable script is a **Node.js CLI**
(TypeScript compiled) that reads one JSON document and writes one JSON document.
No third-party packages in skill runtime beyond the compiled bundle.

### Invocation

```bash
node scripts/<script>.js --input data.json        # read from a file
cat data.json | node scripts/<script>.js           # or read from stdin
```

Add `--pretty` for indented output. Every script exits non-zero and prints
`{"error": "..."}` on bad input.

### Canonical input object

Not every field is required by every skill; each `SKILL.md` lists what it reads.

```json
{
  "ticker": "GP",
  "mode": "momentum",
  "as_of": "2026-06-19",
  "ohlcv": [
    {"date": "2026-01-01", "open": 300.0, "high": 305.0, "low": 298.0, "close": 304.0, "volume": 120000}
  ],
  "market_index": [
    {"date": "2026-01-01", "close": 6200.0}
  ],
  "fundamentals": {
    "eps_ttm": 24.5, "eps_history": [18.0, 20.1, 22.3, 24.5],
    "book_value_per_share": 110.0, "pe": 14.2, "pb": 1.3,
    "roe": 0.23, "debt_to_equity": 0.15, "current_ratio": 2.8,
    "profit_margin": 0.21, "free_cash_flow": 3.2e9, "dividend_yield": 0.04,
    "revenue_growth": 0.12, "earnings_growth": 0.18, "peg": 0.85,
    "ncav_per_share": 60.0, "interest_coverage": 6.0, "sector": "Telecom"
  },
  "shareholding": [
    {"month": "2026-04", "sponsor": 45.0, "govt": 0.0, "institution": 22.0, "foreign": 8.0, "public": 25.0}
  ],
  "news": [
    {"date": "2026-06-18", "headline": "...", "source": "...", "category": "earnings"}
  ],
  "macro": {"policy_rate": 0.10, "fx_reserves_bn": 20.1, "inflation": 0.095, "bdt_usd": 117.0},
  "microstructure": {"circuit_state": "normal", "floor_price": null, "halted": false,
                     "avg_daily_value_bdt": 25000000},
  "account": {"capital_bdt": 1000000, "risk_per_trade_pct": 1.0}
}
```

### Canonical output object (Thinking Card)

Every analysis script emits a structured "Thinking Card" so outputs compose cleanly and stay
auditable (glass-box):

```json
{
  "skill": "technical-analysis",
  "ticker": "GP",
  "mode": "momentum",
  "as_of": "2026-06-19",
  "score": 0.62,                 // normalised -1..+1 (or 0..1 where noted)
  "confidence": 0.78,            // 0..1
  "rating": "buy",               // skill-specific label
  "key_metrics": { "rsi_14": 58.3, "adx_14": 27.1 },
  "reasoning": ["RSI 58 — healthy, not overbought", "ADX 27 — trend is strong"],
  "flags": ["stale_data"],       // confidence-penalty flags, never silent drops
  "disclaimer": "Educational analysis only. Not financial advice."
}
```

## Conventions

- **Frontmatter**: `name`, `description` (third-person, trigger-rich), `license: Apache-2.0`,
  `compatibility`, and `metadata` (author, version).
- **`scripts/`**: TypeScript CLIs (compiled to `.js`) implementing the math. Pure functions, no network.
- **`references/`**: deeper docs (formulas, criteria tables, methodology) loaded on demand.
- **Determinism**: same input → same output. No randomness except where a skill explicitly
  documents a seeded simulation.
- **DSE specifics**: BDT currency, Sun–Thu trading week, circuit limits & floor prices,
  monthly shareholding cadence. Localisation notes live in each skill's references.

## Disclaimer

All skills output educational analysis and signals only — never individualised investment
advice — and respect the out-of-scope boundaries in the PRDs (no order execution, public data
only for institutional flow).
