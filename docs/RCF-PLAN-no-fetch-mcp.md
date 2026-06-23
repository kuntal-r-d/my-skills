# RCF Plan — No-Fetch MCP Instruction Layer + Client Data Contract

**Goal.** Stock Buddy skills are usable end-to-end by any MCP client, where the MCP
server **only instructs and analyses (never fetches data)** and the client supplies
market data through the tool calls. Validated against ticker **LHB**.

This plan expresses the change in RCF terms (PRD → REQ → US → AC → FBS → TS/TC) and
follows the 5-step build cycle (Define → Build → Review → Test → Finalise). Code for
the core items is already written; the RCF artifacts below formalise and verify it.

---

## 0. Root cause (why "analyze LHB" failed)

| # | Defect / gap | Evidence | RCF impact |
|---|--------------|----------|------------|
| D1 | MCP tools advertised an **empty `inputSchema`** (`properties: {}`), so spec-compliant clients strip `ohlcv`/`fundamentals`/… before the call. | `analyze_ticker` returned `ticker: null`, all stages "skipped: missing …"; a direct `fundamental_analysis` MCP call with data returned "missing fundamentals". | Violates **REQ-002**; **AC-014** too weak to catch it. |
| D2 | On missing data the server **silently skips** instead of telling the client what to gather. | bare `analyze_ticker` → "skipped" with no guidance. | No AC covers it (new capability). |
| D3 | **No client-facing acquisition instructions** exist for MCP clients (skills assume data is pre-assembled). | `USAGE.md` §6 "skills analyse, they do not fetch"; no acquisition skill. | New capability. |
| D4 | **Direction conflict:** US-006 "Data Adapter Implementation" / AC-017 mandate *server-side* DSE fetching (`DSEProvider`), contradicting the no-fetch directive. | `data_adapter/providers/dse_provider.py` is a stub. | Needs re-scoping. |
| D5 | **`rcf.manifest.json` fails RCF schema validation** → `rcf_connect` errors `INVALID_MANIFEST` ("additional properties"). | Live `rcf_connect` failed. | Blocks all traceability tooling. |

---

## 1. Define — PRD-001 amendments

**Amend REQ-002 (Client Data Provider Interface).** Add an explicit clause:
> Every MCP tool's `inputSchema` MUST declare, as named `properties`, the
> shared-contract fields that skill reads (`ohlcv`, `fundamentals`, `news`,
> `shareholding`, `funds`, `macro`, `microstructure`, `account`, `agents`, …), with
> `additionalProperties: true`. Clients pass data **in the tool call**; the server
> never fetches.

**Add REQ-026 — No-Fetch Instruction Layer & Client Data Acquisition Guidance** (must):
> The MCP server performs no network I/O. When a tool/composite is called with
> insufficient data it returns a structured `instructions` block (needs, JSON shape,
> suggested public sources, missing core fields). A `dse-data-acquisition`
> instruction skill documents the end-to-end client workflow (source → assemble
> contract → call order → interpret).

**Re-scope server-side fetching.** Move "server fetches DSE data" (the `DSEProvider`
behind US-006 / AC-017) to **out-of-scope / deprecated**. The optional file/mock
provider remains only as a *client-side* convenience, not server behaviour.

_Tooling:_ `rcf_prd_edit_start` (amend REQ-002, re-scope), `rcf_prd_add_requirements_start` (REQ-026).

## 1b. Define — Repair the manifest (prerequisite, D5)

Fix `docs/rcf/rcf.manifest.json` so it validates against the RCF schema (remove/relocate
the non-schema keys the validator rejects under `prds[]`). Without this, `rcf_connect`,
`rcf_query`, `rcf_coverage`, and `rcf_validate` cannot run. **Do this first.**

---

## 2. Define — User Stories & Acceptance Criteria

**Amend US-005 (MCP Server with Tools)** — add ACs:
- **AC-013a** Given any skill/composite tool, when a client inspects its `inputSchema`,
  then every contract field that skill reads is declared as a property (with
  `additionalProperties:true`). *(covers D1)*
- **AC-014a** Given a tool called with the documented contract fields, when executed,
  then those fields reach the skill and a valid Thinking Card is returned — no silent
  stripping (round-trip). *(covers D1)*
- **AC-015a** Given `analyze_ticker` called with missing `ohlcv`/`fundamentals`, when
  executed, then the response contains an `instructions` block (`needs`,
  `minimal_payload_example`, `suggested_public_sources`, `missing_core_fields`) and no
  network call is made. *(covers D2)*

