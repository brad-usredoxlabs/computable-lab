# L2-VACUOUS-PINS-DEBT — Unit uD2pin Report

## Summary
Pin the client's spec-sheet door route with a test that executes `apiClient.extractSpecSheetProposals` against a mocked fetch and asserts the outbound URL suffix.

## Changed Files
- `app/src/shared/api/client.specSheetDoorRoute.test.ts` (NEW, 92 lines) — committed

## GREEN Test Results
```
cd app && npx vitest run src/shared/api/client.specSheetDoorRoute.test.ts

 ✓ src/shared/api/client.specSheetDoorRoute.test.ts  (2 tests) 3ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Mutation Probe — RED verification
Scratch edit applied: `app/src/shared/api/client.ts:3066`, changed
`'/ingestion/spec-sheet/extract'` to `'/ingestion/spec-sheet/extract-x'`.

```
cd app && npx vitest run src/shared/api/client.specSheetDoorRoute.test.ts

 ❯ src/shared/api/client.specSheetDoorRoute.test.ts  (2 tests | 1 failed) 6ms
   ❯ ... > POSTs /ingestion/spec-sheet/extract with the {url, recordKind} body
     → expected '/api/ingestion/spec-sheet/extract-x' to match /\\/ingestion\\/spec-sheet\\/ex...

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Mutation reverted byte-for-byte. The pin is effective — route drift causes RED.

## Reverted Status (after restoring literal)
```
git -c core.fileMode=false status --short
?? app/node_modules
```
Only the new untracked test file (node_modules is pre-existing). No modified production files.

## Verbatim Mutation Statement
File: `app/src/shared/api/client.ts`, line 3066
Before: `    return request<SpecSheetExtractResult>('/ingestion/spec-sheet/extract', {`
After:  `    return request<SpecSheetExtractResult>('/ingestion/spec-sheet/extract-x', {`
Then restored to original.

## Neighbor Regression
```
cd app && npx vitest run src/editor/material/VendorProductBuilderModal.specSheetDoor.test.tsx
 ✓ src/editor/material/VendorProductBuilderModal.specSheetDoor.test.tsx  (4 tests) 285ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Typecheck
`tsc --noEmit -p .` — pre-existing errors only (missing type declarations for ajv, yaml, prosemirror-view). No new errors from this test file.

## Exit marker:
L2-VACUOUS-PINS-uD2pin UNIT unit DONE bf40d989460f0fcf04df49d1c3c540dcac0be8c2
