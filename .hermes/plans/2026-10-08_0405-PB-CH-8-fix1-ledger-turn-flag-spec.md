# PB-CH-8 fix1 — ledger-turn flag in AiTabPanel (run-page chat renders the ledger answer)

Item: PB-CH-8 (fix cycle on the merged ledger feature). Lane 2. Coder: cl-coder.
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-8-fix1-lane2-l2t0355 (branch pb-ch-8-fix1-lane2-l2t0355,
off trunk b824bc5d — trunk ALREADY contains the merged ledger feature + PB-CH-6 fix1).
Defect doc (full evidence): lanes/2/decisions/PB-CH-8-ledger-render-defect.md (orch
probe/capture/witness receipts: SSE carries the answer; MutationObserver proves it NEVER enters
the DOM; run-page pane parks on CHANGES over nothing).

## Orch-verified orientation (checked myself at b824bc5d, trust these, do not re-derive)

- app/src/event-editor/right-pane/ai/useChatThread.ts case 'ledger_answer' (~:294-318): builds a
  kind:'ledger' trace entry via dispatch({type:'stream-trace',...}) and `return`s — it does NOT
  call any onLedger callback and sets no turn flag. The hook's props interface has
  onWorkstateProposal? (:116) and onAnalysisProposal? (:123) only.
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx: `workstateTurnRef` (:343) is set ONLY in
  handleWorkstateProposal (:579-590) for workstate/analysis card turns, consumed FIRST in
  onDraftResult (:358-359), and cleared at the single sendChat choke point (:619-623). A ledger
  turn sets NOTHING -> onDraftResult falls to the final else (:447+) and dispatches
  'draft-ready' with empty changes: sidebar parks 'reviewing'/changes, the chat section (where
  the kind:'ledger' trace renders) UNMOUNTS before 'done' commits the trace. Exactly the
  PB-CH-4 D1 failure class, replayed for ledger turns.
- Server is CORRECT and out of scope: ledger_answer emits during run() BEFORE the `done` frame
  (same verified ordering the workstate_proposal comment at AiTabPanel.tsx:583-586 cites), and
  AgentOrchestrator's ledger suites are green. NO server change.

## The change (bounded, app-only, mirror the workstateTurnRef discipline EXACTLY)

1. useChatThread.ts: add optional `onLedgerAnswer?: () => void` prop; in case 'ledger_answer',
   call it (before/after the existing dispatch — the dispatch stays byte-identical) then return.
   Follow the existing prop-declaration + deps-array style (the callback is in the sendChat
   useCallback deps list ~:334; keep exhaustive-deps honest).
2. AiTabPanel.tsx: add `ledgerTurnRef = useRef(false)` beside workstateTurnRef with a comment
   citing this defect + receipts dir; set it in the onLedgerAnswer callback passed to useChatThread
   (same place onWorkstateProposal is wired, ~:594-607); CONSUME it in onDraftResult right beside
   workstateTurn — same discipline: consume FIRST on every path, and on a ledger turn
   `sidebarDispatch({ type: 'reset' })` and return (no draft-ready, no changes panel; the ledger
   trace IS the turn's only surface; the chat section stays mounted). CLEAR it in the sendChat
   choke point next to the workstateTurnRef clear (:621).
3. NO other behavior changes. No server, no YAML, no new emission types.

## RED-first tests (write them first; they must fail on current code)

Extend the existing AiTabPanel protocol/workstate test harness style (see
app/src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx and the PB-CH-4 D1 workstate
test — find them by grep for workstateTurnRef in test files):
- T1: a turn whose SSE stream carries a ledger_answer event (status notFound shape AND found
  shape) -> after done, the answer text (answerText verbatim) is present in the rendered chat
  pane; the sidebar is NOT in reviewing/changes (no Apply-to-run button); chat input enabled.
- T2: a workstate_proposal turn regression — card still shows, draft-ready still suppressed.
- T3: a normal draft turn regression — draft-ready still fires (flag leak guard).
- T4 (flag hygiene): a ledger turn followed by a normal draft turn — the second turn DOES open
  draft-ready (choke-point clear).

## Verification (coder runs, output in report)

- vitest MUST run from <wt>/server for server tests; app tests: cd <wt>/app &&
  npx vitest run <files> (follow the existing app test invocation you find in the tree).
- Targeted app suites green incl. your new file; app tsc: `npx tsc -p app --noEmit` — the NEW
  error count must equal the trunk baseline measured in YOUR worktree (report both numbers).
- Do not touch other failing files (app full-suite baseline is a known 53-file failing set;
  you must introduce ZERO new failing FILES).

## Deliverables

- Commit(s) on branch pb-ch-8-fix1-lane2-l2t0355 (tests commit, feat commit).
- Report (write it, commit it): /mnt/vast/home/brad/git/wt/PB-CH-8-fix1-lane2-l2t0355/.hermes/plans/PB-CH-8-report.fix1-l2t0355.md
  — sections: what changed (file:line), test output (commands + pass/fail verbatim), tsc
  baseline-vs-after, deviations/assumptions.
- ALL edits in YOUR worktree only. Never write to cl-integration-2 or computable-lab checkouts.
- git: ALWAYS `git -c core.fileMode=false ...` (NFS mode-bit noise). Commit with -c core.fileMode=false too.
