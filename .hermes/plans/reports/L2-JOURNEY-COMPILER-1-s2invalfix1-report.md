# L2-JOURNEY-COMPILER-1 / unit s2invalfix1 (advc c1, defect D1)

Worktree: /home/brad/cl-wt/L2-JOURNEY-COMPILER-1-s2inval-lane2
Branch: cl/lane2-journey-s2inval-2011, base 619fc8d6.

## Defect and fix

D1 (MAJOR): the AC1 pin invalidates `measure`, which is already NOT_READY
(awaiting_producer_output), so dropping `status: 'NOT_READY'` in
recordEnvelopeInvalidation, or skipping the not_ready recompute, both kept the
suite green. The READY-step path (compileJourneyEnvelope binds READY steps) was
unwitnessed.

Fix: one new test leg, `AC1b`, invalidating the READY `transfer` step of the
existing `twoStepPlan()` fixture. No product-code change was needed — both
mutants below now bite, so the product was already correct for a READY target.

## Changed files

- server/src/compiler/journey/journeyCompiler.test.ts (+35 lines, one new it(...))
- .hermes/plans/reports/L2-JOURNEY-COMPILER-1-s2invalfix1-report.md (this file)

`git diff 619fc8d6 -- server/src/compiler/journey/journeyCompiler.ts` is empty:
no product-code change in the diff.

## Assertions in the new leg

- fixture precondition asserted: steps[0] ('transfer') status READY, not_ready ['measure'];
- after recordEnvelopeInvalidation on 'transfer':
  steps[0].status === 'NOT_READY', reasons contain 'stale_input' exactly once,
  recorded.not_ready === ['transfer', 'measure'] (document order, re-derived),
  invalidations has exactly one entry equal to the recorded one,
  'measure' unchanged, input manifest not mutated.

## RED evidence (raw vitest)

Mutant F1 — removed `status: 'NOT_READY', ` from the returned invalidated step:

    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  src/compiler/journey/journeyCompiler.test.ts > compileJourneyStructure > AC1b: invalidating a READY step flips it to NOT_READY with stale_input and adds it to not_ready in document order
    AssertionError: expected 'READY' to be 'NOT_READY' // Object.is equality
          Tests  1 failed | 9 passed (10)

Mutant F2 — replaced the not_ready recompute with `not_ready: manifest.not_ready`:

    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  src/compiler/journey/journeyCompiler.test.ts > compileJourneyStructure > AC1b: invalidating a READY step flips it to NOT_READY with stale_input and adds it to not_ready in document order
    AssertionError: expected [ 'measure' ] to deeply equal [ 'transfer', 'measure' ]
          Tests  1 failed | 9 passed (10)

Both mutants were reverted; `git diff --quiet -- .../journeyCompiler.ts` is clean
(PRODUCT_CLEAN) before the step-1 commit. Full logs kept outside git:
/tmp/s2invalfix1-F1.log, /tmp/s2invalfix1-F2.log.

## GREEN evidence

    cd server && npx vitest run src/compiler/journey/journeyCompiler.test.ts
    Test Files  1 passed (1)
         Tests  10 passed (10)        # baseline 9 + AC1b

    npx tsc --noEmit -p server      -> TSC_EXIT=0, 0 lines of output

## Next actions / notes

- Review: the independent reviewer owns acceptance. The closed-vocabulary pin
  (unnamed keys/literals) is unaffected: journeyCompiler.ts is byte-identical to
  base, so both closed-set pins still hold (10/10).
- No blockers.

L2-JOURNEY-COMPILER-1 UNIT unit DONE 5a37e4e996285b3e860d96dc769e35c3d219b8cc
