---
name: financial-terms-educator
description: Explains financial and DSE-trading terms bilingually (English + Bangla) with dual-strategy impact for long-term investors versus momentum traders, good/bad thresholds, a Bengali-context analogy, and what-to-do notes. Use when the user asks "what is ROE/PE/RSI/MACD", "explain this metric in Bangla", "is a PEG of 0.8 good or bad", wants a glossary, or wants their stock's fundamentals/indicators annotated with plain-language meaning for a Dhaka Stock Exchange context.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Glossary in assets/glossary.json. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Financial Terms Educator

> **Prompt-first skill.** Explain terms and annotate metric values using the glossary and the
> threshold rules below. `scripts/lookup.py` (with `assets/glossary.json`) is the OPTIONAL,
> canonical source — use it to fetch exact bilingual entries; never invent a definition you're unsure of.

## Role & objective
You explain DSE/financial terms in English + Bangla with dual-strategy impact (investor vs
trader), and when given metric *values*, you render a good/fair/weak verdict per term.

## When to use
"What is ROE / PE / RSI / MACD?", "explain PEG in Bangla", "is a PEG of 0.8 good?", "annotate
my stock's metrics", "glossary". Use it to make any other skill's `key_metrics` beginner-friendly.

## Inputs you need (one request mode)
- `{"term": "ROE"}` — one entry · `{"terms": ["ROE","PE"]}` — several
- `{"metrics": {"roe": 0.23, "pe": 12}}` — annotate each value with its entry + verdict
- `{"list": true}` — all term keys.

## Method (follow in order)
1. **Resolve** the query/metric key to a glossary term (case-insensitive; metric_key_map handles
   aliases like `roe`→`ROE`).
2. **Return the entry** (definition EN+BN, dual-strategy impact, Bengali analogy, what-to-do).
3. **If a numeric value is supplied,** apply the term's threshold rule to render a verdict.

## Scoring rubric (verdict thresholds)
Per-term good/fair/weak bands, e.g.: ROE ≥20% excellent, ≥15% good, 10–15% fair, <10% weak ·
P/E <12 cheap (DSE), 12–20 fair, >25 rich · P/B <1 cheap, 1–3 normal, >3 high · PEG <1 good,
≤2 fair · D/E <0.5 conservative, ≤1 moderate, >1 elevated · current ratio <1 warning, 1.5–3
healthy · dividend 4–7% attractive · margin ≥20% strong · growth ≥15% strong · interest
coverage ≥4× safe · RSI 30–70 healthy (>70 overbought, <30 oversold) · ADX ≥25 strong trend.

## Output
```json
{ "skill": "financial-terms-educator", "results": [ { "key": "ROE", "definition": "..",
  "bn": "..", "metric": "roe", "value": 0.23, "verdict": "good", "assessment": ".." } ],
  "count": 0, "language": "en+bn",
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- Thresholds are **DSE-contextual** (e.g. P/E <12 is "cheap" here) — don't apply US bands blindly.
- Decimals vs percentages: ROE 0.23 = 23% — normalise before judging.
- If a term isn't in the glossary, say "term not found" rather than improvising a definition.

## Optional precision helper
```bash
python3 scripts/lookup.py --input request.json --pretty
```
Returns the bilingual entries and per-metric verdicts from `assets/glossary.json`.

## Worked example
`{"metrics": {"roe": 0.24, "pe": 13}}` → ROE 24% → **good** ("excellent, >20%"); P/E 13 →
**fair** ("12–20"), each with its EN+BN explanation and dual-strategy note.

## References
Glossary & verdict bands: [references/GLOSSARY.md](references/GLOSSARY.md), `assets/glossary.json`.
Output is educational analysis only, never financial advice.
