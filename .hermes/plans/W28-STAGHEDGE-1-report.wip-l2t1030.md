# W28-STAGHEDGE-1 — coder report (lane 2, l2t1030)

Worktree: /mnt/vast/home/brad/git/wt/W28-STAGHEDGE-1-lane2
Branch: W28-STAGHEDGE-1-lane2 (off trunk a1dea08a)
Commit: 60bcab23 `fix(compiler): W28-STAGHEDGE-1 model-hedge label-divergence consume in resolve_nouns`
Authority: W28-A5m ruling §Q2 option (b) (decisions/W28-A5m-answer-loop-stagnant-labware-class-decision.md) + spec 2026-10-19_1045-W28-STAGHEDGE-1.

## What was implemented

ONE module changed: `server/src/compiler/resolution/resolveNounsPass.ts` + ONE new test file
`server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts`. Server-only. No handlers,
no fold leaf, no engine, no app files, no YAML, no wire-contract change, no new reason codes, no
verb/argument/kind NAME literals (identity + declared `argContracts` data + the two stable codes
`NOT_STATED_REASON` (imported from the fold leaf, never re-declared) and
`MISSING_REQUIRED_ARGUMENT_REASON` only).

New exported guard function `consumeAnsweredLabelHedges(vocabulary, modelFacts, answers)` applied
to the FOLDED model facts in the same stage the PARAM-FOLD feeds `reconcileModelUnresolved`
(the call site now reads `consumeAnsweredLabelHedges(deps.vocabulary, foldedModelFacts,
deps.answeredSlots ?? [])`), so a consumed fact never enters `clarifications` and never counts
toward `blocked`. A model fact is dropped when ALL four ruled guards hold:
1. slot identity (`actionLocation.actionIndex` + string `argument` — fold guard 1 / SH-QA-1 shape);
2. its slot is a declared `kind: resolvable` arg-contract of its verb (same read as
   `answeredSlotBindings`; scalar/quantity/wells cards untouched);
3. reason is the stable `NOT_STATED_REASON` code (ambiguous / contradicts stay kept);
4. a `deps.answeredSlots` entry's KEY EQUALS the fact's label (exact identity, never containment).
Drops the QUESTION only: no binding is minted; the `answeredSlotBindings` value-join and
`settledEngineClarifications` arms are byte-unchanged. `answers.length === 0` short-circuits to the
input list, so every caller without answers is byte-unchanged. Engine clarifications, the §5.2
sweep, and gated survivors are untouched by construction (the consume reads only model facts).

## RED evidence (new suite against the UNMODIFIED pass, base a1dea08a)

`npx vitest run src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts` (server workspace):

    ❯ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts  (9 tests | 2 failed) 13ms
      ❯ ... SH1 RED pin (probe r5 arm B shape) ... — expected false to be true
      ❯ ... SH2 label collision (sub-class 2a) ... — expected false to be true
    AssertionError: expected false to be true   (resolveNounsPass.stagnantHedge.test.ts:187 — expect(result.ok).toBe(true))
    AssertionError: expected false to be true   (resolveNounsPass.stagnantHedge.test.ts:229 — expect(result.ok).toBe(true))
    Test Files  1 failed (1)
    Tests  2 failed | 7 passed (9)

