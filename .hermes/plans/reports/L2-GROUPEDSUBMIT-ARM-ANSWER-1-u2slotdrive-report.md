# L2-GROUPEDSUBMIT-ARM-ANSWER-1 UNIT u2slotdrive Report

## Summary
Surface-driven driver + narrowed catch guard. Fixes two defects identified by advc cycle-1:

1. **Catch guard narrowed**: `ClarificationPicker.tsx:682-716` — the bare `catch` that swallowed
   ALL throws (including from `onPick`/`closePicker`) is replaced with a narrow inner `try/catch`
   around ONLY `await groundedAnswerFromMention(...)`. `onPick` + `closePicker` run outside it,
   so a throw from either propagates as an unhandled rejection.

2. **Truthful transport probe**: `ChatClarification.groupedSubmit.test.tsx` — replaced the
   `groundMaterialRef` mock (which advc proved cannot reject due to its own try/catch) with
   a mock of `apiClient.groundOntologyMaterial` (the actual transport layer). The test confirms
   that on a transport failure, the picker falls back to `answerFromMention` bytes and the slot
   records, enabling Submit.

3. **Surface-driven chrome.cjs**: `answerSlotBySurface()` enumerates each slot's control by testid
   in the card's precedence order (assumed-chip → wells-slot → picker → options → typed).
   `answerAllSlots()` walks every `[data-testid="chat-clarification-slot"]` and reports
   `{unanswered:true, slotId, dom}` for slots with no drivable surface.

## Changed Files
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — narrowed catch, rewritten comment
- `app/src/agent/ChatClarification.groupedSubmit.test.tsx` — truthful transport probe + success pin
- `.hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/chrome.cjs` — surface-driven `answerSlotBySurface` + `answerAllSlots`

## Verification
- `npx vitest run src/agent/ChatClarification.groupedSubmit.test.tsx` → 2 passed (2)
- ClarificationPicker.test.tsx → 4 passed (4) (pre-existing, unchanged)
- chrome.cjs: no tests in repo (driver helper)
- leg4.cjs: stack was down at time of execution (ports :3093/:5193 not answering)

## Blockers
- Live driver run (leg4.cjs): BLOCKED — stack-down. Ports :3093 (API) and :5193 (app) not
  responding. Cannot verify surface-driven driver against live grouped card.
- Mutation control (revert catch to bare catch → pin goes RED): not performed — stack-down
  prevents full verification.

L2-GROUPEDSUBMIT-ARM-ANSWER-1 UNIT u2slotdrive BLOCKED project STU-scratch not found at URL
