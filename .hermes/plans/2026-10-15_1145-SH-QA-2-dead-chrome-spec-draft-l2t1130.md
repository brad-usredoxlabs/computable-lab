# SH-QA-2 — SPEC DRAFT — lane 2 — composer l2t1130
Draft: 2026-10-15T11:45 EDT. Lane: 2. Item: SH-QA-2. Trunk base at draft time:
cl/integration-2 tip `6dba17a5` (docs-only; last product merge `75a124fa` HARNESS-SEQ-2;
HARNESS-SEQ-2 agent_action work is MERGED; SH-QA-1 will land BEFORE this item is coded).
DRAFT — orchestrator reviews and promotes; do NOT dispatch unreviewed.

**Drift check (done at draft time):** `git -c core.fileMode=false diff 532ec676..HEAD --stat`
over QuestionsPanel.tsx / AiTabPanel.tsx / sidebarState.ts / ClarificationPicker.tsx is
**EMPTY** — the four files are byte-identical to the architect's 532ec676 verification. The
task list's file:line citations are therefore *citation drift, not tree drift*; the corrected
map below is authoritative AT 6dba17a5 and must be RE-VERIFIED against the branch point
(trunk moves — SH-QA-1 lands server-only, but g2d/SEQ legs may touch app/).

## Goal (one sentence)
Make the clarification card surface never dead: an answered card always carries a live
proceed affordance, "Change" always reopens an editable picker whose resubmit fires the SAME
answer-resend the first pick fires, and every reachable state of the
answered/changed/resend machine is either actionable or surfaces why.

