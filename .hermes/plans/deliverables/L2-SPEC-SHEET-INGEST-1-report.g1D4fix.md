# L2-SPEC-SHEET-INGEST-1 — g1D4 capacity fix report

Unit: uD4capacityfix
Lane: 2
Worktree: /home/brad/cl-wt/L2-SPECSHEET-uD4capacity-lane2
Branch: cl/lane2-specsheet-uD4capacity-1110
Base: 8d14f110

## Defects and fixes

### Defect 1 (MAJOR) — Vendor half unfixed on real receipt line
File: server/src/ingestion/SpecSheetExtractor.ts:113-126 (segmentLine)
Problem: Real receipt line has colon-less segments like "Manufacturer | OEM/ODM Supplier | ..."
segmentLine discarded segments without colons, and the whole-line fallback re-ran extractValue
which returned a blob identical to base — vendor extraction was byte-identical to pre-fix.
Fix: segmentLine now treats colon-less segments as both label and value (lines 122-124),
so "Manufacturer" matches the "Manufacturer" keyword via includes().
Pinned by: test "extracts vendor from pipe-separated colon-less segment (real receipt pattern)"
which asserts vendor value is exactly "Manufacturer", not containing "OEM".

### Defect 2 (MAJOR) — | pipe missing from sepRe
File: server/src/ingestion/SpecSheetExtractor.ts:115 (sepRe)
Problem: Comment on line 114 names | as a separator but sepRe regex did not include it.
Lines with pipe separators like "Vendor: Acme | Reservoir Capacity: 25 mL" were not split,
producing a fabricated whole-line blob.
Fix: Added \| to sepRe (line 115: /\s*(?:◉|\|)\s*/).
Pinned by: test "splits pipe-separated multi-field line (mutation check for pipe separator)"
which asserts vendor is "Acme" (not containing "Reservoir") and capacity is "25 mL" (not containing "Acme").
Mutation check: removing | from sepRe turns 2 tests RED (confirmed).

### Defect 3 (MAJOR) — Truncation regression on values with ·/•/;
File: server/src/ingestion/SpecSheetExtractor.ts:115 (sepRe)
Problem: sepRe included · (U+00B7), • (U+2022), ; — these are punctuation inside legitimate
values, not field boundaries. "Acme·Corp" truncated to "Acme", "AB-123; AB-124" truncated to "AB-123".
Fix: Removed ·, •, ; from sepRe. Only ◉ and | remain as reliable field separators.
Pinned by: test "does not truncate values containing middle-dot, bullet, or semicolon"
which asserts "Acme·Corp" and "Model A; Model B" are returned intact.

### Defect 4 (MINOR) — Vacuous capacity assertions
File: server/src/ingestion/SpecSheetExtractor.test.ts:185-186
Problem: Capacity assertions used toContain('195') and toContain('mL') — these values were
already present in the pre-fix blob, so the test passed even when capacity extraction was broken.
Fix: Changed to exact match: expect(capacities[0].value).toBe('195 mL, 185 mL').

## Verification
- Tests: 10/10 passed (was 7/7 before, now covers all 4 defects)
- TypeScript: 0 errors (npx tsc --noEmit -p . in server/)
- Mutation check: removing | from sepRe turns 2 tests RED (defects 1+2 pinned)

## Changed files
1. server/src/ingestion/SpecSheetExtractor.ts (lines 113-127, 150)
2. server/src/ingestion/SpecSheetExtractor.test.ts (lines 158-276)

DONE 4e96dc19b765a246427152b4f246486e6e2a970a

L2-SPECSHEET-ud4capacityfix UNIT DONE 4e96dc19b765a246427152b4f246486e6e2a970a
