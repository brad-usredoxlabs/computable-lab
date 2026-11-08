# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 / u8mspdedupe — Report

## Summary

Batch deduplication of material-spec upserts in `normalizeEventGraphMaterialUsage`.
Events sharing the same `material_ref` + identical `composition_snapshot` now mint
exactly ONE material-spec instead of one per event.

## Changed Files

1. `server/src/materials/addMaterialCompositionBatchDedupe.test.ts` — NEW, RED pin + GREEN verification
2. `server/src/materials/AddMaterialSupport.ts` — fix (batch-scoped identity memo)

## The Fix

In `normalizeEventGraphMaterialUsage`, added a function-local `Map<string, Promise<RefShape | null>>`
keyed by `material_ref.id|JSON.stringify(canonicalCompositionSnapshot(composition_snapshot))`.
Each `add_material` event checks the memo before calling `upsertProposedMaterialSpecFromComposition`.
If a sibling event already triggered the upsert for that identity, the shared promise is awaited
instead of launching a redundant call. The memo is per-call (function-local), never module-global.

## Before/After

- BEFORE (no memo): 4 events with identical identity → 4 material-spec creates (g4 D1: mspTotal 25->29)
- AFTER (with memo): 4 events with identical identity → 1 material-spec create

## Verification

### New tests
```
cd server && npx vitest run src/materials/addMaterialCompositionBatchDedupe.test.ts
✓ src/materials/addMaterialCompositionBatchDedupe.test.ts (2 tests)
  ✓ four events sharing one material+composition mint ONE material-spec
  ✓ distinct identities in one graph still mint distinct specs
```

### Existing tests (unchanged)
```
cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts src/materials/addMaterialCompositionDraftShape.test.ts src/materials/AddMaterialSupport.test.ts
✓ src/materials/addMaterialCompositionIdentity.test.ts (3 tests)
✓ src/materials/addMaterialCompositionDraftShape.test.ts (3 tests)
✓ src/materials/AddMaterialSupport.test.ts (10 tests)
Test Files  3 passed (3)
     Tests  16 passed (16)
```

### TypeScript
```
npx tsc --noEmit -p server -> 0 errors
```

### App diff
```
git diff --name-only 106e8e7e..HEAD -- app -> EMPTY
```

### B1 mutation check
With the memo commented out: test (a) is RED (4 creates), test (b) stays GREEN (2 creates).
Restored the fix byte-identically after probe.

### B2-B9 compliance
- B2: No material names/labels in product code. Identity key = material_ref.id + canonical composition JSON.
- B3: No undefined spreading; used conditional logic with null checks.
- B4: Did not replace Promise.all; deduped only the spec upsert.
- B5: Memo is function-local, not module-global.
- B6: Did not call store.list twice or rely on create landing.
- B7: Zero app/ diff, no YAML edits.
- B8: No store surgery for orphans.
- B9: No YAML edits.

## BEFORE/AFTER Create Counts

BEFORE (no memo):
```
FAIL  src/materials/addMaterialCompositionBatchDedupe.test.ts
expected 4 to be 1 // Object.is equality
```

AFTER (with memo):
```
✓ src/materials/addMaterialCompositionBatchDedupe.test.ts (2 tests)
```

## Commits

1. 1e22a81f — roauth u8mspdedupe: RED pin for per-identity spec minting
2. 83937958 — roauth u8mspdedupe: one material-spec per identity in a batch

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u8mspdedupe DONE 0089304747a848551c734d9bb0ff1a0c4786edc8
