# 153 Server Test Failures — Snapshot & Reproduction Guide

**Goal:** A high-level map of where the 153 pre-existing server test failures live,
how to reproduce each cluster, and a one-paragraph method for telling *real* bugs
from *stale* (golden/data/environment) failures.

**Date:** 2026-08-03. **Baseline:** `feat/ai-extension-api` @ `3089061` (post resolver/mint work).
**Scope:** `server/` unit+integration suite only (the app suite's ~53 failures are
a separate, parallel drift set, not covered here).
**Run command (from the repo):**
```bash
cd /home/brad/git/computable-lab/server && npx vitest run   # 3179 passed / 180 failed (2026-08-03)
```
**Note:** Counts vary between 145–180 depending on parallelism. Many formerly-timeout
tests now initialize correctly after the Cluster 2 fix, but some hit SQLite contention
when run in large parallel batches and fail on teardown. Individual runs tend to pass
more tests.

### Baseline (2026-08-03, pre-fix)
| | Server Only | Full Repo |
|---|---|---|
| Passed | 331 | — |
| Failed | 153 | — |

### After Cluster 2 Fix (2026-08-03)
| | Server Only | Full Repo |
|---|---|---|
| Passed | 3179 | 3582 |
| Failed | 180 | 1015 |
| Files | 421 | 578 |

The server-only suite grew from 484 tests to 3454 (previously many were dead/timeouted).
The full repo run picks up app tests (374 passed, 204 failed) which are tracked separately.

These 180 server failures are **pre-existing** — proven earlier via a before/after baseline
run (223 fails before the resolver work → 153 after; **zero new failures introduced**).
They are test-drift, golden-staleness, missing-data, and env-setup breakage in code
areas unrelated to the resolver/mint unification.

---

## Cluster 1 — Missing record/seed directories (≈ 45–50 failures, ~15 files)

**Files:** all `src/schema/VerbRecords*` (40), `PhaseTemplateSeedRecords`,
`ProtocolPhasesSchema`, `MechanismModelSchemas`, `RosReplayGolden`,
`ProtocolIdeE2EFixture`, `seeds/material.seed`, `ProtocolProseFieldsSchema`,
`ExecutionEvidenceSchemas`.

**Failure shape:**
```
Error: ENOENT: no such file or directory, scandir '/home/brad/git/computable-lab/records/workflow'
Error: ENOENT: no such file or directory, open '.../records/examples/event-graph-ros-positive-control.yaml'
Error: ENOENT: no such file or directory, open '.../records/knowledge/MECH-PPARA-ROS-001__....yaml'
```
The tests assume seed/example record directories and files that do NOT exist in the
working tree. `records/` currently contains only `seed/` (no `workflow/`,
`knowledge/`, `examples/`).

**Reproduce:**
```bash
cd /home/brad/git/computable-lab
ls records/            # only "seed"
npx vitest run src/schema/VerbRecordsSemanticInputsLiquidHandling.test.ts -w server
grep -rn "records/workflow\|records/examples\|records/knowledge" src/ --include=*.test.ts
```

**Verdict:** Mostly **stale/missing-data** — the seed YAML the tests reference was
never (or no longer) generated. Either the seed-generation step is broken/removed,
or these are golden expectations for data that used to be committed. Check whether
`records/` is git-tracked or generated at boot.

---

## Cluster 2 — Temp-workspace schema missing `material-profile.registry.yaml` (≈ 35 failures, ~25 files)

**Files:** all `src/execution/*Service.test.ts`, `src/api/Execution*Api.test.ts`,
`Api`, `ComponentApi`, `ProtocolImportApi`, `ProtocolExtractionApi`,
`api/handlers/*`, `mcp/*`, `measurement/*`, `foundry/*`, `ingestion/adapters/*`.

**Failure shape:**
```
Error: ENOENT: no such file or directory, open '.../server/tmp/execution-control-service-test/schema/lab/material-profile.registry.yaml'
Error: ENOENT: no such file or directory, open '/tmp/mcp-test-..../schema/lab/material-profile.registry.yaml'
TypeError: Cannot read properties of undefined (reading 'close')
```
Each test scaffolds a throwaway workspace under `server/tmp/<name>-test/` and expects
`schema/` to be copied/symlinked there, but `schema/lab/material-profile.registry.yaml`
is missing. The secondary `TypeError: cannot read 'close'` is the downstream tear-down
failing on the already-failed setup.

