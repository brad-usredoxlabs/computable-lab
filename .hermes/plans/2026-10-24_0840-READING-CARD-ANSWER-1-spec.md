# SPEC — READING-CARD-ANSWER-1 (lane 2)
# Filed + authored by orch l2t0810 under architect ruling decisions/REVISEGHOST1-a5tier2-readingcard-decision-l2t0650.md (Readings 1-4).
# Gates REVISE-GHOST-1 acceptance (attempt-6 browser gate re-runs the FULL F1 sequence after this merges).

id: READING-CARD-ANSWER-1
title: "Answer the composition-fraction-sum READING card through the UI: readings-as-choices + scientistAnswers on the chat fold route"

## Why (one paragraph)
The canonical dogfood utterance holds a fraction-sum bar as a card with NO answer affordance: the
server already carries its `readings[]` (candidate readings with computed final fractions) on the
fact, but the clarification map renders every `domain: material` fact as a `/m` material picker and
the app has zero readings consumers — the scientist sticks at "1 of 2 answered" forever. This is a
live HIGH product defect on the founder's dogfood line, not a REVISE-GHOST-1 regression (architect
Ruling 1(b): new task, not folded, not dodged).

## Ruling basis (binding; read in full before dispatch)
decisions/REVISEGHOST1-a5tier2-readingcard-decision-l2t0650.md — Ruling 2 shape + Amendments 1-2,
Ruling 4 (defect 2 IN scope; defect 4 = separate menu-surface backlog item, NOT this task).

## Orch-verified ground at trunk 8e376c0f (first-hand l2t0810; ruling cited 786e81df, line drift
## noted — substance re-confirmed at this tip)
- `clarificationsFromUnresolvedFacts` — server/src/ai/shorthandChat.ts (~:521-565). Pure structural
  map. `menuProvider = domain==='labware' ? '/l' : domain==='material' ? '/m' : 'choice'`;
  `allowCreateLocal = menuProvider !== 'choice' && mintable` (~:541). Routing a readings-bearing
  fact to `menuProvider:'choice'` suppresses mint FOR FREE — zero new policy expressions.
- Readings ride the FACT: server/src/compiler/scientistIntent/normalizeScientistIntent.ts:464-469
  (`readings?: readonly CompositionReading[]` on the clarification fact) and :926-927 (conditional
  spread onto the fact). §14.2 RECORD leg ~:907-921 settles the bar when
  `scientistAnswers[fact.label]` is a declared reading id (validated against DATA
  `convention.readings`, never a TS list). CompositionReading {id,label,finalFractions,
  nestedFractions?,note?} — compositionFractions.ts ~:345-354.
- THE WIRE GAP: AgentOrchestrator.ts chat fold leg (~:1341-1412) calls
  `compileShorthandDeterministically(folded.doc, {store, searchLabwareByHint, reuseBindings})` —
  NO `scientistAnswers`. The recompile route DOES pass it:
  IntentCompileFromPromptHandlers.ts ~:450 (`scientistAnswers: answers`) is the verbatim precedent;
  `compileScientistIntent` already accepts the param (deps plumbing :119/:283 per ruling — verify
  at dispatch tip). The chat fold is the only missing hop.
- App: QuestionsPanel.tsx (~:150-178) has exactly TWO branches — `requestHasPicker(request) ?
  <ClarificationPicker/> : <ParameterAnswerInput/>`. Zero `readings` consumers app-wide.
  GAPCARD-1 'choice'-cards precedent: ProtocolLocalizationThread.clarificationAdapter.ts +
  ClarificationPanel.tsx:223 (protocol thread sibling pattern for choice cards).

## Scope (files)
- server/src/ai/shorthandChat.ts — the MAP (a new structural arm; the fold stays byte-identical).
- server/src/ai/AgentOrchestrator.ts — the answer-fold leg only (additive conditional spread).
- app clarification surface: QuestionsPanel.tsx (+ ClarificationPicker/options rendering as needed)
  and wherever the chat card model is built (the AiTabPanel-side clarification adapter mapping the
  server card shape to QuestionsPanel requests).
- Tests alongside each (server vitest cwd=server; app component tests mirroring
  AiTabPanel.protocolEdit.test.tsx conventions).

## Shape (Ruling 2 + amendments — binding)
1. MAP: a fact CARRYING `readings` (non-empty array on the fact — the data the bar itself attached)
   maps to `menuProvider:'choice'` with the readings as its option set; kind stays from the domain
   map. Prompt text = the fact's OWN `message` (already data-derived), NOT the noun template —
   closes the R2-family wording defect for the READING class without a reason-name branch.
2. DISCRIMINATOR IS STRUCTURAL, NEVER A REASON LITERAL: no `fact.reason ===
   'composition-fraction-sum'` branch anywhere; no reasons list in TS (l2t0115 prohibitions intact).
   A fact with no readings renders EXACTLY as today (byte-stable).
