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
