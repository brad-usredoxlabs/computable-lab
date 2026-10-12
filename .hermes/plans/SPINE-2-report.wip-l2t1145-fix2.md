# SPINE-2 CODER REPORT — FIX-2 RUN (lane 2, l2t1145)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-2-lane2-l2t1145
Branch: spine-2-lane2-l2t1145 (base cd5a7101 = fix1+report; NOT reset/rebased)
Review under repair: /home/brad/.hermes/cl/lanes/2/reviews/review-SPINE-2-adversarial-l2t1355.md
Defect: [1] MAJOR — `vocab-hint-verbs-carry-policy-ref` inverted predicate (lint yaml ~:77-78).

## What was wrong (reviewer's finding, reproduced)

The rule's `any` branch 1 was `not( everyItem(args, not(equals hintEligible true)) )`
= "SOME arg is hintEligible". ORed with `exists(policyRef)`, a hint verb WITHOUT a
policyRef passed (the exact case the rule exists to catch) and a plain verb without a
policyRef failed (false positive). Sole enforcement of spec §5.0 P2 presence; silent.

## Fix (exactly the reviewer's endorsed smallest change)

1. `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml` — dropped the outer
   `op: not` / `not:` wrapper on branch 1: it is now a bare
   `everyItem(args, not(equals hintEligible true))` = "no hintEligible argument exists".
   `any[ no-hintEligible-arg, exists(policyRef) ]` now yields: hint verb w/o policyRef =>
   fail; plain verb => pass. NO other rule in the file touched (diff is 11 lines, one rule).
2. New mutation fixtures (full copy + one delta, P1-P4 convention; header comment dropped
   exactly as p1-p4 do):
   - `fixtures/vocab-mutations/vocab-hint-missing-policyref.yaml` — shipped minus the
     `policyRef: hint-authority` line on `spin` (a verb carrying `hintEligible: true` args).
     Diff vs shipped: header (10 lines) + exactly `622d611 < policyRef: hint-authority`.
   - `fixtures/vocab-mutations/vocab-plain-verb-no-policyref.yaml` — shipped minus `spin`'s
     policyRef AND minus `spin`'s single `hintEligible: true` flag (spin becomes a plain
     verb). Diff vs shipped: header + `622d611` + `628d616`. Two deltas by design: the
     second delta is what makes the verb plain; together they isolate the false-positive
     case. Schema-valid (policyRef optional; hintEligible optional).
3. `vocabulary.test.ts` — two new named legs mirroring P1-P4 style:
   - 'P2-hint mutation: a verb with a hintEligible arg and NO policyRef fails with the
     NAMED rule' => toThrow(/vocab-hint-verbs-carry-policy-ref/)
   - 'P2-hint control: a plain verb (no hintEligible arg) with NO policyRef loads CLEAN
     (no false positive)' => loads, 31 verbs, spin has no hintEligible arg, labware arg intact.
   Existing rule-id-present assertion KEPT byte-unchanged.

## FORCED RIPPLE (recorded)

The four fixture triplet dirs each carry a full copy of the lint file (the loader reads the
lint file co-located with the data file). The mutation fixtures only bite against the FIXED
predicate, so the copies were re-synced 1:1 from the shipped lint file:
- fixtures/vocab-mutations/scientist-intent-vocabulary.lint.yaml
- fixtures/vocab-minus-pellet/scientist-intent-vocabulary.lint.yaml
- fixtures/vocab-strategy-flip/scientist-intent-vocabulary.lint.yaml
- fixtures/vocab-empty/scientist-intent-vocabulary.lint.yaml
(diff -q confirms each identical to shipped after sync). No other ripple.

## NOT touched (STOP boundaries honored)

