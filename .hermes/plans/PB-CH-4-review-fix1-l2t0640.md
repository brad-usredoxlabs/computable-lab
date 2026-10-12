# ADVERSARIAL REVIEW — PB-CH-4 fix run 1 (gate fix D1: workstate turn must not open the event-graph review)

Reviewer: cl-adversarial-reviewer (OpenRouter deepseek/deepseek-v4.1-flash — different family from the coder's qwen3.8-flash-next-iq3_xxs)
Date: 2026-10-07
Item: PB-CH-4F-lane2-l2t0550 (bounded fix of browser-gate defect D1)
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-4F-lane2-l2t0550
Branch: PB-CH-4F-lane2-l2t0550, commit ebec9ad0 on base 1bdba22d (docs tip; code tip ed397216 = ancestor)
Reviewed diff: `git -c core.fileMode=false diff ed397216..ebec9ad0` AND the fix commit's own diff `1bdba22d..ebec9ad0`
Trunk sources read at: /mnt/vast/home/brad/git/cl-integration-2 (HEAD ed397216)

---

## 0. Scope of the reviewed diff (measured)

The review brief predicted "2 files, +134". The RANGE `ed397216..ebec9ad0` actually contains **4 files / +419**:

    .hermes/plans/handoffs/2026-10-07_0420-lane2-pbch4-merged-gate-inflight.md      | 156 +
    .hermes/plans/handoffs/2026-10-07_0520-lane2-pbch4-gate-run2-inflight-rail-...   | 129 +
    app/src/event-editor/right-pane/ai/AiTabPanel.tsx                                |  44 +
    app/src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx                  |  90 +

The two extra files are **orchestrator handoff docs that arrive on the branch BASE commit 1bdba22d**, not in the fix commit. The fix commit itself is clean:

    $ git show --stat --oneline ebec9ad0
    ebec9ad0 fix(PB-CH-4): a workstate turn's done result never opens the event-graph review …
     app/src/event-editor/right-pane/ai/AiTabPanel.tsx            | 44 ++++
     app/src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx | 90 ++++
     2 files changed, 134 insertions(+)

So **no coder scope creep**: the fix touches exactly the two app files. (Noted for the record so a later reader does not mistake the handoff docs for coder output.)

---

## 1. Acceptance criteria (verbatim from the task) and how each was checked

Binding rule under review: **when the turn emitted `workstate_proposal`, `onDraftResult` must NOT dispatch draft-ready; the card is the turn's ONLY review surface; the chat subtab stays active.** Plus the spec's **`result.error` guard discipline** (`/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_0120-PB-CH-4-wave1-mount-spec.md`, §1 + §6).

The task's seven non-negotiables (verbatim intent) → result:

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Race-safety of the flag; server ordering claim true; flag cannot leak | **FAIL (see D1)** | ordering verified; one leak path found |
| 2 | Flag consumed at TOP of onDraftResult on EVERY path (error/protocolEdit/clarification) | PASS | AiTabPanel.tsx:364-365 |
| 3 | Non-workstate turns still dispatch draft-ready; tests prove BOTH directions | PASS | test 2 + 265-test suite |
| 4 | No regression of accepted invariants (no-accept-before-canAccept, zero-write, reject zero store, no 2nd AI call, never-default switch untouched) | PASS | diff + tests |
| 5 | Scope: only AiTabPanel.tsx + its test | PASS | `git show --stat ebec9ad0` |
| 6 | Test quality: real callbacks, fail-able, assert (a)(b)(c) | PASS (with limitation) | read test bodies |
| 7 | `reset` cannot wipe a pending protocol_edit / deck_layout proposal | PASS | sideBar reset semantics + reachability analysis |

---

## 2. Commands I ran (verbatim results)

    $ git -c core.fileMode=false diff --stat 1bdba22d..ebec9ad0
     app/src/event-editor/right-pane/ai/AiTabPanel.tsx         | 44 +++++++++++
     .../right-pane/ai/AiTabPanel.workstate.test.tsx           | 90 ++++++++++++++++++++++
     2 files changed, 134 insertions(+)

    $ npx vitest run src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx
     ✓ src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx  (12 tests) 249ms
     Test Files  1 passed (1)
          Tests  12 passed (12)

    $ npx vitest run src/event-editor/right-pane/ai src/shared/session
     Test Files  3 failed | 33 passed (36)
          Tests  265 passed (265)
     FAIL src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx
     FAIL src/event-editor/right-pane/ai/draftChanges.test.ts
     FAIL src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx

    $ ls -l src/event-editor/right-pane/ai/{ParameterAnswerInput.test.tsx,draftChanges.test.ts,useChatThread.deckLayout.test.tsx}
     lrwxrwxrwx ... ParameterAnswerInput.test.tsx -> /mnt/vast/home/brad/git/computable-lab/app/...
     lrwxrwxrwx ... draftChanges.test.ts          -> /mnt/vast/home/brad/git/computable-lab/app/...
     lrwxrwxrwx ... useChatThread.deckLayout.test.tsx -> /mnt/vast/home/brad/git/computable-lab/app/...
    # ALL THREE failing files are gitignored symlinks into Brad's live tree; re-run at trunk ed397216
    # fails them IDENTICALLY ("Failed to load url ... Does the file exist?"). Pre-existing environmental
    # RED, NOT caused by the fix. ZERO failing tests, 265 passing.

    $ cd app && npx tsc --noEmit --pretty false | grep -c 'error TS'
    34
    $ comm -3 <(worktree error-file set) <(trunk ed397216 error-file set)
    (empty)
    # 34 = 34, error-FILE set IDENTICAL, AiTabPanel.tsx appears in NEITHER set → the fix introduces no
    # new type error and does not perturb the pinned baseline.

    $ git show --stat --oneline ebec9ad0        # 2 files (above)
    $ git diff --name-only ed397216..ebec9ad0   # 4 names: 2 handoff docs (from base) + the 2 app files

---

## 3. What the fix does (verified against the code, not the report)

- `workstateTurnRef` declared: AiTabPanel.tsx:349.
- **Set** synchronously in `handleWorkstateProposal` (AiTabPanel.tsx:617), i.e. when the `workstate_proposal` frame is forwarded to the panel.
- **Consumed at the TOP of `onDraftResult`** (AiTabPanel.tsx:364-365), *before* the `result.error` guard (373), the `protocolEdit` branch (397), and the clarifications branch (450) — so every early-return path consumes it. ✓
- The workstate branch (AiTabPanel.tsx:387-390) dispatches `sidebarDispatch({type:'reset'})` and returns — no `draft-ready`, no `'reviewing'`, no empty 'Apply to run'.
- **Cleared** in `sendSurfaceContext` (:726), `handleSend` (:900), `handleClarificationsSubmit` (:928).

**Ordering claim — verified in trunk, but the citation is WRONG (see D2).** The proposal frame is emitted by `onEvent` DURING `orchestrator.run()` at server/src/ai/AgentOrchestrator.ts:2199 (compose_workstate branch, inside run). The `done` frame is written only after `await orchestrator.run(...)` in the handler that actually serves the client. The client (`assistStream.ts:269`) posts to **`/ai/assist/stream`**, which is registered to `aiHandlers.assistStream` (server/src/api/routes.ts:645). In that handler the ordering is `onEvent: sendEvent` at AIHandlers.ts:455 inside `await orchestrator.run(...)` at :447, then `sendEvent({ type: 'done', result })` at **:458**. Both frames go through the single `reply.raw.write` writer (:388-390). **Conclusion: in the stream, `workstate_proposal` always precedes `done` of the same turn.** The coder's cited line `AIHandlers.ts:288` is *not* that writer — `:288` belongs to `draftEventsStream` (a different endpoint, `/ai/draft-events/stream`). The coder does also cite ":458" in the prose report, so the conclusion is sound; the line number in the code comment and the test comment is misleading.

---

## 4. Defects

### D1 — major — the flag CAN leak: two of five `chat.send` entry points and the SSE-error exit never clear it
**File/line:** AiTabPanel.tsx:1122 (`onDraft` in `ProtocolBuilderOrchestrator` → `void chat.send(draftPrompt, …)`); AiTabPanel.tsx:1145 (extract-protocol button → `void chat.send(\`Extract a protocol from the PDF …\`, …)`); and the SSE-error exit at useChatThread.ts:221-223.
**Rule violated:** the fix's own stated invariant (code comment AiTabPanel.tsx:346-348 and :897-899) — "cleared on every next send so a stale flag can never suppress a later turn's review"; and the task's explicit leak criterion ("consumed/reset paths missing on some exit — error path, … next send").

Every `chat.send` call site in the panel is: :727 (sendSurfaceContext — clears), :902 (handleSend — clears), :930 (handleClarificationsSubmit — clears), **:1122 (does NOT clear)**, **:1145 (does NOT clear)**. Additionally, `onDraftResult` is only invoked on the `done` frame; if a turn ends with an SSE `error` frame (AIHandlers.ts:459-463) or an abort, no `done` arrives, `onDraftResult` never runs, and the panel is not notified — so the flag stays `true`.

Reachability (honest, narrow but real): a turn emits `workstate_proposal` (flag := true) and then the stream terminates without a `done` (transport error / Stop / server error frame). `workstateTurnRef` remains true. The user's next send via the *Extract Protocol* button or the protocol-builder *Draft* button bypasses every clear, and that next turn's `onDraftResult` hits the workstate branch (:387) → `sidebarDispatch({type:'reset'})` and returns, **silently suppressing a legitimate draft-ready** — exactly the failure the clears were added to prevent. (For the common chat path `handleSend` clears it, so the leak needs one of the two non-chat send entry points; that is why I rate it major, not blocker.)

**Minimal corrective ask:** guarantee the reset at a single choke point so no send path can miss it — e.g. reset `workstateTurnRef.current = false` inside the one place every turn starts (a `chat.send` wrapper), and/or clear it on the stream-error/abort exit. Add one test for the "proposal then no-done, then a non-handleSend send" sequence. (Direction only — no patch provided.)

### D2 — minor — ordering citation points at the wrong handler
**File/line:** AiTabPanel.tsx:344-345 and :615; AiTabPanel.workstate.test.tsx:546. All three cite **`server/src/api/handlers/AIHandlers.ts:288`** as the `done` send. `:288` is inside `draftEventsStream` for `/ai/draft-events/stream`. The client's chat stream (`/ai/assist/stream`, assistStream.ts:269 → routes.ts:645) sends `done` at **AIHandlers.ts:458** inside `async assistStream` (:299).
**Why it matters:** the ordering proof is load-bearing for the race-safety argument, and it is cited as evidence in the code comment, the test comment, and the report. The conclusion is CORRECT (ordering holds via :447/:455/:458), but the citation would mislead a future maintainer into verifying the wrong method.
**Minimal corrective ask:** fix the cited line to AIHandlers.ts:458 (assistStream) in the comment/test/report. No behavioral change.

---

## 5. Criteria checked and PASSED (with evidence)

- **Consume-at-top on every path (task #2).** Consume is at :364-365, above the `result.error` guard (:373), the `protocolEdit` branch (:397), and the clarifications branch (:450). The no-envelope compose_workstate turn yields `success:false, error` and no proposal frame (AgentOrchestrator.ts:2166-2198), so the flag is false and the error guard handles it. ✓
- **Non-workstate turns unaffected (task #3).** The flag is only ever set at :617, which runs only on a real `workstate_proposal` frame; null turns leave it false. Test 2 (AiTabPanel.workstate.test.tsx:592-618) drives proposal→done→reject→plain-draft and asserts `ai-subtab-changes` and `changes-apply` reappear — proving the guard is per-turn and does not over-suppress. Existing suite (265 passing) covers ordinary draft-ready. ✓
- **Accepted invariants untouched (task #4).** `git diff --name-only ed397216..ebec9ad0` shows useChatThread.ts is NOT modified; the `_exhaustive: never` arm is intact (useChatThread.ts:271-274). The fix adds no accept control, performs no store write, and `handleWorkstateProposal`'s compile/accept/reject logic is unchanged apart from the added flag line. The pre-existing AR-2 tests (no accept before canAccept, 600 ms zero-putSession, reject zero store calls, fetch-spy no-second-AI-call) remain green inside the 265. ✓
- **Scope (task #5).** Fix commit = 2 files (above). No ChatPage/useAiChat/aiClient hunks. ✓
- **Test quality (task #6).** The two new tests invoke the **real panel callbacks** captured from `useChatThread` (`chatOptions.onWorkstateProposal` / `chatOptions.onDraftResult`) — they do NOT set the ref manually, so they are not tautological; pre-fix test 1 would throw `Unable to find [data-testid="workstate-card"]` (the card unmounts under `'reviewing'`). They assert (a) `workstate-card` + `workstate-card-accept` still present (:574-575), (b) no `ai-subtab-changes` and header not "Review changes" (:577-578), (c) no `changes-apply` and no "Apply to run" text (:580-581), plus chat subtab active (:583) and zero push (:589). The asserted testids are real: subtabs are `data-testid={\`ai-subtab-${t.tab}\`}` (AiTabPanel.tsx:1081) with tabs `chat`/`changes` (:1069/:1072); `changes-apply` lives in ChangesPanel.tsx; `workstate-*` in WorkstateProposalCard.tsx. **Limitation (not a defect):** the tests order the two callbacks themselves, so they do not exercise the real `useChatThread` frame switch; they cannot catch a future frame-ordering regression. Acceptable because that ordering is separately code-verified, but a frame-level test would be strictly stronger. ✓
- **`reset` cannot wipe a pending protocol_edit / deck_layout proposal (task #7).** `sidebarReducer` `'reset'` returns `initialSidebarState` (sidebarState.ts:217-219) — it does NOT touch `protocolProposalRef` (AiTabPanel.tsx:816). I traced the only consumer: `handleProtocolAccept` is reachable ONLY from `ChangesPanel.onApply` when `sidebar.protocolDiff` is truthy (AiTabPanel.tsx:1214-1220), and `protocolDiff` is set ONLY by the `protocol_edit` branch of `onDraftResult` (:432-440), which also re-sets `protocolProposalRef` fresh (:426). A stale ref therefore cannot drive an Accept after a workstate reset. Reachability of the "pending review then later workstate turn" sequence: any workstate turn is started by a send; `handleSend` already dispatches `start-interpreting` (:901) which takes the pane off `'reviewing'` BEFORE the turn, so the visible protocol/event-graph review is already gone regardless of the fix — and the pre-fix behaviour (`draft-ready` with empty changes) replaced it just as destructively. Hence the added `reset` introduces no new loss. ✓

---

## 6. Verdict rationale

The core gate fix (D1's requirement) is implemented correctly and is independently verified: the flag is set on the proposal frame, consumed at the very top of `onDraftResult` on all its paths, and the workstate turn now resets the sidebar instead of opening an empty event-graph review; the card stays mounted on the chat subtab. Targeted tests pass under my own run (12/12; 265/265 in the wider ai+session set, with the only 3 failures being the pre-existing live-tree symlink load errors), and typecheck is 34/34 set-identical to trunk.

However, the bounded fix does not fully uphold its own race-safety claim: the flag is cleared on only three of the five `chat.send` entry points and is not cleared on the SSE-error/abort exit (D1), so a stale flag can suppress a legitimate draft-ready on a later turn via the protocol-builder Draft or Extract-Protocol buttons. Per the task's explicit criterion ("if … the flag can leak … that is a FIX verdict defect"), this is FIX. D2 is a minor citation-accuracy defect in load-bearing evidence.

D1: AiTabPanel.tsx:1122, :1145, useChatThread.ts:221-223 — clear `workstateTurnRef` on every turn start (single choke point) and on the stream-error exit.
D2: AiTabPanel.tsx:344-345, :615; AiTabPanel.workstate.test.tsx:546 — correct the cite to AIHandlers.ts:458 (assistStream), not :288 (draftEventsStream).

VERDICT: fix
