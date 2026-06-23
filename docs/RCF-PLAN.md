# RCF Plan — Prompt-First Reusable Stock-Analysis Skills (master)

**Vision (your idea).** The product is a library of **reusable, efficient prompts** for
analysing stocks. Each skill is a step-by-step *"how to analyse"* guideline that **anyone**
can drop into **any** MCP client / agent and get a consistent, high-quality read — no bespoke
code required. Skills stay in **Agent Skills** form:

- `SKILL.md` — the reusable prompt: the method, the rubric, the output shape (**source of truth**).
- `references/` — deep methodology, formulas, criteria the prompt cites.
- `scripts/` — **optional** deterministic helpers (no network) the model **may** execute for
  exact math (RSI, ATR, DCF…). Helpers, not the brain.

This master plan supersedes/absorbs `docs/RCF-PLAN-no-fetch-mcp.md` (the data-layer sub-plan)
and expresses everything in RCF terms (PRD → REQ → US → AC → FBS → TS/TC), run through the
5-step cycle (Define → Build → Review → Test → Finalise).

---

## A. Recommended solution (the "best possible" ask)

1. **One canonical prompt-first SKILL template** (Appendix 1) every analysis skill conforms to,
   so the suite is consistent and genuinely reusable. Required sections: *Role/Objective ·
   When to use · Inputs (→ `dse-data-acquisition`) · Method (numbered steps) · Scoring rubric ·
   Output (Thinking-Card JSON) · DSE pitfalls · Worked example · Optional precision helper*.

2. **SKILL.md is the source of truth; scripts are optional.** The method lives in prose so a
   model can reason through it unaided; the script is offered as "run this for exact numbers,
   interpret like so." A skill must be fully usable **with the script absent**.

3. **Two distribution doors, ranked.**
   - **Primary — Agent Skills** (`gh skill install`, Claude Code / Copilot / Cursor / skill-aware
     hosts): the host reads `SKILL.md` and the agent follows the prompt. This is how "skills =
     reusable prompts" actually reaches users.
   - **Secondary — MCP tools** (the existing thin server): for clients that want the optional
     script executed on client-supplied data. The server stays **no-fetch**; tool schemas expose
     the data contract; missing-data calls return acquisition instructions. *(Surfacing the
     SKILL.md prompt itself over MCP — via an MCP `prompt`/resource per skill — is an optional
     enhancement, see FBS-G.)*

4. **Client supplies data; server never fetches.** The `dse-data-acquisition` skill is the
   step-1 prompt: source → assemble contract → call order → interpret.

5. **Composability unchanged:** leaf skills → `signal-synthesizer` → `risk-manager` →
   `ticker-dossier`.

---

## B. Define — PRD-001 amendments

| Action | Requirement | Why |
|--------|-------------|-----|
| **Add REQ-027** | *Prompt-First Reusable Skills standard* — every analysis skill is a self-sufficient prompt conforming to the SKILL template; usable without its script; references/ holds methodology; scripts/ optional, deterministic, no-network. | Encodes the core vision. |
| **Add REQ-026** | *No-fetch instruction layer + client data-acquisition guidance* (server returns `instructions` on missing data; `dse-data-acquisition` skill exists). | From sub-plan. |
| **Amend REQ-002** | Every MCP tool `inputSchema` declares the contract fields it reads as `properties` (`additionalProperties:true`); clients pass data in the call. | Fixes the schema-strip defect. |
| **Re-scope** | Server-side DSE fetching (`DSEProvider`, US-006/AC-017) → deprecated/out-of-scope. | Matches no-fetch directive. |
| **Fix first** | Repair `docs/rcf/rcf.manifest.json` (currently fails RCF schema → `rcf_connect` errors `INVALID_MANIFEST`). | Unblocks all RCF tooling. |

_Tooling:_ `rcf_prd_add_requirements_start` (REQ-026, REQ-027), `rcf_prd_edit_start` (REQ-002, re-scope).

## C. Define — Skill template + methodology standard

- Author `skills/_TEMPLATE/SKILL.md` (Appendix 1) + `skills/_TEMPLATE/references/METHODOLOGY.md`.
- Standard becomes the conformance target for every skill.

## D. Define — User Stories & Acceptance Criteria

**New US-022 — Prompt-First Skill Conformance (REQ-027):**
- **AC-064** Given any analysis skill, when its `SKILL.md` is inspected, then it contains all
  required template sections (Method steps, Scoring rubric, Output schema, Pitfalls, Worked example).
- **AC-065** Given a skill, when followed **without** running its script, then a model can produce
  a valid Thinking Card from supplied data (script-independent).
- **AC-066** Given a `scripts/` helper exists, when present, then the SKILL.md documents *when to
  run it* and *how to interpret its output*, and the script makes **no network calls**.
- **AC-067** Given the skill `description` frontmatter, when indexed by a host, then it is
  trigger-rich (verbs + synonyms) so the right skill activates.

**New US-021 — Client Data Acquisition Guidance (REQ-026):** AC-061 skill present w/ valid
frontmatter; AC-062 documents sources + contract shape + call order; AC-063 end-to-end LHB.

**Amend US-005 (MCP Server, REQ-002):** AC-013a schema exposes contract per tool; AC-014a
client data round-trips to the skill; AC-015a missing-data → `instructions` block, no network.

