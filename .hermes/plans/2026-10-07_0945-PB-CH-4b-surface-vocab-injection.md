# SPEC — PB-CH-4b: Workstate surface vocabulary is discoverable (registry ids injected into the forced tool schema)

Status: orchestrator-authored (gate run-5 evidence; per handoff 2026-10-07_0855 run-5 plan the
gap becomes "its own item (compose_workstate tool description should name the registered surface
ids)"). Baseline: trunk `cl/integration-2` @ 90a60d6c (code tip includes PB-CH-4 88496f2c).
Deps: PB-CH-4 (merged code). Dispatch: fleet coder, ONE slot; PB-CH-5 has priority — dispatch
this only after PB-CH-5 merges/exits its coder cycle or if PB-CH-5 hits a stop-boundary.

## Why (gate evidence, not theory)
Gate run-5 (receipts /home/brad/.hermes/cl/receipts/PB-CH-4/2026-10-07_orchgate5/): three
single-record phrasings x fresh threads — the model EITHER times out or emits
`tabs:[{surface:"protocol", target:{recordId:PRT-4iaey2}}]`, correctly rejected
`DRAFT_INVALID: UNSUPPORTED_SURFACE /tabs/0/surface`. backend.log traces (rylbk4, 0izit8,
l6xxqe) show it cannot know the legal ids; one turn prose-apologised that it "can only open a
registered surface" and guessed. The compiler's behavior is CORRECT; the model's menu is blind.

## Orchestrator-verified recon (opened by orch at 09:2x on trunk, git -c core.fileMode=false)
- `server/src/ai/submitSuggestionTool.ts:430` `AGENT_INTENT_TOOL_DEF` — static `ToolDefinition`
  const. Two surface fields, both description-only (no enum):
  - `:529` workspace_action `action.surface`: `'open-surface: a registered surface id (e.g.
    "analysis", "run-design").'`
  - `:546` compose_workstate `tabs[].surface`: `'A registered surface id (e.g. "run-design",
    "analysis").'`
  The example pair is a hardcoded near-truth; the real truth is
  `schema/registry/surfaces/surfaces.yaml` (ids: find, run-plan, run-design, run-execute,
  results, analysis, knowledge, project, ingestion, protocol-review — NO `protocol`).
- Offer site: `server/src/ai/AgentOrchestrator.ts:984` inside `buildToolDefs(forceDraftTool,
  toolFilter)` → `if (forceDraftTool) return [AGENT_INTENT_TOOL_DEF];`. Shared by run() and
  buildPrefixRequest (warm/real prefix parity comment at :975-982 — the replacement MUST be the
  same value both paths see, i.e. derive it ONCE per orchestrator instance, not per request).
- The registry is already in deps: `AgentOrchestrator.ts:905` `surfaces?:
  SurfacesRegistry` (loaded from surfaces.yaml via `loadDefaultSurfacesRegistry`,
  `server/src/surfaces/surfaces.ts` — `list()` / `getSurface(id)`; NO TS allow-list by design,
  surfaces.ts:64 comment).
- Membership check that must stay the single authority: `server/src/drafts/workstateCompile.ts:372`
  (`UNSUPPORTED_SURFACE`). DO NOT add an enum to the tool schema (would duplicate policy in a
  second place and break dynamic registry edits); inject into DESCRIPTIONS only.
