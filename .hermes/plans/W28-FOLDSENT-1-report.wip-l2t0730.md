# W28-FOLDSENT-1 coder report (lane 2, worktree W28-FOLDSENT-1-lane2)

Token: l2t0730 · branch `W28-FOLDSENT-1-lane2` off trunk tip `9dc2f679`
Code commit: `a8da2717` fix(lane2): W28-FOLDSENT-1 hedge-sentinel slot value counts as declared absence (guard 4)
Test commit: `041ee2a7` test(lane2): W28-FOLDSENT-1 RED pins — sentinel-in-slot guard-4 fold (paramFold FS1-FS5 + raw-channel convergence)

## What changed (3 files, server-only)

1. PRODUCT — `server/src/compiler/resolution/declaredOptionalHedgeFold.ts`
   - `argumentPresent` string arm (:50):
      `if (typeof raw === 'string') return raw.trim().length > 0;`
      -> `if (typeof raw === 'string') return raw.trim().length > 0 && raw.trim() !== NOT_STATED_REASON;`
   - `argumentPresent` is the module's private presence helper called ONLY at the
     guard-(4) site (:102 `if (argumentPresent(...[contract.name])) return true;`),
     so the change is exactly the guard-(4) presence test. Guards (1)(2)(3)(5)
     (:87, :92, :99-102 order, :104) byte-untouched. Zero new domain literals: the
     only token referenced is the module's own exported stable code
     `NOT_STATED_REASON` (:34); module law (header :20-22, NOT_STATED_REASON
     comment :30-33) still holds. Header comment on `argumentPresent` documents
     the W28-A5l ruling and pins that the §5.2 sweep's own copy in
     `resolveNounsPass.ts` (:242) stays byte-identical (the sweep raises the
     DATA's questions; only the fold adjudicates the hedge's own sentinel —
     verified: `git diff` touches no line of resolveNounsPass.ts).
   - Idempotence: the fold remains an idempotent filter; the change only ADDS
     sentinel values to the "absent" equivalence, so already-folded sets
     re-fold identically (raw-channel test below exercises the double fold:
     normalize folds, resolve_nouns re-folds — no-op).

2. TESTS — `server/src/compiler/resolution/resolveNounsPass.paramFold.test.ts`
   (+101 lines, new describe `param-fold-1 sentinel-in-slot (W28-FOLDSENT-1)` :296):
   - FS1: declared-optional scalar slot holding the sentinel + not-stated fact ->
     FOLDED (clarifications [], blocked:false). Verb/arg names READ FROM DATA
     (`optionalScalar = optionalArgs.find(a => a.kind === 'scalar')` — resolves
     to seed.duration in the shipped vocabulary; no name literals).
   - FS1b: sentinel with surrounding whitespace -> trimmed -> FOLDED.
   - FS2: slot holding "20 min" -> KEPT (no over-fold).
   - FS3: "not-statedly 20 min" (substring, not exact) -> KEPT.
   - FS4: numeric slot 0 (declared-optional quantity arg, from data) -> KEPT
     (number arm unchanged).
   - FS5: REQUIRED slot holding the sentinel -> KEPT (guard (3) fires before
     guard (4); sweep adds nothing because the slot IS present for the sweep's
     own untouched presence test).

3. TESTS — `server/src/compiler/scientistIntent/hedgeOptionality.test.ts`
   (+48 lines, new describe :309 — the RAW channel / PARAM-FOLD-2 surface,
   normalizeScientistIntent `unresolvedRefs` + `protocolIntent.unresolved`):
   - `bead_beat {duration:"not-stated"}` + not-stated hedge -> folded at the raw
     source: outcome 'complete', clarifications [], normalized.unresolvedRefs [],
     terminalArtifacts.gaps [], protocolIntent.unresolved [], events still expand.
   - No-over-fold twin: `duration:"20 min"` + hedge -> fact survives (gap +
     clarification), pinning exact equality on the raw channel too.

## RED-first proof (tests run BEFORE the product edit)

paramFold file (product at base):
    Test Files  1 failed (1)
          Tests  2 failed | 12 passed (14)
    FAIL ... > FS1 ... AssertionError: expected [ { actionLocation:{action:"seed",
         actionIndex:0, argument:"duration"}, label:..., reason:"not-stated" } ]
         to deeply equal []
    FAIL ... > FS1b ... same shape
hedgeOptionality raw-channel test (product at base):
    Test Files  1 failed (1)
          Tests  1 failed | 16 passed (17)
    FAIL ... > duration:"not-stated" IN the slot ...
         AssertionError: expected 'needs-clarification' to be 'complete'
The RED failures name the defect symptom (kept sentinel fact -> clarification /
needs-clarification outcome), not test wiring. FS2-FS5 passed at base by design
(they pin the KEEP side that must not move).

## Targeted green (post-fix)

`cd server && npx vitest run src/compiler/resolution/ src/compiler/scientistIntent/hedgeOptionality.test.ts`

     ✓ src/compiler/resolution/hintParity.test.ts  (8 tests)
     ✓ src/compiler/resolution/resolveNounsPass.paramFold.test.ts  (14 tests)
     ✓ src/compiler/resolution/resolveNounsPass.answeredNouns.test.ts  (8 tests)
     ✓ src/compiler/resolution/nounResolution.test.ts  (16 tests)
     ✓ src/compiler/scientistIntent/hedgeOptionality.test.ts  (17 tests)
     ✓ src/compiler/resolution/spine4Registration.test.ts  (18 tests)
     ✓ src/compiler/resolution/spine4ProductionWiring.test.ts  (4 tests)
     ✓ src/compiler/resolution/resolveNounsPass.test.ts  (24 tests)
     ✓ src/compiler/resolution/compositionArgResolution.test.ts  (14 tests)

     Test Files  9 passed (9)
          Tests  123 passed (123)

