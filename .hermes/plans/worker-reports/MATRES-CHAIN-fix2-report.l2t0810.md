# MATRES-CHAIN fix-run 2 — LANE 2 report (l2t0810)

Branch: cl/lane2-matres-chain-fix2-l2t0810 (off cl/integration-2 trunk tip 8e376c0f)
Worktree: /mnt/vast/home/brad/git/wt/MATRES-CHAIN-fix2-lane2-l2t0810
Impl commit: 23e52939 (single commit; `git -c core.fileMode=false status --porcelain` CLEAN after)

## What the gate found (read in full: /home/brad/.hermes/cl/receipts/MATRES-CHAIN/2026-10-24_115822/report.md)

Server exonerated (compose_execute_chain emitted 3/3, chat says "review the card"),
but 0 POST /api/drafts/compile and chainTestids=[] on the routed run page:
D1 — the §7.5 review wall was mounted on app/src/graph/RunWorkspacePage.tsx, a module
imported by NOTHING (the /runs/:runId route lazy-imports run/RunWorkspacePage).
D2 — the routed panel (AiTabPanel, mounted via agent/AgentChatPane.tsx) never passed
onChainProposal to useChatThread, and its flow.card branch emitted only
<WorkstateProposalCard>.

## Fix (app wiring only — no server, schema, config/drafting YAML, ChainProposalCard
internals, or useChatThread frame handling touched)

1. app/src/event-editor/right-pane/ai/AiTabPanel.tsx
   - Passes `onChainProposal: (intent) => handleWorkstateProposal(intent, 'chain')`
     into useChatThread — the SAME shared useWorkstateProposalFlow the workstate/
     analysis/record-drafting mounts use (adapter is a parameter of the flow; the
     compile call site stays the ONE implementation — no forked POST /api/drafts/compile).
     The analysis/record-drafting pattern is cited verbatim in the code comment.
   - handleWorkstateProposal now also records the adapter on flowCardAdapterRef (the
     workstateTurnRef ref precedent) at the propose call site — the same adapter
     constant the flow already takes, no new vocabulary.
   - The flow card state already carried the SERVER-BUILT `card` document verbatim as
     `chainCard` (the recordFields precedent, merged in 2b51a472); the render branch
     now mounts <ChainProposalCard> when the pending flow card came from a 'chain'
     compile (phase, card, summary, diagnostics, draftId, revision via conditional
     spreads — exactOptionalPropertyTypes), and <WorkstateProposalCard> otherwise.
     No card frame (flow.card null) -> no card chrome (PB-CH-4 no-leak discipline,
     cited in the comment).
   - Turn honesty: chain turns ride the EXISTING workstateTurnRef guard (PB-CH-4 D1 /
     PB-CH-8 fix1 discipline) — handleWorkstateProposal sets it, onDraftResult consumes
     it, the sendChat choke point clears it. A notes-only `done` on a chain turn keeps
     the card as the ONLY review surface: no draft-ready park, no 'reviewing' mode, no
     empty 'Apply to run'.
   - Accept/Reject ride the existing draft accept path (ChainProposalCardProps.onAccept
     -> flow.acceptWorkstate: {draftId,revision,reviewHash} only -> the single writer
     applyAcceptedWorkstate with {accepted:true} + identity duplicate guard; Reject =
     abandon, zero fetches).

2. app/src/graph/RunWorkspacePage.tsx — RETIRED the dead chain mount (D1): removed the
   chainFlow useWorkstateProposalFlow, the onChainProposal callback, the
   <ChainProposalCard> render block, and the two now-unused imports. The FILE stays
   (not deleted — per gate direction; grep re-verified: no importer in app/src, no test
   references graph/RunWorkspacePage). ONE reachable mount now exists (AiTabPanel).

3. app/src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx — NEW (557 lines,
   9 tests), RED-first. Harness = AiTabPanel.workstate.test.tsx precedent verbatim
   (option-capturing useChatThread mock, providers, executor mocked at its module,
   apiClient mocked so compile/accept/push accounting is real; ChainProposalCard NOT
   mocked — the real presentational component renders the server-built card fixture
   from the ChainProposalCard.test.tsx vocabulary). Pins: relay wired (key present);
   exactly one compile request {adapter:'chain', intent verbatim}; compiling slot with
   NO accept control until the compile response; canAccept:true mounts ChainProposalCard
   with artifactKind header, verbatim labels (completed / reported-by-other),
   reconciliation readout (aliquots 1000 / prepared 1000, stored: 9, used: 1), ceiling
   note, draftId+revision; canAccept:false renders named diagnostics with NO accept
   control (rejectable); Accept posts exactly {draftId,revision,reviewHash}, FLAT body
   -> applyAcceptedWorkstate {accepted:true}+identity, ZERO assist/stream fetch during
   accept, spent card loses controls (chain-card-applied); Reject = card gone, zero
   further apiClient calls, zero pushes; pending card + 600 ms -> ZERO putSession and
   unchanged tab-store identity (AR-2), landing never entered the store; notes-only done
   keeps the card as the ONLY review surface; guard is per-turn (after Reject, a later
   plain draft still opens the changes review).

## Verification (real outputs; cwd=app; worktree bootstrapped first: lane-exclude
symlinks recreated from cl-integration-2's link list + root node_modules ->
computable-lab/node_modules; vitest 1.6.1, tsc 5.9.3 verified)

