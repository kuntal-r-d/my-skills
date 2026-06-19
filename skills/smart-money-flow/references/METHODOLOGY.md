# Smart-money flow methodology (smart-money-flow)

This skill reads "who owns the stock and how that changed" from **public disclosures**
and turns it into an accumulation/distribution signal. It is deliberately conservative:
when data is missing it says so and lowers confidence rather than guessing.

## Inputs

- `shareholding` — monthly array, each entry with `month` and the percentage held by
  `sponsor`, `govt`, `institution`, `foreign`, `public`.
- `funds` (optional) — array of public fund holdings, each with `name`,
  `ticker_weight_pct`, `prev_weight_pct`, `manager`, `track_record_3y`.

## The 2pp significance threshold

Month-over-month deltas are computed for the latest pair of disclosure months. A change
of **>= 2 percentage points** in institution, foreign, or sponsor holdings is treated as
**significant** (`SIGNIFICANCE_THRESHOLD = 2.0`). Smaller foreign moves still register a
modest signal; smaller institution moves are noted but not scored, to avoid reacting to
disclosure noise.

## Scoring rules

| Signal | Direction | Score impact |
|--------|-----------|--------------|
| Foreign holding +>=2pp | inflow (confidence/governance) | +0.30 |
| Foreign holding -<=2pp | outflow | -0.30 |
| Foreign holding small +/- | modest | +/-0.10 |
| Institution +>=2pp | accumulation | +0.30 |
| Institution -<=2pp | distribution | -0.30 |
| Sponsor/director -<=2pp | **RED FLAG** insider selling | -0.40 + flag |
| Sponsor/director small - | caution | -0.15 |
| Sponsor/director +>=2pp | insider buying | +0.25 |
| Sponsor/director small + | modest accumulation | +0.10 |
| Fund raised weight | scaled by 3y track record | up to +0.30 |
| Fund cut weight | reduction | -0.10 |

Fund contribution scales with `track_record_3y`: a manager with a strong record adding
to a position carries more weight than an unproven one. The total score is clamped to
[-1, +1]. Rating: `accumulation` (>= +0.2), `distribution` (<= -0.2), else `neutral`.

## Public-data-only guardrail (PRD-002 REQ-021)

This is the most important rule in the skill:

- Only fields **present in the input** are used.
- A private or non-public **"broker book"** is **never** fabricated or inferred. If the
  input lacks fund data or a second month of shareholding, the skill states the gap in
  its reasoning and lowers confidence — it does not invent flows.
- With no `shareholding` at all, the skill returns `score = 0`, low confidence, and the
  flag `no_disclosure_data`, with reasoning explaining the data is unavailable.

## DSE monthly shareholding disclosure context

- DSE-listed companies disclose shareholding composition on a **monthly** cadence. By
  the time a month's pattern is public it is already weeks old, so flow signals here are
  **inherently lagging**. Confidence is therefore **capped at 0.7** and every run carries
  the `monthly_disclosure_lag` flag.
- Sponsor/director holdings are watched closely because insider selling on the DSE is a
  meaningful governance and confidence signal.
- Foreign participation is a barometer of external confidence in a frontier market;
  sustained foreign inflow is read constructively.
- All output is educational analysis only, never financial advice.
