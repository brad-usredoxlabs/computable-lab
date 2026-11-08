# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 / u5fix1 — Report

## Task

Repair the composition-identity FIND in `upsertProposedMaterialSpecFromComposition` so the accept
path binds the EXISTING canonical material-spec instead of minting one `MSP-DRAFT-*` per accepted
event, and candidate selection prefers a non-ai-draft canonical spec over prior draft residue.

## Root Cause (g2 D1)

At line 261 of AddMaterialSupport.ts, the filter checked:
  `storedRef.id !== materialRef.id`

This compared the canonical MSP's `payload.material_ref.id` (material-level, e.g. MAT-PR9-TEST-CLO)
against the event's `details.material_ref.id` (spec-level, e.g. MSP-PR9-TEST-CLO-1MM). Since these
are different levels, every candidate was rejected, causing 4 draft MSPs to be minted instead of
binding the canonical spec.

## Root Cause (g2 D2)

When multiple candidates matched, the sort only used recordId ordering, which could select an
ai-draft residue over a canonical spec.

## Fix

### AddMaterialSupport.ts (lines 257-290)

1. Replaced the level-exact `storedRef.id !== materialRef.id` check with a cross-level identity check:
   - Match when payload.material_ref.id === materialRef.id (original material-level case)
   - OR when the candidate recordId === materialRef.id (event names the spec directly)
2. Added ai-draft preference in multi-candidate sort: non-draft specs win over draft residue.

### addMaterialCompositionIdentity.test.ts

Added 2 new tests:
- D1: event material_ref is spec-level (MSP-PR9-TEST-CLO-1MM), canonical payload material_ref is
  material-level (MAT-PR9-TEST-CLO). Expects bind to canonical spec, zero new records.
- D2: both a draft residue and canonical spec in store. Expects canonical spec to win.

## Verification Transcripts

### Baseline (at base 9bf6a229)

```
$ cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts
 ✓ src/materials/addMaterialCompositionIdentity.test.ts  (1 test) 3ms
 Test Files  1 passed (1)      Tests  1 passed (1)

$ cd server && npx vitest run src/materials/AddMaterialSupport.test.ts
 ✓ src/materials/AddMaterialSupport.test.ts  (10 tests) 8ms
 Test Files  1 passed (1)      Tests  10 passed (10)

$ cd server && npx tsc --noEmit
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3'.
```

### RED pin (new tests fail against unfixed code)

```
$ cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts
 FAIL > binds canonical spec when event material_ref is spec-level (D1)
   expected 'MSP-DRAFT-EVG_CORPUS2_EVT_D1' to be 'MSP-PR9-TEST-CLO-1MM'
 FAIL > prefers canonical spec over ai-draft residue (D2)
   expected 'MSP-DRAFT-EVG_CORPUS2_EVT-33L5E2ZH' to be 'MSP-PR9-TEST-CLO-1MM'
 Test Files  1 failed (1)      Tests  2 failed | 1 passed (3)
```

### After fix (all green)

```
$ cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts
 ✓ src/materials/addMaterialCompositionIdentity.test.ts  (3 tests) 4ms
 Test Files  1 passed (1)      Tests  3 passed (3)

$ cd server && npx vitest run src/materials/AddMaterialSupport.test.ts
 ✓ src/materials/AddMaterialSupport.test.ts  (10 tests) 10ms
 Test Files  1 passed (1)      Tests  10 passed (10)

$ cd server && npx tsc --noEmit
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3'.
```

### Mutation control (revert :261 fix alone -> RED; restore -> GREEN)

Revert RED:
```
$ cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts
 FAIL > binds canonical spec when event material_ref is spec-level (D1)
   expected 'MSP-DRAFT-EVG_CORPUS2_EVT_D1' to be 'MSP-PR9-TEST-CLO-1MM'
 FAIL > prefers canonical spec over ai-draft residue (D2)
   expected 'MSP-DRAFT-EVG_CORPUS2_EVT-33L5E2ZH' to be 'MSP-PR9-TEST-CLO-1MM'
 Test Files  1 failed (1)      Tests  2 failed | 1 passed (3)
```

Restore GREEN:
```
$ cd server && npx vitest run src/materials/addMaterialCompositionIdentity.test.ts
 ✓ src/materials/addMaterialCompositionIdentity.test.ts  (3 tests) 4ms
 Test Files  1 passed (1)      Tests  3 passed (3)
```

## Changed Files

1. server/src/materials/AddMaterialSupport.ts (+24 lines, -4 lines)
2. server/src/materials/addMaterialCompositionIdentity.test.ts (+141 lines, 0 deletions)

## Commits

1. 2e9a3b8d — u5fix1: RED — cross-ref-level composition FIND (gate g2 D1 shape)
2. 48e243e8 — u5fix1: bind canonical spec across ref levels; prefer non-draft candidate (D1/D2)

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u5fix1 DONE 48e243e87a453169dbb060872a443a3193982750
