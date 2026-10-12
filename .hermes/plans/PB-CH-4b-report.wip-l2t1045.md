# PB-CH-4b REPORT (wip-l2t1045) — surface vocabulary injected into the forced tool schema

Worker: cl-coder (lane 2)
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-4b-lane2-l2t0950
Branch: cl/PB-CH-4b-lane2-l2t0950 (base a9426cfd = lane trunk tip)
Code commit: a24d1f4f
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_0945-PB-CH-4b-surface-vocab-injection.md

## What was built (exactly per spec "Design (exact)")

1. `server/src/ai/submitSuggestionTool.ts` — new exported PURE builder
   `buildAgentIntentToolDef(surfaceIds?: readonly string[]): ToolDefinition`:
   - `surfaceIds` undefined/empty -> returns `AGENT_INTENT_TOOL_DEF` BY REFERENCE
     (byte-identical fallback; every existing pin keeps passing).
   - otherwise `structuredClone` of the static const; rewrites ONLY the two
     descriptions:
     - workspace_action `action.surface` ->
       `open-surface: a registered surface id — registered ids: <ids joined ", ">. Nothing else is valid.`
     - compose_workstate `tabs[].surface` ->
       `A registered surface id — registered ids: <ids joined ", ">. Nothing else is valid.`
   - No enum, no validation, no membership branch. The static const is never
     mutated in place (clone rule; pinned by test (d)).
2. `server/src/ai/AgentOrchestrator.ts` — at construction (after the shadowSetup
   block, before `buildToolDefs`):
   `const intentToolDef = buildAgentIntentToolDef(deps.surfaces ? deps.surfaces.list().map((surface) => surface.id) : undefined);`
   — computed ONCE per orchestrator instance (exactOptionalPropertyTypes-safe:
   explicit array or `undefined`, never undefined-in-spread). `buildToolDefs`
   forced branch now `return [intentToolDef];` with a comment citing the
   warm/real parity contract. The now-unused `AGENT_INTENT_TOOL_DEF` import was
   removed (noUnusedLocals).
