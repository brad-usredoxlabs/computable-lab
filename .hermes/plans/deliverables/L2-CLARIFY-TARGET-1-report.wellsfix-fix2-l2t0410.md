# L2-CLARIFY-TARGET-1 — WELLS-DOOR FIX RUN 2 (adversarial defect closure)

Coder: cl-coder. Tick l2t0410. Worktree /mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810,
branch cl/lane2-target1-1-l2t1810. Start state: tip a6a71bcb (PRESERVED WIP, unverified), tree CLEAN,
on top of 2018f966 (D1 engine: scalar carried through expandWellTokens at the choke point).

Scope of this run (per orchestrator task + adversarial review l2t0230): PROVE by measurement what the
preserved WIP (a6a71bcb) already closes of D1/D2/D3/D4/D6, finish what it does not, run the full V-set.
Do NOT re-author green code; do NOT re-bless realizationGolden (T1/T2 stay red, tracked).

## Status ledger (updated as each defect closes; commits interleaved)

| defect | status | evidence |
|--------|--------|----------|
| D1 (BLOCKER) transfer/aliquot co-extensivity | CLOSED (proven) | RED-at-base + GREEN-at-head below |
| D2 (MAJOR) once-only prompt render | PENDING | — |
| D3 (MINOR) disabled on wells arm + app tests | PENDING | — |
| D4 (MINOR) one address grammar | PENDING | — |
| D6 (LOW) proposalRowFacts dead-code deletion | PENDING | — |
| D7 (LOW) report integrity: tsconfig truth + (b)-arm pin | PENDING | — |

## Log

### 05:1x start
- `git status --short` empty; `git log --oneline -3`: a6a71bcb / 2018f966 / 0a3a4f18. Confirmed.
- Adversarial review read in full; ruling read in full.
- Orch notes applied: manifest re-hash already graded outcome-inert (no re-derivation); read vocab pins at
  tracked path schema/scientist-intent/scientist-intent-vocabulary.yaml (server/schema is a symlink).

## D1 (BLOCKER) — CLOSED, PROVEN by measurement (RED-at-base + GREEN-at-head)

**What the branch already had (verified, not re-authored):** the 2018f966 choke-point carry.
`git diff 9374a681..HEAD -- server/.../normalizeScientistIntent.ts` shows the ENTIRE functional D1 fix
is exactly ONE line (resolutionEngine.ts is byte-IDENTICAL 9374a681..HEAD — the shape-gate SKIP is
unchanged; only the CARRY changed):

    -        event[eventKey] = scalar;                       (9374a681: raw STRING carry)
    +        event[eventKey] = expandWellTokens([scalar]);   (HEAD: EXPANDED array carry, ONE parser)

This is the ruling's "teach the lowering the SAME one-parser expansion" fix direction: the scalar that
is an address literal is carried EXPANDED through `expandWellTokens` (the ONE parser) into the concrete
address array EVERY target-wells expander natively consumes (`params.wells`/`p.wells` as `string[]`).
No second parser, no verb-name table, no expander edit. The `wellsDoorCoextensivity.target1.test.ts`
pin (in HEAD) asserts transfer yields a real address ARRAY (never a string passthrough, never char-split)
and aliquot yields 96 per-well events with real address parts.

**RED (base = string-carry engine 9374a681) — first-hand, /tmp/red-d1 harness**
(HARNESS: server/src hardlinked + HEAD pin; `node_modules`->worktree root, `schema`->worktree schema;
`normalizeScientistIntent.ts` reverted to `git show 9374a681:...` so the carry line is `event[eventKey] = scalar;`.
vocabulary.ts diff 9374a681..HEAD is a single additive `identityCollapse?: {...}` optional field — inert here):

    $ vitest run src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts   (RED)
    FAIL ... transfer targetWells: A1:H12 (scalar) ... never a string passthrough ...
      AssertionError: expected false to be true   (pin :101 expect(Array.isArray(wells)).toBe(true))
    FAIL ... aliquot targetWells: A1:H12 (scalar) ... never single characters ...
      AssertionError: expected 6 to be 96         (pin :126 expect(events.length).toBe(96))
    Test Files  1 failed (1)   Tests  2 failed | 15 passed (17)

    concrete base values (my _redprobe.test.ts on the same RED harness):
      TRANSFER outcome= complete clarifications= [] events= 1 details.wells= "A1:H12"   (STRING)
      ALICOT   outcome= complete events= 6
               srcWells= ["A","1",":","H","1","2"]   dstWells= ["A","1",":","H","1","2"]   (char-split)

  => EXACTLY the reviewer's measured defect (transfer: bare STRING read empty by array-only readers;
     aliquot: six char-split events). The pin is LOAD-BEARING — it fails on the string-carry engine.

**GREEN (HEAD = expanded array carry) — first-hand, worktree:**

    $ npm run test:run -w server -- src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts
      ✓ src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts  (17 tests)
      Test Files  1 passed (1)   Tests  17 passed (17)

**Verdict:** 2018f966's choke-point expansion ALREADY fixes both transfer and aliquot (one parser, no verb
table). The pin proves it (RED at base, GREEN at head). No verb-name table was added. D1 CLOSED.
