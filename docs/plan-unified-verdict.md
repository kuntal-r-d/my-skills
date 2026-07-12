# Plan: Unified Verdict skill (grade + GPA + score → one buy/hold/sell)

**Status:** Plan only — no code changes yet.
**Scope:** Single ticker, on demand.
**Goal:** One tool call that returns the value-checklist **Grade / GPA / score** and the synthesizer **investment score**, then combines them into a single final **Buy / Hold / Sell** decision with a stated rationale.

---

## 1. Why

Today the two systems are computed and shown separately and can disagree (e.g. CITYBANK: Investment **Hold** vs checklist **B+**):

| System | Source | Output |
|---|---|---|
| Investment signal | `packages/skills/src/signal-synthesizer/synthesize.ts` (`synthesize()`) | `rating` (strong_buy/buy/hold/sell/stand_aside), `score` −1..+1, `composite_1_10`, `confidence` |
| Value checklist | `packages/skills/src/value-investment-checklist/checklist.ts` (`checklist()`) | `score` 0..1, `rating` A+..F, `key_metrics.gpa`, pass counts, `confidence` |

No existing code merges them — `analyze_ticker` (`packages/mcp-server/src/composites.ts`) doesn't call the checklist; the dashboard enriches them independently (`enrichValueChecklistInAnalysis()` in `packages/ingest/src/value-enrich.ts`).

## 2. Deliverable

A new skill **`unified-verdict`** (agent-skills format, like the other 34), plus MCP registration, so any client can call:

```
unified_verdict(ticker contract or precomputed cards) →
{
  ticker, as_of,
  grade: "B+",            // from checklist
  gpa: 3.3,               // from checklist
  checklist_score: 0.724, // 0..1
  investment_score: 0.079,// −1..+1 from synthesizer
  composite_1_10: 6,
  unified_score: ...,     // blended, −1..+1
  decision: "buy" | "hold" | "sell",
  confidence: 0..1,
  rationale: [ ... ],     // why the decision, incl. any cap/override applied
  inputs: { synthesizer_rating, governance_flags, buckets }
}
```

## 3. Combination algorithm

**Step 1 — normalize.** Map checklist score 0..1 onto the same −1..+1 axis: `quality_axis = 2 × checklist_score − 1` (B+ 0.724 → +0.448).

**Step 2 — blend.**
```
unified_score = 0.60 × investment_score + 0.40 × quality_axis
```
Signal-heavy weighting because the synthesizer already contains fundamentals (40%); the checklist adds a long-term quality tilt, not a second full vote.

**Step 3 — decision thresholds** (reuse synthesizer bands for consistency):

| unified_score | decision |
|---|---|
| ≥ +0.15 | buy |
| −0.15 … +0.15 | hold |
| ≤ −0.15 | sell |

**Step 4 — guardrail overrides** (applied after Step 3, each recorded in `rationale`):

1. **Quality floor:** grade **D or F** caps decision at **hold** (never buy on weak fundamentals-quality), and confidence −0.1.
2. **Stand-aside passthrough:** if synthesizer governance returned `stand_aside` (strong agent conflict), decision = **hold** with an explicit "stand aside" note — never buy.
3. **Deep-value tilt:** grade **A/A+** with investment score in the hold band but ≥ 0 → stays **hold** but rationale flags "quality accumulate candidate" (no silent upgrade to buy).
4. **Confidence gate:** if blended confidence < 0.35, decision text carries a "low data confidence" warning.

**Step 5 — confidence.**
```
confidence = 0.6 × synth_conf + 0.4 × checklist_conf − governance penalties already in synth
```

Worked example (CITYBANK): 0.6×0.079 + 0.4×0.448 = **+0.227 → buy**, but note this shows the design tension — the plan includes a calibration step (§6) to test whether 60/40 over-rewards checklist quality; alternative is 0.75/0.25 (CITYBANK → +0.171, still buy) or requiring investment_score ≥ 0 for the checklist to add positive tilt.

## 4. Files to create / modify

| Action | Path |
|---|---|
| New skill impl | `packages/skills/src/unified-verdict/verdict.ts` (+ `index.ts` export) |
| New skill folder | `skills/unified-verdict/SKILL.md`, `scripts/` (compiled CLI), `references/combination-rules.md` |
| Register MCP tool | `packages/mcp-server/src/registry.ts` → `unified_verdict: { skill: 'unified-verdict', reads: ['agents','fundamentals','ticker','as_of'] }` |
| Extend composite | `packages/mcp-server/src/composites.ts` → `analyze_ticker` additionally runs value checklist, then unified-verdict; add `verdict` to output |
| Dashboard (optional, phase 2) | `packages/dashboard/src/server.ts` — add `unified_verdict` to the analysis snapshot next to `value_investment_checklist` |
| Tests | `tests/unified-verdict.test.ts` (Vitest) |

Input contract: accept either (a) precomputed cards `{ investment: {...}, checklist: {...} }`, or (b) the full ticker data contract, in which case it calls `synthesize()` and `checklist()` in-process — keeps it usable standalone by any MCP client.

## 5. Tests

- Threshold edges: unified_score exactly ±0.15; grade boundary 0.60/0.70.
- Guardrails: D/F caps buy→hold; stand_aside never becomes buy; missing checklist (no fundamentals) → falls back to synthesizer rating alone with a flag.
- Golden case: CITYBANK snapshot (invest +0.079/47%, checklist 0.724/B+/89%) → assert exact output.
- Degenerate inputs: all agents missing, zero evaluable criteria.

## 6. Rollout steps (est. order)

1. Calibrate blend weight: replay stored analysis snapshots for all registered tickers at 0.60/0.40 vs 0.75/0.25; pick the weighting whose decisions flip least often vs. pure synthesizer while still letting grade A/F cases matter.
2. Implement `verdict.ts` + unit tests.
3. Build skill folder (SKILL.md thinking-card spec + compiled script), register in `registry.ts`.
4. Wire into `analyze_ticker`; run `npm run build && npm run test`.
5. (Phase 2) Dashboard verdict card + docs update.

## 7. Open questions

- Should momentum signal ever influence the verdict? (Current plan: no — this is the long-term decision; momentum stays separate.)
- Do bank-sector tickers need a sector adjustment (checklist D/E and FCF rules penalize banks structurally — CITYBANK's exact red flags)? Option: sector-aware criterion weighting, deferred to a follow-up.
- Should `stand_aside` be a fourth decision value instead of mapping to hold? (Plan maps to hold + note, since the ask was buy/hold/sell.)
