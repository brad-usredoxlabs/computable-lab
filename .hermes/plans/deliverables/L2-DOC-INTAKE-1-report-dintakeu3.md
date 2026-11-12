# L2-DOC-INTAKE-1 — unit 3 (dintakeu3) report

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-dintakeu3-lane2
Branch: cl/lane2-docintake-dintakeu3-0009 · base 7a9847fdda41a7b668dd8c28ecd5420ffa360e1c
Product commit: c91999b7d8368f0d2fb5e79ca213416d425eeda0

## Decision — shape of the seam
`extractDocumentPages(filePath, options?)` in `server/src/ingestion/documentIntake.ts`
returns `{ pages: [{page, text, method}], diagnostics, toolsAvailable }` where
`method` is `'pdf_text' | 'ocr' | 'plain_text'` and the decision is PER PAGE
(`page.text.trim().length > 0` → `pdf_text`, else the page is routed to OCR).
No `> 40` merged-length heuristic exists in the seam.

Composition, not a rewrite:
- text layer: per-page text via `pdf-parse` — the SAME library
  `PdfTextAdapter.extractPdfText()` wraps (the adapter only exposes merged text +
  page_count, so per-page text is read from the library directly; no adapter file
  was modified).
- OCR: config-declared tools only. `loadImageOcrConfig()` supplies
  `rasterizer`/`executable`/`dpi`/timeout from
  `config/ingestion/document-extraction.yaml`; each page is rasterized into a
  scratch dir and read via `extractImageText()` from `ImageTextAdapter`.
  No binary literal (tesseract/pdftotext/pdftoppm/pdfinfo) appears in the new
  file; the only `tesseract` string is the explanatory doc comment
  (`grep -nE "tesseract|pdftotext|pdftoppm|pdfinfo" server/src/ingestion/documentIntake.ts`
  → line 9, comment only).
- diagnostics: `PDF_DIAGNOSTIC_CODES`, `IMAGE_DIAGNOSTIC_CODES` and
  `LOCAL_OCR_REVIEW_MESSAGE` are imported from the adapters, never retyped.
- The seam owns exactly two codes of its own: `DOCUMENT_INTAKE_READ_FAILED`,
  `DOCUMENT_INTAKE_UNSUPPORTED_FORMAT`.

Honesty rules implemented:
- never throws — the whole body is wrapped; every failure arm returns a typed
  diagnostic (verified by the missing-file test and by `await expect(...).resolves`).
- an OCR success always carries `LOCAL_OCR_REVIEW` (+ `details.page`), attached by
  this seam (duplicate caution diagnostics from the adapter are filtered so it is
  emitted once).
- an OCR result with empty text adds `PDF_NO_TEXT_LAYER` for that page — a blank
  page is never a silent success.
- unresolvable OCR tools → `IMAGE_OCR_TOOL_MISSING` error, OCR seam not invoked,
  `toolsAvailable` reports per-tool booleans keyed by the config-declared names.
- `exactOptionalPropertyTypes`: optional result fields are built by conditional
  spread / omitted; no `undefined` assignment.

No `config/extraction/document-intake.yaml` was added — the existing declared
source (`config/ingestion/document-extraction.yaml` `images:` block consumed by
`loadImageOcrConfig`) already names every OCR tool, so a new YAML + second config
reader would have been a defect. (YAML reload note: not applicable, no YAML edit.)

## Scope / invariants
- New files only: `server/src/ingestion/documentIntake.ts` (280 lines),
  `server/src/ingestion/documentIntake.test.ts` (146 lines, 5 tests).
- `server/src/extract/**`, `server/src/vendor-documents/service.ts`,
  `server/src/vendor-documents/pdfAcquisition.ts`, `server/src/server.ts`,
  `server/src/api/**`, `app/**`, `schema/**`, `records/**`, root `config.yaml`:
  untouched (git status shows only the two new files).
- No consumer wired (that is the next unit); no route, no DI.

## RED → GREEN evidence
RED (before implementation):
```
FAIL  src/ingestion/documentIntake.test.ts [ src/ingestion/documentIntake.test.ts ]
Error: Failed to load url ./documentIntake.js (resolved id: ./documentIntake.js) ...
 Test Files  1 failed (1)
      Tests  no tests
```
GREEN (targeted, only this file):
```
 ✓ src/ingestion/documentIntake.test.ts  (5 tests) 11ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Mutation probe (pin d is load-bearing)
Mutation applied exactly as briefed — the ported whole-document rule inserted
after the text-layer read:
```ts
const mergedTextLength = textOutcome.pages.reduce((sum, page) => sum + page.text.trim().length, 0);
if (mergedTextLength > 40) {
  return { pages: textOutcome.pages.map((page) => ({ page: page.page, text: page.text, method: 'pdf_text' as const })), diagnostics, toolsAvailable };
}
```
RAW failing summary:
```
 ❯ src/ingestion/documentIntake.test.ts  (5 tests | 1 failed) 21ms
   ❯ src/ingestion/documentIntake.test.ts > extractDocumentPages > (d) decides per page: text page 1 + empty page 2 returns [pdf_text, ocr]
     → expected [ 'pdf_text', 'pdf_text' ] to deeply equal [ 'pdf_text', 'ocr' ]

 FAIL  src/ingestion/documentIntake.test.ts > extractDocumentPages > (d) decides per page: text page 1 + empty page 2 returns [pdf_text, ocr]
AssertionError: expected [ 'pdf_text', 'pdf_text' ] to deeply equal [ 'pdf_text', 'ocr' ]
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```
First probe run stayed GREEN because the page-1 fixture was only 30 chars (< 40).
Per the brief I fixed the FIXTURE (page 1 is now 58 chars: "Section 1. Reagent
preparation: 10 g in 100 mL buffer"), not the assertion wording; the re-run then
failed as pasted above. Mutation reverted before the commit; `git status --short`
at exit shows only the two new (committed) files.

## Verification commands / results
```
cd server && npx vitest run src/ingestion/documentIntake.test.ts
 → Test Files 1 passed (1) / Tests 5 passed (5), 819ms

cd server && npx vitest run src/extract/PdfTextAdapter.test.ts src/extract/ImageTextAdapter.test.ts
 → ✓ ImageTextAdapter.test.ts (8 tests) · ✓ PdfTextAdapter.test.ts (14 tests)
   Test Files 2 passed (2) / Tests 22 passed (22), 1.01s   (baseline unchanged)

cd server && npx tsc --noEmit -p .
 → exit 0, no output (0 error lines)

git -c core.fileMode=false status --short
 → clean at exit (product paths committed; only node_modules symlinks, which are gitignored)
```

## Environment note
The fresh worktree had no `node_modules`; the launcher had not provisioned it. No
dependency install was run. `node_modules` and `server/node_modules` were symlinked
to the existing sibling checkout `/home/brad/cl-wt/L2-DOC-INTAKE-1-u1-lane2/...`
(gitignored, not committed). Remove the two symlinks if a clean tree is preferred.

## Next actions
- Next unit: wire `vendor-documents/service.ts` (replace private `extractPdfPages`,
  remove the `> 40` heuristic) and the labware/noun callers to this seam.
- Reviewer focus: per-page pin (d) fixture (>40 chars on the text page), imported
  caution, `exactOptionalPropertyTypes` spreads, no binary literals.

L2-DOC-INTAKE-1 UNIT 3 DONE c91999b7d8368f0d2fb5e79ca213416d425eeda0
