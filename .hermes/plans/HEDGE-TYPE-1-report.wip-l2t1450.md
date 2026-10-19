# HEDGE-TYPE-1 — CODER REPORT (wip-l2t1450)

Lane 2 · worktree /mnt/vast/home/brad/git/wt/HEDGE-TYPE-1-lane2-l2t1450
Branch feat/HEDGE-TYPE-1-lane2-l2t1450 off trunk tip 3e65a172 (cl/integration-2).
SAMPLE-CARD-1 (8ef18df4) NOT an ancestor of this base — per decision Q2 the two
tasks are order-independent; either order is authorized.
Spec: .hermes/plans/2026-10-18_HEDGE-TYPE-1-spec.md
Authority: .hermes/plans/decisions/W28-A5i-slotless-hedge-bar-decision.md (Q2 TASK HEDGE-TYPE-1)

Commits:
- RED:  587423f1  test(HEDGE-TYPE-1): RED pins (1 file, +254)
- FEAT: 9df81fac  feat(HEDGE-TYPE-1): prompt DATA + mirror (4 files, +343/-10 total vs base)

## 1. What changed (prompt DATA + generated verb-block only)

server/src/compiler/scientistIntent/intentCompile.ts
- RULES block rewritten per decision Q2 (1)-(3):
  - "Hedge under unresolved ONLY what the scientist STATED but you could not
    commit to (ambiguous, contradicted, existing-vs-new unknown) or a REQUIRED
    parameter the ARGUMENTS block marks required and the text omits — put it
    under unresolved instead of inventing it."
  - "NEVER hedge the absence of a parameter the ARGUMENTS block marks OPTIONAL:
    omit the field. The compiler's required-argument sweep and downstream fold
    own optional absences."
  - "Every unresolved entry about a specific action's argument MUST carry
    actionLocation: {actionIndex, action, argument} (the argument named exactly
    as the ARGUMENTS block declares it) and label: EXACTLY the scientist's own
    word for the thing — never a sentence. Use reason \"not-stated\" for a thing
    the scientist named but left uncommitted."
  - The offending blanket line "- If a parameter is ambiguous or missing, put it
    under unresolved instead of inventing it." is GONE (its anti-fabrication
    tail "instead of inventing it" survives inside the scoped REQUIRED-absence
    rule — byte-present).
- The unresolved example in TOP-LEVEL SHAPE now teaches
  `actionLocation: { actionIndex: 1, action: transfer, argument: source }` and
  reason vocabulary `<not-stated | ambiguous | contradicts-the-text>`.
- NEW generated ARGUMENTS block (decision Q2 (4)): local generator
  `promptArgContractBlock(vocab)` reads `vocab.verbs()` + `vocab.argContracts()`
  only — renders `name:kind` for required, `name?:kind` for optional (same
  rendering as contractBlock()). ZERO verb/arg name literals in TypeScript —
  same generation principle as promptVerbBlock(). Header line:
  "ARGUMENTS (declared per-verb arguments; a name written with '?' is OPTIONAL —
  the compiler treats its absence as legal):"
- ANTI-FABRICATION CORE byte-present (pinned in tests):
  "instead of inventing it" and "Do not add wells/volumes the scientist did not
  state."

schema/registry/prompt-templates/intent.compile.system.yaml (drift mirror)
- Same posture in lock-step: scoped hedge rule, NEVER-hedge-OPTIONAL rule,
  actionLocation + exact-label + not-stated mandate, unresolved example carries
  actionLocation, and the ARGUMENTS block rendered verbatim from the shipped
  vocabulary data (32 verb lines, `name?` = optional).

server/src/compiler/scientistIntent/promptShapeParity.test.ts
- normalizePlaceholders extended for the two new placeholder tokens so the
  taught-shape door keeps parsing the updated examples (2-line test-harness
  update, no policy change).

server/src/compiler/scientistIntent/hedgeOptionality.test.ts (NEW, RED-first)
- 15 tests: string pins on the generated prompt (offending line gone;
  optional-hedge prohibition present; actionLocation mandate present;
  not-stated + exact-label present; anti-fabrication core byte-pins), mirror
  lock-step pins, generated ARGUMENTS-block pins (SET diffs both directions;
  per-verb args mirror argContracts exactly — assertions iterate
  vocab.verbs()/argContracts(), zero verb/arg name literals in the test), and
  acceptance (a) fake-LLM legs (below).

