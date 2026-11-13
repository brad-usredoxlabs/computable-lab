# L2-NOUN-FROM-DOC-1 — unit nfdoutcomesfix1 (fix 1 of 1)

Branch: cl/lane2-noun-from-doc-nfdoutcomes-1945 · base: 05366741a02ccbef33dca2b11b00aeff1d3ad67e
Continuation of nfdoutcomes (reports/L2-NOUN-FROM-DOC-1-nfdoutcomes-report.md — untouched).

## What changed (advc c1 D1 — mutation probe: the pin had no teeth)

One owned file: `server/src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts`
(3 insertions, 5 deletions). In the `noProposals` test at line 119, the vacuous guard
`if ('fieldOutcomes' in result) { … }` was deleted and the three assertions de-indented
so they run unconditionally after the `noProposals` narrowing. Predicates, order, and the
narrowing `if (!('noProposals' in result)) throw …` are unchanged; test count stays 6.

Production file `SpecSheetExtractor.ts` was mutated ONLY for the probe and restored
byte-identically (sha256 `e14b0444…e4336` before and after).

## Raw evidence (every run below was actually performed)

### 1. Baseline before the fix (at 05366741)
`cd server && npx vitest run src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts`

RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-nfdoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts  (6 tests) 15ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:00
   Duration  1.35s (transform 49ms, setup 0ms, collect 67ms, tests 15ms, environment 0ms, prepare 60ms)

### 2. Targeted test after the fix
`cd server && npx vitest run src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts`

RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-nfdoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts  (6 tests) 29ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:19
   Duration  2.69s (transform 88ms, setup 0ms, collect 121ms, tests 29ms, environment 0ms, prepare 170ms)

### 3. Mutation probe — BEFORE (mutation applied: line 430 `fieldOutcomes,` deleted)
Pre-mutation production sha256: e14b0444df927b276cf7364328134178416a1d0d6246887aed48da1fdb4e4336
Same vitest command:

RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-nfdoutcomes-lane2/server

 ❯ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts  (6 tests | 1 failed) 32ms
   ❯ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts > extractFromUrl — fieldOutcomes carried through unchanged > noProposals arms: reasons preserved; every outcome is not_present, in declared order
     → Target cannot be null or undefined.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts > extractFromUrl — fieldOutcomes carried through unchanged > noProposals arms: reasons preserved; every outcome is not_present, in declared order
AssertionError: Target cannot be null or undefined.
 ❯ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts:128:36
    126|       expect(result.noProposals.reason).toBe(reason); // semantics unc…
    127|       expect(result.proposals).toEqual([]);
    128|       expect(result.fieldOutcomes).toHaveLength(declared.length);
       |                                    ^
    129|       expect(result.fieldOutcomes.every((o) => !isProposed(o))).toBe(t…
    130|       expect(result.fieldOutcomes.map(fieldOf)).toEqual(declared.map((…

⎯⎯⎯⎯⎯⎯⎯[1/1]⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
   Start at  23:27:29
   Duration  1.92s

Exactly the one expected failure — the `noProposals` test — at the now-unconditional
`expect(result.fieldOutcomes).toHaveLength(declared.length)` (line 128). Pin has teeth.

### 4. Restore + re-run
`git checkout -- server/src/ingestion/SpecSheetExtractor.ts`
Post-restore production sha256: e14b0444df927b276cf7364328134178416a1d0d6246887aed48da1fdb4e4336
(byte-identical to pre-mutation)

`git -c core.fileMode=false status --short` (pre-commit, no product path present):

 M server/src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts

Same vitest command:

RUN  v1.6.1 /home/brad/cl-wt/L2-NOUN-FROM-DOC-nfdoutcomes-lane2/server

 ✓ src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts  (6 tests) 32ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:33
   Duration  1.81s (transform 73ms, setup 0ms, collect 149ms, tests 32ms, environment 0ms, prepare 151ms)

### 5. Typecheck
Not run — no `.ts` signature changed (test-body-only edit; `fieldOutcomes` is required on
the `SpecSheetExtractNoProposals` union member after the `noProposals` narrowing, so the
bare access type-checks by construction; `exactOptionalPropertyTypes`-safe, no `??`, no `!`).

### 6. Diff
`git diff --stat` (pre-commit):

 server/src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts | 8 +++-----
 1 file changed, 3 insertions(+), 5 deletions(-)

## Scope compliance
- Owned files touched: 1 of 1 (`SpecSheetExtractor.fieldOutcomes.test.ts`).
- Prohibited files untouched for edit: `SpecSheetExtractor.ts` (probe only, restored
  byte-identically), `SpecSheetFieldMaps.ts`, old nfdoutcomes report. No YAML touched.
- No reason tokens / field names / record kinds added or renamed anywhere.
- Commit: one, message `test(ingestion): nfdoutcomesfix1 — assert fieldOutcomes on the noProposals arm unconditionally (advc c1 D1)`.
  Mutation was never committed.

## Next actions
- None for the coder. Adversarial re-run against the new commit is the gate.

L2-NOUN-FROM-DOC-1 UNIT nfdoutcomesfix1 DONE 38bc83ee984ac5c62f5f0bd14a24ad13323a082a

### 7. Final tree state (post-commit, pre-report)
`git -c core.fileMode=false status --short` → (empty = clean)
`git diff 05366741 38bc83ee --stat`:
 server/src/ingestion/SpecSheetExtractor.fieldOutcomes.test.ts | 8 +++-----
 1 file changed, 3 insertions(+), 5 deletions(-)
`git diff 05366741 38bc83ee -- server/src/ingestion/SpecSheetExtractor.ts` → empty
(production file byte-identical to base; sha256 e14b0444df927b276cf7364328134178416a1d0d6246887aed48da1fdb4e4336)
