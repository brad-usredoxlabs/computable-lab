# L2-DOC-INTAKE-1 Unit 1 Report

## Summary

Implemented `extractDocumentPages()` — a shared document-intake entry point that turns an uploaded PDF (or single-page image) into per-page text where every page carries the method that produced it, and every failure is a typed diagnostic instead of a thrown error or blank success.

## Changed Files

- `server/src/ingestion/documentIntake.ts` (190 lines) — entry point module
- `server/src/ingestion/documentIntake.test.ts` (296 lines) — 10 tests
- `server/vitest.config.mts` (49 lines) — vitest config for .ts/.js resolution and pdf-parse mock

## Design Decisions

1. **Composed, not forked**: Imports `extractPdfText` from PdfTextAdapter and `extractImageText` from ImageTextAdapter. No re-implementation of PDF parsing or OCR.
2. **Per-page method**: Each page gets its own `method` field (`'pdf_text'`, `'ocr'`, or `'failed'`). Not a document-level method like the old `service.ts:159` shape.
3. **Config path**: Re-exports `DOCUMENT_EXTRACTION_CONFIG_PATH` from DocxTextAdapter — one config reader, not a second.
4. **exactOptionalPropertyTypes**: Optional `diagnostics` field is absent (not `undefined`) when empty. Built conditionally.
5. **Never throws**: Outer try/catch catches unexpected errors; adapter-level diagnostics catch known failures. Parse failures return `PDF_PARSE_FAILED` diagnostic.
6. **No storage**: No `writeFile`, no `ArtifactBlobStore`, no storage calls.
7. **No hardcoded binaries**: Tool names come from config, not from TS literals.

## Mutation Probes

### Probe 1: Per-page method is load-bearing
Changed `buildPage` to return `'pdf_text'` for all pages (mimicking `service.ts:159` document-level shape):
- 4 tests failed: `Scanned PDF (no text layer)`, `Scanned PDF with missing OCR tool`, `Image media kind → single-page ocr`, `image with missing OCR tool → failed`
- All failures: `expected 'pdf_text' to be 'ocr'` or `expected 'pdf_text' to be 'failed'`
- **PIN IS LOAD-BEARING**

### Probe 2: Never-throws leg
Removed try/catch from `extractDocumentPages`:
- All 10 tests passed — because `extractPdfText` already catches parse errors internally
- The try/catch still protects against unexpected errors in the composition layer (e.g., image processing)
- Reverted to preserve the safety net

## Verification

- `npx vitest run server/src/ingestion/documentIntake.test.ts` → 10 passed (10)
- `npx vitest run server/src/extract/PdfTextAdapter.test.ts server/src/extract/ImageTextAdapter.test.ts` → 22 passed (22), 2 files passed (2)
- `npx tsc --noEmit` → zero errors
- `git status --short` → clean tree

## Acceptance Criteria Met

- [x] Per-page method assignment (PDF text layer → `'pdf_text'` per page)
- [x] Scanned PDF fallback to OCR per page with review caution
- [x] Missing OCR tool → typed diagnostic per page, not blank success
- [x] Unparsable PDF → `PDF_PARSE_FAILED` diagnostic, no throw
- [x] Image media kind → single-page OCR
- [x] exactOptionalPropertyTypes compliance (diagnostics absent, not undefined)
- [x] No storage writes
- [x] No hardcoded tool names
- [x] 22 existing adapter tests still pass unmodified

code_commit: 772cdcc454424345d29c4a575f5bf4c5c80c2d6c
report_commit: a2c49dff5129e60ddbc14e3cb7273de7be51c8a0

L2-DOC-INTAKE-1-u1rt UNIT 1 DONE 772cdcc454424345d29c4a575f5bf4c5c80c2d6c


---

> **SUPERSEDED CODE (architect, 2026-11-12).** This unit's `server/src/ingestion/documentIntake.ts`
> (232 lines) predates the trunk's 425-line module, which is a strict superset of its API
> (`extractDocumentPages` plus `intakeDocument`, blob identity, diagnostic codes and page methods,
> from 7529063c / c1c2179b / 1eb221b7 / c91999b7). The report is retained for the audit trail; the
> code from this branch was NOT merged, and must not be re-added. Resolution:
> lanes/2/decisions/2026-11-12-MERGE-RESOLUTION-docintake-and-seedlab.md