### (a) RED at base -> GREEN after
RED (new test file against UNTOUCHED base product files):
  npx vitest run src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx --reporter=basic
  EXIT:1
   ❯ src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx  (9 tests | 9 failed) 185ms
   Test Files  1 failed (1)
        Tests  9 failed (9)
  Failure names the defect's symptom, not test wiring:
    → expected false to be true            (onChainProposal key ABSENT from the routed panel's chat options)
    → expected "spy" to be called 1 times, but got 0 times   (no compile request issued)
    → Unable to find an element by: [data-testid="chain-card"] / chain-card-accept / chain-card-reject
  Raw: /tmp/l2t0810-RED.txt

GREEN (after the AiTabPanel wiring):
  npx vitest run src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx --reporter=basic
  EXIT:0
   ✓ src/event-editor/right-pane/ai/AiTabPanel.chain.test.tsx  (9 tests) 215ms
   Test Files  1 passed (1)
        Tests  9 passed (9)
  Raw: /tmp/l2t0810-GREEN.txt

### (b) Scoped suite — zero NEW failing files vs pre-edit baseline
BASE (pre-edit, recorded before any product change):
  npx vitest run src/event-editor/right-pane/ai --reporter=basic
  EXIT:1 — Test Files 2 failed | 46 passed (48); Tests 315 passed (315); Errors 1 error
HEAD:
  same command — EXIT:1 — Test Files 2 failed | 47 passed (49); Tests 324 passed (324); Errors 1 error
Fail-file sets (normalized both FAIL shapes, sorted):
  BASE: ParameterAnswerInput.test.tsx, useChatThread.deckLayout.test.tsx
  HEAD: ParameterAnswerInput.test.tsx, useChatThread.deckLayout.test.tsx
  comm -3 base head -> EMPTY (zero new fail files).
  Both are the known lane-exclude SYMLINK LOAD debt ("Failed to load url ... resolved id:
  /mnt/.../computable-lab/...") — environmental, proven identical at base.
  The single unhandled error (ClarificationPicker.tsx:215 'Cannot read properties of
  undefined (reading then)') appears in BOTH runs (grep -c "Errors  1 error" = 1/1) —
  pre-existing unhandled-exception debt, untouched.
  Raws: /tmp/l2t0810-baseline-vitest.txt, /tmp/l2t0810-head-vitest.txt

Adjacent-mount check (mounts that consume the flow / host the panel):
  npx vitest run src/agent src/shared/ai src/event-editor/right-pane/RightPane.test.tsx
  EXIT:0 — Test Files 7 passed (7); Tests 51 passed (51)
  (includes useWorkstateProposalFlow.chain.test.tsx 5 passed, AgentChatPane.test.tsx,
  RightPane.test.tsx 6 passed). Raw: /tmp/l2t0810-adjacent.txt

### (c) app tsc sorted-diff vs baseline — zero new errors
BASE: npx tsc --noEmit -> EXIT:2, 23 'error TS' lines (recorded pre-edit)
HEAD: same -> EXIT:2, 23 'error TS' lines
Sorted error-line diff (positions stripped, sorted): diff base head -> EMPTY (TSC_DIFF_EMPTY).
All 23 are pre-existing trunk/lane debt (runDeckLock EventEditorState drift,
useAiChat.surfaceContext.test.ts symlink-lag TS2739s, etc.).
Raws: /tmp/l2t0810-baseline-tsc.txt, /tmp/l2t0810-head-tsc.txt

### (d) Commit + clean status
  git -c core.fileMode=false log --oneline -2
  23e52939 fix(matres-chain): mount the §7.5 review wall on the ROUTED run surface (gate D1/D2)
  8e376c0f docs(lane2): handoff l2t0650 amendments ...   (trunk tip base)
  git show --stat: AiTabPanel.chain.test.tsx +557, AiTabPanel.tsx +74/-..., graph/RunWorkspacePage.tsx -35
  3 files changed, 626 insertions(+), 40 deletions(-)
  git -c core.fileMode=false status --porcelain -> (empty) CLEAN

## Assumptions
- AS-l2t0810-1: the gate direction's "reuse useWorkstateProposalFlow's compile
  discipline ... do NOT fork a parallel compile call site" is honored by riding the
  SAME flow instance AiTabPanel already holds (one pending identity, one supersede
  discipline) with the 'chain' adapter constant; the only addition is the mount-side
  adapter marker (flowCardAdapterRef) that picks WHICH presentational card the single
  flow card state renders — the flow body itself is untouched (its own comment: "a
  second adapter is one constant at the call site, never a second flow").
- AS-l2t0810-2: graph/RunWorkspacePage.tsx is kept (file not deleted) per the gate
  direction's caution; only its chain-specific wiring was retired. Grep re-verified
  in this worktree: no importer, no test references.
- AS-l2t0810-3: chain accept lands through the SAME executor path
  (applyAcceptedWorkstate validates the flat accept body's sessionDocument — the
  server's chain adapter emits a landing sessionDocument, ExecuteChainDraft.ts §9c);
  the executor's internals are consumed as-is, zero changes.

## Not done / for the orchestrator
- The browser gate re-run on :5193 is orchestrator-owned (post-merge); nothing here
  was exercised against the live stack (no stack touched, nothing dispatched, no push).
- Pre-existing debt reported, not fixed: the two symlink LOAD-fail test files and the
  ClarificationPicker unhandled error (all identical at base).

STATUS: complete
