# L2-DOC-INTAKE-1 — unit u4wire (PDF arm delegates to the shared intake seam)

Branch: cl/lane2-docintake-u4wire-0124 (base 87848321, trunk cl/integration-2; the
brief's named base c13c1297 is a diverging child of 143ad214 with an IDENTICAL
tree for server/src/vendor-documents/ and server/src/ingestion/ — verified with
`git diff --stat c13c1297 HEAD -- server/src/vendor-documents/ server/src/ingestion/` => empty).

## What changed (2 files, 159 insertions / 33 deletions)
- `server/src/vendor-documents/service.ts`
  - `buildVendorDocumentExtraction(upload, options: DocumentIntakeOptions = {})`
    -> `extractTextPages(upload, options)` -> `extractPdfPages(tempFile, options)`
    -> `extractDocumentPages(tempFile, options)`. Existing callers
    (attachVendorDocumentExtraction, ProtocolIdeSourceImportService) compile unchanged.
  - `extractPdfPages` body replaced by delegation + mapping onto the existing
    consumer contract: `pages` from `result.pages` (pageNumber/text),
    `method` = 'failed' when no pages, 'ocr' when any page.method === 'ocr',
    else 'pdf_text'; `ocrAttempted` = any page.method === 'ocr';
    `ocrAvailable` = toolsAvailable non-empty AND every value true.
  - Deleted: `mergedTextLength > 40` whole-document heuristic, the in-arm
    pdftoppm/tesseract shelling, and its commandAvailable('tesseract'/'pdftoppm')
    probes. KEPT `commandAvailable` (image + plain-text arms use it, unchanged).
  - `readPageTexts` is injected as a LOCAL `pdftotext -layout` per-page reader
    (page count still from `pdfinfo`). Deliberate: `buildDraftItems` parses
    composition TABLE COLUMNS and `-layout` preserves them; the shared default
    (pdf-parse) does not. Changing the text engine is a separate, measurable
    decision — NOT this unit. OPEN QUESTION for the architect: should the
    vendor-product PDF text layer switch to pdf-parse (the shared default) once
    a table-shape test exists?
- `server/src/vendor-documents/service.test.ts`
  - Existing 13 tests untouched. +2 pins in
    `describe('pdf extraction delegates to the shared intake service')`:
    (a) page 1 long text + page 2 empty -> method 'ocr', ocr_attempted true,
        page_count 2, HEPES item with source_page 2 in the draft, injected
        ocrPage called EXACTLY ONCE with page 2;
    (b) both pages have text -> method 'pdf_text', ocr_attempted false,
        ocrPage never called.
  - No PDF fixture; upload bytes are deliberately not a PDF (the injected
    `readPageTexts` means `extractDocumentPages` never parses the file).

## Declared behavioural narrowing (one sentence)
`extraction.ocr_available` now means "was OCR required AND available for this
document" instead of "is tesseract installed on the host" — a text-layer-only
PDF records `ocr_available: false` because no probe runs (pinned by test (b)).
No record field was added or renamed; `buildDraftItems`, `buildHtmlCompositionDrafts`,
the HTML/image/plain-text arms and `attachVendorDocumentExtraction`'s payload
shape are unchanged.

## RED
`npx vitest run src/vendor-documents/service.test.ts` before the service change:
2 failed | 13 passed (15) — both new pins failed because the old arm ignores the
options and shells `pdftotext` on the non-PDF bytes.

## GREEN (targeted, post-change)
```
cd server && npx vitest run src/vendor-documents/service.test.ts src/ingestion/documentIntake.test.ts
 Test Files  2 passed (2)
      Tests  25 passed (25)
```
documentIntake.test.ts stayed at 10 tests (prohibited file untouched).

## Typecheck
`cd server && npx tsc --noEmit -p .` -> exit 0, zero error lines (single run).

## Mutation probe
A) Brief-specified verbatim restore of the old body (base file from
   `git show c13c1297:...` pasted over `extractPdfPages` keeping the new
   signature): service.test.ts => `Tests 2 failed | 13 passed (15)`. RAW failure
   shape: `Error: Command failed: pdftotext -layout -f 1 -l 1
   /tmp/vendor-doc-pdf-*/formulation.pdf -` ("Couldn't read xref table") — the
   old body ignores the injected reader, so this variant proves only that the
   seam is bypassed, not the heuristic itself.

B) Sharper, load-bearing probe: keep the delegation but restore the
   `mergedTextLength > 40` gate in the mapping (the reviewer-bait #1 shortcut).
   service.test.ts pin (a) fails RAW with:
   `extraction: { method: 'pdf_text', ocr_attempted: false, ocr_available: false }`
   (expected method 'ocr'). Direct instrumented run of the same fixture under
   mutation B printed: `ocrPage calls = 0` and
   `{"method":"pdf_text","page_count":2,"ocr_attempted":false,"ocr_available":false,...}`
   i.e. the blank page 2 is presented as a pdf_text success — exactly the defect
   this unit removes. Fixture page 1 is 104 chars, well past the 40-char gate.

Reverted both mutations; scratch (`/home/brad/.docintake-scratch`) deleted.
`git -c core.fileMode=false status --short` after revert: clean.

## Environment note
The worktree had no node_modules. Following the existing sibling-worktree
convention (L2-DOC-INTAKE-1-u1-lane2, L2-DOCINTAKE-dintakeu3-lane2), I added
untracked, gitignored `node_modules` symlinks to that local checkout's
node_modules. No install, no scaffold, no tracked file touched.

## Scope
Only the two owned files were modified. `pdfAcquisition.ts`, `extract/**`,
`ArtifactBlobStore.ts`, `api/**`, `server.ts`, `sequences/**`, `app/**`,
`schema/**`, `records/**`, `config.yaml` untouched. No YAML added; NO claim of
live :3093 behaviour — the lane stack must be reloaded by the orchestrator
before any browser receipt.

## Verification commands
- `cd server && npx vitest run src/vendor-documents/service.test.ts src/ingestion/documentIntake.test.ts`
- `cd server && npx tsc --noEmit -p .`
- `git -c core.fileMode=false status --short`