Right-reason proof: SH1/SH2 fail exactly on `result.ok === false` — the label-divergent not-stated
fact re-bars (blocked:true, the fact rides `clarifications`) because no existing drop arm covers it
(silent engine: no binding, no engine twin at its key — the ruling's step-5 stagnation precondition).
All 7 negatives/pins (SH1 control, SH3 scalar, SH4 ambiguous, SH5 unvalidated, SH6 slot-less, SH7
engine/sweep/gated, SH8 value-join regression) were GREEN at base and stay green after the fix.

## Final test output (after the fix)

`npx vitest run src/compiler/resolution/` from the server workspace:

     ✓ src/compiler/resolution/hintParity.test.ts  (8 tests) 8ms
     ✓ src/compiler/resolution/resolveNounsPass.answeredNouns.test.ts  (8 tests) 109ms
     ✓ src/compiler/resolution/resolveNounsPass.paramFold.test.ts  (14 tests) 8ms
     ✓ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts  (9 tests) 10ms
     ✓ src/compiler/resolution/nounResolution.test.ts  (16 tests) 326ms
     ✓ src/compiler/resolution/spine4ProductionWiring.test.ts  (4 tests) 62ms
     ✓ src/compiler/resolution/spine4Registration.test.ts  (18 tests) 169ms
     ✓ src/compiler/resolution/resolveNounsPass.test.ts  (24 tests) 867ms
     ✓ src/compiler/resolution/compositionArgResolution.test.ts  (14 tests) 1213ms

    Test Files  9 passed (9)
    Tests  115 passed (115)

Untouched answeredNouns (8) and paramFold (14) suites green byte-unchanged.

## Typecheck output

`npm run typecheck -w server` from the worktree root:

    > @computable/server@1.0.0 typecheck
    > tsc --noEmit

    (no diagnostics) — exit 0. Trunk baseline CLEAN, zero new errors.

## Zero-new proof for the pass's other consumers

The pass module is imported by scientistIntent suites + IntentCompileFromPromptHandlers. Ran
`cueResolutionGate / hedgeOptionality / rolesSeam / goldenRolesSeam / goldenIntentToClarification /
src/api/handlers/` at BASE (lane change stashed, new test file held out) and in-lane; comm of the
sorted FAIL lists:

    base fails (7): EventEditorFixHandlers.startApplyFixJob, ExtractHandlers.upload,
                    LabSettingsHandlers x2, MeasurementHandlers.applianceJob,
                    WorkspaceHandlers x2
    lane fails (6): ExtractHandlers.upload, LabSettingsHandlers x2,
                    MeasurementHandlers.applianceJob, WorkspaceHandlers x2

comm -3 shows ONE base-only line: EventEditorFixHandlers.startApplyFixJob (a background-job timing
flake — it passed in the lane run and is unrelated to resolve_nouns). Zero NEW failures introduced;
the 6 shared fails are pre-existing trunk debt (upload/labware-adjacent + appliance-job suites).

## Diff summary

    server/src/compiler/resolution/resolveNounsPass.ts                    | +75 / -1
    server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts | +401 (new, 9 tests)
    commit 60bcab23: 2 files changed, 476 insertions(+), 1 deletion(-)

Module change is three hunks: (a) import `NOT_STATED_REASON` from the fold leaf (the re-export
block below stays byte-identical); (b) the new `consumeAnsweredLabelHedges` section with the ruled
guard comments; (c) the pass call-site: fold result hoisted to `foldedModelFacts`, consume applied
before `reconcileModelUnresolved`.

## Assumptions recorded

1. Worktree bootstrap: the fresh lane worktree was missing the lane's untracked-but-required
   symlinks (node_modules, server/node_modules, server/schema, and 45 lane-excluded files such as
   server/src/ai/materialRefFields.ts that resolutionEngine.ts imports). Restored by mirroring the
   sibling lane W28-FOLDSENT-1-lane2's link set (targets verified to exist; all are listed in the
   lane-exclude file and stay untracked — nothing committed). Without them vitest suite-loads and
   typecheck fail at base for reasons unrelated to this task.
2. Guard (4) trims the fact's label before the exact-key lookup (`answeredByKey.has(fact.label.trim())`),
   symmetric with the value-join's `raw.trim()`. Still exact identity, never containment.
3. The consume rides AFTER the PARAM-FOLD on the folded facts, per the spec's "mirror the PARAM-FOLD's
   position — apply the consume to the folded model facts so a folded fact never re-enters".
4. SH4 uses reason `'ambiguous'` (the paramFold V2b precedent) as the ambiguous-class stand-in for
   the ruling's "ambiguous / contradicts-the-text stay kept".
5. SH7 sweep pin uses the shipped required arg (kind `wells`): the sweep fact survives, and the model
   twin on the same key merges into it via the existing reconcile arm — exactly ONE clarification
   rides, pinned.
6. `consumeAnsweredLabelHedges` is exported (like `reconcileModelUnresolved` and the fold) for
   direct pinning; it adds no wire surface.

## Status

Implementation complete on the branch; NOT merged, NOT pushed; stacks untouched. Ready for
orchestrator verification + adversarial review, then the probe r6 arm-B loop check per the ruling's
gate sequence.

STAGHEDGE1 IMPLEMENTED

## Fix cycle 1 (adversarial reviewer defect 1 — guard (4) exact-equality discipline unpinned)