- Intent pins that must stay green untouched: `submitSuggestionTool.test.ts:264-280` (name +
  parameters shape), `createRecordIntent.test.ts` (NOTE: gitignored symlink into Brad's tree —
  reports MAIN's state, never a lane gate, per PB-CH-7/PROO-AI-7 note in the task list).

## Design (exact)
1. `submitSuggestionTool.ts`: export a PURE builder
   `buildAgentIntentToolDef(surfaceIds?: readonly string[]): ToolDefinition` —
   `structuredClone`-style deep clone of `AGENT_INTENT_TOOL_DEF`; when `surfaceIds` is
   undefined/empty return the static const BY REFERENCE (byte-identical fallback, existing tests
   keep passing); otherwise set the two descriptions to
   `'open-surface: a registered surface id — registered ids: <ids joined ", ">. Nothing else is valid.'`
   and `'A registered surface id — registered ids: <ids joined ", ">. Nothing else is valid.'`
   Nothing else changes. No enum, no validation, no policy branch — pure rendering of declared
   data (repo rule #1: the ids ARRIVE as data from the registry).
2. `AgentOrchestrator.ts`: at orchestrator construction (where deps.surfaces is in scope, near
   the shadowSetup block :960-968), compute
   `const intentToolDef = buildAgentIntentToolDef(deps.surfaces?.list().map(s => s.id))` ONCE;
   `buildToolDefs` returns `[intentToolDef]` for forceDraftTool. Warm and real requests already
   share buildToolDefs -> parity preserved; add a comment citing :975-982.
3. Server tsc `exactOptionalPropertyTypes`: `deps.surfaces?.list()` -> pass
   `deps.surfaces ? deps.surfaces.list().map(s => s.id) : undefined` (never undefined-in-spread).

## Red-first test matrix
- `submitSuggestionTool.surfaceVocab.test.ts` (NEW):
  (a) no-registry: builder output === AGENT_INTENT_TOOL_DEF (same reference);
  (b) stub registry ['alpha','beta']: both descriptions contain exactly `alpha, beta`, do NOT
      contain `run-design`/`analysis` examples; schema structure (required, enum of intent)
      unchanged — deep-diff everything but the two strings;
  (c) empty array behaves as (a).
- `AgentOrchestrator` side: existing suite set untouched; assert buildToolDefs(true) is
  REFERENCE-STABLE across two calls (warm/real parity) — add to an existing orchestrator test
  file only if a natural one exists; else a small new test with a stub registry proving the
  ids reach the offered def.
- Golden/intent pins green: submitSuggestionTool.test.ts, .protocolEdit, .workstate.

## Verification list
1. First targeted check: run the NEW test RED before implementing (module absent), then green.
2. `cd server && npx vitest run src/ai/submitSuggestionTool.surfaceVocab.test.ts
   src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts
   src/ai/submitSuggestionTool.workstate.test.ts` — zero failures.
3. `npm run test:run -w server` failing-file SET identical to base (symlink-landmine set
   unchanged: deckLayout, EventGraphEquipmentSchema, LabwarePhysicalGeometryData, surfacesAjv,
   createRecordIntent — report, never fix).
4. server tsc: error-line set identical to base (pin 26 file-set at PB-CH-5 base; RE-MEASURE
   your own base).
5. No schema/**, prompts/**, app/** hunks (`git diff --stat` proof pasted).
6. Runtime receipt: after orch restarts the lane stack (coder must NOT), orch verifies a live
   assist turn's backend trace or a direct builder eval shows the 10 real ids — orch runs this
   half, coder declares PENDING-RESTART.
7. End with `PB-CH-4b DONE <sha>` + report at the unique wip path.

## Placement / conventions
- Lane trunk /mnt/vast/home/brad/git/cl-integration-2; worktree wt/PB-CH-4b-lane2-l2t<HHMM>
  (orch bootstraps per the PB-CH-5 symlink+excludesFile recipe in handoff 2026-10-07_0855).
- Report `.hermes/plans/PB-CH-4b-report.wip-l2t<HHMM>.md` in the worktree.
- ONE branch, ONE logical commit (+ report). NEVER `git add -A`; git -c core.fileMode=false.
- Browser gate: NOT required for this item's own diff (server-only, no UI surface changes);
  the downstream PB-CH-4 gate RUN 6 (orch deterministic script, clean-card accept leg) IS the
  behavioral proof and closes AS-LANE2-PBCH4-GATE4-D1-PASSED-ACCEPTLEG-OPEN.

## Explicitly OUT
- No tool-schema ENUM for surface (policy duplication — the compiler owns membership).
- No prompt preamble/template change; no systemPrompt.ts hunks.
- No changes to surfaces.yaml (labels are data there already; the ids are what's injected).
- No ChatPage / AiDraftBar / client-side hunks.

## Open questions
None blocking. (OQ1 if the coder finds warm-prefix KVS tokenisation sensitive to description
length: report, do not "fix" — orch decides; the parity requirement is reference-identity, which
this design guarantees.)

## Reviewer bait
- A second membership check or enum = reject.
- Mutating AGENT_INTENT_TOOL_DEF in place (tests import the const; must be a clone) = reject.
- Per-request rebuild (breaks warm/real parity comment contract) = reject.
- Any hunk in workstateCompile.ts = reject (membership already correct).
