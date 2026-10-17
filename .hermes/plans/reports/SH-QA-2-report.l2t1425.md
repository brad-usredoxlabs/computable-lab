# SH-QA-2 — CODER REPORT — lane 2 — l2t1425

Branch: `cl/SH-QA-2-lane2-l2t1425` off trunk `cl/integration-2` @ `1b2b5ce9` (verified at
dispatch time via `git -C /mnt/vast/home/brad/git/cl-integration-2 log --oneline -1` — the
branch point is the CURRENT tip, not the draft-time `6dba17a5`).
Commits: `dae185fc` (test RED) → `1fb96943` (fix GREEN) → report commit → harness-
determinism test commit (DC3 two-question re-ask cycle with distinct re-pick; DC5
fake-timer sequence without findBy deadlock). All verification runs above were executed
against the committed tree.
Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_1145-SH-QA-2-dead-chrome-spec.md`
(all OQ rulings OQ1/OQ2/OQ3/OQ4 followed as written).

## 0. Worktree environment repair (pre-flight)

Fresh worktree lacked the lane's untracked symlink materialization (known lane pitfall).
Repaired read-only from trunk: `find -type l` in cl-integration-2 → 64 symlinks
(node_modules x3, server/schema, .env, computable-lab, cl-lane-stack.sh, 15 app/src +
43 server/src test/module symlinks incl. ParameterAnswerInput.tsx/.test.tsx) re-created
with `ln -sfn` pointing at the SAME targets. `diff` of trunk vs worktree symlink lists:
empty (raws: none needed — verified in-session). Git status stayed clean (all gitignored).
Brad's tree and :3001/:5174 untouched; no lane stack restarted.

## 1. Per-state affordance table (the acceptance matrix)

| State | Card/pane renders | Live affordance (progress, not just cancel) | Test |
|---|---|---|---|
| S1 unanswered, picker question | ClarificationPicker (existing leg) | picker input + rows (enabled) | DC6-S1 |
| S2 unanswered, parameter question | ParameterAnswerInput (existing leg) | input + "Use this answer" (enabled) | DC6-S2 |
| S3 some answered (multi-q) | answered card: ✓ + **Change** + **"Go to next unanswered"**; open cards keep inputs | next-unanswered dispatches change-question(nextId); focus effect visibly focuses the next card's first control (document.activeElement asserted) | DC6/S3, DC3 |
| S4 all answered / prefilled-carried | every answered card: ✓ + **Change** + **"Continue with this answer"** (`continue-<id>`) + panel "Update draft" primary (kept) | continue calls the SAME `onSubmit` prop → `handleClarificationsSubmit` → the single :1046 sendChat (OQ2 batch-proceed; no new wire) | DC1, DC1b, DC6-S4 |
| answered→changed (reopen) | Change REMOVES the answer key (reducer) → card falls to its existing picker/parameter leg, picker re-seeded with the request query | re-pick rides answer-question → auto-submit → the SAME resend; exactly ONE sendChat per reopen cycle | DC2, DC3, DC5 |
| S6 updating (resend in flight) | header "Updating draft…" + bottom block now renders for `updating` too | **"Cancel this draft and start a new prompt"** (`updating-cancel`) — same handleCancelDraft | DC4 |
| S7 updating + SSE error, no done frame | same + **REASON**: `chat.state.error` surfaced verbatim (`updating-strand-reason`) | reason + cancel escape (OQ4: CANCEL + REASON only — NO retry-resend; one-path rule intact) | DC4 |
| S8 updating + result.error done frame | existing :423-428 reset leg (unchanged) | pane returns to usable chat (pin-only) | DC7 |
| S9 re-ask re-entry | fresh clarifying, answers wiped by design; carried set lives in resolvedClarificationsRef and re-sends in the batch (pinned, not changed) | cards actionable via S1/S2/S3 legs | DC3 |
| S10 mode churn mid-auto-submit | panel unmounts; timer cleared; submit no-ops at :1316 | NO guard-heuristic added; churn arm documented (§5) | DC8 |
| cancelled | cancel from clarifying/updating → ready | existing handleCancelDraft, now reachable from `updating` too | DC4 |

No new local vocabulary: "Change", "Update draft", "Cancel this draft and start a new
prompt" are the existing labels; the two new labels are the spec's own
("Continue with this answer", "Go to next unanswered"). No CSS added — the new buttons
reuse `questions-panel__btn`, `questions-panel__btn--primary`, `ai-tab__input-cancel`.

## 2. RED/GREEN pairs (raws in `.hermes/raws/`, prefix `shqa2-`)

First targeted check (spec §First targeted check), `shqa2-red-dc2.txt`:
```
AssertionError: expected true to be false   (x2 — 'q1' in state.answers survives :215-217)
 Test Files  1 failed (1)
      Tests  2 failed | 21 passed (23)
