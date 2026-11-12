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
- an OCR arm that produced text (no error-severity diagnostic) carries
  `LOCAL_OCR_REVIEW` (+ `details.page`), attached by this seam (duplicate caution
  diagnostics from the adapter are filtered so it is emitted once). A FAILED arm
  carries only its `IMAGE_OCR_*` error — it must never claim "Transcribed using
  local OCR" (adversarial c1 D2, fixed in dintakeu3-fix1).
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
- New files only: `server/src/ingestion/documentIntake.ts` (324 lines after the
  fix run), `server/src/ingestion/documentIntake.test.ts` (226 lines, 9 tests).
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
Per the brief I fixed the FIXTURE (page 1 is now 53 chars: "Section 1. Reagent
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

## Fix run — unit dintakeu3-fix1 (adversarial c1 verdict FIX 6)

Review: `.hermes/cl/lanes/2/reviews/L2-DOC-INTAKE-1-dintakeu3-advc-c1-l2t0040.md`.
Code+test commit: `1eb221b7aa19b75706cf15f01b587454ae94b18b`. Scope kept to
`documentIntake.ts`, `documentIntake.test.ts`, this report; `server/src/extract/**`
untouched (only imported from), no YAML edit, no `tsc`/dep change.

- D1 (pin gap) — new leg (e): injected `ocrPage` resolves `{text:'', diagnostics:[]}`;
  asserts the per-page `PDF_NO_TEXT_LAYER` warning (severity, `details.page`, message
  "OCR returned no text") and that the arm is not silent. Mutation M4 (block deleted)
  is now RED.
- D2 (false claim) — the `LOCAL_OCR_REVIEW` push is gated on the arm producing NO
  error-severity diagnostic; a failed arm keeps only its `IMAGE_OCR_*` error. New leg
  (f). Mutation M5 (unconditional push) RED.
- D3 (config ignored) — the OCR loop counts attempts and stops at
  `config.maxPages`; every untranscribed page is named in a `LOCAL_OCR_PAGE_LIMIT`
  coverage warning, mirroring `pdfAcquisition.ts:369`. New leg (g) (maxPages=1,
  3 text-less pages → `ocrPage` called once, warning names "page(s) 2, 3", only one
  caution). Mutation M10 (cap disabled) RED.
- D4 (duplicate policy list) — `PLAIN_TEXT_EXTENSIONS` deleted. `readableTextExtensions()`
  derives the set from the existing `loadDocumentFormats()` (decodeAttachment) reader:
  `mediaKind === 'text'` AND declared `mediaType` starts with `text/` → UTF-8 on disk.
  `docx`/`doc`/`rtf` are mediaKind text but not UTF-8, so they stay refused rather than
  decoded as mojibake. Effect declared: `.html`/`.htm` are now read (as raw text, markup
  not interpreted); `.tsv` — declared nowhere — is now `DOCUMENT_INTAKE_UNSUPPORTED_FORMAT`.
  New leg (h). Grep for a literal extension list in the module: no hits.
- D5 (marker) — this report now names the commit carrying it (see marker below; the
  marker-only follow-up commit exists because a commit cannot contain its own sha).
- D6 — 58 → 53 chars in this report and in the fixture comment (measured:
  `'Section 1. Reagent preparation: 10 g in 100 mL buffer'`).

RED (tests added, implementation unchanged):
```
 → expected [] to deeply equal [ { page: 1, …(2) } ]                    (h)
 → expected [ 'IMAGE_OCR_FAILED', …(2) ] to not include 'LOCAL_OCR_REVIEW'  (f)
 → the declared page cap is load-bearing: expected "spy" to be called 1 times, but got 3  (g)
 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
```
Leg (e) was already green before this run — D1 is a pin gap, so its RED is the mutation
probe below, not a failing-first assertion.

Mutation probes (worktree file, restored byte-identical, `cmp` = 0):
```
M4  delete the empty-OCR flag block   → Tests 1 failed | 8 passed (9)  (leg e)
M1  route all pages to OCR            → Tests 2 failed | 7 passed (9)  (legs a, d)
M5  caution pushed on a FAILED arm    → Tests 1 failed | 8 passed (9)  (leg f)
M10 ignore config.maxPages            → Tests 1 failed | 8 passed (9)  (leg g)
```
GREEN / verify:
```
cd server && npx vitest run src/ingestion/documentIntake.test.ts
 ✓ src/ingestion/documentIntake.test.ts  (9 tests) 79ms
 Test Files  1 passed (1)
      Tests  9 passed (9)

cd server && npx vitest run src/extract/PdfTextAdapter.test.ts src/extract/ImageTextAdapter.test.ts
 Test Files  2 passed (2) / Tests  22 passed (22)   (unchanged)

cd server && npx tsc --noEmit -p .
 TSC_EXIT=0 (no output)

git status --porcelain → clean at exit (code+test committed in 1eb221b7; report after)
```

L2-DOC-INTAKE-1 UNIT dintakeu3-fix1 DONE 1eb221b7aa19b75706cf15f01b587454ae94b18b