**Amend US-001/AC-001:** "≥14 analysis skills + `dse-data-acquisition` instruction skill,"
distinguishing analysis vs instruction skills.

_Tooling:_ `rcf_stories_add_for_requirement_start` (US-021, US-022), `rcf_stories_edit_start` (US-005, US-001).

## E. Define — TAD / ADR

- **ADR-011 — Prompt-first skills.** SKILL.md is source of truth; scripts optional deterministic
  helpers; Agent Skills primary distribution, MCP tools secondary. Links REQ-027, AC-064..067.
- **ADR-010 — No-fetch MCP layer.** (from sub-plan) Supersedes any server-fetch ADR.

_Tooling:_ `rcf_tad_edit_start`, then `rcf_suggest_tad_refs` to link ADR↔AC.

## F. Build — Build Sequence (FBS)

| FBS | Title | Covers | Depends | Status |
|-----|-------|--------|---------|--------|
| FBS-E | Repair `rcf.manifest.json` | tooling unblock | — | not-started |
| FBS-T | Prompt-first SKILL template + methodology standard | AC-064 basis | FBS-E | not-started |
| FBS-P1 | **Pilot:** migrate `technical-analysis` to prompt-first | AC-064..067 | FBS-T | not-started |
| FBS-P2 | Roll out template to remaining analysis skills | AC-064..067 | FBS-P1 | not-started |
| FBS-A | Contract-aware tool input schemas | AC-013a, AC-014a | FBS-E | **done (code)** |
| FBS-B | Missing-data `instructions` block | AC-015a | FBS-E | **done (code)** |
| FBS-C | `dse-data-acquisition` skill | AC-061..063, AC-001 | FBS-E | **done (code)** |
| FBS-D | Deprecate server-side DSE fetching | AC-017 (deprecate) | FBS-C | not-started |
| FBS-G | *(optional)* Expose SKILL.md prompts as MCP prompts/resources | REQ-027 reach | FBS-P2 | not-started |

_Tooling:_ `rcf_build_sequence_patch` (`add_fbs`), `rcf_build_sequence_validate`, `rcf_build_graph_view`.

## G. Test — TS / TC (+ evals)

- **Structural conformance** (TC-AC064/066/067): each `SKILL.md` has required sections + valid,
  trigger-rich frontmatter; documented script usage; `grep` scripts for network imports → none.
- **Prompt evals** (TC-AC065, via `skill-creator` eval harness): run the prompt over fixture
  tickers; assert a valid Thinking Card and, where a script exists, agreement within tolerance;
  variance analysis for reusability.
- **Script helper tests:** keep existing `test_indicators.py`; assert determinism/no-network.
- **Round-trip + instructions** (TC-AC014a/015a) and **end-to-end LHB** (TC-AC063), as already
  exercised. Wire all into `ci.yml` alongside `rcf_validate` + `gh skill publish` spec check.

## H. Finalise

Per FBS: Define → Build → Review (`/rcf-functional-review`) → Test (CI green) → Finalise
(commit; `rcf_coverage` = 100% AC coverage, no orphans). Tag a semver release when green.

## I. Execution order
1. **FBS-E** manifest (unblocks RCF tooling).
2. **Define** REQ-026/027 + REQ-002 amend + US-021/022 + US-005/001 edits + ADR-010/011 (RCF tools → commit).
3. **FBS-T** template + standard.
4. **FBS-P1** pilot `technical-analysis`; review & sign-off.
5. **FBS-P2** roll out to the rest.
6. Confirm **FBS-A/B/C** (done) green; **FBS-D** deprecate fetch; optional **FBS-G**.
7. Evals + CI; validate coverage; tag.

---

## Appendix 1 — Prompt-first SKILL.md template

```markdown
---
name: <skill-id>
description: <one trigger-rich sentence: what it does + "use when …" with verbs/synonyms>
license: Apache-2.0
metadata: { author: stock-buddy, version: "x.y.z", mode: ["momentum","investment"] }
---

# <Skill Title>

## Role & objective
You are <analyst persona>. Goal: <single-sentence outcome>.

## When to use
<trigger phrases the user might say>

## Inputs you need
Gather via the `dse-data-acquisition` skill, then use: <fields, e.g. ohlcv ≥30 bars>.
If a required input is missing, say what's missing and stop — never invent data.

## Method (follow in order)
1. <Step> — <exactly what to compute/check> → <how to read it>.
2. ...

## Scoring rubric
<weights per step> → combine to score −1..+1 → map to rating (thresholds).
Downgrade confidence when steps conflict.

## Output (emit this Thinking Card)
{ "skill": "<id>", "ticker": "..", "score": .., "confidence": .., "rating": "..",
  "key_metrics": {..}, "reasoning": [".."], "flags": [".."],
  "disclaimer": "Educational analysis only. Not financial advice." }

## DSE pitfalls
<circuit limits, floor prices, thin liquidity, limited history → flag + downgrade>.

## Optional precision helper
`python3 scripts/<x>.py --input data.json` returns <fields>. Run it for exact math;
interpret <field> as <meaning>. The analysis is valid without it.

## Worked example
<short input → expected reasoning + card>
```
