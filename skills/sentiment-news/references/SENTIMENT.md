# Sentiment & News — methodology

The Sentiment Agent (PRD-002 REQ-019, PRD-001 REQ-023) turns a list of news items
into a single sentiment score, while keeping rumour-driven noise out of the way of
fundamentals-driven signal.

## Inputs (`news` array)

Each item: `{"date", "headline", "source", "category"}`. Only `headline` is required
for scoring; `source` and `category` drive classification. An empty or missing array
returns `{"error": ...}` with exit code 1.

## Lexicon scoring

Headlines are tokenised into words (regex `[a-zA-Z]+`, lower-cased) and matched
against two word sets:

- **Positive**: profit, record, growth, dividend, beats, upgrade, expansion, surge,
  wins, rises, rally, gain, strong, high, outperform, approval, award, bonus,
  buyback, rebound, … (see `POSITIVE` in `scripts/sentiment.py`).
- **Negative**: loss, fraud, probe, decline, downgrade, default, halt, suspension,
  penalty, fall, drop, plunge, weak, miss, lawsuit, scandal, delist, warning, cut,
  slump, … (see `NEGATIVE`).

Per item: `sentiment = clamp((pos - neg) / (pos + neg))`, or `0.0` if no keyword
matches. This keeps every item in `[-1, +1]`.

## Rumour vs fundamentals separation

The DSE is a retail-dominated, rumour-prone market: special-dividend whispers,
"gainer" tips on social channels, and unconfirmed merger talk routinely move prices
ahead of any disclosure. Treating those the same as audited earnings would let noise
dominate the signal, so we classify and weight every item:

| Label | Trigger | Weight |
|-------|---------|-------:|
| `RUMOUR` | `source` in {social, forum, unconfirmed, rumour}; category rumour-like; or headline contains rumour/unconfirmed/speculation/alleged | **x0.3** |
| `FUNDAMENTAL` | not a rumour **and** `category` in {earnings, regulatory, corporate_action, macro} | **x1.0** |
| `general` | everything else (mainstream-source, non-classified) | **x0.7** |

Aggregate score = weighted average of item sentiments. Two guard rails:

1. **Rumours never drive a strong signal.** If there are rumour items and *zero*
   fundamental items (`rumour_dominated`), the final score is clamped to
   `[-0.4, +0.4]` and the `rumour_dominated` flag is raised.
2. **Thin coverage is flagged.** Fewer than 2 items raises `thin_coverage`.

## Output mapping

- `rating`: `positive` if score `>= 0.2`, `negative` if `<= -0.2`, else `neutral`.
- `key_metrics`: `item_count`, `fundamental_count`, `rumour_count`,
  `avg_fundamental_sentiment` (mean sentiment of fundamental items only).
- `reasoning`: lists each notable item (`|sentiment| >= 0.5` or any rumour) with its
  label, source and signed sentiment.

## Confidence

`confidence = 0.4 + 0.1*min(fundamental_count,4) + 0.05*min(item_count,4)`, minus
`0.2` if `rumour_dominated` and `0.15` if `thin_coverage`, clamped to `[0.15, 0.9]`.
More fundamental coverage and more items raise conviction; rumour-dominated or thin
coverage lowers it.

## DSE context

- Mainstream BD financial press (The Daily Star, Financial Express, bdnews24) is
  treated as `general`/`FUNDAMENTAL` by category; social and forum chatter is treated
  as `RUMOUR`.
- Regulatory headlines (BSEC/BTRC/Bangladesh Bank actions, floor prices, spectrum
  fees) are `FUNDAMENTAL` even when keyword-neutral, because they carry real
  price-discovery weight.
