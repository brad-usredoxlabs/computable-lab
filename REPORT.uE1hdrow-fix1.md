# REPORT - L2-SPECSHEET-uE1hdrow-fix1

## Diagnosis
The `isHeaderRow()` guard (commit 6b6394c3) correctly skips header rows like
"Catalog Number | Quantity", but also dropped data rows like "25200056 | 100 mL"
because those data segments contain no keywords. The data row was processed but
no keyword matched in any segment label, and extractValue returned null because
there is no colon on the line.

## Fix
Added a pre-scan pass that records which column positions contain each mapping's
keywords from detected header rows. Data rows with the same segment count are
then extracted by column position instead of requiring keyword matches.

## Changed Files (1)
- server/src/ingestion/SpecSheetExtractor.ts (+41, -7)

## Verification
- Tests: `cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts`
  Result: Tests 13 passed (13)
- Typecheck: `cd server && npx tsc --noEmit`
  Result: 0 errors

## Fix Commit
8480a4af

L2-SPECSHEET-uE1hdrowfix UNIT unit DONE 517bf758