Wire schema, vocabulary.ts, parseScientistIntent.ts, shipped vocabulary DATA yaml, app/**,
SPINE-1 pins — all byte-unchanged (see git status below).

## GATES — verbatim outputs

### Gate 1: RED-first (test added BEFORE the lint fix)

`npx vitest run src/compiler/scientistIntent/vocabulary.test.ts` (pre-fix):

    ❯ src/compiler/scientistIntent/vocabulary.test.ts  (16 tests | 2 failed) 1103ms
      ❯ ... > P2-hint mutation: a verb with a hintEligible arg and NO policyRef fails with the NAMED rule
        → expected [Function] to throw an error
      ❯ ... > P2-hint control: a plain verb (no hintEligible arg) with NO policyRef loads CLEAN (no false positive)
        → scientist-intent vocabulary failed lint policy (.../vocab-mutations/scientist-intent-vocabulary.lint.yaml):
          1 violation(s): vocab-hint-verbs-carry-policy-ref: a verb with a hintEligible argument must declare a policyRef
    Test Files  1 failed (1)
          Tests  2 failed | 14 passed (16)

RED for the RIGHT reasons: mutation leg = rule does NOT fire on hint verb missing policyRef
(reviewer's MISSED case); control leg = rule FALSE-POSITIVES on a plain verb missing
policyRef (reviewer's second engine-run finding). Both reproduce the reviewer's evidence
exactly.

### Gate 2: GREEN after predicate fix — targeted suite

`cd <worktree>/server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent`

     ✓ src/compiler/protocolIntent/ProtocolIntentLowering.test.ts  (7 tests) 10ms
     ✓ src/compiler/protocolIntent/ProtocolIntent.test.ts  (5 tests) 7ms
     ✓ src/compiler/protocolIntent/ProtocolIntentStatePlanner.test.ts  (3 tests) 6ms
     ✓ src/compiler/protocolIntent/ProtocolIntentPatternExpanders.test.ts  (8 tests) 9ms
     ✓ src/compiler/protocolIntent/ProtocolIntentValidation.test.ts  (4 tests) 7ms
     ✓ src/compiler/scientistIntent/clarificationContract.test.ts  (15 tests) 226ms
     ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests) 73ms
     ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (6 tests) 11ms
     ✓ src/compiler/scientistIntent/scientistIntent.test.ts  (20 tests) 94ms
     ✓ src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts  (6 tests) 56ms
     ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests) 239ms
     ✓ src/compiler/scientistIntent/vocabulary.test.ts  (16 tests) 697ms

    Test Files  12 passed (12)
          Tests  113 passed (113)

Prior 12 files/111 + 2 new legs (vocabulary.test.ts 14 -> 16).

### Gate 3: server tsc SET comm -3 vs 26-line/6-file baseline — EMPTY

Pre-fix baseline captured at HEAD cd5a7101: 26 lines / 6 files
(AgentOrchestrator 7, ProtocolIntakeHandlers 2, RecordHandlers 1, AuthoringGuard 3,
bootstrapAdmin 1, RecordStoreImpl 12). Post-fix:

    lines: 26
    files: 6
    comm -3 vs baseline:
    comm exit: 0        (no output = set identity)

### Gate 4: KNOWN_ACTIONS grep — zero

    git grep -n KNOWN_ACTIONS -- server/src   => no output, exit 1 (zero hits)

### Gate 5: shipped vocabulary validates CLEAN

The resolver-spec.validation shipped leg ('the shipped vocabulary validates + lints CLEAN
(zero findings)') is GREEN in the run above (vocabulary.test.ts 16/16), including the
rule-id backstop assertion (5 rule ids, order-pinned) — the fixed rule still reports zero
violations on the shipped document (all 31 verbs carry policyRef).

### Gate 6: app/** diff EMPTY

    git -c core.fileMode=false diff --stat HEAD -- app/   => empty

### Changed files vs HEAD (pre-commit git status, tracked)

     M schema/scientist-intent/scientist-intent-vocabulary.lint.yaml
     M server/src/compiler/scientistIntent/fixtures/vocab-empty/scientist-intent-vocabulary.lint.yaml
     M server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.lint.yaml
     M server/src/compiler/scientistIntent/fixtures/vocab-mutations/scientist-intent-vocabulary.lint.yaml
     M server/src/compiler/scientistIntent/fixtures/vocab-strategy-flip/scientist-intent-vocabulary.lint.yaml
     M server/src/compiler/scientistIntent/vocabulary.test.ts
    + server/src/compiler/scientistIntent/fixtures/vocab-mutations/vocab-hint-missing-policyref.yaml (new)
    + server/src/compiler/scientistIntent/fixtures/vocab-mutations/vocab-plain-verb-no-policyref.yaml (new)

## Semantics check (post-fix truth table, engine-verified via the suite)

- shipped (all 31 verbs: hint args + policyRef) => [] (suite shipped leg)
- hint verb w/ hintEligible arg, NO policyRef => NAMED rule throws (mutation leg)
- plain verb, NO policyRef => loads clean (control leg)
- p1/p2/p3/p4/struct/empty/missing legs unchanged and green.

SPINE-2 CODER DONE