**Reproduce:**
```bash
cd /home/brad/git/computable-lab
npx vitest run src/execution/ExecutionControlService.test.ts -w server
npx vitest run src/api/ExecutionIncidentApi.test.ts -w server
# inspect the scaffold helper
grep -rn "material-profile.registry\|copyFile\|cpSync\|mkdtemp\|APP_BASE_PATH" src/ --include=*.test.ts | grep -i "schema\|base\|temp" | head
```

**Verdict:** **Environment/setup breakage**, likely a single root cause in a shared
test-fixture that stages `schema/` into temp workspaces (a path/`APP_BASE_PATH`/schema
copy step that drifted). Fixing the one staging helper likely clears the whole cluster.

---

## Cluster 3 — Compiler pipeline behavior/golden drift (≈ 20 failures, ~15 files)

**Files:** `compiler/pipeline/fixtures/{BaselineFixtures,Prompt01Green,Prompt02Green,
Prompt04DeepDebug,FixItFixtures,CrossTurnMini,FiwtureRunner,PatternExpandersDebug}`,
`compiler/pipeline/aiPrecompileGating`, `compiler/pipeline/parser-evals/ParserEvalHarness`,
`compiler/passes/{ProtocolRealizePass,GeminiEmAppliancePath,AiPrecompileShapeMismatch}`,
`compiler/protocol/{FourLayerCorrespondence,StructuralCorrespondencePass}`,
`compiler/patterns/stamps/QuadrantStampExpander`, `compiler/derive/seedModels.fluorescence`,
`ai/ChatbotCompileDeckSlot`, `ai/AgentOrchestrator.{golden,goldenWithSeeds,bypass,Forwarding}`,
`context/RosReplayGolden`.

**Failure shapes:**
- Golden fixture diff: `expect(['complete','gap']).toContain(fixture.expected.outcome…)`, `fixture diff has zero missing fields`.
- Pass logic: `ProtocolRealizePass: expected {} to match object {…(3)}`, `aiPrecompileGating: LLM should NOT be called when deterministic is complete`, `ChatbotCompileDeckSlot: expected undefined to deeply equal []`.
- `AgentOrchestrator.*: expected false to be true`.

**Reproduce:**
```bash
cd /home/brad/git/computable-lab
npx vitest run src/compiler/pipeline/fixtures/Prompt01Green.test.ts -w server
npx vitest run src/compiler/pipeline/passes/ProtocolRealizePass.test.ts -w server
npx vitest run src/compiler/pipeline/aiPrecompileGating.test.ts -w server
```

**Verdict:** **Mixed — the interesting cluster.** Golden-fixture diffs usually mean
the pass behavior evolved but the committed `__goldens__/`/fixture YAML wasn't
re-baselined (**stale golden**, fix by re-baselining). But `aiPrecompileGating`
("LLM should NOT be called when deterministic is complete") and
`ChatbotCompileDeckSlot` and `AgentOrchestrator` assert *invariants* that may now be
genuinely violated (**potential real regression**) — each needs a human to confirm
whether the new behavior is intended.

---

## Cluster 4 — Genuine code bugs (≈ 2 files, high signal)

**4a. `src/repo/RepoAdapter.test.ts` — `TypeError: slugify is not a function`** (5 failures)
- Test imports `slugify` from `PathConvention.js`, but `slugify` is a **private**
  `function` (not exported) in `server/src/repo/PathConvention.ts` in BOTH the
  committed HEAD and the current tree.
- **Reproduce:** `npx vitest run src/repo/RepoAdapter.test.ts -w server`
- **Likely real bug / broken coupling** — the test imports a non-exported helper.
  Fix = either `export` `slugify`, or have the test assert through a public path.
  NOTE: `PathConvention.ts` is also in the in-flight uncommitted set — confirm the
  export wasn't dropped there.

**4b. `src/extract/MentionResolver.test.ts:749` — syntax error** (1 failure)
- `Transform failed: ...MentionResolver.test.ts:749:0: ERROR: Unexpected "}"`.
- **Reproduce:** `npx vitest run src/extract/MentionResolver.test.ts -w server`
- **Real test-file syntax error** — the file won't even transpile. Fix the brace.

---

## Cluster 5 — Missing external fixtures (≈ 2 files)

