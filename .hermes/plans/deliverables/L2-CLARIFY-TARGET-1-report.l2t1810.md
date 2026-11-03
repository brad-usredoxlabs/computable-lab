# L2-CLARIFY-TARGET-1 — coder report (l2t1810)

Worker: cl-coder, worktree `wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, branch `cl/lane2-target1-1-l2t1810`.
Spec: `.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md` (RE-PIN edition, 954 lines, read IN FULL).
OQ1/OQ2/OQ3 rulings + OQ4/OQ5 recommendations + AMENDMENT l2t0920 are BINDING.

## 0. Base-tip proof

- `git merge-base --is-ancestor 4a65d4c1 HEAD` → OK (command printed `BASE-OK`).
- Branch tip at start: `93c38e9240ec103f358af3feb3a49a7b274777f0` (two doc-only commits above base `4a65d4c1`).

## 1. PIN TABLE re-verification at tip (all rows verified first-hand, grep/sed)

All rows of the spec's PIN TABLE **HOLD** at the branch tip with no MOVED/CHANGED deltas:

- simpleVerbs.ts: `:559` `const volumeUl =`, `:587` `const resolvedVolumeUl =`, `:593` `const volumeDetails:`, `:642` modern material-spread — HOLD. (`:617` legacy LABEL pin: line carries the legacy add_material material label; verified by context of the :642 spread — HOLDS.)
- aiPlanningTools.ts:343 `?? 100` — HOLD (MCP only, out of scope).
- submitSuggestionTool.ts `:635-647` (shorthand desc start, `volumeUl: 100` `:645`, `targetWells: [A1]` `:646`, `SHORTHAND_CONTRACT_BLOCK` `:647`) — HOLD, byte-frozen.
- shorthandChat.ts repair prompts `:1345`/`:1346` and `:1378`/`:1379` (`'    volumeUl: 100'` / `'    targetWells: [A1]'`) — HOLD, byte-frozen.
- scientist-intent-vocabulary.yaml: `:246` `- name: add_material`, `:294` `- name: volumeUl` (add_material), `:296` `required: false` (FACT OF RECORD, flip lands here), `:300` `- name: composition`, `:305` `itemNounField: material` (insert targetWells AFTER), `:531` `- name: aliquot`, `:556` SPINE-7 comment, `:559` `- name: targetWells` (aliquot), `:561` `required: true` — HOLD.
- scientist-intent.schema.yaml: `:107` `targetWells:`, `:113` oneOf end, `:166` `volume: {}`, `:167` `volumeUl:`, `:168` `type: number` — HOLD.
- resolveNounsPass.ts: `:65` reason const, `:123` answeredSlots channel, `:140`/`:143` output interface, `:252`/`:255` argumentPresent (number arm :255), `:259` sweep, `:269` scalar skip, `:270` required skip, `:274`/`:275` fact emission, `:462` recomputed-from-folded-intent, `:485`/`:487` KEEP arm — HOLD.
- compileScientistIntent.ts `:133`/`:141` result interface, `:390` W12 wiring — HOLD.
- nounCoverage.ts `:99`/`:121` (resolvable-only; do not widen — S5) — HOLD.
- clarificationDedupe.ts `:66`/`:74` — HOLD.
- wellRange.ts `:38` `expandWellTokens` — HOLD.
- nounShape.ts `:29`/`:52`/`:65` (path idiom, per-call loader, throw idiom) — HOLD.
- config/drafting/shorthand-drafting.yaml `:27` surfaces, `:49` nounShape, `:88` file end (append after) — HOLD.
- AgentOrchestrator.ts `:596` `defaultScientistIntentVocabulary().contractBlock()` inside FORCED_DRAFT_TAIL_BULLETS — HOLD (zero hunks here).
- systemPrompt.ts `:70`/`:672`/`:673` — HOLD.
- vocabulary.ts contractBlock `:375-392` (`:379` `?` render, `:383` teaching gate, `:387` teaching push) — HOLD.
- vocabularyContractBlock.test.ts `:16` `toContain('add_material — source?')` + FIX4 teaching leg — HOLD (note: `:17` also pins `toContain('volumeUl?:quantity')` — that assertion flips with the required-flag change; handled in the Change-4 test work, declared here).
- server types.ts `:584`/`:621`/`:624`/`:630` — HOLD.
- app types/ai.ts `:270`/`:288`/`:290`/`:297` — HOLD.
- clarificationAnswerPrompt.ts `:18`/`:24`/`:28`/`:41` — HOLD.
- ClarificationPicker.tsx `:34`/`:47`/`:192`-ish/`:232` (grounded token :192 verified as `recordType}:${id}`, material token :232 verified) — HOLD. (mint row `:253` not re-grepped individually — OUT of scope.)
- aiPromptMentions.ts `:3` MENTION_PATTERN, `:39` id/label split, `:106` parsePromptMentions — HOLD.
- ChatPreviewCard.tsx `:51`/`:95`/`:97`/`:112`/`:114`/`:141`/`:163`/`:165`/`:167`/`:183`/`:192` — HOLD (all grepped; `:95` = eventDetailLine end verified by function range :51→:95).
- ChatClarificationCard.tsx `:105` record, `:112` allAnswered, `:143`-ish slot container (testid at :146 — the container section is :143, HOLD within 3 lines as pinned), `:160` hasPicker ternary, `:201`/`:206` submit — HOLD. NOTE: CARD-1 fix-run (parallel dedupe/mint-label work) may be landing on this file concurrently; my hunk is minimal (one arm) and will be re-verified before commit.
- ChatLog.tsx `:269`/`:276`/`:366`/`:373`/`:388` — HOLD (renderTypedClarification guard at :276 verified byte-exact).
- HarnessChatPane.tsx `:373`/`:383` — HOLD.
- WellSelectionContext.tsx `:32` null context, `:195` useWellSelection — HOLD.
- HarnessChatPane.test.tsx `:177` toggle pin — HOLD.
- foldNullArms.test.ts `:516` `expect(requests.length).toBe(5)` — HOLD (in blast radius; update with WHY comment).
- server/tsconfig.json `:13` exactOptionalPropertyTypes — HOLD. app tsconfig: no eOPT (0 matches) — HOLD.

**No MOVED rows. No CHANGED rows.** Spec's note that my tip is two doc-only commits ahead of base confirmed (93c38e92 + c1ac87a5 above 4a65d4c1).

## 2. Progress

(in progress — sections appended as legs land)

## 3. Change 1 — DONE, GREEN (committed b2454f81)

- `config/drafting/shorthand-drafting.yaml`: appended `assumedValues:` after
  `blobDetectPatterns` (quantities: add_material.volumeUl value 100 unit uL;
  wells: add_material.targetWells). DATA only — the number's only home.
- `server/src/compiler/resolution/assumedQuantities.ts` (loader, byte-identical
  to the dead-run archive) + `assumedQuantities.test.ts` (RED→GREEN 6/6).
- RED repair (committed e1555d87): the dead-run test had 3 latent defects —
  REAL_POLICY_URL 6-up (→ repo root, MISSING; correct is 4-up), the
  submitSuggestionTool.ts path 3-up (→ server/ai/, MISSING; correct is 2-up),
  and the frozen-example regex `/^ +volumeUl: (\d+)$/m` which can never match
  the actual source line (a TS string concat `+ '    volumeUl: 100\n'`). Dropped
  the ^/$ anchors; it still extracts only the frozen value and still fails if
  the example's number changes. The meaningful RED (2 failed | 4 passed, both
  for the right reason: the config has no assumedValues: section yet) was
  captured BEFORE the data was added.
- `vocabularyContractBlock.test.ts`: extended to assert the EXACT post-flip
  add_material contract line (verified byte-for-byte against the generated
  contractBlock() output). Teaching line untouched (OQ1 ruling).

## 4. Change 4 DATA — DONE (committed b2454f81) + BLAST-RADIUS FINDING

`scientist-intent-vocabulary.yaml` add_material: `volumeUl.required: true`
(the CARD-1 3b flip, AMENDMENT l2t0920) + new `targetWells` (kind wells,
required true), same shape as the aliquot precedent (SPINE-7). DATA only.

### Base-parity (the blast radius) — MEASURED FIRST-HAND
At BASE (my 3 tracked changes stashed): only 2 fail files —
`assumedQuantities.test.ts` (expected RED, no data yet) and
`AgentOrchestrator.shorthandDeckBinding.test.ts` (pre-existing trunk debt).
WITH the flip: 12 fail files. So the flip adds 11 NEW failing files:
  goldenIntentToClarification, goldenIntentToGraph, goldenProseBlobStrip,
  realizationGolden, foldNullArms, declaredArgumentReachability,
  cueResolutionGate, resolveNounsPass, resolveNounsPass.paramFold,
  resolveNounsPass.stagnantHedge, vocabularyMirrorDrift.
This is WIDER than the spec's bait-11 enumeration (7 goldens + foldNullArms +
MANIFEST): it also hits the HEDGE-TYPE-1 registry-template mirror
(vocabularyMirrorDrift (f)) and the dynamic-verb tests (paramFold/stagnantHedge/
resolveNounsPass/cueResolutionGate) that select requiredVerb/requiredArg by
data and now see add_material with TWO required args.

### BLOCKER 1 — the `volume`-form false bar (DOMAIN DECISION, not mine to make)
`declaredArgumentReachability.test.ts:159/:370` + `realizationGolden.test.ts:263`
pin "a stated volume (the `volume` OBJECT form `{value,unit}`) compiles to
COMPLETE." The flip's sweep (`resolveNounsPass.ts:252-284`) checks ONLY
`fields['volumeUl']` and `argumentPresent` returns false for an object — so a
document that states volume via `volume: {value:50, unit:uL}` (schema
`scientist-intent.schema.yaml:166`, honored at `simpleVerbs.ts:575-598`) now BARS
on "missing required argument volumeUl," even though a volume IS stated. This is
a FALSE POSITIVE the spec's blast-radius enumeration did NOT anticipate, and it
CONTRADICTS the spec's own W11 intent (the defect is the INVENTED number, not a
stated volume). Resolving it needs either (a) a product-contract change (update
these tests to accept the bar — NOT my authority) or (b) a sweep refinement to
recognize the `volume` form (NOT permitted — the spec allows only the
`resolveNounsPass.ts:485-488` hunk). I will NOT unilaterally change these pins.
ROUTED TO ORCHESTRATOR.

### BLOCKER 2 — scope contradiction (task vs. ratified spec)
The task's SCOPE section says "In scope: ONLY the paths the spec's 'In scope'
list names." But the spec's Change 4 + AMENDMENT l2t0920 MANDATE the flip in
`schema/scientist-intent/scientist-intent-vocabulary.yaml` — a file NOT in the
spec's "In scope (exact paths)" list — and acceptance-2 requires the whole
`resolution`+`scientistIntent` dirs green, which requires updating files
(goldens, foldNullArms, the registry mirror, the dynamic tests) also NOT in the
list. So the task's scope guardrail CONTRADICTS the ratified spec's mandated
flip + acceptance-2. I've done the mandated flip (on disk); every blast-radius
file I touch is documented here. ROUTED TO ORCHESTRATOR for the scope ruling.

### BLOCKER 3 — ChatLog.tsx (concurrent-run ownership)
The spec's "In scope" list names `app/src/agent/ChatLog.tsx` (Change 2's n===1
arm), but the task says "Do NOT edit app/src/agent/ChatLog.tsx — a concurrent
CARD-1 fix run owns those." The Change 2 chip on the single-request arm (the
canonical W11 V2 turn, a single-fact request) needs a line in
`renderTypedClarification` (the :276 guard + one answer-surface arm).
SERIALIZATION POINT — I will NOT edit ChatLog.tsx; the single-request chip mount
is reported as the pending handoff. ROUTED TO ORCHESTRATOR.


## CONTINUATION RUN l2t2245

Continuation of L2-CLARIFY-TARGET-1 after dead run l2t1810 (pid 3651837, rc=0 at 22:19:54, output-token cap mid-work).
Both blockers are now RULED: BLOCKER 1 (volume-object bar) by architect decision l2t2230 (arrives via merge of cl/integration-2);
BLOCKER 2 (blast-radius scope) and BLOCKER 3 (serialization / ChatLog.tsx ownership) by orchestrator.
Turn discipline: report-first, commit-after-every-step, small commands.

STEP 0 (in progress): deleting the two stale untracked SWEEP-1 copies (config/chat, app/src/shared/config/chatHostInventory.contract.test.ts)
and committing the dead run's uncommitted Change-2 work (app/src/types/ai.ts, server/src/ai/shorthandChat.ts, server/src/ai/types.ts) as-is.

STEP 0 DONE: deleted stale untracked SWEEP-1 copies (config/chat/ dir, app/src/shared/config/chatHostInventory.contract.test.ts);
committed dead run's Change-2 work as-is at 3b66e065 (4 files: app/src/types/ai.ts, server/src/ai/shorthandChat.ts, server/src/ai/types.ts, + this report). Tree clean.
Pre-merge HEAD was 1e48ac49. cl/integration-2 contains SWEEP-1 39f6df48 and CARD-1 8b61971b (verified with merge-base --is-ancestor); 29 commits ahead; decision file L2-TARGET1-VOLUMEOBJECT-BAR-l2t2230.md present at its tip.

STEP 1 (in progress): merging cl/integration-2 with -c core.fileMode=false --no-ff.

STEP 1 DONE: `git -c core.fileMode=false merge --no-ff cl/integration-2` -> merge commit 101b44de, NO conflicts (parents 3b66e065 + 0579e8a1).
Trunk's SWEEP-1 config/chat/ files re-landed as tracked (expected — they are trunk's own work now, not the stale copies I deleted in STEP 0).
Post-merge verification:
  - `git diff --name-only 8b61971b..0579e8a1 -- ':!.hermes'` is EMPTY (CARD-1 8b61971b..ruling 0579e8a1 is doc-only) -> the decision file arrived as data, and nothing code-shifting landed between CARD-1 and the ruling.
  - `git diff --name-only 8b61971b..0579e8a1 -- 'server/src/compiler/**' 'schema/scientist-intent/**'` EMPTY -> the merge did not touch my files; the merged-base failures below are pure flip blast radius.
  - Decision file now at .hermes/plans/decisions/L2-TARGET1-VOLUMEOBJECT-BAR-l2t2230.md (read in full; RULING (a) OBJECT FORM SATISFIES, 5-item implementation contract).
  - CARD-1's requestRendersPrompt predicate present in app/src/agent/ChatLog.tsx (:126, :305 bubble-suppression arm) -> the Change-2 chip must keep it working.

STEP 1 RE-MEASURE (merged base, `npm run test:run -w server -- src/compiler/resolution`, raw at /tmp/t21-merged-resolution-raw.txt):
  Test Files 3 failed | 16 passed (19); Tests 6 failed | 160 passed (166).
  All 6 failures are in the dead-run §4 blast-radius file list (resolveNounsPass, .paramFold, .stagnantHedge):
    1. resolveNounsPass.paramFold.test.ts:193  V2e  — 1 sweep fact expected, got 2 (volumeUl + targetWells now both required).
    2. resolveNounsPass.paramFold.test.ts:375  FS5  — 1 clarification expected, got 2 (same cause).
    3. resolveNounsPass.stagnantHedge.test.ts:416 SH7 — 1 expected, got 2 ({label:'volumeUl'…} + one more; same cause).
    4. resolveNounsPass.test.ts:480  comp4 shipped  — 1 clarification expected, got 3 (2 sweep facts + composition).
    5. resolveNounsPass.test.ts:524  comp4 fixture-copy — ok:false now (2 sweep facts where 0 expected).
    6. resolveNounsPass.test.ts:556  shqa1.gate — ok:false now (fixture action lacks the 2nd required arg).
  Root cause identical in all 6: add_material now declares TWO required args (volumeUl + targetWells) and the fixtures name neither.
  None are pre-existing trunk debt (the merge changed no compiler files) -> NO base-parity proof needed for these; they are the
  mandated flip's blast radius and in scope per the BLOCKER-2 ruling (update counts WITH WHY comments, no assertion-weakening).

STEP 1.5 — FULL base-parity proof (corrects the dead run's narrower §4 list).
The dead run measured the flip DELTA only for the resolution dir (base 2 -> with-flip 12 fail files = 11 new).
It never established the base state for src/ai or src/compiler/scientistIntent. On the merged base, those dirs show
31 failing files / 57 failing tests, which is FAR more than the 11-file delta — so I built a true base-parity probe.

METHOD (non-destructive):
  - Detached worktree /tmp/t21-base-probe at the TRUE base 0579e8a1 (= cl/integration-2 tip, i.e. what I merged INTO,
    before any of my TARGET-1 commits). `git diff --name-only 8b61971b..0579e8a1 -- ':!.hermes'` is EMPTY, so base 0579e8a1
    == CARD-1 merge 8b61971b plus doc-only commits; it carries the SWEEP-1 + CARD-1 code.
  - package.json (root/server/app) IDENTICAL between base and my tip (diff-verified), so I symlinked the main worktree's
    node_modules into the probe.
  - Materialized the 46 gitignored-but-present source files (server/src/ai/materialRefFields.ts, clarificationLoop.ts,
    BypassAudit.ts, etc. — the "~54 materialized files" class) by copying them from the main worktree into the probe
    (cp -p fails on /tmp permission preservation but the content lands; verified 0 missing). Without this, the probe
    fails at LOAD (98 load-failures) — a known fresh-worktree artifact, not a real delta.
  - Ran `npm run test:run -w server -- src/compiler/resolution src/compiler/scientistIntent src/ai` at base 0579e8a1.

RESULT (base 0579e8a1, raw at /tmp/t21-base-parity-raw.txt, 0 load errors):
  Test Files 18 failed | 158 passed (176); Tests 33 failed | 1690 passed (1723).

DIFF vs merged base (31 files / 57 tests; raw at /tmp/t21-merged-resolution-raw.txt + /tmp/t21-merged-si-ai-raw.txt):
  + 28 NEW failures at merged base — the flip's blast radius. Every one is in the dead-run §4 file list (the 6 resolution
    tests + cueResolutionGate, declaredArgumentReachability, realizationGolden, goldenIntentToClarification,
    goldenIntentToGraph, goldenProseBlobStrip, vocabularyMirrorDrift, shorthandContractDisclosure, foldNullArms,
    e2eStubHonesty, labwareIdBinding, labwareResult, shorthandDeckBinding store-hint). These are IN SCOPE per the
    BLOCKER-2 ruling (update counts WITH WHY comments, no weakening; new truth where a golden genuinely changes).
  = 29 fail at BOTH base and merged — pre-existing trunk debt (AgentOrchestrator.*, chatbotCompile.*, tubeGate,
    attachedProtocol, createRecordIntent, submitSuggestionTool.tubeSchema, chatbotCompileDeckSlot, cueCascade).
    OUT OF SCOPE, no action (base-parity proven: identical at base 0579e8a1).
  - 4 FIXED by my lane commits (tubeEventDetailGate.tube x3, realizationGolden W2-7 T1 'fixtur' test) — my work strictly
    improved the base.

CONCLUSION: the only failures I must address are the 28 in the §4 list. The 29 pre-existing-debt tests need no base-parity
per-test proof because the whole-file set is byte-identical at base (the comm above).

LINT DSL DECISION (ruling item 5 — satisfiedBy entries must name another declared arg of the same verb):
  The in-tree P7 boundary note (scientist-intent-vocabulary.lint.yaml:210-225) documents that the shipped PathResolver
  does NOT flatten a multi-level wildcard selection — `verbs[*].args[*].x` selects NESTED arrays and an item-relative
  collectionPath cannot reach a SIBLING arg's field (which is why P6's `preferred ∈ levels` rides a same-item allIn, and
  the cross-DOC referentLevels identity rides a test, not the lint). Item 5 needs exactly that cross-sibling reference
  (satisfiedBy entry ∈ sibling arg `name` of the SAME verb), which the DSL (ops: all/allIn/any/equals/everyItem/exists/
  nonEmpty/not, + itemField) cannot express as a loud cross-sibling membership. So, matching the in-tree precedent, I
  pin item 5 in a TEST (the established pattern for cross-list/cross-sibling identity) rather than force an inexpressible
  lint rule. This keeps the declarative surface (schema slot + DATA) intact; the test enforces no dangling aliases.
  I will DISCLOSE this decision in the report (it is an in-scope, reversible implementation detail of a binding ruling
  item, not a domain-policy change).

STEP 2 PLAN (ruling l2t2230 RULING (a), 5 items, VERBATIM — RED-first):
  (a) schema slot `satisfiedBy` (array of ^[a-z][a-zA-Z0-9_]*$) in the arg-item properties
      (scientist-intent-vocabulary.schema.yaml, after `teaching`, before wellsetValueTokens).
  (b) vocabulary add_material volumeUl: `satisfiedBy: [volume]` (the unique `name: volumeUl / kind: quantity /
      required: true` anchor at :294; all other 13 volumeUl declarations are required:false — verified).
  (c) vocabulary.ts: add `satisfiedBy?: readonly string[]` to ScientistIntentArgContract + RawArg + the conditional
      normalize spread (the same SPINE-8 idiom — the meta-schema is the structural authority; zero per-arg branches).
  (d) resolveNounsPass.ts: argumentPresent gains ONE SHAPE arm (plain object present iff finite-numeric `value` AND
      non-empty-string `unit`); the §5.2 sweep present-check becomes `argumentPresent(fields[contract.name]) || any
      (contract.satisfiedBy ?? []) name passes argumentPresent`. ZERO name literals (volume/volumeUl never in TS).
  (e) item-5 cross-sibling membership pinned in a test (per the LINT DSL DECISION above).
  RED tests to write BEFORE (c)/(d): a `volume: {value:50,unit:uL}` add_material action => NO missing-required fact for
  volumeUl; `volume: {}` => the fact STILL fires; the three shipped pins go green without edit (to be verified empirically).
  OPEN TO-VERIFY: the CHARACTERIZATION pin (declaredArgumentReachability.test.ts:168) currently fails with TWO facts —
  volumeUl/missing-required (the satisfiedBy fix clears this) AND `targetWells: A1:H12`/unknown-address (a wells-resolution
  consequence of Change 4, NOT cleared by satisfiedBy). Base-parity confirms this test PASSES at base, so the unknown-address
  is a flip consequence. I will implement (a)-(e) and run the three pins to determine empirically whether the ruling's
  'goes green without edit' holds for the targetWells dimension; if unknown-address persists I will diagnose and report.
