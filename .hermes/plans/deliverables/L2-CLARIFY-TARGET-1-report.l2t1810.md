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
