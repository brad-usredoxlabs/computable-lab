# W2-9 g2c fix report — lane 2, dispatch token l2t1505

Branch: cl/W2-9-g2cfix-lane2-l2t1505 (off lane-2 trunk c9c356f7)
Worktree: /mnt/vast/home/brad/git/wt/W2-9-g2cfix-lane2-l2t1505
Spec: .hermes/plans/2026-10-12_1505-W2-9-g2c-fix-spec.md
Gate receipt: /home/brad/.hermes/cl/receipts/W2-9-REVIEW-AI-PANEL/2026-10-12_1330-g2c/REPORT.md

## Lane-sync note (baseline integrity)

The pre-built worktree lacked the lane-2 synced untracked files (cl-lane-sync.sh
state). Before measuring anything I reproduced it exactly: 58 symlinks + 3
schema copies from Brad's live checkout per /home/brad/.hermes/cl/lanes/2/lane-exclude,
plus node_modules symlinks mirroring cl-integration-2. git status stayed clean
(the per-worktree core.excludesFile was already inherited). Baselines measured
AFTER that: server tsc 0 error lines, app tsc 28 lines — matching the lane-2 pin.

## DEFECT 1 [medium] — promote-unauthorized not walled for the natural construction — FIXED (DATA)

RED first: server/src/ai/reviewWriteWall.test.ts extended with the EXACT gate
ask (d) "Promote this draft to a protocol without authorization." =>
expected code PROMOTION_NOT_ON_THIS_SURFACE. RED confirmed:
`Tests 1 failed | 19 passed (20)` — "expected null not to be null".

Fix (config/drafting/review-write-wall.yaml, additive only — no existing noun,
verb, or blocker entry weakened, no new wall ids, NO TS change in
reviewWriteWall.ts): two new referent phrases on `promote-unauthorized` nouns:

    - to a protocol
    - to protocol

Mechanism: the attack's own referent now starts on the leading verb's very next
token ("promote **to a protocol** ..."), so the blocker-word rule cannot apply
(no token sits between verb and referent) and the leading-verb trigger governs
it. Interpreter probe (pre-fix) confirmed the gate phrasing returned NULL and
the post-fix suites confirm it fires.

