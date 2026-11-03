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
