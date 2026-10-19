# W28-OPTIONBIND1 report — LANE 2 (W28-SOURCEROW-1 + W28-OPTIONBIND-1) — wip-l2t1515

Branch: cl/lane2-w28-optionbind1-l2t1515
Worktree: /mnt/vast/home/brad/git/wt/W28-OPTIONBIND1-lane2-l2t1515
Base: 2777d964af737036d02e6c65f965bed3dda075ba
Spec: .hermes/plans/2026-10-19_1515-W28-OPTIONBIND-1-and-SOURCEROW-1-prer6-spec.md
Authority: .hermes/plans/decisions/W28-A5n-defect2-partial-draw-and-obs3-source-surface-decision.md (W28-A5n DECIDED)

## Commit groups (4 commits, RED separate from impl per group)

Group 1 — W28-SOURCEROW-1:
- f279120f test(sourcerow): RED - (not-stated,source) must render /l per W28-A5n Q2
- a5fd90a7 feat(sourcerow): (not-stated,source) renders /l - declared domain: labware (W28-A5n Q2)

Group 2 — W28-OPTIONBIND-1:
- d3333190 test(optionbind): RED - engine candidate record handle + option idiom emit (W28-A5n Q1)
- 6ef0263d feat(optionbind): candidate record handle on the engine fact + option-pick emits the binding idiom (W28-A5n Q1)

## Baselines (recorded BEFORE edits, on the pristine worktree at 2777d964)

Lane setup first: node_modules symlinks to cl-integration-2 (root/app/server), the
lane-sync symlink pattern reproduced from cl-integration-2 (56 symlinks), and
server/schema -> worktree schema symlink (matches trunk's ignored layout; without
it the schema-loading suites fail at load).

- app tsc (pristine): 23 error lines (.hermes/evidence/l2t1515/base-app-tsc.txt)
- server tsc (pristine): 0 error lines (base-server-tsc.txt). Trunk cross-check:
  `cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit` -> 0
  error lines. THE SPEC'S "33 error lines" FIGURE IS STALE vs this trunk tip;
  the recorded baseline (0) is what "zero new" is measured against.
- server full vitest (pristine): Test Files 90 failed | 672 passed | 9 skipped
  (771); Tests 101 failed | 6338 passed | 70 skipped (6691) (base-server-full.txt;
  fail-file set extracted to base-server-failfiles.txt, 90 files).
- app targeted baseline (adapter gapcard+sampleCard1+adapter+heldBundle+
  gapcard.tsx+cards): 6 files / 37 tests passed (base-app-targeted.txt).
- Targeted server suites green at baseline: nounResolution, resolveNounsPass,
  clarificationContract, goldenIntentToClarification,
  IntentCompileFromPromptHandlers(.test + .answeredBinding) — none appear in the
  baseline fail-file set.

## Group 1 — W28-SOURCEROW-1

RED (f279120f, red1-sourcerow.txt):
    AssertionError: declared domain: labware — '/l' (resolveLabware, no mint
    floor), never the '/m' material funnel: expected '/m' to be '/l'
    Test Files  1 failed (1); Tests  1 failed | 2 passed (3)

