# L2-SPEC-SHEET-INGEST-1 — unit uD5formpw (VERIFY-AND-CLOSE)

## Provenance

The product change closed by this unit was NOT written by this run. It arrived as launcher
auto-commit 2f015bbb ("WIP AT EXIT ... NOT gated") from the silent-exited uD5form coder run. The
closeout-audit script recorded `ESCALATE L2-SPEC-SHEET-INGEST-1-uD5form consec=1 ok=0 coder_commits=0
wip_head=true` with the reason "HEAD is only a launcher WIP commit; the coder delivered nothing
gradable". However, the WIP commit is NOT empty: `git diff --stat 7911a295..HEAD` shows exactly
three changed paths (YAML +1/-1, new test file +110, SpecSheetExtractor.ts +18/-4) and all 16
tests pass. This unit verified the fix rather than re-implementing it, and produces only this report
plus a DONE marker — zero product lines committed.

## Anchored-match defect and fix

Browser gate g1 finding D5 measured the vendor-product door against
`thermofisher.com/order/catalog/product/25200056`: `formulation` returned a ~700-char prose blob and
`catalog_number` was never proposed despite `Catalog: 25200056` on the page. Root cause: the engine
used a bare substring test (`includes`) instead of anchored matching.

Fix — two anchors:
- `server/src/ingestion/SpecSheetExtractor.ts:119` — `return labelNorm.startsWith(kwNorm);`
- `schema/ingestion/spec-sheet.vendor-product.yaml:27` — adds "Catalog" to the source keywords

YAML diff (one removed line, one added line):

```diff
-        source: "Catalog number / Product number from the sheet"
+        source: "Catalog / Catalog number / Product number from the sheet"
```

## Test results (baseline, 16/16)

```
RUN  v1.6.1 /home/brad/cl-wt/L2-SPECSHEET-uD5form-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests) 12ms
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (12 tests) 16ms

 Test Files  2 passed (2)
      Tests  16 passed (16)
   Start at  16:49:07
   Duration  483ms (transform 68ms, setup 0ms, collect 122ms, tests 28ms, environment 0ms, prepare 179ms)
```

## Mutation probe

Edit applied: `SpecSheetExtractor.ts:119` changed from `return labelNorm.startsWith(kwNorm);` to
`return labelNorm.includes(kwNorm);` (nothing else).

RED summary (1 of 4 tests failed — the prose-blob/formulation case at :20/:35):

```
RUN  v1.6.1 /home/brad/cl-wt/L2-SPECSHEET-uD5form-lane2/server

 ❯ src/ingestion/SpecSheetExtractor.labelMatch.test.ts  (4 tests | 1 failed) 15ms
   ❯ ... > rejects prose blob for formulation and extracts catalog_number from "Catalog: 25200056"
     → expected [ Array(1) ] to have a length of +0 but got 1

 FAIL  ... > uD5form — anchored label matching > rejects prose blob ...
AssertionError: expected [ Array(1) ] to have a length of +0 but got 1
 ❯ src/ingestion/SpecSheetExtractor.labelMatch.test.ts:35:30

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

The mutation is non-vacuous: reverting to `includes` causes the prose-blob test to fail at :35,
proving the anchoring fix is the sole reason the test passes.

Restore proof — `git -c core.fileMode=false diff --stat` prints nothing for SpecSheetExtractor.ts,
and the post-restore run is GREEN (4 passed).

## What this unit did NOT do

No merge, no adversarial review, no browser gate, no stack restart, no product change committed.
