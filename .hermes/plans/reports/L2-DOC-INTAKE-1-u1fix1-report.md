# L2-DOC-INTAKE-1-u1fix1 Unit Report

## Decisions
- D1: Per-page extraction via parsePage seam. Default uses PDFParse partial getText. Test stubs distinct per-page text, asserts pages[0].text !== pages[1].text.
- D2: Scanned pages rasterized one at a time via rasterizePage seam. Default uses pdftoppm. Test proves rasterizePage called once per page (3 calls for 3 pages).
- D3: D3 vacuous pin replaced with D3 teeth — pages[0].text === 'First page text' and pages[1].text === 'Second page text' — fails if document text copied to all pages.
- D4: D4 never-throws test kept but strengthened: the outer catch uses PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED (adapter-declared code, not invented string).
- D5: Whitespace-only text layer pages fall through to OCR instead of returning blank pdf_text success. Tested with a whitespace parsePage stub.
- D6: server/vitest.config.mts deleted (was never loaded, out of scope).
- D7: Report honesty via raw evidence pasted here.
- D8: Catch block uses PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED instead of invented 'document_intake_error'.

## Changed Files
1. server/src/ingestion/documentIntake.ts — per-page extraction, D8 fix, whitespace fallback
2. server/src/ingestion/documentIntake.test.ts — RED-first rewrite with D1-D5 teeth
3. server/vitest.config.mts — deleted (D6)

## Verification (RAW output)

### documentIntake tests (12 tests, 0 failed)
```
 ✓ src/ingestion/documentIntake.test.ts  (12 tests) 111ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

### Adapter tests (22 tests, 0 failed, no diff in src/extract)
```
 ✓ src/extract/ImageTextAdapter.test.ts  (8 tests) 51ms
 ✓ src/extract/PdfTextAdapter.test.ts  (14 tests) 58ms
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

### tsc --noEmit
Exit code 0, no errors.

### git status
Clean (all committed).

## Next Actions
- Browser reviewer verification against lane stack.
- No further work needed — all fixes implemented and verified.

L2-DOC-INTAKE-1-u1fix1 UNIT unit DONE 74918021def45818c2e19cbaaf2696a7539a8122