## 2. Acceptance (a) — fake-LLM compile on the bead_beat macro shape

Test: hedgeOptionality.test.ts "hedge-type-1 acceptance (a)" — fake LLM client
(tool-call emission) + store-backed spine (single labware row so the stated
labware binds tier-1):
- `bead_beat` WITHOUT duration/cycles and with NO unresolved entries:
  intent.unresolved == [], compile.clarifications == [],
  **compile.outcome == 'complete'**, events non-empty incl. event_type 'mix'
  (beadBeatExpander lowers the macro). Proves downstream expansion tolerates
  declared-optional absence.
- Companion characterization: the SAME actions WITH a hedge
  ({label:'duration', reason:'not-stated', actionLocation:{0,bead_beat,duration}})
  -> outcome NOT 'complete' + clarifications non-empty. Proves the hedge (the
  emission contract's output), not the engine, manufactured the 0/5 wall.

## 3. Acceptance (b) — prompt + mirror drift tests green

Raw (log /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-targeted-green-l2t1450.log):

    ✓ src/compiler/scientistIntent/vocabularyContractBlock.test.ts  (3 tests)
    ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (6 tests)
    ✓ src/compiler/scientistIntent/hedgeOptionality.test.ts  (15 tests)
    ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests)
    ✓ src/compiler/scientistIntent/promptShapeParity.test.ts  (9 tests)
    ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests)

     Test Files  6 passed (6)
          Tests  56 passed (56)

vocabularyMirrorDrift (a)-(e) legs incl. (d) system-prompt block and (e) registry
template block: set diffs EMPTY both directions; mutation leg green.

## 4. RED-first evidence

Raw (log /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-red-l2t1450.log, run at
RED commit 587423f1 before any prompt edit):

     Test Files  1 failed (1)
          Tests  12 failed | 3 passed (15)

The 12 REDs are exactly the posture pins (offending-line-gone, optional-hedge
prohibition, actionLocation mandate, not-stated, mirror lock-step, generated
ARGUMENTS block legs); the 3 passes were the anti-fabrication byte-pins + the
two compile characterization legs (the engine already tolerated optional
absence at base — the wall was the emission contract, as the decision states).

## 5. Full server suite — failing-file NAME SET comm vs trunk baseline

Both runs in this worktree: tip (feat branch, 9df81fac) and detached base
(3e65a172), same untracked lane-exclude harness state (see §7).

TIP raw (/home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-full-tip-l2t1450.log):

     Test Files  89 failed | 671 passed | 9 skipped (769)
          Tests  99 failed | 6305 passed | 70 skipped (6647)

BASE raw (/home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-full-base-l2t1450.log):

     Test Files  90 failed | 669 passed | 9 skipped (768)
          Tests  99 failed | 6277 passed | 70 skipped (6619)

FAIL-file name sets (sorted unique from "FAIL  <file>" lines): 89 at tip, 90 at base.

    comm -13 base tip  ->  EMPTY   (ZERO new failing files at tip)
    comm -23 base tip  ->  src/foundry/FoundryCoderPatch.test.ts  (fails at BASE, passes at TIP)

Named honestly, not hidden: FoundryCoderPatch.test.ts failed at base with
`ENOENT ... schema/registry/prompt-templates/test-missing-var.yaml` — a
pre-existing concurrency race: PromptTemplateRegistry.test.ts writes then
unlinks test-vars.yaml / test-missing-var.yaml INTO the shared
schema/registry/prompt-templates directory while RegistryLoader enumerates that
directory for other suites in the same parallel run. It is timing-dependent
(load-order race), not caused nor fixed by this diff; standalone re-run at tip:
13/13 pass. The direction (base-fails -> tip-passes) means the green-set is
unchanged-or-better; the required comm (new failures) is EMPTY.

## 6. Acceptance (c) — ZERO engine-side file changes (empty diffs, commands pasted)

    $ git -c core.fileMode=false diff 3e65a172..HEAD -- server/src/compiler/resolution/resolveNounsPass.ts
    (no output — EMPTY)
    $ git -c core.fileMode=false diff 3e65a172..HEAD -- server/src/compiler/resolution/resolutionEngine.ts
    (no output — EMPTY)

