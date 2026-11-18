# L2-DOC-INTAKE-1 / unit g1pagemethod — report

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-g1pagemethod-lane2
Branch: cl/lane2-docintake-g1pagemethod-0327
Base: 1dc9db1a5128153b1daea6cb10b4d6a201a6f155 (verified: `git rev-parse HEAD` == base,
`git status --short` empty at start)
Commits:
- 561a6510 test(vendor-documents): pin per-page extraction method (RED)
- 14552a15 feat(vendor-documents): record and render per-page extraction method

## What changed (5 owned files across 2 commits; product commit 39 insertions / 4 deletions across 4 product files)

1. `server/src/vendor-documents/service.ts` — `ExtractedPage` gains
   `method: DocumentPageMethod` (imported from the seam's own union in
   `../ingestion/documentIntake.js`; no new vocabulary). Propagated at the three
   construction sites (`result.pages.map` → `page.method`; text arm → `'plain_text'`;
   image/OCR arm → `'ocr'`), and the record's `extraction` now emits
   `pages: [{ page_number, method }]` behind the same
   `extraction.pages.length > 0` conditional-spread idiom used by `page_count`.
   Document-level `method` derivation (:199) and `ocr_attempted`/`ocr_available`
   are byte-identical to base; html arm untouched (emits no `pages`).
2. `schema/lab/vendor-product.schema.yaml` — one new `pages` array property under
   `extraction` (items: object, `additionalProperties: false`,
   `required: [page_number, method]`, `page_number` integer min 1, `method` enum
   copied byte-identical from the document-level enum at :114). No other key
   reordered or touched; `page_count` unchanged.
3. `server/src/vendor-documents/service.test.ts` — ONE new test in the existing
   `describe('pdf extraction delegates to the shared intake service')` block,
   reusing `pdfUpload()`, the two-page `readPageTexts` fixture and the `ocrPage`
   mock (same fixture as the existing `method: 'ocr'` test). No existing test edited.
4. `app/src/types/material.ts` — `extraction.pages?: Array<{ pageNumber; method: 'plain_text' | 'pdf_text' | 'ocr' }>`;
   parser maps `entry.extraction.pages` per element, dropping only malformed
   elements (`flatMap`), and emits the key only when the mapped array is non-empty.
5. `app/src/editor/material/VendorProductBuilderModal.tsx` — attachment row appends
   ` · pages 1 pdf_text, 2 ocr` after the existing `N pages` segment, only when
   `document.extraction?.pages?.length`. Pure render, no new state/fetch.

## RED (before product change)

`cd server && npx vitest run src/vendor-documents/service.test.ts`

```
 ❯ src/vendor-documents/service.test.ts  (17 tests | 1 failed) 52ms
   ❯ ... > records the extraction method per page, not only for the document
     → expected undefined to deeply equal [ { page_number: 1, …(1) }, …(1) ]

 FAIL  ... > records the extraction method per page, not only for the document
AssertionError: expected undefined to deeply equal [ { page_number: 1, …(1) }, …(1) ]

- Expected:
Array [
  Object { "method": "pdf_text", "page_number": 1 },
  Object { "method": "ocr", "page_number": 2 },
]
+ Received:
undefined

 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

## MUTATION PROBE (deleted only the `pages:` spread in the `extraction` object)

`cd server && npx vitest run src/vendor-documents/service.test.ts`

```
 ❯ src/vendor-documents/service.test.ts  (17 tests | 1 failed) 54ms
   ❯ ... > records the extraction method per page, not only for the document
     → expected undefined to deeply equal [ { page_number: 1, …(1) }, …(1) ]

 FAIL  ... > records the extraction method per page, not only for the document
