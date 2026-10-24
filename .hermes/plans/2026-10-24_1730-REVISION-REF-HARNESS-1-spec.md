# REVISION-REF-HARNESS-1 — spec (orch-authored, lane 2)

Item: REVISION-REF-HARNESS-1. Filed 2026-10-24T17:20 EDT (orch l2t1710) from handoff
l2t1610 backlog. Test-only hygiene; clears the lane's standing "3 baseline-red schema
test files" carve-out that every coder/advc prompt must otherwise carry.

## Measured defect (orch first-hand, cwd=server at trunk a86c31ac, 2026-10-24T17:16 EDT)

`npx vitest run src/schema/EventGraphEquipmentSchema.test.ts
src/schema/EventGraphSemanticKeySchema.test.ts src/schema/ProcurementSchemaContracts.test.ts`
-> 10 failed / 19 passed, every failure the verbatim Ajv throw:

    can't resolve reference ./datatypes/revision-ref.schema.yaml from id
    https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml
    Serialized Error: { missingRef: '.../datatypes/revision-ref.schema.yaml' }

Root cause: these three test files build a TEST-LOCAL Ajv harness with an explicit
schema path list. event-graph.schema.yaml ($ref at schema/workflow/event-graph.schema.yaml:17)
pulls in the revision-ref datatype, and the three lists omit it. The datatype ships at
schema/core/datatypes/revision-ref.schema.yaml with $id
`https://computable-lab.com/schema/computable-lab/datatypes/revision-ref.schema.yaml`.

The shipped convention (three PASSING siblings): ProtocolPhasesSchema.test.ts:33,
ProtocolProseFieldsSchema.test.ts:21, CandidateMapperSchemaConformance.test.ts:21 each add
`'core/datatypes/revision-ref.schema.yaml'` to the harness list, with the comment that
"the harness path list mirrors the schema's dependency closure". Verified by orch at trunk:
ProtocolPhasesSchema.test.ts 6/6 PASS.

Product impact: NONE — the registry loads all 199 schemas at server boot, so production
$refs resolve; the failure class is test-harness dependency-closure drift only.

## Fix (test-only; file ownership is exactly these 3 files)

Extend each failing harness path list with `'core/datatypes/revision-ref.schema.yaml'`,
matching the sibling idiom (same comment style). NO product/schema edits. NO registry
changes. If any of the three harnesses use a helper that auto-derives the closure, prefer
fixing the derivation over list edits — but report which mechanism each file actually uses.

## Reviewer bait

1. Any hunk outside the 3 test files = DEFECT (especially schema/ or server/src non-test).
2. Disabling/skipping the failing tests instead of resolving the ref = DEFECT.
3. The fix must not mask a genuine product-side broken $ref: verify by checking
   `schema/core/datatypes/revision-ref.schema.yaml` exists at trunk and the $id matches
   the missingRef string exactly.
4. Check ProcurementSchemaContracts.test.ts: its failing arm is planned-run procurement
   anchor tests — confirm they exercise event-graph (planned-run embeds it) and that the
   closure addition is the true root cause, not a coincidental pass.

## Verification commands (verbatim)

- RED at base: the 3 files fail with the verbatim missingRef throw (orch evidence above;
  coder re-runs and quotes).
- GREEN: cwd=server `npx vitest run src/schema/EventGraphEquipmentSchema.test.ts
  src/schema/EventGraphSemanticKeySchema.test.ts src/schema/ProcurementSchemaContracts.test.ts`
  -> 29/29 PASS.
- Wider sweep: cwd=server `npx vitest run src/schema` -> zero failing files attributable
  to revision-ref (any OTHER pre-existing failure must be named + proven identical at base).
- cwd=server `npx tsc -p . --noEmit` sorted-diff zero NEW vs trunk baseline.
- `git -c core.fileMode=false diff --stat base...HEAD` = the 3 test files only.
- No UI -> NO browser gate. No schema YAML changed -> no stack restart needed (confirm the
  diff touches no schema/ file).

## Open questions
None. Vocabulary/mechanism questions n/a (pure harness-list fix).
