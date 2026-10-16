# HANDOFF — QMS7-9 upload affordance: coder complete (lane 1, l1t0310)

Date: 2026-10-16. Branch wt/QMS7-9-lane1-l1t0310 @ 7a7fe831 (base a584770c).
Full report + raw evidence paths: /home/brad/.hermes/cl/lanes/1/qms7-9-report-l1t0310.md

## What landed (3 commits)

- c5e3529d RED (5 intentional fails named in message)
- 4f5b4858 impl: VendorPdfSearchSection gains STANDALONE-only "Upload a
  document" button + hidden picker (peer of search, reuses
  vendor-pdf-search__submit class); runUpload -> uploadGraphLemurVendorPdf
  {fileName, contentBase64, query?/studyId?} no url; onIngested fires with
  response-shaped info (sourceUrl '' for uploads); 415 UNSUPPORTED_DOCUMENT
  surfaces verbatim, no onIngested; DOCUMENT_ACCEPT const shared by BOTH
  pickers (old :310 literal gone).
- 7a7fe831 mount assertion in VendorPdfWorkflowTab.test.tsx.

## Verification (all bars met)

- Targeted vitest 19/19 green (RED was 5 failed | 14 passed).
- app tsc: 23 errors, multiset pin 723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb byte-exact (recipe: strip (line,col) then sort+sha256); zero errors in touched files.
- search+ingestion suites: comm-proven zero new fails (base 7 fails incl. my 5 RED; tip 2 fails = pre-existing VendorPdfReviewPage.treeSelect trunk drift only).
- Diff == ownership list only (3 files). No HARD OUT, no server change, no CSS change.

## For the orchestrator

1. Discriminator note: spec OQ2's "onBuildProtocol absent" contradicts trunk
   (WorkflowTab PASSES onBuildProtocol; AddSourceModal does not). Implemented
   the intent via studyId-absence gate (verified call sites; T1b pins AI-tab
   shape renders no upload). One-line flip available if the literal gate is
   demanded — but it would invert the item intent.
2. Browser gate next: cl-browser-reviewer on :5192/ingestion/vendor-pdf per
   task-list verified-by criteria; receipts /home/brad/.hermes/cl/receipts/QMS7-9/<ts>/.
3. Flagged trunk drift (not mine): 2 pre-existing fails in
   src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx ride base.
