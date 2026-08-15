# Server Test Failures — Master Fix Plan

**Date:** 2026-08-05. **Source:** Consolidated from `2026-08-03_test-failures-snapshot.md` + session @session:coder/20260803_203007_a49a94.
**Baseline:** `feat/ai-extension-api` branch. Server-only suite: 419 test files, 3430 tests total.
**Run command:** `cd /home/brad/git/computable-lab/server && npx vitest run`

## Current Status

| Metric | Value |
|---|---|
| Total tests | 3430 |
| Passing | 3132 |
| Failing | 147 |
| Failed files | 85 |
| Error files | 2 |

## What's Already Done (Aug 3)

### Cluster 2 — Temp-workspace schema setup (FIXED)
- **Problem:** 29 test files under `server/tmp/<name>-test/` were missing `schema/lab/material-profile.registry.yaml`, causing `initializeApp` to crash.
- **Fix:** Added `setupTestWorkspace(testDir)` import + call to all 29 affected files.
- **Result:** Eliminated ~35 failures. Tests that were "timeouting" now run to completion, revealing ~100 underlying assertion/logic failures.

### Cluster 4a — `slugify` not exported (FIXED)
- **Problem:** `RepoAdapter.test.ts` imported `slugify` from `PathConvention.js`, but it was a private function.
- **Fix:** Exported `slugify` from `PathConvention.ts`.

### Cluster 4b — `MentionResolver.test.ts` syntax error (FIXED)
- **Problem:** Extra `});` at line 716 caused transform failure. Also used `@jest/globals` import instead of `vitest`.
- **Fix:** Removed extra brace, changed import to `vitest`.

## Remaining Work

### Cluster 1 — Missing record/seed directories (~45 failures, ~15 files)

**Root cause:** Tests reference `records/{workflow,knowledge,examples}/` subdirectories that don't exist. Only `records/seed/` exists.

**Affected files:**
- `src/schema/VerbRecords*.test.ts` (40 tests across multiple files)
- `PhaseTemplateSeedRecords`, `ProtocolPhasesSchema`, `MechanismModelSchemas`
- `RosReplayGolden`, `ProtocolIdeE2EFixture`, `seeds/material.seed`
- `ProtocolProseFieldsSchema`, `ExecutionEvidenceSchemas`

**Fix options (pick one):**
A. Generate seed data — find or rebuild the seed-generation script, commit the output
B. Gate the tests — skip if directories don't exist (`test.skip` conditionally)
C. Delete stale tests — if the seed data is genuinely obsolete, remove the test files

**Recommendation:** Option B (gate) for quick win, then Option A if the seed data is still needed.

### Cluster 3 — Compiler golden/invariant drift (~20 failures, ~15 files)

**Root cause:** Mix of stale golden fixtures and possibly real invariant regressions.

**Sub-cluster 3a — Golden fixture diffs (stale):**
- `compiler/pipeline/fixtures/` — BaselineFixtures, Prompt01/02/04Green, CrossTurnMini, FiwtureRunner
- **Fix:** Re-baseline committed goldens against current pass output
- **Command:** Run each test individually, capture the actual output, overwrite `__goldens__/` YAML

**Sub-cluster 3b — Invariant assertions (need human triage):**
- `aiPrecompileGating` — "LLM should NOT be called when deterministic is complete"
- `ChatbotCompileDeckSlot` — "expected undefined to deeply equal []"
- `AgentOrchestrator.*` — "expected false to be true"
- `ProtocolRealizePass` — object match failure
- **Fix:** Human must confirm whether the new behavior is intended, then either fix the code or re-baseline the test

### Cluster 5 — Missing external fixtures (~2 failures, 2 files)

**Root cause:** `CaymanPlateMapPdf.test.ts` and `CaymanPlateMapSpreadsheet.test.ts` reference PDF/XLSX fixtures not in the repo.

**Fix options:**
A. Download/provide the actual Cayman Lipid Library PDF and XLSX
B. Gate the tests with `test.skip` if fixtures don't exist

**Recommendation:** Option B (gate) — these are integration tests against external vendor files.

### Cluster 6 — Schema `$ref` resolution (~3 failures, 1-3 files)

**Root cause:** `ProcurementSchemaContracts.test.ts` can't resolve `$ref` to `./event-graph.schema.yaml#/$defs/PlateEvent`.

**Fix:** Likely a renamed or moved schema file. Find the actual `PlateEvent` definition location and update the `$ref` path in the seed YAML, or load the full schema registry into Ajv before validation.

### Test Logic Failures (~100 failures revealed after Cluster 2 fix)

**Root cause:** Tests now run to completion but have assertion-level mismatches. Examples:
- `ExecutionIncidentService`: expects 2 incidents but gets 1
- `ExecutionOrchestrator`: gets `PLR-000005` instead of `PLR-000001`
- SQLite contention when running in large parallel batches

**Fix:** These need individual investigation per test. Two approaches:
A. Fix tests to match current behavior (if the behavior change is intended)
B. Fix production code to restore original behavior (if it's a regression)

**Recommended approach:** Run each failing test individually first (`npx vitest run <file>`). Many that fail in parallel pass individually due to SQLite contention.

## Execution Order

1. **Quick wins:** Cluster 5 (gate tests), Cluster 1 (gate tests) — drops failure count immediately
2. **Cluster 6:** Fix schema `$ref` paths — low effort, deterministic fix
3. **Cluster 3a:** Re-baseline golden fixtures — run tests, capture output, overwrite goldens
4. **Cluster 3b:** Human triage required — schedule review with Brad
5. **Test logic failures:** Run individually, fix based on whether behavior is intended
6. **Parallel SQLite contention:** If individual runs pass but parallel fails, reduce `maxWorkers` or use `--pool=threads` with serialized SQLite access

## Verification

After each cluster fix:
```bash
cd /home/brad/git/computable-lab/server && npx vitest run 2>&1 | tail -15
```
Target: 0 failures across 419 files, 3430 tests.