## Why
Dead chrome converts a recoverable misask into a total blockage (tally F6(c), paste #9): the
answered card shows a check + "Change" and the click does nothing visible. SH-QA-1 makes the
re-ask cascade rare; this makes it survivable regardless of what the spine asks.

## File ownership (contract)
IN SCOPE (app/ ONLY — NO server/compiler/schema edits, full stop):
- `app/src/event-editor/right-pane/ai/QuestionsPanel.tsx` — answered-card affordances, proceed
  affordance, focus behavior.
- `app/src/event-editor/right-pane/ai/sidebarState.ts` — the `change-question` reducer leg
  (reopen) and, per OQ1, the `updating`-mode escape leg. This is the clarifying-mode leg the
  item's files list names as "AiTabPanel.tsx (clarifying-mode leg)" — the reducer IS that
  leg's state half; it cannot be fixed from the panel alone. Flagged as OQ1 for the ruling.
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — ONLY the clarifying/updating leg:
  the QuestionsPanel mount block (:1303-1322), the submit handler wiring, the bottom
  input/cancel block (:1407-1429). No other leg of this 1441-line file.
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — ONLY if the reopened picker
  leg needs a re-open signal (it likely does NOT — reopen works by clearing the answer, after
  which the existing picker branch renders; touch it only with a reason in the report).
- Tests: `QuestionsPanel.test.tsx` (extend), `AiTabPanel.shorthandClarification.test.tsx`
  (PATTERN source — do not modify its existing legs), plus the new deliverable files named in
  the RED plan below.
EXPLICITLY OUT OF SCOPE: every server/ file, every schema/ file, `useChatThread.ts`,
`chatReducer.ts`, `MessageLog.tsx`, `ChangesPanel.tsx`, the shorthand VERBATIM legs,
anything belonging to SH-QA-1 (server cue bar, fold loop, `shorthandChat.ts`).

## Ground-truth findings (VERIFIED this session at 6dba17a5; citations corrected from 532ec676)

### A. Answered-card render path — QuestionsPanel.tsx (156 lines)
- Answered count / allAnswered: `:46-47`.
- Auto-submit effect: `:51-56` (task list says :46-49 — drifted). `allAnswered` →
  `setTimeout(() => onSubmit(), 300)`; cleanup clears the timer.
- Answered branch (shadows every other branch): `:100-110` (task list says :101-108). Renders
  `✓ {answer.label ?? answer.value ?? 'answered'}` + a **single** "Change" button
  `:103-109` wired to `onChangeQuestion(request.id)`. No accept/proceed of any kind.
- Unanswered branches: picker `:111-116` (`requestHasPicker` → ClarificationPicker,
  `onPick → onAnswer`), else `ParameterAnswerInput` `:120-124` (typed answers — the
  2026-09-20 "unanswerable question" regression, pinned in `requestHasPicker` doc
  ClarificationPicker.tsx:37-45).
- Panel-level actions: "Update draft" primary button renders ONLY when `allAnswered`
  `:136-145`; Cancel always `:146-152`.
- `activeQuestionId` affects ONLY the card's `--active` CSS class (`:78-86`) — there is no
  focus/scroll behavior bound to it. THIS is why the Change click "does nothing visible."

### B. The change-question leg — sidebarState.ts (281 lines)
- `'change-question'`: `:215-217` — guarded `if (state.mode !== 'clarifying') return state`,
  body `{ ...state, activeQuestionId: action.questionId }`. **The answer is NOT cleared, no
  request fires, no resend.** Pure reducer-verified dead click: an already-answered card
  re-renders identically (only a highlight class may move).
- `'answer-question'`: `:208-213` — merges into `answers`, clarifying-guarded.
- `'submit-answers'`: `:219-221` — clarifying-guarded → `{ mode: 'updating', draftId }`.
- `'clarifications-needed'`: `:195-206` — **UNCONDITIONAL entry into clarifying from ANY
  mode**, and it RESETS `answers: {}` with `activeQuestionId = questions[0]?.id ?? ''`.
  ⇒ FINDING: the client has NO prefill path. The task's repro wording "a card arrives with an
  answer ALREADY selected (carried from the previous answer)" cannot happen as literal client
  state today — the reachable dead-click repro is WITHIN one clarifying session (answer q1
  of N, or answer the only q and the auto-submit races mode churn — §D), and the
  "carried answer" lives in `resolvedClarificationsRef` (AiTabPanel.tsx:857-862), which is
  invisible to the panel and re-sends the FULL answer set on the next submit. Pin this
  reading in tests; if the architect's repro needs literal arrival-prefill, that payload
  exists nowhere on the wire (OQ3).

### C. The host wiring — AiTabPanel.tsx (1441 lines)
- QuestionsPanel mount: `:1303-1322` (task list :1303-1322 — VERIFIED exact), gated
  `activeSubTab === 'questions' && sidebar.mode === 'clarifying'` ⇒ the panel UNMOUNTS the
  moment the sidebar leaves clarifying; a killed submit is then invisible chrome-wise.
- `onAnswer` → dispatch `answer-question` `:1313` (VERIFIED).
- `onChangeQuestion` → dispatch `change-question` `:1314` (VERIFIED).
- `onSubmit` → `if (sidebar.mode !== 'clarifying') return` at `:1316` (task list :1318 —
  drifted 2 lines) → `handleClarificationsSubmit(Object.values(sidebar.answers),
  sidebar.questions)`.
- `handleClarificationsSubmit`: `:1037-1052` — merges answers into
  `resolvedClarificationsRef` (keyed by grounded `ref.id ?? requestId`), dispatches
  `submit-answers`, `await sendChat(clarificationAnswersPrompt(...), { clarificationAnswers:
  all, enableThinking: false })`. THE single answer-resend code path — first pick, re-pick,
  every batch goes through here. There is no second submit anywhere (grep: `sendChat` call
  sites `:784`, `:1019`, `:1046`; the clarification one is `:1046` only).
- `resolvedClarificationsRef`: `:857-862` (cleared on fresh `handleSend` `:968`, on
  `handleCancelDraft` `:1060`).
- clarifications-needed dispatch: `:512-523` (server re-ask re-entry, answers wiped).

### D. Every transition INTO / OUT OF clarifying (exhaustive, verified)
INTO 'clarifying' — exactly ONE: `'clarifications-needed'` (sidebarState.ts:195), fired only
from AiTabPanel.tsx:513 (onDraftResult, server carried clarificationRequests).

OUT of 'clarifying':
1. `'submit-answers'` → 'updating' (sidebarState.ts:219-221; fired from
   handleClarificationsSubmit :1045).
2. `'reset'` → 'ready', UNCONDITIONAL (sidebarState.ts:242-244), fired from onDraftResult
   guards: sequenceProposal leg `:393`, `result.error` leg `:426`, `workstateTurn` leg `:438`,
   `ledgerTurn` leg `:450`; protocol-swap effect `:944`; ChangesPanel legs `:1360`/`:1371`.
   ⇒ a server turn that lands in ANY of those arms while the panel is up yanks the user out
   of clarifying with no explanation (mode churn; suspect #1 for the SH-QA-1 re-ask loop).
3. `'cancel'` → 'ready' (handleCancelDraft :1059; user-afforded, always visible while
   clarifying — panel Cancel :146-152 and the disabled-input block :1418-1429).
4. `'start-interpreting'` → 'interpreting', UNCONDITIONAL (sidebarState.ts:184-189), fired
   from `handleSend` :1018. Chat input is hidden while clarifying (isChatEnabled
   sidebarState.ts:253-255; the clarifying block :1418 shows only the cancel text) — BUT the
   `pendingRetryPrompt` effect `:1029-1035` calls `handleSend` from editor fixIt state, a
   non-visible route OUT of clarifying.
5. `'clarifications-needed'` → clarifying again (re-ask; answers wiped per §B).
6. `'draft-ready'` → 'reviewing', UNCONDITIONAL (sidebarState.ts:223-236; onDraftResult
   :529) — the good terminal path once the server accepts the answers.

THE SECOND DEAD-END (found this session, in the audit's scope): after
`submit-answers` the sidebar is `'updating'`. In `updating` the QuestionsPanel is unmounted
(:1303 guard), the chat input is hidden (`isChatEnabled` excludes updating), and the
cancel-block at `:1418` renders ONLY for `clarifying`. If the answer-resend turn ends in an
SSE `error` frame with NO `done` frame, `onDraftResult` never fires, the `result.error`
reset leg never runs (useChatThread.ts:224-241: `case 'error'` only marks the chat reducer),
and the pane sits at `updating` with header "Updating draft…" and **ZERO actionable controls
and zero surfaced reason** — the identical defect class, on the resend leg. This must be
pinned RED and fixed (requirement (3)); it is inside the "answered/changed/resend state
machine" the item owns.

## Design
No new wire shape ANYWHERE. The proceed affordance is `onSubmit` — the existing
`handleClarificationsSubmit` — which already carries everything (answers + full
accumulated set) on the existing chat request. If the architect rules the proceed affordance
needs server state that doesn't exist (e.g. a per-answer accept receipt), that is the
stop_boundary: stop and hand back the exact missing payload (OQ2), do not invent.

1. **(a) Answered card = answer + live proceed affordance.** In QuestionsPanel, an answered
   card renders: the ✓ + label (keep), a "Change answer" button, AND — when `allAnswered` —
   an explicit per-card proceed affordance (e.g. `data-testid="continue-<id>"`, label
   "Continue with this answer") whose onClick calls the SAME `onSubmit` prop the "Update
   draft" button calls. When NOT allAnswered, the answered card's proceed affordance is
   "Go to next unanswered" — dispatching `onChangeQuestion(nextUnansweredId)` — and
   QuestionsPanel gains a focus effect: when `activeQuestionId` names a card, focus its first
   interactive element (assertable via `document.activeElement`), so "focus" is a VISIBLE
   action, not a style flicker. `allAnswered` keeps the existing "Update draft" primary
   (:136-145) — it stays; it is what the silent auto-submit no-op was hiding.
2. **(b) Change reopens the picker; resubmit = the same code path.** Reducer
   `'change-question'` becomes a REOPEN: `answers = { ...state.answers }` with
   `delete answers[questionId]` (plus `activeQuestionId` set), still clarifying-guarded. With
   the answer gone, the card falls to the EXISTING picker/parameter branch (QuestionsPanel
   :111-124) — a fresh `ClarificationPicker` (the `key={request.id}` remount clears its
   query) or `ParameterAnswerInput`. Picking again dispatches `answer-question` exactly like
   the first pick; when allAnswered re-trips, the SAME auto-submit effect (:51-56) fires the
   SAME `handleClarificationsSubmit`. ONE submit path, zero parallel resends — the "Change →
   pick → resubmit" cycle is structurally indistinguishable from "first pick" to the host.
   (Answered-question id NOT in `questions` anymore / server re-ask re-entry: existing
   full-set re-send in handleClarificationsSubmit covers the server side; client card state
   resets by design §B.)
3. **(c) The dead-end audit — the full reachable matrix; each cell actionable or explains
   itself.** (T-numbers = tests below.)
   - S1 clarifying, no answers, picker question → picker actionable (existing regression,
     keep green).
   - S2 clarifying, no answers, parameter question → ParameterAnswerInput actionable
     (existing 2026-09-20 regression, keep green).
   - S3 clarifying, SOME answered (multi-question) → answered card: Change reopens picker
     (NEW, (b)); unanswered cards keep their inputs; "Go to next unanswered" visible-focuses
     the next card (NEW, (a)).
   - S4 clarifying, ALL answered → every answered card has proceed affordance firing the
     same onSubmit + panel "Update draft" (NEW, (a) — the prefilled-answered case can never
     be actionless).
   - S5 answered → changed → re-answered → auto-submit fires EXACT ONE `sendChat` (pin the
     300ms timer + double-resend: the effect's dep is `allAnswered`, reopen→re-answer flips
     it false→true once; assert `sendChat` call count, (b)+(3)).
   - S6 updating (resend in flight, streaming) → header says so; add the escape: extend the
     `:1418` block to render for `updating` too — "Cancel this draft and start a new prompt"
     (same handleCancelDraft) so the resend leg is never affordanceless.
   - S7 updating → SSE error with no done frame → CURRENTLY STRANDED (§D last para) — RED
     today; fix: the updating block surfaces the chat error text (`chat.state.error` — the
     chat reducer's field the mock harness already carries) as the REASON, plus the S6 cancel
     escape. No client-side heuristic, no auto-reset: name the failure, offer the exit.
   - S8 updating → result.error done frame → reset-to-ready already exists (:423-428) — pin
     it keeps working.
   - S9 updating → re-ask (clarifications-needed again) → fresh clarifying, answers wiped by
     design; cards actionable via S1/S2; the full accumulated answer set re-sends on the next
     submit (existing :857-862 behavior — pin, don't change).
   - S10 mode churn mid-300ms auto-submit timer (the SH-QA-1 suspect): if mode left
     clarifying, the panel unmounts — the submit no-ops at :1316 with zero chrome. This item
     does NOT paper it over. Instrument instead: the test proves the reducer-level fact
     (churn ⇒ no resend fired), and the coder records the churn's SOURCE (which :393/:426/
     :438/:450/:944 arm ran, or server re-ask frame) in the report — if it traces to the
     server re-ask loop, that is SH-QA-1's defect: hand it the evidence per stop_boundary.
   - INVARIANT test (the umbrella): for every clarifying shape (0/some/all answered ×
     picker/parameter × 1/N questions) the DOM contains at least one control whose click
     dispatches a state-advancing action (reopen, focus-next, submit, or an enabled input) —
     cancel-always-present does NOT satisfy it; the invariant is about PROGRESS affordances
     per the matrix above.
4. **exactOptionalPropertyTypes discipline** (repo law): optional fields ride conditional
   spreads (`... (x !== undefined ? { x } : {})`) — the answers-map deletion is a fresh
   object minus the key, never `answers[id] = undefined` (a `: undefined` write would render
   `answer` truthy-object-typed and break the `answer ?` branch AND tsc).

## RED-first test plan (vitest + @testing-library/react, existing harness conventions)
New deliverable files (unique paths, no collision with in-flight work):
- `app/src/event-editor/right-pane/ai/QuestionsPanel.deadChrome.test.tsx` (presentational
  legs), and reducer legs folded into `sidebarState.test.ts` (extend — its existing
  `change-question updates activeQuestionId` test at :168 MUST be updated to the reopen
  semantics, with the change called out in the report), plus
- `app/src/event-editor/right-pane/ai/AiTabPanel.deadChrome.test.tsx` (host legs; harness =
  the EXACT option-capturing `useChatThread` seam pattern of
  `AiTabPanel.shorthandClarification.test.tsx` — reuse `renderPanel` +
  `emitClarificationTurn` idioms verbatim; mock `chat.state.error` via the same seam).

Requirement (1) — proceed affordance:
- DC1 RED (QuestionsPanel.deadChrome): render one question + prefilled answer map → assert a
  `continue-*` affordance exists AND clicking it calls `onSubmit` exactly once. RED today:
  answered card shows only Change (QuestionsPanel.tsx:100-110).
- DC1b RED (AiTabPanel.deadChrome): emit a clarification turn (harness), fill the answer via
  the picker leg (or dispatch path the harness exposes), advance the 300ms timer —
  the send seam's `sendChat` fires; then a second clarification turn + prefill scenario per
  §B — assert the card is never actionless.

Requirement (2) — Change reopens + same resend:
- DC2 RED (sidebarState.test): clarifying with q1 answered, dispatch change-question('q1') →
  `state.answers.q1` is GONE (key absent, not undefined) and `activeQuestionId === 'q1'`.
  RED today: the answer rides through (:215-217).
- DC3 RED (AiTabPanel.deadChrome): after a first pick+submit (sendChat spy call 1 with the
  new answer), re-enter clarifying, pick q1, click Change → picker input present again →
  pick a different answer → submit fires `sendChat` call 2 whose `clarificationAnswers`
  payload carries the NEW answer for q1 (same prompt-builder, same seam). One code path —
  assert the spy's request shape is built by `clarificationAnswersPrompt` for both calls.

Requirement (3) — dead-end matrix (S1-S10 above):
- DC4 (host): S7 — after a submit (sendChat mocked to reject / emit stream error with no
  done), assert an error reason is visible AND a cancel control exists. RED today: zero
  controls in updating+error.
- DC5 (panel): S5 — answered → Change → re-picked → allAnswered flips; with fake timers
  advance: exactly ONE additional sendChat, no double-resend.
- DC6 (panel): INVARIANT — table-driven over S1/S2/S3/S4 DOMs, each asserts a
  progress-affordance control exists (not merely cancel).
- DC7 (host): S8 pin — a done result with `error: true` after a submit resets to a usable
  pane (existing behavior kept, pin-only).
- DC8 (host): S10 — churn mid-timer (dispatch path or a second emit that resets mode) →
  NO sendChat fires; the test documents where the churn came from (report obligation §Worker
  contract). No guard-heuristic code is permitted to "fix" this — see reviewer bait B5.
Frozen legs that MUST stay green untouched: QuestionsPanel.test.tsx shorthand-VERBATIM legs,
AiTabPanel.shorthandClarification.test.tsx both legs, sidebarState.test.ts shorthand-carry
legs (:264 region), ClarificationPicker.test.tsx, ParameterAnswerInput.test.tsx,
MessageLog clarification-summary leg (MessageLog.tsx:152-155).

## First targeted check (prove the approach early)
Write DC2 (the reducer reopen test) ONLY, no implementation:
```bash
cd app && npx vitest run src/event-editor/right-pane/ai/sidebarState.test.ts
```
Expected RED: the updated reopen expectation fails against :215-217 (answer survives). This
one command proves the dead-click diagnosis and the fix seam before any UI work.

## Verification commands (complete, with expected output)
All from the worktree root; app workspace is npm-workspaces (`"workspaces"` in root
package.json). Either form:
- RED set: `cd app && npx vitest run src/event-editor/right-pane/ai/QuestionsPanel.deadChrome.test.tsx src/event-editor/right-pane/ai/AiTabPanel.deadChrome.test.tsx` → fails BEFORE impl, green after (paste both phases in the report).
- GREEN set (targeted): `npm run test:unit -w app -- run src/event-editor/right-pane/ai/QuestionsPanel.test.tsx src/event-editor/right-pane/ai/QuestionsPanel.deadChrome.test.tsx src/event-editor/right-pane/ai/AiTabPanel.deadChrome.test.tsx src/event-editor/right-pane/ai/AiTabPanel.shorthandClarification.test.tsx src/event-editor/right-pane/ai/sidebarState.test.ts src/event-editor/right-pane/ai/ClarificationPicker.test.tsx src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx` → ALL green (`npm run test:unit -w app --` forwards paths to `vitest run`).
- Full directory sweep: `cd app && npx vitest run src/event-editor/right-pane/ai/` → green;
  the ai/ suite is this item's blast radius.
- Typecheck BASELINE-SET EQUALITY (app trunk baseline measured by the composer at 6dba17a5
  = 23 errors, ZERO of them under `src/event-editor/right-pane/ai/`; per-file counts:
  useAiChat.surfaceContext.test.ts 6, useChatThread.deckLayout.test.tsx 2,
  editorHistory.test.ts 2, one each: useSurfaceContext.ts, ExtractionProgressPanel.test.tsx,
  IngestionUploadModal.tsx, Viewer.tsx, ViewerToolbar.tsx, DeckToolbar.tsx,
  DeckModeSwitcher.tsx, ProtocolLocalizationThread.tsx, systemPromptForViewer.ts,
  LabwareFocus.instrument.test.tsx, EventEditorContext.tsx, PreviewActionBar.test.tsx,
  LawnSurface.moveAcross.test.tsx):
  `cd app && npx tsc --noEmit 2>&1 | grep "error TS" | sort > /tmp/shqa2-tsc.txt && wc -l /tmp/shqa2-tsc.txt && grep -c "right-pane/ai/" /tmp/shqa2-tsc.txt || true`
  → expect `23` and `0` (set equality: the baseline file:line set may not grow; the report
  pastes the diff against the list above — an empty diff is the bar).
- Scope gate: `git -c core.fileMode=false diff --name-only <base>..HEAD` → ONLY the four in
  scope app files + the three test files + report. ANY server/schema/other app file = scope
  fail. `git -c core.fileMode=false` for every git call.
- BROWSER GATE (orchestrator-owned, AFTER merge, on :5193 with the live stack restarted so
  SH-QA-1's server fix is served): (i) the clofibrate sentence POST-SH-QA-1 reaches a
  proposed, ghostable event set end-to-end (SH-QA-1's verified-by rides this gate's
  receipts); (ii) a synthetic re-ask scenario (answer, server re-derives, re-enter) reaches
  ghosted events WITHOUT a stranded pane; (iii) receipts MUST show a screenshot of an
  answered card WITH the live proceed affordance visible, and the Change→reopen→resubmit
  click sequence. Receipts render the gate: no receipts, no done.

## Acceptance criteria (verbatim from the task list)
> Red-first component tests (pattern: AiTabPanel.shorthandClarification.test.tsx): prefilled
> card renders a proceed affordance; Change reopens the picker; choosing re-fires the resend
> call with the new answer; no state combination renders zero actionable buttons. Browser
> gate on :5193: the clofibrate sentence (post-SH-QA-1) and a synthetic re-ask scenario both
> reach ghosted events; receipts show the answered card WITH the live affordance.

## Worker contract
- Worktree: `/mnt/vast/home/brad/git/cl-integration-2/wt/SH-QA-2-lane2-l2t1130` off trunk
  cl/integration-2 tip AT DISPATCH (6dba17a5 at draft time; RE-ANCHOR every file:line above
  against the branch point — trunk moves; SH-QA-1 lands server-only so the app map should
  hold, verify anyway).
- Branch: `cl/SH-QA-2-lane2-l2t1130`. Fleet coder lock: acquire before coding (pid-file
  convention in assumptions.md); coder-able in parallel with SH-QA-1's code (file-disjoint)
  but the fleet cap is still 1 coder.
- Report: `<worktree>/.hermes/plans/reports/SH-QA-2-report.l2t1130.md`; end marker
  `SH-QA-2 DONE <sha>`. Report MUST include: RED/GREEN paste pairs per DC test, the tsc
  baseline-set diff, the diff --name-only scope proof, the S10 churn-source evidence trail
  (even if it exonerates the client), and any sidebarState.ts deviation from OQ1's ruling.
- Commits: `test(...)` RED first, then `fix(ai): ...`; never `git add -A`.
- Environment: lane-2 stack :3093/:5193 (never restart it yourself — orchestrator's);
  exactOptionalPropertyTypes is ON app-side too — conditional spreads only, the
  answers-deletion must remove the KEY (OQ4: if the repo's tsc config makes
  `delete obj[k]` complain, recompute the map with the key filtered out).

## Reviewer bait (expected adversarial probes — pre-empt all)
- B1: **"The proceed affordance is a duplicate auto-submit path / double-send."** It is not:
  it is the same `onSubmit` prop (same `handleClarificationsSubmit`, the :1046 sendChat is
  the ONLY clarification send site); DC5 pins exactly-one-send across reopen cycles; the
  post-`submit-answers` 'updating' unmount removes all resend affordances synchronously.
- B2: **"Change resubmit is a parallel submit implementation."** It isn't: reopen is ONE
  reducer line deleting the answer; the resubmit runs the byte-identical first-pick path
  (picker → answer-question → auto-submit → handleClarificationsSubmit). DC3 asserts both
  sends' request shapes come from the same prompt-builder with the same seam.
- B3: **"A server file was touched"** (or a wire shape invented to make prefill literal).
  Scope gate output + `git diff --name-only` prove app/ only; no SSE/payload field was added
  anywhere (grep the diff for schema/server = zero).
- B4: **"A sidebar-mode heuristic papers over server churn"** (e.g. resubmitting when mode !==
  clarifying, or auto-refilling answers on re-entry). Forbidden by the stop_boundary: the
  :1316 guard and the answers-wipe stay exactly as they are; DC8 documents churn without
  masking it; S10 evidence goes to SH-QA-1 if the server re-ask loop is the source.
- B5: **"The frozen clarification tests were bent to make the diff green"** — the
  shorthand-VERBATIM legs, shorthandClarification harness legs, sidebarState shorthand-carry
  legs, ClarificationPicker/ParameterAnswerInput suites are byte-identical after the change
  (report proves with diff); ONLY the :168 change-question test changes semantics, and it
  changes because the ITEM mandates the reducer change (report quotes this spec).
- B6: **"exactOptionalPropertyTypes violation"** — `answers[qid]` is never assigned
  `undefined` (key deleted / map recomputed); any new optional prop (e.g. focus trigger)
  rides conditional spread; the tsc baseline-set diff (23→23, zero ai/ lines) is the proof.

## Open questions (orchestrator / architect)
- OQ1 (scope ruling): sidebarState.ts is not verbatim in the item's files list, but the
  mandated reopen fix lives in the `change-question` reducer there — I declared the reducer +
  the updating-escape leg as the "clarifying-mode leg" already in scope. Confirmed or
  narrowed? (Checked: AiTabPanel-only cannot reopen the picker without the reducer, since
  QuestionsPanel is presentational and `answers` flows from the reducer.)
- OQ2 (stop_boundary check): I found NO missing server payload — the proceed affordance reuses
  the existing full-set answer-resend. IF the architect's intended "proceed" is a distinct
  server-side per-answer accept (e.g. the fold confirming one answer without resending the
  batch), that payload does not exist on any wire today (`assistStream.ts` done-frame result
  has `clarificationRequests?` only; the answer leg rides the chat request's
  `clarificationAnswers`). If so, return this as the exact missing payload rather than coding
  the batch-proceed. (Checked: AiClarificationRequest/Answer app/src/types/ai.ts:212-247,
  done-frame result shape assistStream.ts.)
- OQ3 (repro fidelity): the task's "card arrives with an answer ALREADY selected (carried
  from the previous answer)" has NO client-side realization at trunk — `clarifications-needed`
  wipes answers (:200). The faithful red repro is (a) the within-session answered-card dead
  click and (b) the re-ask re-entry where the carried answers live only in
  `resolvedClarificationsRef` while cards show fresh pickers. Is that the intended reading
  (this spec codes to it), or does the architect have a literal-prefill frame the composer
  missed? (Checked: every dispatch site of clarifications-needed = exactly :513; no answer-
  seeding code exists anywhere app-side — grep 'answers' across ai/.)
- OQ4 (minor, coder-resolvable): whether S6's cancel-during-updating should also expose a
  retry-resend (re-derive the answer set from `resolvedClarificationsRef`) or cancel-only.
  Spec defaults to CANCEL+REASON only (retry invents a second resend affordance; keep the
  one-path rule); rule if retry is wanted.
