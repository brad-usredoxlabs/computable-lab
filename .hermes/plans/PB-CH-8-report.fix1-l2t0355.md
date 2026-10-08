# PB-CH-8 fix1 — coder report (l2t0355)

Branch: pb-ch-8-fix1-lane2-l2t0355 (off trunk b824bc5d)
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-8-fix1-lane2-l2t0355
Defect doc: lanes/2/decisions/PB-CH-8-ledger-render-defect.md (probe1/capture1/witness1 receipts)

## Commits

- e4bb2896 test(PB-CH-8 fix1): RED ledger-turn suite (written and committed FIRST;
  RED evidence below — T1a/T1b/T4 fail on pre-fix code, T2/T3 pass as regression guards)
- 1381a952 feat(PB-CH-8 fix1): ledger-turn flag (the fix)

## What changed (file:line at HEAD)

1. app/src/event-editor/right-pane/ai/useChatThread.ts
   - :125-133 — new optional prop `onLedgerAnswer?: () => void` on
     UseChatThreadOptions (documented as a TURN MARKER, not a content relay).
   - :148 — destructured in the hook signature.
   - :314-326 — case 'ledger_answer': `try { onLedgerAnswer?.() } catch {}` added
     BEFORE the existing dispatch; the dispatch block itself is byte-identical
     (verified by diff — only the marker + comment lines were inserted). The
     try/catch follows the agent_action never-break-the-turn wrapper precedent.
   - :358 — `onLedgerAnswer` added to the send useCallback deps array
     (exhaustive-deps honest, same style as onWorkstateProposal/onAnalysisProposal).
2. app/src/event-editor/right-pane/ai/AiTabPanel.tsx
   - :345-358 — `const ledgerTurnRef = useRef(false)` beside workstateTurnRef,
     comment citing the defect doc + receipts dir (PB-CH-8/2026-10-08
     probe1/capture1/witness1) and the verified ledger_answer-before-done ordering.
   - :376-377 — onDraftResult consumes BOTH flags FIRST on every path
     (`const ledgerTurn = ledgerTurnRef.current; ledgerTurnRef.current = false`).
   - :404-415 — new guard arm right after the workstateTurn arm (`if (ledgerTurn)`
     at :411): on a ledger turn `sidebarDispatch({ type: 'reset' })` and return —
     no draft-ready, no 'reviewing' mode, no empty Apply-to-run; the chat section
     (where the kind:'ledger' trace renders) stays mounted.
   - :641-643 — `onLedgerAnswer: () => { ledgerTurnRef.current = true }` wired at
     the useChatThread call site, beside onWorkstateProposal/onAnalysisProposal.
   - :658 — `ledgerTurnRef.current = false` in the sendChat choke point, next to
     the workstateTurnRef clear.
3. app/src/event-editor/right-pane/ai/AiTabPanel.ledgerTurn.test.tsx (NEW, 331 lines)
   - Harness deviation (documented, deliberate): unlike the workstate harness
     (which mocks useChatThread), this suite runs the REAL hook against a mocked
     `runAssistStream` transport seam (partial mock via importOriginal) so SSE
     frames flow through the hook's onEvent exactly as the browser delivers them;
     ChatInput is mocked to a plain button capturing the panel's onSend so a turn
     starts through the panel's real handleSend -> sendChat choke point. This
     exercises the full ledger_answer -> trace -> DOM path end-to-end, which is
     what the witness1 MutationObserver receipt says never happened.
   - T1a found shape + T1b no-history shape: answerText verbatim in
     message-log-trace, trace-ledger/trace-ledger-lab-events present, NO
     ai-subtab-changes, NO changes-apply / 'Apply to run', header not
     'Review changes', chat subtab active, chat input mounted.
   - T2 workstate regression, T3 normal-draft regression, T4 ledger->draft
     flag-hygiene (choke-point clear).

## RED evidence (pre-fix, at the tests commit against b824bc5d code)

Command: cd <wt>/app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.ledgerTurn.test.tsx

    FAIL ... > T1a: a found ledger_answer turn renders answerText verbatim ...
      -> Unable to find an element by: [data-testid="message-log-trace"]
         (the chat section was unmounted by the draft-ready park — the defect)
    FAIL ... > T1b: a no-history ledger_answer turn ...
      -> Unable to find an element by: [data-testid="message-log-trace"]
    FAIL ... > T4 (flag hygiene) ...
      -> AssertionError: expected <button type="button" …(2)></button> to be null
         (ai-subtab-changes present after the ledger turn — the park)
    Test Files  1 failed (1)
         Tests  3 failed | 2 passed (5)   (T2/T3 pass: pre-existing behavior guards)

