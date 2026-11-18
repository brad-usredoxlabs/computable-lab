# L2-DOC-INTAKE-1 / unit intakedoc-fix2 — report (lane 2)

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-intakedoc-lane2
Branch: cl/lane2-docintake-intakedoc-0240, base 87848321, HEAD at start e30ae785.
Closes adversarial c2 D1 (store-rejection pin had no observation) and D2 (false budget claim).
No product change: `server/src/ingestion/documentIntake.ts` is byte-identical to e30ae785.

## Asserted (inside the EXISTING STORAGE_FAILED `it(...)`, no new test)

`readPageTexts` and `ocrPage` are now hoisted `vi.fn()` consts passed as-is into
`intakeDocument(..., { save }, { readPageTexts, ocrPage })` (same spy objects, no re-wrap).
`fsProbe.scratchDirs.length = 0` inline immediately before the call, so the assertion does not
depend on `beforeEach` order. Three assertions after the four existing ones:
`expect(readPageTexts).not.toHaveBeenCalled()`, `expect(ocrPage).not.toHaveBeenCalled()`,
`expect(fsProbe.scratchDirs).toEqual([])`. `save`-throws shape, the four :350-357 assertions,
STORAGE_FAILED, the `node:fs/promises` harness and every sibling test are unchanged.

## MUTATION PROBE — M4 (reviewer's), mutate-run-restore

Applied to `documentIntake.ts` in the worktree, run, then reverted. Lines as applied:
- added above the `deps.save` try-block, after `let identity: DocumentBlobIdentity;`:
  `let tempDir: string | null = null; tempDir = await mkdtemp(join(tmpdir(), 'cl-doc-intake-'));`
  `const tempFile = join(tempDir, `document${extname(args.fileName ?? '')}`);`
  `await writeFile(tempFile, Buffer.from(args.contentBase64, 'base64'));`
- deleted those same four lines from the extraction try-block (extraction stayed after `deps.save`).

RAW (M4): 1 failed | 15 passed (16)
  ❯ resolves with a typed STORAGE_FAILED diagnostic when the store rejects ...
    → expected [ '/tmp/cl-doc-intake-Q40bZc' ] to deeply equal []
  ❯ src/ingestion/documentIntake.test.ts:368:33  expect(fsProbe.scratchDirs).toEqual([])
Under M4 the scratch pin has teeth. The reader spies stayed GREEN (extraction remains after the
store, so `save` rejection never reaches them) — that is the honest split, not a claim of both.

## MUTATION PROBE — M4b (extra, same run-restore procedure)

Added `await extractDocumentPages(tempFile, options);` right after the hoisted `writeFile`, before
`deps.save`. RAW: 2 failed | 14 passed (16)
  ❯ STORAGE_FAILED test → AssertionError: expected "spy" to not be called at all, but actually
    been called 1 times; 1st spy call: [ "/tmp/cl-doc-intake-TJdljQ/document.pdf" ]
    ❯ :366:31  expect(readPageTexts).not.toHaveBeenCalled()
  ❯ D3 ordering test → expected [ 'extract', 'save', 'extract' ] to deeply equal [ 'save', 'extract' ]
So `readPageTexts` has teeth. `ocrPage` was NOT independently reddened by either mutant: on a
text-layer PDF the OCR path is unreachable, so it is a companion guard asserting the same
"extraction never ran" fact one step later — declared, not overclaimed.

Restore proof: `git -c core.fileMode=false checkout -- server/src/ingestion/documentIntake.ts`,
then `git -c core.fileMode=false status --short` → empty. No product path in any commit.

## Verification (raw, restored tree)

  $ cd server && npx vitest run src/ingestion/documentIntake.test.ts
  ✓ src/ingestion/documentIntake.test.ts  (16 tests) 59ms
  Test Files  1 passed (1)
       Tests  16 passed (16)
  git -c core.fileMode=false status --short  -> (empty)
  /tmp/cl-doc-intake-* count: 7 before, 7 after (baseline dirs pre-date 02:56; the three dirs the
  mutants leaked at 04:02-04:03 were removed by hand: Q40bZc, TJdljQ, mQyEvv).

NOTE on the brief's "expect 17 passed (17)": the brief also requires the assertions to live INSIDE
the existing `it(...)`, which cannot change the test count. Measured 16 (the brief's own baseline)
with the three new assertions green; 17 would have required an unrequested new test.

## Honest budget

`git show --numstat 64d03b42` → `12  1  server/src/ingestion/documentIntake.test.ts` (13 changed).
Cap was files<=3 / lines<=60. Delivered: 12 added / 1 removed test lines, plus the fix1 budget
sentence (3 lines replaced) and this report. Code-side: 12 added lines vs 60 cap — within.

## D2 correction applied

`L2-DOC-INTAKE-1-intakedoc-fix1-report.unit.md` D4 section now records "123 added lines vs a
120-line cap: a 3-line OVERRUN ... the excess is the fsProbe harness the leak pin needs" and that
the earlier "within files<=3 / lines<=140" claim was wrong. No other line of that file was touched.

## Changed files

- server/src/ingestion/documentIntake.test.ts (12+/1-, commit 64d03b42)
- .hermes/plans/reports/L2-DOC-INTAKE-1-intakedoc-fix1-report.unit.md (budget sentence only)
- .hermes/plans/reports/L2-DOC-INTAKE-1-intakedoc-fix2-report.unit.md (this file)

L2-DOC-INTAKE-1-intakedoc-fix2 UNIT unit DONE 64d03b42c24db47328e0eef0d1b44dfbde48fa0c
