# L2-SPEC-SHEET-INGEST-1 / Unit uD1door — Report

## Summary
Implemented the spec-sheet door: vendor-builder now calls the SHARED engine
(POST /ingestion/spec-sheet/extract) and renders proposals read-only with
citation (sourceUrl + passage).

## Changed Files
1. app/src/shared/api/client.ts — Added SpecSheetExtractResult discriminated union types and extractSpecSheetProposals method
2. app/src/editor/material/VendorProductBuilderModal.tsx — Added "Extract Spec Sheet" button and results rendering
3. app/src/editor/material/VendorProductBuilderModal.specSheetDoor.test.tsx — NEW, 4 tests

## Decisions
- Reused existing htmlSourceUrl state (line 114) rather than adding a second URL input
- No apply-to-form affordance — proposals are display-only per scope
- Rendered targetField verbatim (no humanising switchboard)
- Used "'blocked' in" type guard for discriminated union narrowing
- Followed existing test harness pattern (spy on apiClient, vi.restoreAllMocks)

## MUTATION PROBE
Skipped — not required for this unit (rendered behaviour from rendered test).

## Verification

### Tests (raw output)
```
✓ src/editor/material/VendorProductBuilderModal.idempotence.test.tsx  (2 tests) 187ms
✓ src/editor/material/VendorProductBuilderModal.defaultPolicy.test.tsx  (4 tests) 200ms
✓ src/editor/material/VendorProductBuilderModal.specSheetDoor.test.tsx  (4 tests) 217ms

Test Files  3 passed (3)
     Tests  10 passed (10)
```

### Typecheck
cd app && npx tsc --noEmit -p . → exit 0, zero output lines

## Next Actions
None — unit complete.

L2-SPEC-SHEET-INGEST-1 UNIT uD1door DONE 461a29e9b1aed7485cc12a751ee57c020bdf1da2
