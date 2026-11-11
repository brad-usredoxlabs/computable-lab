# L2-LAB-INVENTORY-CREATE-1-u2 Report

## Decision
Added guard in createMaterialInstance to refuse POST /materials/instances when lot is present without a source material ref (vendorProductRef, materialSpecRef, or materialRef). Returns typed 400 LOT_WITHOUT_SOURCE and writes zero records.

## Changed Files
1. server/src/api/handlers/MaterialLifecycleHandlers.ts (+7 lines guard)
2. server/src/api/handlers/MaterialLifecycle.lotref.test.ts (NEW, 90 lines, 3 tests)

## Test Results
- Unit tests: 3 passed (400+empty-store, zero records, 201 with valid ref)
- Regression: 9 passed (9)
- Mutation probe: `if (false && !sourceRef)` → 2 failed | 1 passed (expected 201 to be 400, expected 1 to be +0); guard byte-restored, `git status --short` clean
- Typecheck: clean

L2-LAB-INVENTORY-CREATE-1-u2 UNIT u2pw DONE PLACEHOLDER_SHA
