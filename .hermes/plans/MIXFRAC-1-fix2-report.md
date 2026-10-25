# MIXFRAC-1 (lane 2) — FIX RUN 2 coder report — tag l2t2110

Item: MIXFRAC-1 — composition-fraction convention as DATA + sum bar with three candidate readings.
Worktree: /mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-l2t0310  branch cl/lane2-mixfrac1-l2t0310
Base reviewed: f813d4d8 (cycle-1 fix, D1-D4 closed). Cycle-2 review: review-MIXFRAC1-cycle2-l2t2110.md (VERDICT: fix).
THIS RUN'S COMMIT: 6aec9eb5 — ONE commit directly on f813d4d8 (no amend, no rebase).
`git -c core.fileMode=false log --oneline -2`:
  6aec9eb5 fix(mixfrac-1): adversarial-gate fix run 2 — N1 settled flat view strips the declared nested key (no expander re-flatten, snapshot == reading's finalFractions), N2 dead settledComposition field deleted, N3 full-pipeline legs per reading, O3 answer-key contract comment
  f813d4d8 fix(mixfrac-1): adversarial-gate fix run 1 ...
All git via `git -c core.fileMode=false` (NFS mode-bit noise). Worktree left clean: `git -c core.fileMode=false status --short` -> empty. No stack touched (:3001/:5174/:3092/:5192 untouched; :3093/:5193 not used at all).

Diff inventory (14 files, 614 insertions / 6 deletions):
- M server/src/compiler/scientistIntent/compositionFractions.ts   (+35/-6)  — N1 fix, N2 deletion, O3 comment
- M server/src/compiler/scientistIntent/compositionFractions.test.ts (+220)  — N1 RED-first tests + N3 coverage
- A .hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-*.txt (12 raws)
Cycle-1's closed work (D1-D4) is untouched except where N1 required it: the whole-mixture unit leg
(compositionFractions.test.ts:428-443) gained only the nested-key assertion; no D1/D2/D4 file was edited.

---

## N1 (MAJOR, correctness) — FIXED

Cause (as the review named it): `settleCompositionFromReading`'s non-nested branch spread
`entry.source` onto the settled line, so the declared nested `composition` key SURVIVED on the
"flat" line; the verb expander `compositionSnapshotFromParams`
(server/src/compiler/biology/verbs/simpleVerbs.ts:432-458 — `nested && parentParsed -> childLines`)
then treated the already-settled share as a PARENT share and re-flattened the declared children on
top of the reading's own arithmetic — double-counting plus a duplicate component line.

Fix — server/src/compiler/scientistIntent/compositionFractions.ts:686-708 (the `else` branch of
`settleCompositionFromReading`): the flat line is now emitted FRESH from the fields the flat view is
allowed to carry (material/role + verbatim concentration/count/counterDensity) with the declared
`composition` key STRIPPED — exactly the shape the nested branch (:676-685) already produces by
dropping the parent line. Comment at :687-698 records the why (expander re-flatten / §14.2 "the
nested form NEVER rides a snapshot entry"). The excluded-role (cells) passthrough (:713-716) and the
absorbed-supplement drop are unchanged; the preceding-noun-recipe nested branch is unchanged.

RED-FIRST (both new full-pipeline legs were RED before the product edit, shaped on the review's
§3.5 probe: real handler route, same nested 110% document, answer value varied per reading):

  RED raw 1 (harness-shape capture): .hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-red1-n1-tests-red-harness-status-artifact.txt
    Tests 4 failed | 20 passed (24) — the first capture showed the success path sends with no explicit
    status (fastify default 200), so my status pin read `undefined`. That was a TEST-harness artifact,
    not the defect; I normalized it the way replayKernel does (`status ?? 200`) and re-captured.

  RED raw 2 (the defect's own numbers, pre-fix): .hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-red2-n1-tests-red-defect-numbers.txt
    Tests 3 failed | 20 passed (24)
    whole-mixture-supplement:  snapshot Map{ DMEM => 40.5, FBS => 10, Trypsin-EDTA => 45 }
                               expected  Map{ DMEM => 45,   FBS => 10, Trypsin-EDTA => 45 }
    explicit-on-top:           snapshot Map{ DMEM => 45,   FBS => 10, Trypsin-EDTA => 50 }
                               expected  Map{ DMEM => 50,   FBS => 10, Trypsin-EDTA => 50 }
    unit leg (explicit-on-top): "expected [ Array(4) ] to not include 'composition'" — the stale nested
                               key on the settled flat line, the review's Probe A shape.
    These are the review's probe numbers reproduced in-suite (40.5/4.5-class double-flatten; the
    duplicate line shows as the DMEM/FBS divergence plus the duplicate-line assertion).

GREEN raw (same tests, post-fix): .hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-green1-compositionfractions-24.txt
    ✓ src/compiler/scientistIntent/compositionFractions.test.ts (24 tests) 347ms
      Test Files 1 passed (1)   Tests 24 passed (24)

New legs (compositionFractions.test.ts):
- :698-720 whole-mixture-supplement -> 200/complete, snapshot fractions == readings['whole-mixture-supplement'].finalFractions (45/45/10), no duplicate component line, cells line rides as a count.
- :721-737 explicit-on-top -> 200/complete, snapshot == that reading's finalFractions (50/50/10), no duplicate line.
- :738-751 preceding-noun-recipe regression guard -> snapshot == 50/45/5 (the ratified golden path, not regressed).
- :752-766 unit leg: explicit-on-top settles the carried composition with NO nested key on any flat line.
- :411 and :442 — the §14.2 "flat view never carries a nested entry" loop now runs on BOTH non-nested
  unit legs (preceding-noun leg already had it from cycle 1).

Assumption AS-N1-1: the settled flat line keeps verbatim `concentration`/`count`/`counterDensity` from
the declared source (the fields the flat view is allowed to carry) and drops only the declared
`composition` key. The declared nested truth still rides the held localMacro untouched (the golden
record leg asserts that: goldenIntentToGraph.test.ts:176-183, still green).

## N2 (minor) — FIXED

`settledComposition?: unknown[]` deleted from `FractionCheckOutcome`
(server/src/compiler/scientistIntent/compositionFractions.ts:555-558 now carries only
`clarification?` / `resolvedFractions?`), and the misleading doc-comment clause rewritten (:548-554)
to state the truth: an ANSWERED bar produces neither — `settleCompositionFromReading` returns the
settled flat view directly to the caller (normalizeScientistIntent.ts:879-883), which writes it onto
the candidate event; it never rides the outcome object. Smallest honest change (delete, not implement).
Proof: `grep -rn settledComposition server/src` -> no matches
(.hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-bait4-grep.txt).

## N3 (minor, coverage) — CLOSED

One full-pipeline leg asserting snapshot == readings[i].finalFractions for EACH reading the bar
presents, including both non-nested ones:
- whole-mixture-supplement (rebase-to-total): compositionFractions.test.ts:699-720
- explicit-on-top (keep-declared): compositionFractions.test.ts:721-737
- preceding-noun-recipe (attach-to-preceding, regression guard): :738-751
Each compares the compiled snapshot's fraction lines against the SAME bar's own `readings[i].finalFractions`
data (read from the bar leg of the same document — the numbers the panel shows), plus a
duplicate-component-line assertion and a nested-key assertion on the carried composition.

## Orchestrator rulings applied

- O1: no revert, no widening. `IntentCompileFromPromptHandlers.ts` and `compileScientistIntent.ts`
  are byte-unchanged in 6aec9eb5 (diff --stat lists only the two compositionFractions files). The
  answer channel stays as cycle-1 shipped it.
- O2: no spec edit (I do not touch the integration trunk). The ratified-limitation sentence for the
  spec §1/§4 area is in the section below for the orchestrator to fold in. The code comment
  (compositionFractions.ts:726-733) is kept as-is.
- O3: comment-only at the label-join site — compositionFractions.ts:785-791 documents the
  client-visible contract: the joined parseable-label string IS the answer key; the settle leg matches
  by exact identity, never containment; malformed-fraction entries never appear in the key. No
  behavior change (`const label = parseable.map(...).join(', ')` line itself is unchanged).

## Ratified-limitation text (for the orchestrator to fold into the spec §1/§4 area)

> RATIFIED LIMITATION (adversarial review l2t1855 D4, orchestrator ruling): the sum check applies
> only to a FULLY declared composition — an entry with no declared fraction string is out of scope,
> because the goal is "a composition whose DECLARED fractions do not sum to the declared convention
> total"; a partially-declared composition therefore skips the check entirely (it has no
> declared-fraction sum to break), and this is not an oversight to widen.

## Verification raws

Evidence home: /mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-l2t0310/.hermes/evidence/MIXFRAC1-l2t0310/

| raw | content |
|---|---|
| fix2-l2t2110-red1-n1-tests-red-harness-status-artifact.txt | RED capture 1 (4 failed / 20 passed) — status-pin harness artifact |
| fix2-l2t2110-red2-n1-tests-red-defect-numbers.txt | RED capture 2 (3 failed / 20 passed) — the defect's own numbers (DMEM 40.5 / 45-vs-50, stale nested key) |
| fix2-l2t2110-green1-compositionfractions-24.txt | GREEN, same file: 24 passed |
| fix2-l2t2110-green2-argresolution-15.txt | compositionArgResolution.test.ts alone: 15 passed |
| fix2-l2t2110-green3-golden-graph-5.txt | goldens/goldenIntentToGraph.test.ts alone (review O4: own line): 5 passed |
| fix2-l2t2110-green4-goldens-suite-23.txt | whole goldens dir: 4 files / 23 passed (incl. manifest hash check) |
| fix2-l2t2110-green5-adjacent-handler-mixture-21.txt | IntentCompileFromPromptHandlers.test.ts + mixtureRedundancy: 21 passed |
| fix2-l2t2110-green6-scientistintent-dir-314.txt | src/compiler/scientistIntent dir: 26 files / 314 passed |
| fix2-l2t2110-green7-resolution-biology-215.txt | src/compiler/resolution + src/compiler/biology: 22 files / 215 passed |
| fix2-l2t2110-typecheck.txt | `npm run typecheck -w server` -> tsc --noEmit, TYPECHECK_EXIT=0 (zero new) |
| fix2-l2t2110-manifest-hashes-unchanged.txt | on-disk sha256 of all 4 mixfrac fixtures + 4 records == MANIFEST pins |
| fix2-l2t2110-bait4-grep.txt | bait-4 grep over the fix2 added production lines: EXIT 1 (zero matches); settledComposition grep: EXIT 1 |

Mandated targeted suites, run individually (review O4 quirk respected — golden path on its own line):

```
$ cd server && npx vitest run src/compiler/scientistIntent/compositionFractions.test.ts
 ✓ src/compiler/scientistIntent/compositionFractions.test.ts  (24 tests) 347ms
 Test Files  1 passed (1)
      Tests  24 passed (24)

$ cd server && npx vitest run src/compiler/resolution/compositionArgResolution.test.ts
 ✓ src/compiler/resolution/compositionArgResolution.test.ts  (15 tests) 1350ms
 Test Files  1 passed (1)
      Tests  15 passed (15)

$ cd server && npx vitest run src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts
 ✓ src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts  (5 tests) 270ms
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ cd <wt> && npm run typecheck -w server
> tsc --noEmit
TYPECHECK_EXIT=0
```

## MANIFEST

NO re-bless: no blessed artifact moved. On-disk hashes equal the MANIFEST pins exactly for all four
mixfrac fixtures and all four records (raw: fix2-l2t2110-manifest-hashes-unchanged.txt), e.g.
fixtures/mixfrac-canonical-flat.yaml 509da519…84f103a == MANIFEST:73 and
__records__/mixfrac-canonical-flat.golden.json a2d1ef36…52d4831d == MANIFEST:146. The new coverage
legs live in compositionFractions.test.ts (the §5 real-route harness idiom already in that file), so
no new golden fixture/record was authored and no pin needed moving. The goldens dir suite (4 files,
23 tests, including golden.manifest.versions-current) is green, which is the in-suite proof that no
pin drifted.

## Assumptions

- AS-N1-1 (above): the settled flat line carries material/role + verbatim concentration/count/
  counterDensity and drops only the declared `composition` key.
- AS-N1-2: the new full-pipeline legs use the compositionFractions.test.ts §5 harness idiom (real
  handler route, stubbed model client + store) rather than a new blessed golden, because the review's
  suggested direction was "replayKernel/golden OR the handler harness" and the handler harness already
  exists in this file — this keeps the MANIFEST pin set unmoved. The existing blessed answer-driven
  golden (mixfrac-canonical-flat) still covers the preceding-noun record leg end to end.
- AS-N1-3: the snapshot-vs-reading comparison parses the percent out of the ratified source form
  ("<value>% of the mixture") and compares against the bar's own finalFractions numbers; the cells
  line is compared as a count line (no source), not as a fraction.
- AS-H-1: the first RED capture's `undefined` status is a fastify default-status artifact of my mock
  reply (replayKernel normalizes the same way with `status ?? 200`); the defect-carrying RED is
  capture 2, which shows the wrong fractions.

## Unresolved / for the orchestrator

- Nothing blocks this item. The O2 sentence above still needs folding into the canonical spec file in
  the integration worktree (not mine to edit).
- Acceptance is the orchestrator's re-review, not this report: implementation complete, acceptance pending.

STATUS: complete
