# L2-SPEC-SHEET-INGEST-1 — unit uD5formpw (VERIFY-AND-CLOSE)

## Provenance

This unit did NOT write any product code. The fix arrived as a launcher auto-commit
(2f015bbb92b571f7ca58f01293d78d66b62fa03b — "WIP AT EXIT") from the prior silent-exited
uD5form run. The `closeout-audit` script recorded `coder_commits=0` and flagged the unit
as `ESCALATE` ("HEAD is only a launcher WIP commit; the coder delivered nothing gradable").
However, the WIP commit contains a real, working fix (3 files changed, 126 insertions, 4
deletions) that passes all tests. This unit verified that fix rather than re-implementing
it, and produces only this report plus a DONE marker — zero product lines committed.

## Anchored-match defect and fix

The defect (browser gate g1, finding D5) occurred when the SpecSheetExtractor matched
keywords using bare substring matching (`includes`). Against the Thermofisher page for
catalog `25200056`, the word "formulation" appeared mid-sentence in a ~700-character prose
blob, causing the engine to extract that entire blob as the `formulation` value. Meanwhile,
the explicit line `Catalog: 25200056` was never proposed as `catalog_number` because the
YAML source keyword list lacked the label `Catalog`.

The fix has two anchors:
- `SpecSheetExtractor.ts:119` — `return labelNorm.startsWith(kwNorm);` (anchored matching)
- `spec-sheet.vendor-product.yaml:27` — added `Catalog` to the source keyword list:

```diff
-        source: "Catalog number / Product number from the sheet"
+        source: "Catalog / Catalog number / Product number from the sheet"
```

## Test results — baseline (16/16)

```
RUN  v1.6.1 /home/brad/cl-wt/L2-SPECSHEET-uD5form-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 11ms
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (12 tests) 19ms

 Test Files  2 passed (2)
      Tests  16 passed (16)
   Start at  16:50:36
   Duration  502ms (transform 65ms, setup 0ms, collect 118ms, tests 30ms, environment 0ms, prepare 138ms)
```

## Mutation probe

Edit: changed line 119 from `return labelNorm.startsWith(kwNorm);` to
`return labelNorm.includes(kwNorm);` (nothing else).

Result — RED (1 failed of 4):

```
RUN  v1.6.1 /home/brad/cl-wt/L2-SPECSHEET-uD5form-lane2/server

 ❯ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests | 1 failed) 15ms
   ❯ src/ingestion/SpecSheetExtractor.labelMatch.test.ts > uD5form — anchored label matching > rejects prose blob for formulation and extracts catalog_number from "Catalog: 25200056"
     -> expected [ Array(1) ] to have a length of +0 but got 1

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  16:32:52
   Duration  458ms
```

The failure at :20/:35 proves the prose-blob rejection depends on anchored matching.
The pin is non-vacuous.

Restore proof — line restored to `startsWith`. Post-restore run: 4/4 passed.
`git -c core.fileMode=false diff --stat -- server/src/ingestion/SpecSheetExtractor.ts`
prints nothing (empty output).

## What this unit did NOT do

No merge, no adversarial review, no browser gate, no stack restart, no product change
committed. Only this report file and a DONE marker were added.

L2-SPEC-SHEET-INGEST-1-uD5form UNIT uD5formpw DONE f0bd2c5cb4a204550d9c7cc7d2863e9d7836a2d7
