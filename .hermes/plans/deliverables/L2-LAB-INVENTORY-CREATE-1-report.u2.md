# L2-LAB-INVENTORY-CREATE-1-u2 Report

## Decision
Added guard in createMaterialInstance to refuse POST /materials/instances when lot is present without a source material ref (vendorProductRef, materialSpecRef, or materialRef). Returns typed 400 LOT_WITHOUT_SOURCE and writes zero records.

## Changed Files
1. server/src/api/handlers/MaterialLifecycleHandlers.ts (+7 lines guard)
2. server/src/api/handlers/MaterialLifecycle.lotref.test.ts (NEW, 90 lines, 3 tests)

## Test Results

Combined unit + regression run:
```
$ node node_modules/vitest/vitest.mjs run --root server src/api/handlers/MaterialLifecycle.lotref.test.ts src/api/handlers/MaterialLifecycle.classify.test.ts

RUN  v1.6.1 /home/brad/cl-wt/L2-LAB-INVENTORY-CREATE-1-u2-lane2/server

 ✓ src/api/handlers/MaterialLifecycle.lotref.test.ts  (3 tests) 6ms
 ✓ src/api/handlers/MaterialLifecycle.classify.test.ts  (9 tests) 41ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

Mutation probe: `if (false && !sourceRef)` → 2 failed | 1 passed; guard byte-restored, `git status --short` clean

Typecheck:
```
$ npx tsc --noEmit
TSC_EXIT=0
```

L2-LABINV-u2pw2 UNIT unit DONE dc17f2a1402b2bd0986ef52c92570b7e9a6b78a4