Impl (a5fd90a7): one DATA row of the declared presentation table
CLARIFICATION_MENU_BY_REASON_ARGUMENT: 'not-stated': { labware: '/l', source: '/l' }.
Zero code change (menuForFact is the ONE existing read path). Grounding:
scientist-intent-vocabulary.yaml declares every 'source' argument (all 23 verbs)
kind: resolvable + domain: labware and never a material-domain source — '/m' was
a domain misroute of the DECLARED kind (verified programmatically: 91 resolvable
args, 0 without a domain). The (reason,'*) fallback 'not-stated': '/m' STAYS.
Deliberate pin flip in the SAME commit: gapcard test 5's 'not-stated' 'source'
expectation '/m' -> '/l' ONLY; the other three reasons' 'source' pins stay '/m'
(pinned via an explicit expectedSourceMenu map so the flip is auditable).

GREEN (green1-app-targeted.txt): sourcerow 3/3, gapcard 10/10, sampleCard1 4/4,
adapter 9/9 + heldBundle/gapcard.tsx/cards pins — 7 files / 40 tests passed
(sampleCard1 green by RUNNING, not reasoning).

## Group 2 — W28-OPTIONBIND-1

RED (d3333190):
- server resolutionEngine.optionRef.test.ts (red2-server.txt): Tests 5 failed |
  4 passed (9) — legs 1,2,3,6,7 fail (no ref emitted / no ref key / parse-door
  leg); anti-fabrication legs 4,5,8,9 already hold at base.
- app ProtocolLocalizationThread.optionbind.test.tsx (red2-app.txt): Tests 2
  failed | 2 passed (4):
    expected undefined to be 'lbw-seed-tube-1p5ml'
    expected '1.5 mL Microcentrifuge Tube' to be '[[labware:lbw-seed-tube-1p5ml|1.5 mL ...'
  Test 4 (no-ref plain-label contrast) holds at base AND after the fix.

Impl (6ef0263d), four linked legs, additive-only:
1. server/src/compiler/resolution/resolutionEngine.ts — candidateRecordRef():
   ref populated ONLY from a tier <= 1 candidate whose CURIE names a record.
   The spine's declared `local:<recordId>` prefix unwrap mirrors
   resolveNounsPass.ts recordIdFromCurie exactly (untouched file, read-only
   reference); labware-hint/registry adapters' bare-recordId curies ride
   verbatim. Anti-fabrication: tier > 1 (oak/ols4/vendor), the tier-5 mint
   affordance (no curie), and role-address `local:well:<address>` (a WELL, not
   a record — a suffix still carrying ':' is not a record id) carry NO ref.
   exactOptionalPropertyTypes: conditional spread, absent-or-value, never
   :undefined. The emitted value is the bare record id, i.e. exactly the id
   ClarificationPicker.tsx answerFromMention's `[[labware:<id>|label]]` idiom
   carries, so the existing server validation (MENTION_ANSWER_PATTERN +
   store.get) accepts it unchanged.
2. SPINE-1 frozen candidate shape, additive-only:
   schema/workflow/scientist-intent.schema.yaml gains
   `ref: {type: string, minLength: 1}` on the unresolved candidate entry;
   server/src/compiler/scientistIntent/types.ts candidates gains `ref?: string`.
   additionalProperties: false / unevaluatedProperties: false / required
   ['label'] posture UNCHANGED — clarificationContract's "rejects an extra
   property" leg still passes (undeclared keys still rejected).
   parseScientistIntent.ts UNTOUCHED: the parse door copies only
   {label, confidence} from a model candidate — a model cannot inject a handle
   (optionRef test leg 7 pins this).
3. app clarificationAdapter.ts option mapping: the wire candidate's ref rides
   onto the EXISTING AiClarificationOption.ref? field (types/ai.ts, as
   {id: <recordId>} — the semantics MessageLog.optionRefId already reads).
   No-ref candidate -> option shape byte-unchanged.
4. app ProtocolLocalizationThread.tsx option onClick: an option carrying a ref
   gains mentionToken = mentionTokenForOption(request, option) (the EXISTING
   builder ClarificationPicker's answerFromMention rides, same
   safeMentionPart rules), so the answer value at :410
   (`answer.mentionToken ?? answer.label ?? answer.value`) IS the
   [[labware:<id>|label]] idiom. No-ref option: today's plain-label path
   byte-unchanged. No new endpoint (the existing re-send round-trip).

DELIBERATE PIN UPDATES (sanctioned pin+row pattern, same commit as impl —
auditable, not rubber-stamped):
- MANIFEST.yaml schema sha: a670a50c021037c8... -> 5327495e9c708df7... (the
  only schema delta is the new optional ref block; comment records this).
- __records__/ambiguous-material.golden.json re-blessed ONCE via the
  replayKernel itself (one-shot evidence script server/tmp/rebless-write.ts,
  git-ignored, NOT committed): before/after stableStringify diff shows the ONLY
  divergence is the two ambiguous-noun candidates gaining
  ref: LAB-plate-alpha / LAB-plate-beta; sha 47a15d73... -> 5fc65b92...
  Fixture bytes unchanged; every other blessed record unchanged (mint-affordance
  and lookup-failure arms carry NO ref — anti-fabrication legs 4-6).
- clarificationContract.test.ts candidate-shape freeze: keys
  ['confidence','label'] -> ['confidence','label','ref'] + ref type/minLength
  pins; required stays ['label'].
- goldenIntentToClarification.test.ts literal candidate pin gains the fixture
  store ids; IntentCompileFromPromptHandlers.answeredBinding.test.ts verbatim
  payload pin gains ref: 'LAB-mct-ont' / 'LAB-mct-seed' (the store's own ids).

HARD CONSTRAINTS HELD (verified):
- resolveNounsPass.ts diff vs base: 0 lines (value-join :313 and the
  STAGNANT-HEDGE consume rule byte-unchanged).
- No lint YAML, prompt template, accept path, fixture YAML changes; no new
  endpoints; no hardcoded domain literals (tier gate + the spine's declared
  CURIE prefix only).
- exactOptionalPropertyTypes: every optional rides as conditional spread
  (absent OR value).

## VERIFY — real outputs

APP targeted (post-impl, whole protocol dir incl. all pins):
    Test Files  26 passed (26)
         Tests  205 passed (205)
  (includes clarificationAdapter gapcard 10, sampleCard1 4, adapter 9,
   sourcerow 3, optionbind 4, gapcard.tsx, heldBundle, cards, test.tsx)

APP tsc (post-impl): 23 error lines == baseline 23. Comm of sorted error-line
sets shows the ONLY difference is a pre-existing error's line-number shift:
    < ...ProtocolLocalizationThread.tsx(233,35): error TS2339: Property 'runDeckLock' ...
    > ...ProtocolLocalizationThread.tsx(234,35): error TS2339: Property 'runDeckLock' ...
  (the import line added for mentionTokenForOption shifted it; ZERO new errors).

SERVER targeted (post-commit rerun, green2-server-targeted-final.txt):
    ✓ resolutionEngine.optionRef.test.ts (9)
    ✓ nounResolution.test.ts (16)
    ✓ clarificationContract.test.ts (15)
    ✓ IntentCompileFromPromptHandlers.answeredBinding.test.ts (7)
    ✓ IntentCompileFromPromptHandlers.test.ts (11)
    ✓ goldenIntentToClarification.test.ts (6)
    ✓ resolveNounsPass.test.ts (24)
    Test Files  7 passed (7); Tests  88 passed (88)

SERVER tsc (post-impl): 0 error lines == baseline 0 (post-server-tsc.txt).
(The spec's "stays 33" pin is stale vs this trunk tip; zero-new holds against
the recorded baseline.)

SERVER full-suite fail-file SET vs baseline (comm of sorted FAIL-file lists):
- Run 1 (post-server-full.txt): +W25CandidateImmutability, +W25DraftLifecycle-
  Promotion, +Wave2SemanticPassE2E, -DraftCopyDerivedRefValidation. All three
  new fails are hook/test TIMEOUTS under load (NFS), zero mention of
  candidateRecordRef/ref anywhere in the run (grep count 0); run in isolation:
  4 files / 29 tests ALL PASS.
- Run 2 (post-server-full2.txt): fail-file set 88 files = a STRICT SUBSET of
  the 90 baseline files (only baseline flaps ZymoCampaignGoldenE2E and
  DraftCopyDerivedRefValidation flipped to pass; ZERO new fail files).
  Conclusion: no new failing file attributable to this lane; the deltas are the
  known load-timeout flaps (proven by isolation + second-run comm, not asserted).

## Notes / assumptions
- Spec's server-typecheck "33 error lines" does not match the trunk tip at
  2777d964 (measured 0 in both trunk and pristine worktree); zero-new is
  reported against the measured baseline.
- server/tmp/rebless-write.ts is a git-ignored one-shot evidence script (the
  re-bless used the SAME replayKernel the suite uses — no hand-edited JSON).
- Pre-existing LSP-only noise in clarificationContract.test.ts (lines 94/106
  Record-cast warnings) exists identically at base; test files are excluded
  from server tsc, so it never enters the typecheck count.
- Nothing merged; trunk untouched; stacks untouched.

W28-OPTIONBIND1 DONE 6ef0263da6c3b91369d58524e5e39c2e696a8542