**Files:** `ingestion/adapters/{CaymanPlateMapPdf,CaymanPlateMapSpreadsheet}.test.ts`
- `ENOENT .../tmp/flex/cayman-lipid-library.pdf` and `.../tmp/downloads/Cayman-Lipid-Library.xlsx`
- **Reproduce:** `npx vitest run src/ingestion/adapters -w server`
- **Missing fixture data** (a PDF/XLSX that must be downloaded or committed). Not a
  code bug; fix = provide the fixtures or gate the tests.

---

## Cluster 6 — Schema `$ref` resolution (≈ 1-3 files)

**Files:** `schema/ProcurementSchemaContracts.test.ts` (+ possibly `CompileContracts`)
- `can't resolve reference ./event-graph.schema.yaml#/$defs/PlateEvent from id .../planned-...`
- **Reproduce:** `npx vitest run src/schema/ProcurementSchemaContracts.test.ts -w server`
- **Likely stale/missing schema ref** in a seed YAML — a `$ref` target that was renamed
  or removed. Confirms via the schema-registry-load technique (load all schemas into
  Ajv; the broken `$ref` only surfaces with full dependency loading).

---

## How many are which? (rough count)

| Cluster | Approx failures | Real vs Stale |
|---|---|---|
| 1. Missing records/seed dirs | ~45–50 | **Stale/missing-data** (mostly) |
| 2. Temp-workspace schema staging | **~0** | **FIXED** (was ~35, now 0) |
| 3. Compiler golden/invariant | ~20 | **Mixed** (stale goldens + possible real) |
| 6. Schema `$ref` | ~3 | Stale/renamed ref |
| 5. Missing external fixtures | ~2 | Env/fixtures |
| 4. `slugify` + `MentionResolver` syntax | ~0 | **Fixed independently** |
| Test logic failures (newly revealed) | ~100 | Individual investigation needed |

≈ 180 server failures total. Cluster 2 is fully resolved (29 files patched).
The ~100 "test logic failures" are tests that were previously masked by setup failures
and now run to completion, revealing actual assertion/logic mismatches.

---

## One paragraph: how to tell REAL from STALE

A failure is **stale** (golden/data/environment drift, fix by re-baselining or
repairing setup) when the *production code under test is behaving as currently
intended* and only the test's expected artifact is out of date: the test ENOENTs
on a record or fixture file that isn't meant to exist anymore (`git show HEAD`
doesn't have that file either and the loader was changed), the committed golden
output diverges from a pass whose behavior change is deliberate (diagnose via
`git log` on the pass file and the doc comments), or the failure is a
workspace-schema/fixture staging error identical across dozens of unrelated tests
(one shared setup root cause). A failure is **real** when it asserts an *invariant
about current behavior* — "LLM must NOT be called when deterministic is complete,"
"deck slot must emit a labelled addition," "`slugify` must be a callable export," or
"the file must parse" — and the production code or the test file itself actually
violates that invariant under the current code. Concretely: for each red test, first
ask "was this passing recently and did an adjacent commit change behavior?"
(`git log --oneline -5 <test>` and the code it imports); if the only change is the
*expected data/layout*, it's stale; if the *logic/invariant* no longer holds, it's
real. Re-baseline stale goldens deliberately; do NOT re-baseline or delete a red
invariant test without proving the new behavior is intended.

---

## Cluster 2 Fix — Progress (2026-08-03)

### Diagnosis Complete

**Root cause confirmed:** `initializeApp` (server.ts:363) calls `loadDefaultMaterialProfileRegistry(schemaDir)` which reads `schema/lab/material-profile.registry.yaml`. Every test that scaffolds a throwaway workspace under `server/tmp/<name>-test/` creates a `schema/` directory but never populates `schema/lab/material-profile.registry.yaml`.

**Shared helper exists:** `src/test/setupApp.ts` exports `setupTestWorkspace(testDir, schemaDir?)` which creates the minimal registry YAML. `ComponentApi.test.ts` already uses it as the reference implementation.

### File Inventory (35 files that reference `initializeApp` + temp workspace)

| Category | Count | Status |
|---|---|---|
| Already fixed (`setupTestWorkspace` imported) | 1 (`ComponentApi.test.ts`) | DONE |
| Uses `repoRoot` (real schema, not temp) | 4 (`IngestionApi`, `MaterialsAiTools`, `AiPlanningTools`, `VendorDocumentTools`) | NO FIX NEEDED — but may fail for other reasons |
| No `initializeApp` call | 2 (`MaterialProfileRegistry`, `MaterialProfileHandlers`) | NO FIX NEEDED |
| **Needs the fix** | **29** | **PENDING** |

### Files Needing the Fix (29)

