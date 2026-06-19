# Pattern Miner — candidates & anti-overfitting methodology

The Pattern Miner (PRD-002 REQ-107; PRD-001 REQ-052) answers "which rule-based patterns
have a *validated* edge on this ticker?" Backtesting many rules on one price series is a
classic overfitting trap, so every reported result must survive the safeguards below.

## Candidate patterns

| Name | Rule (triggers on bar *i*) |
|------|----------------------------|
| 20-day high breakout | `close[i]` exceeds the highest of the prior 20 closes |
| RSI oversold bounce | RSI(14) crosses **up** through 30 (from below to ≥ 30) |
| Golden cross (MA50>MA200) | MA50 crosses above MA200 (was ≤, now >) |
| Close above upper Bollinger | close crosses above the upper 20/2 Bollinger band |

Each is a deterministic, fully specified rule — no free parameters tuned per ticker, which
already limits the search space. Add new rules in `_signal_indices()` and update `N_PATTERNS`.

## Forward return & success rate

For each occurrence we measure the **forward return** over `forward_days` (default 5):
`(close[i+fwd] - close[i]) / close[i] * 100`. The **success rate** is the share of
occurrences with a positive forward return (P(up)). Occurrences without a full forward
window (too close to the series end) are excluded from counts.

## Train / holdout split (out-of-sample)

The series is split at 70%: the **train** window is the first 70% of bars, the **holdout**
window is the last 30%. Success and forward return are computed separately on each. A real
edge should persist out-of-sample; an overfit one decays. This is the core anti-overfitting
test.

## Minimum occurrences

A pattern needs at least `min_occurrences` (default 8) total usable occurrences. Below that,
status is `insufficient_data` regardless of success rate — a high hit-rate on three samples
is noise, not evidence. Each window must also have ≥ 1 occurrence to be judged.

## Multiple-testing correction (Bonferroni)

Testing `N_PATTERNS` rules inflates the chance that one looks good by luck. We apply a
Bonferroni-style correction: with a nominal alpha of 0.05 split across N tests, the
per-test bar tightens. We translate this into an additive bump,
`0.05 * (1 - 1/N)`, added to the user's `success_threshold`. So with the default 0.6
threshold and 4 patterns the effective bar is ~0.6375 on **both** windows. The
`methodology_note` always reports the adjusted threshold so the correction is explicit.

## Validation & auto-retirement

- **validated** — occurrences ≥ min **and** success ≥ adjusted threshold on **both**
  train and holdout.
- **retired** — passed in-sample but the holdout success degraded below the threshold
  (or both windows failed). This is the auto-retirement rule: a pattern that worked
  historically but no longer holds out-of-sample is marked invalid rather than reported
  as tradable.
- **insufficient_data** — too few occurrences, or an empty window.

If no pattern clears every gate, `validated_count` is `0`. The miner is deliberately honest
about null results — reporting a fake edge is worse than reporting none.

## Manipulation-footprint warnings

DSE small-caps are susceptible to pump activity that can fabricate a pattern's apparent
edge. Any occurrence with **volume > 5× its 20-bar trailing average** or a **daily move ≥
9.5%** (near the ~10% circuit limit) raises a `manipulation_footprint` warning on that
pattern. The warning never silently removes the occurrence — it flags that the historical
sample may be contaminated so the user can discount it (glass-box principle).

## Parameters

`params.min_occurrences` (8), `params.forward_days` (5), `params.success_threshold` (0.6).
Tune `VOL_SPIKE_MULT`, `CIRCUIT_MOVE_PCT`, and the train/holdout split fraction at the top
of `mine.py`.