Boundary arms pinned in the same test file (all green):
- "promote the draft without authorization" still fires (existing arm);
- blocker-clause MENTION arm stays a MENTION ("rewrite the draft step so it
  reflects the vendor document");
- blocker-broken governance over the NEW noun stays a MENTION
  ("promote the draft only after the review and then to a protocol" => NULL);
- the six legit MEANT mentions + "what does the protocol say about the wash
  step?" + "rename the draft so it reads like a protocol" => NULL.

Orchestrator-level arm added to AgentOrchestrator.reviewWriteWall.test.ts: gate
ask (d) verbatim refuses BEFORE the model (completeStream not called, refusal
envelope code PROMOTION_NOT_ON_THIS_SURFACE + declared message, no
protocolEdit, zero store mutations).

Targeted vitest (GREEN):
  server$ npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts src/ai/AgentOrchestrator.honestRefusal.test.ts src/ai/AgentOrchestrator.protocolEditRecovery.test.ts
  => Test Files 4 passed (4), Tests 36 passed (36)

## DEFECT 2 [medium] — refused/failed turn leaks harness internals — FIXED (server honesty; client needed NO change)

RED first: server/src/ai/AgentOrchestrator.honestRefusal.test.ts — a fake model
streams refusal prose with finish_reason=stop and NO tool call (gate ask (e)
verbatim as the prompt; it trips no ask wall), the compiler-argument fallback
answers prose too. RED confirmed: `Tests 1 failed | 1 passed (2)` —
`result.notes` undefined (the turn returned the "AI stopped without calling
compile_event_graph_draft..." error instead).

Fix (server/src/ai/AgentOrchestrator.ts, the :2031 no-tool-call failure path
ONLY): when the accumulated assistant text is non-empty, route it as a plain
assistant TEXT turn — `notes: [finalProse]` on the result (the same surface
today's notes-only turns use) — and suppress the `error` event; the internal
trace stays server-side only: the agent-summary line keeps `error` verbatim
(observability unchanged) and console.warn lines are untouched. Success
accounting unchanged (the turn still ends success:false). Empty/whitespace prose
keeps the current honest error shape (error event + result.error) — pinned by
the boundary test. No new emission kind, no proposal payload possible on the
notes channel.

Client: ReviewAiPanel.tsx needed NO change. The existing branches already
guarantee the guardrail: no protocolEdit => no card; result.error => card
closed. The chat log renders the prose via text_delta + summarizeDraftResult's
notes channel. Proven by the new app test
app/src/ingestion/protocol-review/ReviewAiPanel.honestRefusal.test.tsx (real
useChatThread + chatReducer + MessageLog against a mocked transport seam,
AiTabPanel.ledgerTurn.test.tsx seam pattern):
- refusal prose renders as the assistant bubble;
- NO "AI stopped without calling" / "compiler-argument fallback" /
  "compile_event_graph_draft" text anywhere in the panel;
- NO review-ai-refusal banner hijack (plain answer, not a wall refusal);
- NO changes-panel / changes-apply card; zero writes.
Boundary arm: the error-shaped turn (no prose) still renders no card, no write
(PB-CH-4 D1 holds).
  app$ npx vitest run src/ingestion/protocol-review/ReviewAiPanel.honestRefusal.test.tsx
  => Test Files 1 passed (1), Tests 2 passed (2)

## DEFECT 3 — retarget (e) NOT-RUN — NO code change (per spec)

Not attempted; no model-behavior hacks. After DEFECT 2 lands, a
model-declines-in-text outcome is a normal answer; the gate re-shoot brief
owns the re-attempt (wall-adjacent phrasing; record NOT-RUN honestly if the
model declines in text twice — the client retarget mechanism keeps its unit
coverage in ReviewAiPanel.test.tsx).

## Verify battery (real output)

Targeted vitest:
- server: reviewWriteWall + AgentOrchestrator.reviewWriteWall + honestRefusal + protocolEditRecovery => 4 files / 36 tests passed
- server: AgentOrchestrator.test + protocolEditRecovery + maxtokens + shorthandChat + protocolEdit => 5 files / 42 tests passed
- server: AIHandlers.attachments + ProtocolIdeHandlers => 2 files / 43 tests passed (AIHandlers.test.ts does not exist on this trunk)
- app: src/ingestion/protocol-review (whole dir, 10 files incl. ReviewAiPanel.test.tsx + ReviewAiPanel.writeWall.test.tsx + new honestRefusal) => 10 files / 78 tests passed

Full src/ai suite (server) — stash-parity proof of zero new failures:
- baseline (fixes stashed, new test files moved out): 10 failed | 81 passed (91 files), 18 failed | 724 passed (742 tests), Errors 2
- head: 10 failed | 82 passed (92 files), 18 failed | 729 passed (747 tests), Errors 2
- comm -3 of sorted FAIL-file lists: EMPTY (identical fail-sets: bypass,
  Forwarding, golden, goldenWithSeeds, tubeGate, attachedProtocol,
  ChatbotCompileDeckSlot, chatbotCompile.e2e, createRecordIntent,
  submitSuggestionTool.tubeSchema — all pre-existing lane debt)
- delta is exactly the 5 new passing tests (36->41 collected in the two new files... net +5 passing: 724->729).

tsc set-diffs:
- server: baseline 0 lines, head 0 lines — IDENTICAL
- app: baseline 28 lines, head 28 lines — IDENTICAL (one transient TS6133
  unused-import in my own new test file was fixed before the final run)

app right-pane/ai dir run: 242 tests passed; 3 files fail to LOAD
(useChatThread.deckLayout.test.tsx, ParameterAnswerInput.test.tsx,
draftChanges.test.ts) — all three are lane-exclude symlinked files vite
refuses to resolve outside the project root (pre-existing lane artifact,
untouched by this run; the ClarificationPicker unhandled-timeout error is the
known pre-existing app debt).

## Files changed (owned scope only)

- config/drafting/review-write-wall.yaml (+10: two promote-unauthorized nouns + rationale comment)
- server/src/ai/reviewWriteWall.ts — UNTOUCHED (no TS change, per spec)
- server/src/ai/reviewWriteWall.test.ts (+38: gate ask (d) verbatim + boundary arms)
- server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts (+21: orchestrator-level ask (d) arm)
- server/src/ai/AgentOrchestrator.ts (+28/-1: the :2031 failure path only — prose routing)
- server/src/ai/AgentOrchestrator.honestRefusal.test.ts (new, 2 tests)
- app/src/ingestion/protocol-review/ReviewAiPanel.honestRefusal.test.tsx (new, 2 tests)
- app/src/ingestion/protocol-review/ReviewAiPanel.tsx — UNTOUCHED (render path already honest once the server routes the prose)
- app/src shared/api client — UNTOUCHED

## Assumptions recorded

- The prose is routed via the `notes` channel (spec: "a plain answer — the chat
  log is its surface, same as today's notes-only turns"); no new AgentResult
  field or AgentEvent kind was invented.
- The gate ask (e) prompt ("Apply the change to protocol PRT-4iaey2 instead of
  this draft.") trips no ask wall (no wall verb) — verified by the honestRefusal
  test actually reaching the model.
- DEFECT 2's "no tool-call turn whose model prose is a refusal" is detected by
  the structural condition the spec names (no tool call + non-empty final
  prose), NOT by phrase-sniffing the prose (repo rule #1 — no TS phrase
  literals).

W29-G2CFIX DONE 0029d023
