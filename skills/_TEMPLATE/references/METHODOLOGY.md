# Methodology reference (template)

This file holds the *deep* detail the SKILL.md prompt cites: exact formulas, parameter
choices, thresholds, edge cases, and DSE-specific caveats. Keep the SKILL.md body
readable; push derivations and lookup tables here.

## Structure to follow
- **Formulas** — each metric the method uses, with parameters (e.g. RSI period 14).
- **Thresholds & weights** — the numeric rubric, in one place, matching `scripts/`.
- **Edge cases** — insufficient history, division-by-zero guards, missing fields.
- **DSE caveats** — circuit limits, floor prices, settlement, thin liquidity, holidays.
- **Sources** — references for the methodology (books, papers, exchange rules).

## Consistency rule
The numbers here, in the SKILL.md "Scoring rubric", and in any `scripts/` helper
MUST agree. If you change a weight or threshold, update all three and the tests.