Golden/fixture pins on absent-slot folds stayed green in the full suite
(goldenIntentToGraph, goldenProseBlobStrip, goldenIntentToClarification,
goldenRolesSeam, declaredArgumentReachability, clarificationContract,
scientistIntentContract, cueResolutionGate, rolesSeam, scientistIntent — all ✓).

## Full-suite baseline comparison (same worktree, stash recipe: tracked edits
stashed -> base run -> popped -> head run; untracked node_modules symlinks kept)

BASE (my 3 files reverted to HEAD):
     Test Files  88 failed | 673 passed | 9 skipped (770)
          Tests  99 failed | 6324 passed | 70 skipped (6666)
         Errors  2 errors
HEAD (with fix + tests):
     Test Files  89 failed | 672 passed | 9 skipped (770)
          Tests  100 failed | 6331 passed | 70 skipped (6674)
         Errors  2 errors

Fail-FILE set comm (python set-diff of `❯ <file>.test.ts` lines, both shapes
normalized):
     ONLY IN BASE: []
     ONLY IN HEAD: ['src/integration/W25DraftLifecyclePromotion.test.ts']
That single head-only entry is a LOAD-TIMEOUT flake, not a regression:
`Test timed out in 10000ms` on test (e) after 102841ms of suite load; run in
ISOLATION it passes:
     ✓ src/integration/W25DraftLifecyclePromotion.test.ts  (5 tests) 19715ms
     Test Files  1 passed (1)
(pre-existing-debt pattern already documented for this fleet: isolation rerun
before calling a timeout new).

src/compiler fail-file set is IDENTICAL base vs head (16 pre-existing failing
files: seedModels.fluorescence, QuadrantStampExpander, aiPrecompileGating,
BaselineFixtures, CrossTurnMini, FixItFixtures, FixtureRunner,
PatternExpandersDebug, Prompt01Green, Prompt02Green, Prompt04DeepDebug,
ParserEvalHarness, AiPrecompileShapeMismatch.log, GeminiEmAppliancePath,
FourLayerCorrespondence, StructuralCorrespondencePass). ZERO failures in
src/compiler/resolution in either run. Test-count delta: +7 passed / +1 failed
= the 8 new tests (paramFold 8->14, hedgeOptionality 15->17 — all green at
head) MINUS 1: the W25DraftLifecyclePromotion flake passed at base and timed
out at head under load (6324 + 8 - 1 = 6331 ✓).

Receipts: /tmp/w28-base-suite2.raw, /tmp/w28-head-suite.raw,
/tmp/w28-base-failfiles.txt, /tmp/w28-head-failfiles.txt (worktree captures).

## Typecheck

`npm run typecheck -w server` (tsc --noEmit):
- worktree BASE: 0 error lines, exit 0
- worktree HEAD: 0 error lines, exit 0
- cl-integration-2 trunk checkout: 0 error lines, exit 0
AS-FOLDSENT-2: the dispatch/spec pinned a "33 error lines pre-existing"
baseline; the measured baseline at this tip (9dc2f679, and at trunk
625da766) is ZERO. Zero NEW errors holds either way (0 -> 0, sorted-diff
identical). I did not chase the 33 figure; it likely pins an older tip or the
app workspace. Note: server tsconfig excludes test files, so the new test
files are not typechecked by tsc — they are exercised by vitest (esbuild
transform) and all pass.

## Worktree bootstrap (AS-FOLDSENT-1)

Fresh lane-2 worktree lacked materialization. Repaired per the lane-2
precedent (git stays clean — everything is lane-excluded via
/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430):
- symlinks: root `node_modules` -> cl-integration-2/node_modules,
  `server/node_modules` -> cl-integration-2/server/node_modules (package-lock
  sha256 verified identical: 6068d633...), `server/schema` -> `../schema`
  (worktree's own).
- copied the 43 lane-excluded-but-present server .ts sources from
  cl-integration-2 (clarificationLoop.ts, materialRefFields.ts,
  LifecycleBypassAudit.test.ts [healthy 184-line copy], etc.).
- copied 3 lane-excluded schema data files missing from the worktree
  (revision-ref.schema.yaml, 80x2ml-tube-rack.yaml, tube-size-presets.v1.yaml)
  — copies, not symlinks (SchemaLoader skips symlinked YAMLs).
After repair, `git status` shows only my 3 tracked edits; baselines read true
(base suite 88 fail files matches the lane-2 debt scale).

## Scope compliance

No changes to guards (1)(2)(3)(5), no UI, no endpoint, no prompt, no
ANSWER-BIND changes, no product YAML changes (no stack restart needed; nothing
touched :3001/:5174). `git diff --stat 9dc2f679..HEAD`: 3 files, +160/-2.
ESLint has no config in this repo (npm lint script unrunnable at tip —
pre-existing, not introduced).

## Assumptions recorded

- AS-FOLDSENT-1: bootstrap recipe above (lane-2 precedent) — baselines captured
  AFTER repair.
- AS-FOLDSENT-2: typecheck baseline measured 0 (not the spec's 33); zero-new
  proven 0->0.
- AS-FOLDSENT-3: the guard-(4) presence test is implemented inside the private
  `argumentPresent` helper (the spec allows "guard (4) site / the private
  argumentPresent ONLY"); the helper has exactly one call site — guard (4) —
  verified by grep.
- AS-FOLDSENT-4: W25DraftLifecyclePromotion.test.ts head-only timeout is the
  known load-timeout flake class (passes in isolation, unrelated import graph).

W28-FOLDSENT-1 DONE
