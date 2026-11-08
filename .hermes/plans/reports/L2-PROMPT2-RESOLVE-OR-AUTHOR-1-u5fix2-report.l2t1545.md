# L2-PROMPT2-RESOLVE-OR-AUTHOR-1 — Unit u5fix2 Report

## RED Phase

### Test File Created
`server/src/materials/addMaterialCompositionDraftShape.test.ts`

3 failing tests:
- Case A: `expected undefined to deeply equal { value: 1, unit: 'mM' }` — no top-level concentration
- Case B: `expected undefined to deeply equal { value: 10, unit: 'uM' }` — no top-level concentration  
- Case C: `Cannot read properties of undefined (reading 'id')` — no top-level solvent_ref

### Raw RED Output
```
RUN  v1.6.1 /home/brad/cl-wt/wt-ROAUTH-u5fix2/server

 ❯ src/materials/addMaterialCompositionDraftShape.test.ts  (3 tests | 3 failed) 8ms
   ❯ Case A: expected undefined to deeply equal { value: 1, unit: 'mM' }
   ❯ Case B: expected undefined to deeply equal { value: 10, unit: 'uM' }
   ❯ Case C: Cannot read properties of undefined (reading 'id')

 Test Files  1 failed (1)
      Tests  3 failed (3)
```

Commit: 1dd8b433 u5fix2 RED: draft author shape pins

## GREEN Phase — The Fix

### Changed File
`server/src/materials/AddMaterialSupport.ts` — lines 289-302

### Diff Summary
- Added derivation of `authoredConcentration` from exactly-one solute entry (lines 289-300)
- Added derivation of `authoredSolventRef` from exactly-one solvent entry (line 301)
- Conditionally spread `concentration` and `solvent_ref` into `formulation` (lines 302-303)
- Role literals `'solute'` and `'solvent'` cited from `schema/core/datatypes/composition-entry.schema.yaml:13-22`

## VERIFY

### Test Run
```
cd server && npx vitest run src/materials/addMaterialCompositionDraftShape.test.ts src/materials/addMaterialCompositionIdentity.test.ts src/materials/AddMaterialSupport.test.ts

RUN  v1.6.1 /home/brad/cl-wt/wt-ROAUTH-u5fix2/server

 ✓ src/materials/addMaterialCompositionIdentity.test.ts  (1 test) 4ms
 ✓ src/materials/addMaterialCompositionDraftShape.test.ts  (3 tests) 5ms
 ✓ src/materials/AddMaterialSupport.test.ts  (10 tests) 10ms

 Test Files  3 passed (3)
      Tests  14 passed (14)
```

### Typecheck
```
cd server && npx tsc --noEmit
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3' or its corresponding type declarations.
```
Pre-existing error only — zero new errors.

### Tree Status
Clean (no uncommitted changes)

## Changed Files
1. `server/src/materials/addMaterialCompositionDraftShape.test.ts` — NEW (192 lines)
2. `server/src/materials/AddMaterialSupport.ts` — modified (14 lines added)

## Commits
1. 1dd8b433 u5fix2 RED: draft author shape pins
2. 5ee8acb5 u5fix2: draft author carries concentration + solvent_ref

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u5fix2 DONE a007a3aa528ee680214aefc89045fc3e469920da
