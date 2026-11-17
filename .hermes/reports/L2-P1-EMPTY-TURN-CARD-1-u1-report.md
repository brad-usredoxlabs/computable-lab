# L2-P1-EMPTY-TURN-CARD-1 u1 — report (lane 2)

Unit 1 of 1: make a zero-events successful AI turn ALWAYS fire the honest wall
(or an actionable card) when nothing was delivered, deterministically, no model
involved. Scenario: prompt-1 (gate PROMPT1-GATE-20261114T133918Z draw 1).

## Cycle 3 (this run)

### Base / RED state
- Base commit 0692179f659b50bff9b457920035edf4936ed4a5 (branch
  cl/lane2-emptyturncard-u1-1715). The test file
  app/src/shared/hooks/useAiChat.emptyturn.test.tsx was ALREADY committed in
  the base (v2 checkpoint commit); source useAiChat.ts unchanged from base.
- RED recorded at base (raw, first failing line): test 1 FAILED at
  useAiChat.emptyturn.test.tsx:58 — `expect(wall, 'the honest wall must fire
  when nothing was delivered').toBeTruthy()` got `null` (the relayed
  record-draft frame sets handledProposalFrame=true, which skips BOTH the
  wall gate (:2190) and the bubble gate (:2311) — the turn settles with only
  the "No events generated." narration). Test 2 (control) also failed at
  :79 (see "test adjustment below").
- RED run output (tail): `Test Files  1 failed (1) / Tests  2 failed (2)` at
  0692179f6. Because the RED test file was already committed in base, the RED
  state IS the base commit; no separate RED commit was possible
  (working tree clean at base).

### Base counts (recorded before the fix)
- `npx vitest run src/shared/hooks/` at base: 6 failed | 144 passed (150).
  The 6 = 2 in useAiChat.emptyturn.test.tsx (this unit) + 4 pre-existing
  (useAiChat.card1fix5.reloadBoundary.test.ts 1, useAiChat.threadscope.test.ts
  2, useAiChat.card1fix5.realDrop.test.ts 1 — server/yaml + vite-transform
  failures unrelated to this seam).
- `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` at base: 17.
- Outside the hooks dir: src/event-editor/deck/DeckSurfaceChat.deckLayout.uifix1.test.tsx
  fails 4/4 AT BASE (stashed-run check) — pre-existing mock-shape error
  (`No "useOptionalEventEditor" export is defined on the "../EventEditorContext"
  mock`), unrelated to this seam. src/run/RunSurfaceChatBridge.onevoice.test.tsx
  passes.

### Fix (commit 89c007310afeea12a0752ab3b4f35fd9fe764e69)
File: app/src/shared/hooks/useAiChat.ts only (test adjustment below).
Diagnosis (from the shipped test, verbatim its claim): onRecordDraftProposal
is registered by the universal stack (useSurfaceChat.ts:41) and
AnalysisChatPanel.tsx:88, so a relayed record_draft_proposal frame sets
handledProposalFrame (the relay block, try-branch) — a HANDLING signal, not a
mount report (the host callback returns void; useWorkstateProposalFlow
proposeWorkstate is `void`). Both emptiness gates key on !handledProposalFrame,
so a relayed frame + zero-events done ends with narration only and cardCount 0.

Changes (no new top-level branch; the recordCreationsDelivered distinction at
:2185 stays intact — still a delivery the first gate names):
1. Per-turn flag `relayedRecordDraft` (declared beside `navActionDelivered`,
   turn-scoped, resets each send like its siblings), set in the existing
   record_draft_proposal relay block next to `handledProposalFrame = true`.
2. `relayedDraftUnstaged = relayedRecordDraft && !recordDraftStaged` inside
   the existing zero-events block (:2166) — the relayed frame whose draft did
   not stage through the deck seam (recordDraftStaged requires recordCreations
   handed to onProposalDrafted).
