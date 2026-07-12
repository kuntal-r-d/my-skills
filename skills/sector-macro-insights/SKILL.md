---
name: sector-macro-insights
description: Researches and synthesizes sector-level macro insights for DSE — Bangladesh and global analysis, sector news context, cross-sector spending themes (e.g. real estate slowdown, FMCG pressure). Use for macro tab sector refresh, "pharma outlook Bangladesh", global cement demand, or qualitative themes spanning sectors. Persists memos via stock-buddy-data MCP.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Host LLM performs web research; optional TS helper returns context and instructions.
metadata:
  author: stock-buddy
  version: "0.1.0"
  mode: ["momentum", "investment"]
---

# Sector Macro Insights

> **Prompt-first skill.** The host LLM researches qualitative drivers and saves structured memos.
> Call `sector_macro_insights` for instructions, or `get_sector_macro_context` for data.

## When to use

- Macro tab sector analysis (Bangladesh + global sections)
- "What's happening in pharma / banking / FMCG in Bangladesh?"
- Global commodity or rates impact on a DSE sector
- Cross-sector themes: "people aren't spending on real estate", regulatory shifts

## Workflow

1. `stock-buddy-data.get_sector_macro_context({ sector?, scope: "bangladesh"|"global"|"both", days: 14 })`
2. Web research for qualitative drivers (BD + global as requested)
3. `stock-buddy-data.upsert_research_sources({ sources: [...] })`
4. `stock-buddy-data.upsert_research_memo({ title, body_md, summary_json, as_of })`

### summary_json convention

```json
{
  "sector": "Pharmaceuticals",
  "sector_slug": "pharmaceuticals",
  "scope": "bangladesh|global|cross_sector",
  "insight_type": "sector_macro|spending_trend|regulatory",
  "bullets": ["...", "..."]
}
```

## Output (Thinking Card)

```json
{
  "skill": "sector-macro-insights",
  "ticker": "MARKET",
  "mode": "both",
  "as_of": "2026-07-01",
  "score": 0.0,
  "confidence": 0.75,
  "rating": "cautious|neutral|supportive",
  "key_metrics": {
    "sector": "Pharmaceuticals",
    "scope": "bangladesh",
    "bullets": ["..."]
  },
  "reasoning": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice."
}
```

## Cross-sector variant

Set `scope: cross_sector` and omit sector (or set `insight_type: spending_trend`) for themes like real-estate spending weakness affecting cement, NBFI, and services.

## DSE pitfalls

- Sector names vary in the DB — use `sector_slug` from context tool
- Thin sectors (3–4 names) need cautious generalization
- Rumour-heavy headlines — separate from policy/fundamental drivers

Output is educational analysis only, never financial advice.