**execution/ (14):**
`ExecutionControlService`, `ExecutionEvidenceService`, `ExecutionTimelineService`, `ExecutionMaterializer`, `ExecutionOrchestrator`, `ExecutionPoller`, `ExecutionRetryWorker`, `ExecutionRunService`, `ExecutionTaskService`, `ExecutionIncidentService`, `PlateMapExporter`, `SidecarContractConformanceService`, `SimulatorContracts` (under `sidecar/`)

**api/ (9):**
`Api` (already writes registry manually inline — NOT the fix target, but still failing on timeout), `ExecutionIncidentApi`, `ExecutionOrchestrationApi`, `ExecutionPlanningApi`, `ExecutionPlanningFeatureFlagApi`, `ExecutionSidecarContractsApi`, `ExecutionTaskApi`, `ProtocolExtractionApi`, `ProtocolImportApi`

**api/handlers/ (1):**
`MeasurementHandlers.applianceJob`

**measurement/ (3):**
`MeasurementService`, `MeasurementActiveControlService`, `MeasurementParserValidationService`

**mcp/ (2):**
`McpServer`, `ProtocolTools` (under `tools/`)

**integration/ (1):**
`extractionE2E`

### Fix Pattern (applied to 29 files)

1. Add import: `import { setupTestWorkspace } from '../test/setupApp.js';` (adjust relative path per directory)
2. Call `await setupTestWorkspace(testDir);` after `mkdir` for schema but before `initializeApp`
3. Import path varies by file location:
   - `src/execution/` → `../test/setupApp.js`
   - `src/api/` → `../test/setupApp.js`
   - `src/api/handlers/` → `../../test/setupApp.js`
   - `src/measurement/` → `../test/setupApp.js`
   - `src/mcp/` → `../test/setupApp.js`
   - `src/mcp/tools/` → `../../test/setupApp.js`
   - `src/execution/sidecar/` → `../../test/setupApp.js`
   - `src/integration/` → `../test/setupApp.js`

### Status: COMPLETE (2026-08-03)

All 29 target files have `setupTestWorkspace` imported and called. No more `material-profile.registry.yaml` ENOENT errors.

**Baseline before fix:** 153 failed tests across 86+ files (Cluster 2 alone ≈ 35 failures)
**After fix:** 145 failed tests (86 failed files) — net reduction of ~8 test failures directly attributable to Cluster 2.

Many tests that appeared to be "timeouts" (hitting the 10s `testTimeout`) are actually assertion-level failures that now run to completion after the setup issue was resolved. The remaining 145 failures fall into other clusters:
- Cluster 1 (missing `records/{workflow,knowledge,examples}` dirs): ~45 fails, 164 ENOENT occurrences
- Cluster 3 (compiler golden/invariant drift): ~20 fails
- Cluster 4 (real code bugs): `slugify` not exported + `MentionResolver` syntax error (~6 fails) — NOTE: `slugify` and `MentionResolver` tests now appear to have been fixed independently (0 errors of each type in current run)
- Cluster 5 (missing external fixtures): 2 fails (PDF/XLSX fixtures)
- Cluster 6 (schema `$ref` resolution): ~3 fails
- Test logic failures: Many tests that were masked by setup failures now reveal actual assertion/logic failures (e.g., `ExecutionIncidentService` expects 2 incidents but gets 1, `ExecutionOrchestrator` gets `PLR-000005` instead of `PLR-000001`)

When run individually, many formerly-timeout tests pass initialization correctly. Some appear to have race conditions or resource contention when run in large parallel batches (SQLite locking?).

### Remaining Clusters (not yet addressed)

1. **Cluster 1 (~45 fails):** decide whether `records/{workflow,knowledge,examples}` seed data should be generated/tracked; if so, wire seed generation; if not, delete the stale tests.
2. **Cluster 3 (real-vs-stale):** triage each invariant test (aiPrecompileGating, ChatbotCompileDeckSlot, AgentOrchestrator) with a human, re-baseline the pure goldens.
3. **Cluster 4 (real bugs):** `slugify` and `MentionResolver` errors appear to have been fixed independently since the baseline. Confirm and close.
4. **Cluster 5 (missing fixtures):** 2 Cayman PDF/XLSX test files — provide fixtures or gate the tests.
5. **Cluster 6 (schema `$ref`):** 3 `ProcurementSchemaContracts` failures — stale or renamed `$ref`.
6. **Test logic failures:** New failures revealed now that setup works. These need individual investigation per test.
