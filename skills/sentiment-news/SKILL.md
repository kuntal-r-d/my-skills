---
name: sentiment-news
description: Computes ticker/sector news sentiment for DSE stocks and separates rumour-driven items from fundamentals-driven news, since the Dhaka Stock Exchange is rumour-heavy. Use when the user asks about news sentiment, "what's the news saying about GP", headline tone, rumour vs real news, or wants a sentiment score to feed signal-synthesizer.
license: Apache-2.0
compatibility: Prompt-first Agent Skill. Usable with the script absent. Script is Python 3.8+ stdlib-only, no network.
metadata:
  author: stock-buddy
  version: "0.2.0"
  prd_refs: ["PRD-001:REQ-027"]
  mode: ["momentum", "investment"]
---

# Sentiment & News

> **Prompt-first skill.** Score the headlines by the rules below. `scripts/sentiment.py`
> is OPTIONAL (lexicon scorer). The key discipline: **separate rumour from fundamentals** —
> DSE is rumour-heavy, so rumours can never drive a strong score on their own.

## Role & objective
You produce an aggregate news sentiment score (−1..+1) for a ticker, explicitly down-weighting
rumours and surfacing fundamentals-driven items.

## When to use
"What's the news saying about GP?", "headline tone", "rumour vs real news", "sentiment score".
Feed the score into `signal-synthesizer`.

## Inputs you need
**`news`** — array of `{headline, source, category}`. Categories that count as
**fundamental**: `earnings`, `regulatory`, `corporate_action`, `macro`. Sources/terms that
mark **rumour**: social/forum/unconfirmed/rumour/speculation/alleged. If `news` missing →
error; if empty → error.

## Method (follow in order)
1. **Per-headline tone** — count positive vs negative keywords; tone = (pos−neg)/(pos+neg),
   clamp −1..+1 (0 if no keywords).
2. **Classify & weight** each item: **rumour → ×0.3**; **fundamental → ×1.0**; **general → ×0.7**.
3. **Aggregate** = weighted average of tones.
4. **Rumour discipline:** if there are rumours but **zero** fundamental items
   (`rumour_dominated`), clamp the score to [−0.4, +0.4] and flag it.
5. Flag `thin_coverage` if fewer than 2 items.

## Scoring rubric
Rating: score ≥ 0.2 → **positive** · ≤ −0.2 → **negative** · else **neutral**.

**Confidence** = clamp(0.4 + 0.1·min(fundamental_count,4) + 0.05·min(item_count,4)
− 0.2 (if rumour_dominated) − 0.15 (if thin_coverage), 0.15, 0.9).

## Output (emit this Thinking Card)
```json
{ "skill": "sentiment-news", "ticker": "..", "mode": "both", "as_of": "..",
  "score": 0.0, "confidence": 0.0, "rating": "positive|negative|neutral",
  "key_metrics": { "item_count": 0, "fundamental_count": 0, "rumour_count": 0,
    "avg_fundamental_sentiment": 0.0 },
  "reasoning": ["[FUNDAMENTAL|RUMOUR|general] headline -> tone"], "flags": ["..."],
  "disclaimer": "Educational analysis only. Not financial advice." }
```

## DSE pitfalls
- **Rumour-heavy market:** a wave of social/forum buzz must never produce a strong signal —
  enforce the ±0.4 clamp when no fundamental item is present.
- **Thin coverage:** one headline is not sentiment — flag and lower confidence.
- Prefer disclosure/earnings/regulatory items; treat anonymous tips as noise.

## Optional precision helper
```bash
python3 scripts/sentiment.py --input data.json --pretty
```
Returns the per-item classification and the weighted aggregate.

## Worked example
3 items: earnings "record profit, dividend" (+1.0, fundamental ×1.0), regulatory "approval"
(+1.0, ×1.0), forum "rumour of merger" (+0.5, ×0.3) → aggregate ≈ +0.93 → **positive**,
confidence ≈ 0.75 (2 fundamental items).

## References
Lexicon & rules: [references/SENTIMENT.md](references/SENTIMENT.md).
Output is educational analysis only, never financial advice.