Full diff stat (entire task surface):

     schema/registry/prompt-templates/intent.compile.system.yaml    |  53 ++++-
     server/src/compiler/scientistIntent/hedgeOptionality.test.ts   | 256 +++++++++++++++++++++
     server/src/compiler/scientistIntent/intentCompile.ts           |  42 +++-
     server/src/compiler/scientistIntent/promptShapeParity.test.ts  |   2 +
     4 files changed, 343 insertions(+), 10 deletions(-)

The bar (resolveNounsPass.ts:435) and the KEEP arm (:215-217) are untouched.
ZERO TS logic changes beyond the prompt-data generator inside intentCompile.ts
(prompt text + generated verb-block only, per the task's file list).

Typecheck: `npm run typecheck -w server` at base and at tip — 0 errors both;
sorted error-line comm EMPTY.

## 7. Worktree environment notes (for orchestrator verification)

- Fresh worktree needed the lane's untracked-but-ignored harness state to run
  the suite at all (tracked code imports gitignored files, e.g.
  server/src/ai/materialRefFields.ts imported by resolutionEngine.ts). I copied
  the lane-exclude list entries (/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430)
  from the lane trunk working tree into this worktree (same state the other lane
  worktrees carry) and created the standard symlinks:
  server/schema -> ../schema, server/node_modules, app/node_modules,
  node_modules -> /mnt/vast/home/brad/git/computable-lab/node_modules.
  None are tracked; none are in the diff.
- Lane stack :3093/:5193 never touched. No push, no merge, trunk untouched.

## 8. Honesty clause (A5g standing clause, discharged not evaded)

This is a ruling on the two named parameter facts (bead_beat duration/cycles)
and it deliberately makes the emitter SILENT about absent OPTIONAL params.
Grounds (per decision Q2): the vocabulary already declares their absence legal
(required:false data) and the engine's own sweep already exempts them
(resolveNounsPass requiredArgumentClarifications skips kind==='scalar' and
required!==true — verified byte-present, untouched); no information is
suppressed that the data treats as blocking, and the compiled action visibly
lacks the field. An informational notice for absent-optional params would be a
separate FOLD/notice product decision — not pre-decided here.

## 9. Open items / residuals

- Model-side compliance (the real emitter actually following the new rule) is
  proven only by the post-merge STEP-0 PROBE r3 (orchestrator-owned, decision
  Q4 arms A-D). This task ships the contract fix + headless proof that the
  engine tolerates the omission; arm B logic (completing draw still holding
  duration/cycles hedges -> emitter non-compliance) is the probe's job.
- SAMPLE-CARD-1 (the '/l' menu row for reason 'not-stated') is the companion
  task; the reason code this prompt instructs ('not-stated') and the
  actionLocation typing are the join surface it consumes.
- No UI surface in this task -> no browser gate (spec §Report/markers).

Marker: HEDGE-TYPE-1 DONE 9df81fac

---

## FIX RUN (l2t1920) — adversarial c1 defects D1..D4

Review: /home/brad/.hermes/cl/lanes/2/reviews/advc-HEDGETYPE1-c1-l2t1845.md
(VERDICT: fix — 2 major, 2 minor). All four defects fixed on this same
worktree/branch; no new worktree, no trunk touch, lane stack untouched.

Files changed in the fix commit (git -c core.fileMode=false diff --stat):

    .../prompt-templates/intent.compile.system.yaml    | 23 ++------
    .../scientistIntent/hedgeOptionality.test.ts       | 66 +++++++++++++++-------
    .../src/compiler/scientistIntent/intentCompile.ts  |  4 +-
    .../scientistIntent/vocabularyMirrorDrift.test.ts  | 61 ++++++++++++++++++++
    4 files changed, 115 insertions(+), 39 deletions(-)

### F1. D1 (MAJOR) — mirror ARGUMENTS block now ENFORCED by a drift leg

vocabularyMirrorDrift.test.ts gains:
- `argContractBlockLines(text)` — extracts the ARGUMENTS block from a prompt
  text (works identically on the generated prompt and the parsed mirror).
- NEW leg `(f) mirror ARGUMENTS block == generated promptArgContractBlock(vocab)
  — BYTE-identical line-for-line`: compares the mirror's block to the generated
  block line-by-line (mismatch list must be EMPTY), plus a per-verb/per-arg
  data leg asserting the mirror's marks agree with vocab.argContracts
  (required unmarked, optional carry '?').
- NEW `MUTATION LEG (D1)`: flips ONE required-vs-optional mark in a throwaway
  in-memory copy of the mirror text (bead_beat `duration?:scalar` ->
  `duration:scalar`) and asserts the byte-compare goes RED (mismatched.length
  == 1, mirror side carries the flipped mark, generated side the true one).
  Test-the-test: the enforcement leg demonstrably catches the desync class.

Independent byte-comparison (review §4 method, re-run at fix tip):

    gen lines: 32 mirror lines: 32
    TOTAL MISMATCH LINES: 0

Throwaway local desync check (NOT committed — mirror restored via
`git checkout --` immediately after; `git status` confirmed only the intended
files modified): with the mirror's bead_beat line deliberately desynced, the
new (f) leg FAILED as designed:

    ❯ ... > (f) mirror ARGUMENTS block == generated promptArgContractBlock(vocab) — BYTE-identical line-for-line
    ❯ ... > MUTATION LEG (D1): a stale mirror ARGUMENTS line (optional mark flipped) makes the byte-compare go RED
         Tests  2 failed | 6 passed (8)

### F2. D2 (MAJOR) — RED pins RESTORED to the strict 587423f1 literals

hedgeOptionality.test.ts pins restored to the exact RED-commit patterns:
- `/NEVER hedge the absence of an OPTIONAL parameter/` (both prompt + mirror)
- `/\{actionIndex:[^\n]*action:[^\n]*argument:/` (both)
- `/EXACTLY the scientist's own word/` (both)
- mirror anti-fabrication byte pins restored STRICT and strengthened:
  `toContain('instead of inventing it')` +
  `toContain('Do not add wells/volumes the scientist did not state.')`
  (the fragment-split is GONE).
The RED failures were resolved by changing the PRODUCT (mirror reflow +
wording alignment, F3), not by editing the assertions. Diff vs 587423f1 shows
the shipped pins are now a superset-strict of the RED pins (only additions:
the D4 mutation-leg asserts).

### F3. D3 (MINOR) — mirror anti-fabrication core byte-identical to generated

intent.compile.system.yaml RULES reflowed: each pinned phrase is now ONE
contiguous line at block-base indent (YAML block scalar keeps it unfolded),
and the wording is aligned to the generated prompt:
- `...put it under unresolved instead of inventing it.` (was "inventing a value.")
- `Do not add wells/volumes the scientist did not state.` (was "Do NOT add
  wells or volumes the / scientist did not state." wrapped)
- `actionLocation: {actionIndex: 0, ...` in the mirror's TOP-LEVEL SHAPE and
  `{actionIndex: 1, ...` in the generated prompt — the strict
  `/\{actionIndex:[^\n]*action:[^\n]*argument:/` pin now matches BOTH artifacts
  (the space after `{` was what the loosened regex had papered over).
Generated prompt wording aligned too: `NEVER hedge the absence of an OPTIONAL
parameter (the ARGUMENTS block marks it optional): omit the field.` — the
strict `/NEVER hedge the absence of an OPTIONAL parameter/` pin now matches
both artifacts verbatim.
Mandate grep (raw):

    $ grep -n "instead of inventing it" server/src/compiler/scientistIntent/intentCompile.ts schema/registry/prompt-templates/intent.compile.system.yaml
    intentCompile.ts:129: ... put it under unresolved instead of inventing it.
    intent.compile.system.yaml:93: ... put it under unresolved instead of inventing it.
    $ grep -n "Do not add wells/volumes the scientist did not state." <same two files>
    intentCompile.ts:127: - Do not add wells/volumes the scientist did not state.
    intent.compile.system.yaml:97: - Keep it as simple as the scientist said it. Do not add wells/volumes the scientist did not state.

### F4. D4 (MINOR) — real mutation leg replaces the overclaiming test

The 'rip-out posture' test now uses the vocab-minus-pellet FIXTURE
(loadScientistIntentVocabulary({path: fixtures/vocab-minus-pellet/...})):
asserts the shipped block HAS `- pellet`, the fixture-generated block does
NOT, and a set diff shows fixture block verbs == shipped minus pellet. The
rip-out property is genuinely exercised (mirrors vocabularyMirrorDrift's
mutation leg), zero TS edits.

### V1. RED evidence for the fix (strictened pins first)

Log: /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-fix1-red-l2t1920.log
(strictened test files run against the pre-fix product):

    Test Files  1 failed | 1 passed (2)
         Tests  5 failed | 18 passed (23)

The 5 failures: generated-prompt NEVER-hedge pin, generated actionLocation
strict regex pin, mirror NEVER-hedge pin, mirror actionLocation strict regex
pin, mirror anti-fabrication byte pins ('instead of inventing it' /
contiguous wells clause). vocabularyMirrorDrift passed at this point (8 tests)
because its new (f) leg byte-compares mirror-vs-generated — both were
hand-matched pre-reflow; the D1 gap was enforcement, proven by the throwaway
desync check in F1. The D4 fixture leg passed pre-fix (it tests generation,
which was already data-driven; the defect was the test's fake body).

### V2. Targeted green (post-fix)

Log: /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-fix1-targeted-green-l2t1920.log

    ✓ src/compiler/scientistIntent/vocabularyContractBlock.test.ts  (3 tests)
    ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (8 tests)
    ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests)
    ✓ src/compiler/scientistIntent/hedgeOptionality.test.ts  (15 tests)
    ✓ src/compiler/scientistIntent/promptShapeParity.test.ts  (9 tests)
    ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests)
    Test Files  6 passed (6)
         Tests  58 passed (58)

vocabularyMirrorDrift: GREEN (8 tests — 6 prior + (f) byte-compare + D1
mutation leg). promptShapeParity: GREEN (9 tests).

### V3. Whole directory green

    $ cd server && npm run test:run src/compiler/scientistIntent
    Log: /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-fix1-green-dir-l2t1920.log
    Test Files  25 passed (25)
         Tests  284 passed (284)   (was 282 at c1 tip; +2 = the new D1 legs)

### V4. Criterion (c) — engine empty-diff commands (re-run at fix tip)

    $ git -c core.fileMode=false diff 3e65a172...HEAD -- server/src/compiler/resolution/resolveNounsPass.ts
    (no output — EMPTY)
    $ git -c core.fileMode=false diff 3e65a172...HEAD -- server/src/compiler/resolution/resolutionEngine.ts
    (no output — EMPTY)
    $ git -c core.fileMode=false diff 3e65a172 -- server/src/compiler/resolution/resolveNounsPass.ts server/src/compiler/resolution/resolutionEngine.ts | wc -l
    0

### V5. Server typecheck (zero NEW errors)

    $ npm run typecheck -w server   (from worktree root)
    > @computable/server@1.0.0 typecheck
    > tsc --noEmit
    (exit 0 — zero errors, same as c1 tip)

### V6. Full server suite — fail-file NAME SET comm vs base (unchanged)

Fix-tip raw: /home/brad/.hermes/cl/lanes/2/logs/HEDGE-TYPE-1-fix1-full-tip-l2t1920.log

    Test Files  89 failed | 671 passed | 9 skipped (769)
         Tests  99 failed | 6309 passed | 70 skipped (6651)

FAIL-file name sets (sorted unique from "FAIL  <file>" lines): 89 at fix tip,
90 at base (same base raw as §5).

    comm -13 base fix1  ->  EMPTY   (ZERO new failing files)
    comm -23 base fix1  ->  src/foundry/FoundryCoderPatch.test.ts  (fails at BASE, passes at tip — same direction as §5)

Named honestly: ZymoCampaignNegatives.test.ts (2 legs: import-set closure +
pipeline/routes sha pins) is in the BASE fail-file set (line 63 of both
sorted lists) — pre-existing trunk debt, not introduced by this fix run; it
fails identically at c1 tip and at fix tip.

### V7. Constraints re-verified

- Zero engine-file changes (V4). resolveNounsPass.ts:435 bar + KEEP arm untouched.
- Anti-fabrication core byte-present in generated prompt AND mirror (F3 grep).
- Generated ARGUMENTS block still from vocabulary data — intentCompile.ts fix
  diff is 4 lines of template DATA text only (wording alignment); the renderer
  promptArgContractBlock() is unchanged; zero verb/arg name literals added.
- exactOptionalPropertyTypes: typecheck exit 0 (V5).
- Mirror yaml change needs a lane-stack restart to reach running registry
  consumers (unchanged note from c1; orchestrator-owned).

Marker: HEDGE-TYPE-1 FIX1 DONE 5f8671c5