AssertionError: expected undefined to deeply equal [ { page_number: 1, …(1) }, …(1) ]

 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```
(the single failure is the new pin: `expected undefined to deeply equal [...]`;
the other 16, including the three pre-existing PDF pins, stayed green).

Reverted the mutation. Proof the product line is back:
`git -c core.fileMode=false status --short` after revert showed only the four
intended product/test paths (test path already committed as RED), and the final
commit 14552a15 contains the `pages:` spread again (see `git diff` in commit).

## GREEN (final state)

`cd server && npx vitest run src/vendor-documents/service.test.ts`

```
 ✓ src/vendor-documents/service.test.ts  (17 tests) 52ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  03:47:37
   Duration  734ms
```

## TYPECHECKS (baseline 0 error lines at 1dc9db1a)

`cd server && npx tsc --noEmit` → no output, exit 0 (`SERVER_TSC_EXIT=0`)
`cd app && npx tsc --noEmit -p .` → no output, exit 0 (`APP_TSC_EXIT=0`)

## SCHEMA LOAD CHECK

Parsed the schema YAML with js-yaml:
```
extraction.additionalProperties = false
extraction.properties keys = method,extracted_at,page_count,pages,ocr_attempted,ocr_available,text_excerpt
pages = {"type":"array","items":{"type":"object","additionalProperties":false,"required":["page_number","method"],"properties":{"page_number":{"type":"integer","minimum":1},"method":{"type":"string","enum":["plain_text","pdf_text","ocr","html_section_parser","unsupported","failed"]}}}}
```

## Exact record shape now written (captured from the new test's actual output)

```json
{
  "method": "ocr",
  "extracted_at": "2026-11-12T08:47:29.326Z",
  "page_count": 2,
  "pages": [
    { "page_number": 1, "method": "pdf_text" },
    { "page_number": 2, "method": "ocr" }
  ],
  "ocr_attempted": true,
  "ocr_available": true,
  "text_excerpt": "RPMI 1640 formulation sheet (vendor product document) Glucose 2 g/L Sodium bicarbonate 2 g/L HEPES 4.77 g/L"
}
```
(The `expressions`/`text_excerpt` content is fixture text; `method` stays `ocr`
for the document exactly as before, with page truth now beside it.)

## Reviewer-bait dispositions

1. `exactOptionalPropertyTypes`: both server and client use conditional spreads;
   no `pages: undefined` anywhere, and no always-present empty `pages` key.
2. Document-level `method` and its derivation untouched; `ocr_attempted`/
   `ocr_available` untouched (verified in the diff hunk).
3. Schema property added — the write path will not 422.
4. Per-page enum copied byte-identical (six values) from the document-level enum.
5. No format sniffing / extension table / new branch in TS: the method comes
   straight from `documentIntake`'s `DocumentPageMethod`.
6. Unsupported/failed arms keep `pages: []` and therefore emit no `pages` key.
7. Client parser is per-element tolerant (`flatMap`), one bad page cannot drop
   the document, drafts or sibling pages.
8. Diff measured 39 inserted lines / 4 deleted across 4 product files (+33-line
   test hunk in 561a6510); well under the 140-line budget.

## Notes / environment

- The dispatched tree arrived without `node_modules`; per repo convention
  (`cl-lane-tick.sh` WORKTREES note and sibling worktrees) I symlinked
  `node_modules` → `L2-DOC-INTAKE-1-u1-lane2/node_modules` and
  `server/node_modules` → same worktree's `server/node_modules` (`app/node_modules`
  was already a symlink to the trunk app). No installs, and these paths are
  gitignored (tree stayed clean).
- Scratch dir `/home/brad/.dintake-pagemethod-scratch/` used for the record-shape
  capture and deleted at exit.
- YAML changed: lane stack must be reloaded by the orchestrator before live
  verification; UI acceptance (browser lane screenshot of a mixed PDF showing
  `pages 1 pdf_text, 2 ocr`) remains with the independent browser reviewer.

L2-DOC-INTAKE-1 UNIT g1pagemethod DONE cd2b4362a008a8d86474bb2c3e78ab933bba7980