3. Terminal else-arm INSIDE the existing :2166 block, after the first gate's
   close: `noChannelDelivered` = none of askedQuestion / surfacedError /
   answerDelivered / navActionDelivered / deckLayoutDelivered /
   recordCreationsDelivered / labwareAdditions / instrumentApplianceJobs
   fired (note: deliberately NOT keyed on handledProposalFrame — the relayed
   frame is the defect case; keyed on it the arm could never fire). When it
   holds and at least one part is nameable, setHonestWall:
   `Draft produced no events — it delivered only <parts> and asked no
   questions. Next step: <route>`, where parts names `a record draft that did
   not mount` and/or the payload's unresolved ref with reason `unknown-noun`
   (label from result.unresolvedRefs, the done field — AiAgentResult.unresolvedRefs
   is client-declared, no server change), and the next step names the
   `create a local term` route (the same "Create local term" route the
   RefPicker mint row offers; the wall points at it, never creates a term).
   No unresolved noun + no relayed draft => parts empty => no wall (unchanged
   behavior for turns that genuinely carried nothing nameable).

### Test adjustment (RED-neutral, documented)
app/src/shared/hooks/useAiChat.emptyturn.test.tsx control leg, one
assertion: `messages[length-1]` -> `messages[length-2]` with a comment.
Proof the original line was unsatisfiable at base AND at tip: the
empty-success system bubble appends AFTER the assistant row
(useAiChat.ts bubble block runs after the done setMessages that finalizes the
assistant content), and that order is PINNED by existing green tests —
useAiChat.empty.test.ts asserts the bubble present by EXACT content on the
same zero-events success shape; useAiChat.hydrationClobber.test.tsx:291 pins
the persisted order ['user','assistant','system']. So the last row can never
be the assistant row; the control's own comment states the intent — "the
narration tail still lands in the assistant message (unchanged)" — and the
adjusted assertion checks exactly that (probe run at the fix commit showed
assistant row content `Prompt received...working\nNo events generated.` and
system row = the pinned bubble, wall = pinned first-gate copy). No assertion
weakened; all first-leg assertions untouched.

### Verification at tip (commit 89c007310afeea12a0752ab3b4f35fd9fe764e69, raw)
- `cd app && npx vitest run src/shared/hooks/useAiChat.emptyturn.test.tsx`
  -> `Test Files  1 passed (1) / Tests  2 passed (2)` (RED at base:
  `2 failed (2)` — recorded above).
- `cd app && npx vitest run src/shared/hooks/`
  -> `Test Files  3 failed | 41 passed (44) / Tests  4 failed | 146 passed
  (150)`. The 4 failed are EXACTLY the 4 pre-existing base failures
  (reloadBoundary 1, threadscope 2, realDrop 1); no new fails vs base
  (base non-emptyturn failures: 4; tip: 4, same tests). The 2 emptyturn
  failures are gone (146 passed vs base 144).
- `cd app && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` -> 17 (base:
  17; no new typecheck errors).
- Adjacent suites: RunSurfaceChatBridge.onevoice.test.tsx passed;
  DeckSurfaceChat.deckLayout.uifix1.test.tsx 4/4 failed at base AND at tip
  (same pre-existing mock-shape error — verified by stashing the fix and
  re-running at base).

### Acceptance mapping
- Test RED at base 0692179f6, GREEN at tip: yes (raw outputs above).
- A zero-events successful turn never ends with only "No events generated."
  narration + cardCount 0 with no honest wall: the terminal arm fires the
  wall whenever the zero-events arm completes with no delivered channel and a
  nameable part (relayed-unmounted draft, unknown-noun ref); deterministic
  (no model involved).
- No new top-level branch in useAiChat.ts: the arm is inside the existing
  :2166 block; no new state channel (turn-scoped local flag only, same
  pattern as navActionDelivered/handledProposalFrame).
- No new hooks-suite failures and no new app typecheck errors: verified above.

### Commits
- 89c007310afeea12a0752ab3b4f35fd9fe764e69
  `fix(L2-P1-EMPTY-TURN-CARD-1 u1 c3): honest wall always fires on zero-events
  turn with nothing delivered` — the code + test change (THIS unit's work).
- (this report + marker committed after this file was written).

Changed files: app/src/shared/hooks/useAiChat.ts (+73 lines),
app/src/shared/hooks/useAiChat.emptyturn.test.tsx (+4/-2).

No blockers. Acceptance state: implementation complete; independent review
owns acceptance.

L2-P1-EMPTY-TURN-CARD-1-u1-lane2-EMPTY-TURN-CARD-1-u1-v3-l2t2703.txt UNIT unit DONE 9a248249c4199682bfa1674ada1b41fa2bebf30c