3. NOT touched: `server/src/drafts/workstateCompile.ts` (UNSUPPORTED_SURFACE
   stays the single membership authority), schema/**, prompts/**, app/**,
   systemPrompt.ts, surfaces.yaml.

## Files changed (commit a24d1f4f, 4 files, +313/-2)

- server/src/ai/submitSuggestionTool.ts (+44)
- server/src/ai/AgentOrchestrator.ts (+27/-2)
- server/src/ai/submitSuggestionTool.surfaceVocab.test.ts (NEW, 132 lines)
- server/src/ai/AgentOrchestrator.surfaceVocab.test.ts (NEW, 112 lines)

## Verification 1 — RED first, then GREEN

RED (builder absent; run BEFORE implementing):
```
 Test Files  2 failed (2)
      Tests  10 failed (10)
TypeError: buildAgentIntentToolDef is not a function   (x7, submitSuggestionTool.surfaceVocab)
```
RED for the orchestrator half (builder present, orchestrator wiring reverted
via a targeted stash of AgentOrchestrator.ts only, then popped):
```
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
→ expected 'open-surface: a registered surface id…' to contain 'registered ids: alpha, beta'
```
GREEN after wiring:
```
 ✓ src/ai/submitSuggestionTool.surfaceVocab.test.ts  (7 tests)
 ✓ src/ai/AgentOrchestrator.surfaceVocab.test.ts  (3 tests)
 Test Files  2 passed (2)   Tests  10 passed (10)
```

Test matrix covered: (a) no-registry === same reference + byte-identical JSON;
(b) stub ['alpha','beta']: both descriptions are EXACTLY the spec strings,
contain 'alpha, beta', do NOT contain 'run-design'/"analysis"/'protocol';
(b2) deep-diff — with the two descriptions swapped back, the built def's JSON
EQUALS the static def's JSON (everything else byte-identical); (b3) no enum on
either surface field, intent enum + required untouched; (c) empty array === (a);
(d) static const never mutated in place; (b4) single id renders cleanly.
Orchestrator side: stub-registry ids reach the offered def via
buildPrefixRequest(forceDraftTool:true); the offered def is REFERENCE-STABLE
across two calls (warm/real parity); no-registry -> AGENT_INTENT_TOOL_DEF by
reference.

## Verification 2 — targeted vitest set, zero failures

`npx vitest run src/ai/submitSuggestionTool.surfaceVocab.test.ts
src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts
src/ai/submitSuggestionTool.workstate.test.ts` (re-run post-commit, incl. the
orchestrator vocab test):
```
 ✓ src/ai/submitSuggestionTool.protocolEdit.test.ts  (5 tests)
 ✓ src/ai/submitSuggestionTool.surfaceVocab.test.ts  (7 tests)
 ✓ src/ai/submitSuggestionTool.test.ts  (17 tests)
 ✓ src/ai/AgentOrchestrator.surfaceVocab.test.ts  (3 tests)
 ✓ src/ai/submitSuggestionTool.workstate.test.ts  (6 tests)
 Test Files  5 passed (5)   Tests  38 passed (38)
```

## Verification 3 — full server suite: failing-file SET identical to base

Both runs done in this worktree: BASE = pristine HEAD a9426cfd (my changes
stashed via `git stash push -u -- <4 paths>`, suite run, stash popped);
HEAD = same worktree with the commit applied.
```
BASE (a9426cfd): Test Files  91 failed | 526 passed | 9 skipped (626)
                 Tests  114 failed | 4757 passed | 68 skipped (5109)
HEAD (a24d1f4f): Test Files  91 failed | 528 passed | 9 skipped (628)
                 Tests  114 failed | 4767 passed | 68 skipped (5119)
```
(+2 passed files / +10 passed tests = exactly my two new test files.)
Set-diff proof (failing-file sets extracted from the FAIL lines):
```
$ comm -3 /tmp/base-failfiles.txt /tmp/head-failfiles.txt
(no output — identical 88-file failing set)
```
Symlink-landmine set status (REPORT, never fixed, per spec):
- FAILING at base AND at head (identical): src/schema/EventGraphEquipmentSchema.test.ts,
  src/schema/LabwarePhysicalGeometryData.test.ts, src/surfaces/surfacesAjv.test.ts
  (plus the large integration/fixture landmine set — 88 files total).
- src/ai/createRecordIntent.test.ts: PASSES in both runs here (gitignored
  symlink into Brad's tree — reports MAIN's state, never a lane gate, per the
  PB-CH-7/PROO-AI-7 note).
- "deckLayout": no file by that name exists in this checkout; the closest,
  src/ai/ChatbotCompileDeckSlot.test.ts, fails IDENTICALLY at base and head
  (present in both 88-file sets).
Raw logs: /tmp/pbch4b-base2-suite.txt, /tmp/pbch4b-head-suite.txt.

## Verification 4 — server tsc: error-line/file SET identical to base

Base RE-MEASURED at a9426cfd in this worktree (pin confirmed): 26 error lines
across 6 files. Head: 26 error lines across the same 6 files.
```
files: src/ai/AgentOrchestrator.ts, src/api/handlers/ProtocolIntakeHandlers.ts,
       src/api/handlers/RecordHandlers.ts, src/lint/AuthoringGuard.ts,
       src/scripts/bootstrapAdmin.ts, src/store/RecordStoreImpl.ts
comm -3 (file sets):            empty
comm -3 (error lines, position-normalized — my insertion shifts line numbers
inside AgentOrchestrator.ts only): empty
base lines: 26   head lines: 26
```
Raw logs: /tmp/pbch4b-base-tsc.txt, /tmp/pbch4b-head-tsc.txt.

## Verification 5 — diff --stat proof, no forbidden hunks

```
 .../src/ai/AgentOrchestrator.surfaceVocab.test.ts  | 112 +++++++++++++++++
 server/src/ai/AgentOrchestrator.ts                 |  27 ++++-
 .../ai/submitSuggestionTool.surfaceVocab.test.ts   | 132 +++++++++++++++++++++
 server/src/ai/submitSuggestionTool.ts              |  44 +++++++
 4 files changed, 313 insertions(+), 2 deletions(-)

$ git -c core.fileMode=false diff --cached --name-only -- schema prompts app server/src/drafts
(no output — zero hunks in schema/**, prompts/**, app/**, server/src/drafts/**)
```

## Verification 6 — runtime receipt: PENDING-RESTART (orch's half)

I did NOT restart or touch the lane stack (:3093/:5193) — another lane worker
is mid-gate on it. Offline builder eval against the REAL registry
(loadDefaultSurfacesRegistry over the worktree's schema/, via tsx) proves the
10 real ids arrive as data:
```
IDS(10): find, run-plan, run-design, run-execute, results, analysis, knowledge, project, ingestion, protocol-review
ACTION: open-surface: a registered surface id — registered ids: find, run-plan, run-design, run-execute, results, analysis, knowledge, project, ingestion, protocol-review. Nothing else is valid.
TAB: A registered surface id — registered ids: find, run-plan, run-design, run-execute, results, analysis, knowledge, project, ingestion, protocol-review. Nothing else is valid.
```
Live half (backend trace of an assist turn showing the injected def) is ORCH's
after the lane-stack restart.

## Verification 7 — git hygiene

ONE branch, ONE logical code commit (a24d1f4f) + this report commit. Explicit
paths staged only (never `git add -A`); all status/log/diff via
`git -c core.fileMode=false`. Trunk and Brad's tree untouched.

## Assumptions recorded

- The two description strings are rendered EXACTLY as the spec quotes them
  (em-dash form); if the gate's behavioral check expects different wording,
  that is a spec-text change, not an implementation drift.
- OQ1 (warm-prefix KVS tokenisation sensitivity to description length):
  reported, not "fixed" — the design guarantees reference identity between
  warm and real renders (pinned by test), which is the parity contract.
- createRecordIntent.test.ts passing here reflects MAIN's state through the
  gitignored symlink, per the standing note; not treated as lane evidence.

## Reviewer-bait self-check

- Clone, never in-place mutation (test (d) pins the static const byte-stable).
- Computed ONCE per orchestrator instance; reference-stability pinned by test.
- No enum, no second membership check; workstateCompile.ts untouched (diff
  proof above).
- Description text changed ONLY in the two surface fields (deep-diff test (b2)).

PB-CH-4b DONE a24d1f4f
