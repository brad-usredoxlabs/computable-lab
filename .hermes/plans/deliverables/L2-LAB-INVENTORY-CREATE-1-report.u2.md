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

L2-LAB-INVENTORY-CREATE-1-u2 UNIT u2 DONE f93b6bae13a2477b2d28ed11aed4ce91bb08f8de