3. UI: the choice card renders `fact.readings[]` as one choice row per reading — label =
   `CompositionReading.label`, snippet shows the computed `finalFractions` (+`note` when present).
   Presentation order = array order (server never pre-picks; DATA order already declared in
   composition-fraction-convention.yaml). NO mint row (falls out of menuProvider:'choice').
4. ANSWER WIRE: unchanged shape — `AgentClarificationAnswer.value` = the reading id, requestId =
   the existing join id (factRequestId). No new wire types.
5. SERVER ANSWER LEG (the whole delta): at the chat fold leg, build `scientistAnswers` AND
   `answeredClarificationLabels` structurally from the held facts + submitted answers (per the ORCH
   RATIFICATION block below, which governs this sentence; tidied at merge l2t1610) — an answer
   whose HELD FACT carries readings
   and whose value is one of that fact's reading ids goes into `scientistAnswers[label] = value`,
   passed to `compileShorthandDeterministically` by conditional spread (IntentCompileFromPrompt
   AMENDMENT 2: the SAME structural test EXCLUDES reading answers from
   `foldAnswersIntoShorthand`'s answer set (they have no label→noun carrier; feeding them to the
   fold is precisely the never-guess fold-null the pin defends).

   ORCH RATIFICATION 2026-10-24T12:55 EDT (l2t1245, resolving advc-c1 D1): the answer delta is
   `scientistAnswers` AND `answeredClarificationLabels`, both by conditional spread at the same fold
   leg. Rationale: l2t0650 Ruling 2's OBSERVABLE ACCEPTANCE (both bars settled -> draft mounts ->
   events>0) is binding and gate-grade, and is unreachable on the chat route without the
   answeredClarificationLabels threading (advc c1 deletion experiment: without it the role-gap card
   survives, no draft, events==0). The mechanism feeds the ALREADY-SHIPPED MIXROLE-1 §5b membership
   guard (normalizeScientistIntent.ts:1032 / compositionRoles.ts:215) with label data only — no new
   compiler policy, absent path byte-unchanged. l2t0115 R1's "its own item" routing is conditional on
   fold-success-but-re-hold under (2'); the later ruling's acceptance subsumes it — the R1 routing
   note is CLOSED for the chat route by this ratification.
6. HONEST SURVIVOR CLAUSE (Amendment 2 tail): if after the reading answer routes and the remaining
   answers fold, the role-gap bar's answer still trips fold-null, the result must be today's honest
   visible state and the coder REPORTS it plainly — role-vocabulary answer form is NOT this task.

## Acceptance criteria (verbatim from Ruling 2 "OBSERVABLE ACCEPTANCE" — attempt-6 measures this)
Canonical utterance → 2-card hold → BOTH cards answerable through the UI's own controls (fraction-sum
card shows the declared readings as choices, no mint row) → batch completes 2/2 → draft/preview
MOUNTS (ghost wells non-zero) → revise prompt sends → ghosts remount. Per l2t0130: with both bars
genuinely settled, events>0 IS required. Code gates: (a) RED-first server test — reading-carrying
fact maps to choice+readings, mint suppressed via the existing expression, no-readings facts
byte-stable; (b) RED-first orchestrator test — reading answer reaches the §14.2 leg (bar settles,
zero model calls) AND is excluded from the fold set; fold byte-identical diff; (c) app test — the
choice-with-readings card renders reading rows and answers with the reading id; (d) server suite +
tsc at baseline (tsc server 0 lines; app tsc sorted-diff == baseline 28); (e) no app/ policy
literals, no reason literals in TS.

## Sequencing / collisions
- Fleet coder slot currently held by MATRES-CHAIN fix-2 (queue FIFO — dispatch this AFTER CHAIN
  fix-2 exits; fleet rule: one live coder).
- shorthandChat.ts MAP arm is additive; ANSWER-FOLD-NULL-1's fold legs are untouched (byte-pin).
  AiTabPanel hot-file cluster: this task's app files are QuestionsPanel.tsx + the chat card model
  builder; CHAIN fix-2 owns AiTabPanel.tsx/useChatThread relay wiring concurrently — DO NOT let
  both touch AiTabPanel.tsx; if the chat card model lives inside AiTabPanel, this task dispatches
  only after CHAIN fix-2 merges.
- After merge: REVISE-GHOST-1 attempt-6 full browser gate (orch-owned). F2-head stays WAIVED per
  Ruling 3 (resume condition on record).

## Backlog filed per Ruling 4 (separate item, not a gate)
DEFECT-4 backlog: material `/m` menu candidate generation returns degenerate lists (12 identical
aggregate rows, no per-component candidates despite per-component MAT records). Owner surface: the
menu results/dedup/layering the ClarificationPicker drives — NOT clarificationsFromUnresolvedFacts.
