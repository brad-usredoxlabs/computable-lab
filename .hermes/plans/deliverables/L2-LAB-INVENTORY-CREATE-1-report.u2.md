# L2-LAB-INVENTORY-CREATE-1-u2 Report

## Decision
Added guard in createMaterialInstance to refuse POST /materials/instances when lot is present without a source material ref (vendorProductRef, materialSpecRef, or materialRef). Returns typed 400 LOT_WITHOUT_SOURCE and writes zero records.

## Changed Files
1. server/src/api/handlers/MaterialLifecycleHandlers.ts (+7 lines guard)
2. server/src/api/handlers/MaterialLifecycle.lotref.test.ts (NEW, 100 lines, 3 tests)

## Test Results
- Unit tests: 3 passed (400+empty-store, zero records, 201 with valid ref)
- Regression: 9 passed (9)
- Mutation probe: guard confirmed effective
- Typecheck: clean

L2-LAB-INVENTORY-CREATE-1-u2 UNIT u2 DONE 7348fc683b0b6a5d3e54c15bf5c31d2715b7b5af