```
RED set (panel + host, `shqa2-red-set.txt` / `shqa2-red-host.txt`):
```
TestingLibraryElementError: Unable to find an element by: [data-testid="continue-q1"]  (x4)
TestingLibraryElementError: Unable to find an element by: [data-testid="next-unanswered-q1"]  (x2)
FAIL ... DC1b: answered card proceeds via the existing clarification resend wire
FAIL ... DC3: Change reopens the picker; the re-pick resends through the SAME single code path
FAIL ... DC4: an updating strand that errors names the failure and offers the cancel escape
 Test Files  2 failed (2)   Tests  6 failed | 2 passed (8)   (panel file)
 Test Files  1 failed (1)   Tests  3 failed | 2 passed (5)   (host file; DC7/DC8 pass — pin-only by design)
```
GREEN (same commands after `fix(ai)`):
```
targeted (3 files):        Test Files  3 passed (3)    Tests  36 passed (36)     shqa2-green-targeted.txt
spec GREEN set (6 files):  Test Files  6 passed (6)    Tests  58 passed (58)     shqa2-green-set3.txt
ai/ directory sweep:       Test Files  3 failed | 37 passed (40)  Tests 263 passed (263)   shqa2-sweep-ai-green.txt
```
RED→GREEN pairs: DC1↔continue affordance, DC1b↔host proceed on the existing wire,
DC2↔reducer reopen, DC3↔reopen+same-path resend, DC4↔updating reason+cancel,
DC5↔exactly-one auto-submit across reopen, DC6↔invariant table. DC7/DC8 are pin-only
(pass in both phases — they pin existing legs, per spec).

Note on the spec's GREEN-set command form: `npm run test:unit -w app -- run <paths>`
forwards the literal token `run` as a vitest filter, which additionally matches
`e2e/run-workflow.spec.ts` (a Playwright spec that always fails under vitest —
"Playwright Test did not expect test.describe() to be called here"). This reproduces
IDENTICALLY on trunk (proven: same command in cl-integration-2 → same e2e collection
failure, `shqa2-green-set2.txt` shows 130/130 tests passing with only that pre-existing
collection failure). The clean form (no stray `run` token) is 6/6 green, 58/58 tests.

## 3. ai/ sweep baseline parity (zero new failing suites)

Trunk sweep (`/tmp/shqa2-trunk-sweep-ai.txt`, run in cl-integration-2 at 1b2b5ce9):
```
 FAIL ParameterAnswerInput.test.tsx / draftChanges.test.ts / useChatThread.deckLayout.test.tsx
 Test Files  3 failed | 35 passed (38)   Tests  247 passed (247)
