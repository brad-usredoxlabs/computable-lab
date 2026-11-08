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