**New US-021 — Client Data Acquisition Guidance (REQ-026)** — ACs:
- **AC-061** Given the skills directory, when listed, then `dse-data-acquisition/SKILL.md`
  is present with valid frontmatter (name + trigger-rich description). *(covers D3)*
- **AC-062** Given the acquisition skill, when read, then it documents data sources, the
  contract JSON shape, and the analysis-tool call order.
- **AC-063** Given a request to analyze a DSE ticker, when an agent follows the skill,
  then it gathers data, assembles the contract, and runs the analysis tools to
  completion (end-to-end, e.g. LHB).

**Amend US-001 / AC-001.** Re-word the skill-count assertion to "≥14 **analysis** skills
plus the `dse-data-acquisition` **instruction** skill," distinguishing the two kinds.

**Amend US-006 (Data Adapter).** Mark **AC-017** (server DSE fetch) deprecated/out-of-scope;
keep file/mock provider as client-side optional only. *(covers D4)*

_Tooling:_ `rcf_stories_edit_start` (US-005, US-001, US-006), `rcf_stories_add_for_requirement_start` (US-021 under REQ-026).

---

## 3. Define — TAD / ADR

- **New ADR-010 — "MCP server is a stateless, no-fetch instruction + analysis layer."**
  Context: the LHB failure. Decision: schemas expose the full contract; clients supply
  data; missing-data responses return acquisition instructions; zero server network I/O.
  Links: REQ-002, REQ-026, AC-013a/014a/015a, AC-061..063.
- **Supersede** the data-adapter ADR that assumed server-side fetching → mark superseded
  by ADR-010.

_Tooling:_ `rcf_tad_edit_start`; then `rcf_suggest_tad_refs` to wire ADR↔AC links.

---

## 4. Build — Build Sequence (FBS)

Add FBS entries (each a focused build/test session). Status reflects code already written.

| FBS | Title | Covers ACs | Depends on | Status |
|-----|-------|-----------|------------|--------|
| FBS-E | Repair `rcf.manifest.json` to pass RCF schema | (tooling unblock) | — | not-started |
| FBS-A | Contract-aware tool input schemas (`registry.input_schema`, server composites) | AC-013a, AC-014a | FBS-E | **complete (code)** |
| FBS-B | Missing-data acquisition `instructions` block in `analyze_ticker` | AC-015a | FBS-E | **complete (code)** |
| FBS-C | `dse-data-acquisition` instruction skill | AC-061, AC-062, AC-063, AC-001 | FBS-E | **complete (code)** |
| FBS-D | Deprecate server-side DSE fetching; re-point docs to client acquisition | AC-017 (deprecate) | FBS-C | not-started |

_Tooling:_ `rcf_build_sequence_patch` (`add_fbs` ×5, `update_fbs_status` for A/B/C);
`rcf_build_sequence_validate` (cycles/coverage); `rcf_build_graph_view` to visualise.

---

## 5. Test — TS / TC

One test spec per new AC (formalising the ad-hoc checks already run):
- **TC-AC013a** assert each tool's `inputSchema.properties` includes its declared `reads`.
- **TC-AC014a** round-trip: pass real LHB `fundamentals` → `fundamental-analysis` returns a
  scored card (observed: score 0.44, rating "buy").
- **TC-AC015a** bare `analyze_ticker` → `instructions.missing_core_fields == ["ohlcv","fundamentals"]`;
  no network.
- **TC-AC061** `dse-data-acquisition/SKILL.md` exists with valid YAML frontmatter.
- **TC-AC063** end-to-end LHB: fundamentals-only payload → pipeline reaches synthesis
  ("buy"), instructions still request `ohlcv` for the technical/risk legs.

Add to CI (`ci.yml`): `py_compile` + these TCs + `rcf_validate` + `gh skill publish` spec check.

---

## 6. Finalise

Per FBS, run the cycle: Define (this doc's PRD/US/AC/TAD edits) → Build (code) →
Review (`/rcf-functional-review`) → Test (CI green) → Finalise (commit; `rcf_coverage`
shows 100% AC coverage, no orphan ACs). Cut a semver tag once green.

## Execution order (recommended)
1. **FBS-E** — fix the manifest (unblocks RCF tooling). 
2. Define edits: REQ-002 amend, REQ-026 add, US/AC edits, ADR-010 (via RCF tools → commit to GitHub).
3. Mark FBS-A/B/C complete; add TS/TC; wire CI.
4. **FBS-D** — deprecate server fetching.
5. Validate coverage, tag release.
