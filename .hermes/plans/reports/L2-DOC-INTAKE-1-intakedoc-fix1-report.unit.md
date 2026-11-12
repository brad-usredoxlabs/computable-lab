# L2-DOC-INTAKE-1 / unit intakedoc-fix1 — report (lane 2)

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-intakedoc-lane2
Branch: cl/lane2-docintake-intakedoc-0240, base a1ab464c.

## Outcome

Adversarial c1 defects D1/D2/D3 closed as test teeth. No production code change was
needed: intakeDocument already stores before extracting (L375-398 save, L400-424
extract+finally rm). Two mutants prove the new pins bite.

## Changes

server/src/ingestion/documentIntake.test.ts (+123/-1)
- File-scoped `vi.mock('node:fs/promises')` wrapper (importOriginal + spread actual)
  that records ONLY the seam's own scratch paths: prefix `cl-doc-intake-`, excluding
  the fixture prefix `cl-doc-intake-test-`; records mkdtemp dirs, writeFile targets,
  rm targets. No production test-only seam was added.
- D3 test: `save` spy and injected `readPageTexts` share an `order: string[]`;
  asserts `order` deep-equals ['save','extract'].
- D1 test: after one successful run, the recorded mkdtemp dir is rm'd exactly once
  and `access(dir)` rejects ('gone').
- D2 test: `notes.md` upload is read as plain_text and its scratch path ends
  `/document.md` (declared extension reaches extraction); extensionless `rawdoc`
  with JSON body writes scratch `/document`, returns pages [] plus a typed
  UNSUPPORTED_FORMAT naming `(none)`, and keeps the store identity (drefId).

## D2 — honest grade, named limitation

`extractDocumentPages(filePath, options)` (L106-109) derives the format from
`extname(filePath)` only; `DocumentIntakeOptions` has no fileName/name-hint field.
So there is no supported way to pass a name hint, and this seam has no content
sniffing or JSON format entry (config/ingestion/document-extraction.yaml `formats:`
lists no json). Chosen action per brief: pin CURRENT behaviour honestly rather than
bolt sniffing onto u3's module.

  NAMED LIMITATION (u3 follow-up): an extensionless declared fileName whose bytes
  are a sniffable format still yields DOCUMENT_INTAKE_UNSUPPORTED_FORMAT
  "(none)". Fix belongs in the format gate (config formats + sniffing), not here.

## D4 paperwork acknowledgement

Adversarial c4 D4 flagged the previous diff over budget (base delta 273 lines).
This unit: 1 file changed, 123 insertions(+), 1 deletion(-) in the test commit,
plus this report. Measured against the 120-line cap: 123 added lines is a 3-line
OVERRUN, not "within budget"; the excess is the fsProbe harness the leak pin needs.
(Corrected in fix2 after adversarial c2 D2.)

## Verification (raw)

Base, before any change:
  RUN  v1.6.1 /home/brad/cl-wt/L2-DOCINTAKE-intakedoc-lane2/server
  ✓ src/ingestion/documentIntake.test.ts  (13 tests)  (baseline per brief)

After:
  $ cd server && npx vitest run src/ingestion/documentIntake.test.ts
  ✓ src/ingestion/documentIntake.test.ts  (16 tests) 60ms
  Test Files  1 passed (1)
       Tests  16 passed (16)

  $ cd server && npx tsc --noEmit
  RC=0

MUTANT A — D3 reorder (inserted `await extractDocumentPages(...)` before deps.save):
  ❯ intakeDocument > D3: stores the bytes BEFORE extracting pages (ordering pin, not just both-happened)
    → expected [ 'extract', 'save', 'extract' ] to deeply equal [ 'save', 'extract' ]
  Tests  1 failed | 15 passed (16)

MUTANT B — D1 cleanup deleted (finally rm body removed):
  ❯ intakeDocument > D1: removes the scratch directory it created before returning
  AssertionError: expected [] to have a length of 1 but got +0
  Tests  1 failed | 15 passed (16)

Revert: `git checkout -- src/ingestion/documentIntake.ts`; sha256 of the file equals
`git show HEAD:server/src/ingestion/documentIntake.ts` sha256
(39c8723b21a9616658caae9061699c9583f26706db22fb89373920834d659bfe) — byte-identical.

## Commits

73f939b4 test(intakedoc): pin store-before-extract order, scratch cleanup, filename passthrough (fix1 D1/D2/D3, mutant-proven teeth)
(next) docs(intakedoc): fix1 unit report

## Blockers

None.

L2-DOC-INTAKE-1 UNIT intakedoc-fix1 DONE 73f939b409524bf48fb672f914d7d82ecc2f10be