Defect (reviewer finding): the suite as a whole did not pin guard (4)'s exact-label identity.
Replacing `if (!answeredByKey.has(fact.label.trim())) return true;` with the bidirectional
containment join
`if (!answers.some((a) => fact.label.includes(a.label) || a.label.includes(fact.label))) return true;`
left ALL 9 tests green — the suite would not catch a regression to the A5d V6 drift class it
claims to guard.

Fix scope: TEST-FILE-ONLY. One new case, SH9, added beside SH5 in
`server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts` (same harness idiom:
`intentOf` / `hedge` / `runPass`, stage verb + `firstResolvable` slot — the exact
declared-resolvable slot SH1's drop case uses). SH9 answers with a key that is a PROPER SUBSTRING
of the fact label (`'variant'` vs `HEDGE_LABEL` = `'variant b'`) and asserts the fact SURVIVES:
`result.ok === false`, `blocked === true`, exactly ONE clarification carrying label `HEDGE_LABEL`,
reason `NOT_STATED`, pinned `actionLocation`, plus `bindings === []` (a containment join mints
nothing either — the defect it catches is the consumed QUESTION). Production code untouched.

### RED containment-mutation evidence (mutation-sensitivity proof)

Temporarily swapped guard (4) in `resolveNounsPass.ts:401` to the reviewer's exact containment
expression (one-line edit), then ran the new suite:

    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/W28-STAGHEDGE-1-lane2/server
     ❯ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts  (10 tests | 1 failed) 11ms
       ❯ ... > SH9 negative guard (4) exact-equality discipline: an answered key that is a PROPER
         SUBSTRING of the fact label at the SAME declared-resolvable slot SH1 drops — fact KEPT ...
         → expected true to be false // Object.is equality

    FAIL ... SH9 negative guard (4) exact-equality discipline ...
    AssertionError: expected true to be false // Object.is equality

    - Expected
    + Received

    - false
    + true

     ❯ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts:307:23
        305|     const output = result.output as ResolveNounsOutput;
        306|
        307|     expect(result.ok).toBe(false);
           |                       ^
        308|     expect(output.blocked).toBe(true);
        309|     expect(output.clarifications).toHaveLength(1);

    Test Files  1 failed (1)
    Tests  1 failed | 9 passed (10)

Right-reason proof: the single failure is SH9's `expect(result.ok).toBe(false)` receiving `true` —
under the containment join the partial mention `'variant'` WRONGLY CONSUMES the `'variant b'` card
(the question is dropped, so the pass goes ok:true). Exactly the A5d V6 drift class the guard
comment forbids, and exactly the arm the reviewer said was unpinned. The other 9 cases (SH1, SH1
control, SH2-SH8) stayed green under the mutation — confirming the reviewer's reproduction and that
SH9 is the case that closes the gap.

The temp one-line mutation was then REVERTED. Note: one intermediate invocation
(`npx vitest run <file> -w server`) mis-parsed the path filter and ran the whole server suite;
that run is disregarded as evidence (its 448 failures are pre-existing full-suite trunk debt,
unrelated to resolve_nouns). All cited runs use the lane idiom
`npm run test:run -w server -- <path>`.

### Zero-diff proof (production code byte-identical)

    $ git -c core.fileMode=false diff 60bcab23 -- server/src/compiler/resolution/resolveNounsPass.ts | wc -l
    0
    $ git -c core.fileMode=false diff 60bcab23 -- server/src/compiler/resolution/resolveNounsPass.ts
    (empty)

`resolveNounsPass.ts` is byte-identical to impl commit 60bcab23. The only file changed in this fix
cycle is the test file.

### Final test output (reverted state, SH9 included)

`npm run test:run -w server -- src/compiler/resolution/` from the worktree root:

     ✓ src/compiler/resolution/hintParity.test.ts  (8 tests) 6ms
     ✓ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts  (10 tests) 9ms
     ✓ src/compiler/resolution/resolveNounsPass.answeredNouns.test.ts  (8 tests) 108ms
     ✓ src/compiler/resolution/resolveNounsPass.paramFold.test.ts  (14 tests) 10ms
     ✓ src/compiler/resolution/nounResolution.test.ts  (16 tests) 263ms
     ✓ src/compiler/resolution/spine4Registration.test.ts  (18 tests) 123ms
     ✓ src/compiler/resolution/spine4ProductionWiring.test.ts  (4 tests) 55ms
     ✓ src/compiler/resolution/resolveNounsPass.test.ts  (24 tests) 676ms
     ✓ src/compiler/resolution/compositionArgResolution.test.ts  (14 tests) 799ms

    Test Files  9 passed (9)
    Tests  116 passed (116)

115 -> 116: the new SH9 is the only added test; every pre-existing case stays green.

### Final typecheck output

`npm run typecheck -w server` from the worktree root:

    > @computable/server@1.0.0 typecheck
    > tsc --noEmit

    (no diagnostics) — exit 0. Zero errors.

### Fix cycle 1 diff summary

    server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts | +38 (SH9 only; 9 -> 10 tests)
    server/src/compiler/resolution/resolveNounsPass.ts                    | 0 (byte-identical to 60bcab23)

Commit on W28-STAGHEDGE-1-lane2: `test(compiler): pin guard-4 exact-label identity against
containment join (SH1-SH9)`. NOT merged, NOT pushed; stacks untouched.

STAGHEDGE1 FIX1 DONE

## Fix cycle 2

Adversarial reviewer cycle 2, Defect 1 [minor]: SH9 pinned only the substring
containment direction (`fact.label.includes(a.label)` — answer key a proper
substring of the fact label). The mirror containment join
`a.label.includes(fact.label)` (answer key a proper SUPERSTRING of the fact
label) passed ALL 10 tests, despite the guard's own rule being 'never
containment' and the cycle-1 remediation naming 'substring OR superstring'.

Fix (TEST-FILE-ONLY, mirror case): added SH10 to
`server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts` —
answered key `'variant b extended'` (a proper superstring of the fact label
HEDGE_LABEL `'variant b'`) at the SAME declared-resolvable slot SH1 drops,
mirroring SH9's harness exactly. Asserts the clarification SURVIVES:
ok:false, blocked:true, exactly 1 clarification with label HEDGE_LABEL,
reason NOT_STATED, actionLocation {actionIndex:0, action:stageVerb,
argument:firstResolvable.name}, bindings [].

### Mutation-sensitivity proof (two ways)

(a) Superstring-only containment mutation — guard (4) line temporarily
    `if (!answers.some((a) => a.label.includes(fact.label.trim()))) return true;`:

    Tests  1 failed | 10 passed (11)
    FAIL  ... > SH10 negative guard (4) mirror: an answered key that is a PROPER SUPERSTRING ...

    SH10 FAILS, SH9 stays green — SH10 is the ONLY case that catches the mirror
    arm the reviewer flagged.

(b) Cycle-1 bidirectional containment mutation — guard (4) line temporarily
    `if (!answers.some((a) => a.label.includes(fact.label.trim()) || fact.label.includes(a.label))) return true;`:

    Tests  2 failed | 9 passed (11)
    FAIL  ... > SH9 negative guard (4) exact-equality discipline ...
    FAIL  ... > SH10 negative guard (4) mirror ...

    The bidirectional mutation is still caught — now by BOTH arms.

Both temp mutations were REVERTED immediately after each run; the final
guard (4) line is the original exact-key `answeredByKey.has(fact.label.trim())`.

### Zero production diff proof

    git -c core.fileMode=false diff 60bcab23 -- server/src/compiler/resolution/resolveNounsPass.ts | wc -l
    0

`resolveNounsPass.ts` is byte-identical to impl commit 60bcab23; the only
modified file in the fix is the test file.

### Final suite output (post-revert)

    npm run test:run -w server -- src/compiler/resolution/

     ✓ src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts  (11 tests)
     Test Files  9 passed (9)
          Tests  117 passed (117)

116 -> 117: the new SH10 is the only added test; every pre-existing case stays green.

### Final typecheck output

    npm run typecheck -w server

    > @computable/server@1.0.0 typecheck
    > tsc --noEmit

    (no diagnostics) — exit 0. Zero errors.

### Fix cycle 2 diff summary

    server/src/compiler/resolution/resolveNounsPass.stagnantHedge.test.ts | +38 (SH10 only; 10 -> 11 tests)
    server/src/compiler/resolution/resolveNounsPass.ts                    | 0 (byte-identical to 60bcab23)

Commit on W28-STAGHEDGE-1-lane2: `test(compiler): pin guard-4 against superstring containment mirror (SH10)` (268c6173). NOT merged, NOT pushed; stacks untouched.

STAGHEDGE1 FIX2 DONE
