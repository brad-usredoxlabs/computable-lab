# L2-DOC-INTAKE-1 / unit u4wire-fix1 — fix run (adversarial c1 defect)

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-u4wire-lane2 (branch cl/lane2-docintake-u4wire-0124)
Base SHA: 87976235. Lane 2. Scope: fix-1 of 1.

## Defect (adversarial c1, verdict FIX, MINOR)
The u4wire diff left the PDF arm of `extractTextPages` writing the upload under its raw
free-form `fileName` (`join(tempDir, upload.fileName || 'document.pdf')`, service.ts:228),
while the delegated seam `extractDocumentPages` (server/src/ingestion/documentIntake.ts:120)
decides purely on `extension !== '.pdf'`. A PDF uploaded as "spec" with
`mediaType: 'application/pdf'` therefore hit the PDF arm but the seam returned UNSUPPORTED and
the document recorded `extraction.method: 'failed'` — a real regression vs the base, which ran
pdfinfo/pdftotext. Both entry points accept free-form fileName (handlers pass request.body,
mcp tool takes `fileName: z.string()`).

## Fix (server/src/vendor-documents/service.ts)
1. `node:path` import extended with `basename` (join/extname already imported).
2. In the PDF arm the temp file is now normalized to always carry a `.pdf` suffix:
   `const tempBaseName = basename(upload.fileName || '');`
   `const tempFile = join(tempDir, (tempBaseName || 'document') + (extname(tempBaseName).toLowerCase() === '.pdf' ? '' : '.pdf'));`
   `basename()` keeps the original name as a basename and strips path separators before
   `join()`, so no traversal reaches the temp path.
3. Dispatch at :226 kept byte-identical: `if (mediaType === 'application/pdf' || extension === '.pdf') {`.
4. `server/src/ingestion/documentIntake.ts` NOT touched (prohibited).

## Test (server/src/vendor-documents/service.test.ts)
New case in `describe('pdf extraction delegates to the shared intake service')`, cloned from the
existing PDF tests via the `pdfUpload()` helper (:287) with `fileName: 'spec-sheet-no-suffix'`,
`mediaType: 'application/pdf'`, asserting `file_ref.page_count: 1` /
`extraction: { method: 'pdf_text', page_count: 1 }` and explicitly `method).not.toBe('failed')`.

## RED (commit 80714584) — actual vitest output
```
 ✓ src/ingestion/documentIntake.test.ts  (10 tests) 44ms
 ❯ src/vendor-documents/service.test.ts  (16 tests | 1 failed) 79ms
   ❯ src/vendor-documents/service.test.ts > pdf extraction delegates to the shared intake service > extracts a PDF whose fileName has no .pdf suffix when mediaType says application/pdf
     → expected { id: 'VDOC-MWD7ZO8U-2985D0', …(4) } to match object { file_ref: { page_count: 1 }, …(1) }

 FAIL  src/vendor-documents/service.test.ts > pdf extraction delegates to the shared intake service > extracts a PDF whose fileName has no .pdf suffix when mediaType says application/pdf
- Expected
+ Received
  Object {
    "extraction": Object {
-     "method": "pdf_text",
-     "page_count": 1,
+     "method": "failed",
    },
    "file_ref": Object {
-     "page_count": 1,
+     "file_name": "spec-sheet-no-suffix",
+     "media_type": "application/pdf",
+     "sha256": "b8568b12f6f330cce3e2eaaff829f5e3c8b10fff8f1be06bd474534ca49be1ee",
+     "size_bytes": 29,
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 25 passed (26)
```

## GREEN (commit 523db1a6) — actual vitest output
```
 ✓ src/ingestion/documentIntake.test.ts  (10 tests) 61ms
 ✓ src/vendor-documents/service.test.ts  (16 tests) 68ms
 Test Files  2 passed (2)
      Tests  26 passed (26)
```
Baseline at 87976235 was 25 passed (15 + 10); this run is 26 (16 + 10) — the one added case.
`cd server && npx tsc --noEmit -p .` → rc 0 (matches measured baseline).

## Mutation probe
Temporarily changed :226 to `if (extension === '.pdf') {` (deleted only the mediaType clause),
reran the targeted suite:
```
 FAIL  src/vendor-documents/service.test.ts > pdf extraction delegates to the shared intake service > extracts a PDF whose fileName has no .pdf suffix when mediaType says application/pdf
      Tests  1 failed | 25 passed (26)
```
Exactly the new case goes RED; no other test changes state. Mutation reverted with
`git checkout -- server/src/vendor-documents/service.ts`; `git diff` clean and :226 verified
byte-identical. Mutation was never committed.

## Commits (in order)
1. 80714584 RED test — suffixless fileName + application/pdf must still extract
2. 523db1a6 GREEN fix — normalize PDF temp filename so mediaType dispatch survives a suffixless fileName
3. this report

`git -c core.fileMode=false status --short` clean at exit. No blockers.

L2-DOC-INTAKE-1 UNIT u4wire-fix1 DONE 523db1a6cfc384fbf9ceff16cb8e99229b25cc1c
L2-DOC-INTAKE-1 DONE 523db1a6cfc384fbf9ceff16cb8e99229b25cc1c
L2-DOC-INTAKE-1-u4wire-fix1 UNIT unit DONE 523db1a6cfc384fbf9ceff16cb8e99229b25cc1c