This reproduces the defect signature in the vitest DOM: the ledger answer's
trace container is NOT in the document after the turn (matches witness1:
MutationObserver added-node set containing the needle = []).

## GREEN evidence (post-fix)

Same command:

     ✓ src/event-editor/right-pane/ai/AiTabPanel.ledgerTurn.test.tsx  (5 tests) 63ms
     Test Files  1 passed (1)
          Tests  5 passed (5)

Targeted app suites (13 files incl. the new one):

    npx vitest run src/event-editor/right-pane/ai/AiTabPanel.ledgerTurn.test.tsx \
      src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx \
      src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx \
      src/event-editor/right-pane/ai/AiTabPanel.analysis.test.tsx \
      src/event-editor/right-pane/ai/AiTabPanel.test.tsx \
      src/event-editor/right-pane/ai/AiTabPanel.runPageSurface.test.tsx \
      src/event-editor/right-pane/ai/useChatThread.ledger.test.tsx \
      src/event-editor/right-pane/ai/useChatThread.analysis.test.tsx \
      src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx \
      src/event-editor/right-pane/ai/chatReducer.test.ts \
      src/event-editor/right-pane/ai/chatReducer.ledgerTrace.test.tsx \
      src/event-editor/right-pane/ai/assistStream.ledger.test.ts \
      src/event-editor/right-pane/ai/assistStream.test.ts

     Test Files  13 passed (13)
          Tests  100 passed (100)

Full ai directory (lane worktree, post-fix):

     Test Files  3 failed | 33 passed (36)
          Tests  226 passed (226)
         Errors  1 error

The 3 failing FILES (ParameterAnswerInput.test.tsx, draftChanges.test.ts,
useChatThread.deckLayout.test.tsx) and the 1 unhandled error
(ClarificationPicker.test.tsx 'Cannot read properties of undefined (reading
then)') are PRE-EXISTING: the identical 3-file fail set + identical
ClarificationPicker unhandled error reproduce on the TRUNK checkout
(cl-integration-2/app, same command: 3 failed | 32 passed (35), 221 tests
passed). The lane run has exactly ONE more passing file — the new suite.
ZERO new failing files. 226 tests passed, 0 test failures.

Server ledger suites (from <wt>/server, sanity only — server untouched):

    npx vitest run src/ai/AgentOrchestrator.ledger.test.ts src/workspace-session/ledgerQuery.test.ts
     Test Files  2 passed (2)
          Tests  26 passed (26)

## tsc baseline-vs-after (measured in THIS worktree)

Baseline (pristine HEAD b824bc5d + lane-synced untracked files replicated 1:1
from the trunk worktree — comm -3 of `git status --porcelain -uall
--ignored=matching` between trunk and this worktree is EMPTY):

    npx tsc -p app --noEmit  ->  34 errors / 24 files

After the fix:

    npx tsc -p app --noEmit  ->  34 errors / 24 files

Position-normalized comm -3 of the two error sets: EMPTY (identical error
sets, zero new errors). Note: the initial bootstrap of this worktree was
missing the trunk's untracked/ignored entries (tsc read 28/28 without them);
they were replicated 1:1 from the TRUNK worktree (symlinks as symlinks) before
measuring, per the lane bootstrap rule — the 34/24 pin matches the known
post-PB-CH-8-merge app baseline.

## Deviations / assumptions

- Test harness: real useChatThread + mocked transport seam instead of the
  mocked-hook pattern (rationale in the test file header). The mocked-hook
  harnesses (workstate/protocolEdit) could not prove the answer reaches the
  DOM because they replace the very code path the defect lives in.
- The onLedgerAnswer marker is wrapped in try/catch (agent_action wrapper
  precedent) so a throwing mount can never end the turn or the chat.
- No server, no YAML, no new emission types touched (git diff --stat: 3 app
  files only). The ledger_answer -> done ordering is the orchestrator-verified
  one cited in the spec and the existing workstate comment; the flag discipline
  (consume-first + choke-point clear) makes the guard leak-safe regardless.
- The found-shape ledger turn's reattach card still rides the SEPARATE
  workstate_proposal event (unchanged); if BOTH fire in one turn, the
  workstateTurn arm consumes first and resets — the card remains that turn's
  review surface and the ledger trace still renders in the chat section.

## Ready for orchestrator gates

Branch pb-ch-8-fix1-lane2-l2t0355 @ 1381a952. PB-CH-8 legs 2c + 6 receipt
re-take (ledger-no-history.png, ledger-incompatible-surface.png) unblocked
pending orch browser-review verification.