```
Worktree sweep: the SAME 3 collection failures (identical "Failed to load url ...
resolved id: /mnt/vast/home/brad/git/computable-lab/..." symlink-resolution error —
pre-existing trunk baseline for the symlinked test files, NOT introduced here),
37 passed (35 frozen + my 2 new files), 263 tests passed (247 + 16 new legs), zero test
failures in either run. Unhandled-error count identical (1 in both runs).

## 4. tsc baseline-set equality

Base (branch point, `shqa2-tsc-base-sorted.txt`) and head (after GREEN,
`shqa2-tsc-head2-sorted.txt`): both **23 errors**, `diff` → **EMPTY** (raws show
`TSC_SET_DIFF_EMPTY_FINAL`). Zero NEW errors under `right-pane/ai/`; the 3 pre-existing
ai/ lines (systemPromptForViewer.ts, useChatThread.deckLayout.test.tsx x2) are in both
sets. exactOptionalPropertyTypes discipline kept even though app tsconfig does not
enable the flag: the reopen RECOMPUTES the answers map with the key filtered out
(`Object.fromEntries(...filter...)`) — never `answers[id] = undefined`; the new
`updating-cancel` testid rides a conditional spread.

## 5. S10 churn-source evidence trail (DC8)

DC8 (`shqa2-green-targeted.txt` green leg) answers the only question (auto-submit timer
pending), then a second turn lands in the **`result.error` arm of onDraftResult
(AiTabPanel.tsx:423-428 → `sidebarDispatch({type:'reset'})`)** before the 300ms fires.
Asserted: NO sendChat fires (timer cleared on unmount + :1316 mode guard), panel gone,
chat input usable. The churn arm exercised is the CLIENT's intentional error-reset leg
(pinned separately by DC7) — this test does NOT evidence a server re-ask loop, so no
SH-QA-1 handoff is warranted from this item. No guard-heuristic was added anywhere:
the :1316 guard and the answers-wipe in `clarifications-needed` are byte-unchanged
(diff proves). The other enumerated churn arms (:393 sequenceProposal, :438
workstateTurn, :450 ledgerTurn, :944 protocol-swap, ChangesPanel :1360/:1371) remain
untouched by this item.

## 6. Scope proof

`git -c core.fileMode=false diff --name-only 1b2b5ce9..HEAD`:
```
app/src/event-editor/right-pane/ai/AiTabPanel.deadChrome.test.tsx   (new)
app/src/event-editor/right-pane/ai/AiTabPanel.tsx                   (clarifying/updating leg only)
app/src/event-editor/right-pane/ai/QuestionsPanel.deadChrome.test.tsx (new)
app/src/event-editor/right-pane/ai/QuestionsPanel.tsx
app/src/event-editor/right-pane/ai/sidebarState.test.ts
app/src/event-editor/right-pane/ai/sidebarState.ts
```
(+ this report). ZERO server/, schema/, config/ files; zero wire changes — the proceed
affordance reuses the existing `clarificationAnswers` chat-request payload (OQ2).
ClarificationPicker.tsx NOT touched (spec predicted no re-open signal needed — reopen
works by clearing the answer; the existing picker branch renders, proven by DC3/DC5).
AiTabPanel.tsx change is confined to the bottom input/cancel block (:1418 leg, now
covering `updating`); the QuestionsPanel mount block, submit guard, and
handleClarificationsSubmit are byte-unchanged.

Frozen legs byte-identical (absent from the diff): QuestionsPanel.test.tsx,
AiTabPanel.shorthandClarification.test.tsx, ClarificationPicker.test.tsx,
ParameterAnswerInput.test.tsx (symlink), MessageLog legs. sidebarState.test.ts: the
`:168` 'change-question updates activeQuestionId' leg was RETAINED (renamed, semantics
unchanged for an unanswered question) and three DC2 legs ADDED — the mandated reducer
semantics change per spec §RED plan ("its existing ... test at :168 MUST be updated to
the reopen semantics"); the unanswered-question leg stays green as-is, so no frozen
assertion was bent.

## 7. OQ compliance / deviations

- OQ1: sidebarState.ts change-question reopen + updating-escape leg implemented exactly
  as ruled. NO deviation.
- OQ2: proceed = existing handleClarificationsSubmit resend; no new wire shape, no
  per-answer accept. DC1b asserts the send payload is the existing
  `{ clarificationAnswers: [...] }` shape built by the same seam.
- OQ3: faithful reading coded — within-session answered-card dead click (DC1/DC2/DC5) +
  re-ask re-entry with carried answers in resolvedClarificationsRef (DC3 asserts the
  accumulated q2 answer re-sends in the later batch). No arrival-prefill frame invented.
- OQ4: updating strand = CANCEL + REASON only; no retry-resend affordance exists in the
  diff.
- stop_boundary: NOT hit — no wire change was needed.

## 8. Bait pre-empt (B1-B6)

- B1 (double-send): proceed calls the same `onSubmit` prop; DC5 pins exactly-one
  auto-submit across a reopen cycle (prefilled timer cleared by reopen, re-trip fires
  once, further advance fires none); submit-answers unmounts all resend affordances.
- B2 (parallel submit): reopen is one reducer leg (map recomputed minus the key); DC3
  asserts both sends' texts come from `clarificationAnswersPrompt` with the same
  `clarificationAnswers` option shape.
- B3 (server touched / wire invented): §6 diff — app/ only, zero payload fields added.
- B4 (heuristic papering over churn): :1316 guard + answers-wipe byte-unchanged; DC8
  documents churn without masking it.
- B5 (frozen tests bent): §6 — frozen files absent from the diff; only the mandated
  :168-region semantics change, quoted from the spec.
- B6 (exactOptionalPropertyTypes): key filtered out, never `: undefined`; conditional
  spread for the new testid; tsc set-diff empty.

## 9. Browser gate (orchestrator-owned)

Unit/component evidence is complete; the :5193 receipts (answered card WITH the visible
proceed affordance; Change→reopen→resubmit click sequence; clofibrate + synthetic re-ask
reaching ghosted events) belong to cl-browser-reviewer after merge. New stable hooks for
the reviewer: `continue-<questionId>`, `next-unanswered-<questionId>`,
`updating-strand-reason`, `updating-cancel`.

SH-QA-2 DONE 1fb96943
