# QMS7-7 RESUME REPORT — l1t1830 (cl-coder, resume run)

Worktree: /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500 · branch wt/QMS7-7-lane1-l1t1500 · base c5d76fed (no rebase, no new worktree).
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_QMS7-7-ai-training-draft-spec.md (read once; rulings OQ-1 A / OQ-2 / OQ-3 honored, not relitigated).

## Commits this run (new only; preserved 3f05b714 / f2a850b5 / 1596f87e untouched, never amended)

- ec8ec3f8 feat(qms7-7): GREEN the server relay chain (submitSuggestionTool intent+envelope, types.ts stream event, AgentOrchestrator relay arm; golden enum pins widened to ten intents)
- b0876041 feat(qms7-7): GREEN the app relay chain (assistStream union+case, useChatThread case, useAiChat branch, AiTabPanel wiring, WorkstateAdapter union +1, card recordFields block, client.ts transport widening)
- <report commit> docs(qms7-7): this report

Final code sha40: b08760411e5d3566fffd2306b72216dc596872f0

## Inherited uncommitted diff (+51/-6) — adopt/discard decision per hunk

Read first-hand via `git -c core.fileMode=false diff` (saved to /tmp/qms77-uncommitted.patch before any action).

1. server/src/ai/submitSuggestionTool.ts (+38/-4) — **ADOPTED in full**. Every hunk is pinned by the preserved RED suite (1596f87e): intent enum +compose_record_draft, description sentence stating the compile/review-card/one-draft contract, `recordDraft` envelope property (operation enum ['compose-record'], kind, fields), AgentIntentArgs union + `recordDraft?: Record<string, unknown>`, parse branch retaining the envelope **by reference** (RED test asserts `parsed.recordDraft).toBe(RECORD_DRAFT)` — no copy/repair). Verified hunk-by-hunk against the RED assertions before adopting.
2. server/src/ai/types.ts (+12) — **ADOPTED**. `record_draft_proposal` union member beside analysis_proposal with the trust-boundary comment (bait-2 compliance: the stream is NOT the trust boundary; POST /api/drafts/compile is).
3. app/src/shared/ai/useWorkstateProposalFlow.ts (+7/-2) — **ADOPTED**: the diff is EXACTLY the WorkstateAdapter union line + comment. Flow body untouched. (My later recordFields card-state mirror is NOT part of this inherited diff — see Assumptions A2 for its justification.)
4. Nothing was discarded. The three files were re-applied from the saved patch (server hunks via `git apply --include='server/*'`; the flow union re-applied identically), so the adopted content is byte-identical to what was inherited.

## BAR 1 — RED evidence at HEAD 1596f87e (before any GREEN commit; inherited diff first reverted with `git checkout --`)

Server (`cd server && npx vitest run src/ai/AgentOrchestrator.recordDraftProposal.test.ts`, transcript /tmp/qms77-red3-server.txt):

     Test Files  1 failed (1)
          Tests  6 failed | 1 passed (7)

App (`cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts src/shared/hooks/useAiChat.recordDraftProposal.test.tsx`, transcript /tmp/qms77-red3-app.txt):

     Test Files  4 failed (4)
          Tests  13 failed | 4 passed (17)

(Counts match the 1596f87e commit message: server 6 fails, app 13 fails.)

## BAR 2 — GREEN (touched families, verbatim)

Server relay suite: `npx vitest run src/ai/AgentOrchestrator.recordDraftProposal.test.ts`

     Test Files  1 passed (1)
          Tests  7 passed (7)

Server touched families (drafts adapter lifecycle + relay + all menu pins): `npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.analysis.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts src/ai/submitSuggestionTool.workstate.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts`

     Test Files  12 passed (12)
          Tests  134 passed (134)

`cd server && npx vitest run src/drafts` (AC-1..AC-6 adapter lifecycle suite from f2a850b5, re-run at final HEAD):

     Test Files  6 passed (6)
          Tests  76 passed (76)

App touched families: `cd app && npx vitest run src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts src/shared/hooks/useAiChat.recordDraftProposal.test.tsx src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx src/shared/ai/useWorkstateProposalFlow.test.tsx src/types/aiStreamTypes.pin.test.ts`

     Test Files  6 passed (6)
          Tests  39 passed (39)

App broader touched families (`src/event-editor/right-pane/ai src/shared/ai src/shared/hooks src/types`):

     Test Files  5 failed | 52 passed (57)
          Tests  355 passed (355)

The 5 FAIL files are suite-LOAD failures (vitest resolves them outside the worktree — "Failed to load url ... /mnt/vast/home/brad/git/computable-lab/app/...") and are pre-existing at base (see BAR 4 comm). Zero test failures: 355/355 passed.

Zero live model calls: every test stubs at the seam the spec names (vitest mocks of apiClient / injected InferenceClient / staging stores — the WorkstateDraftAdapter.test.ts pattern). Production code never stubs. No lane stack (:3092/:5192) was contacted or restarted.

## BAR 3 — typecheck, base measured FIRST at c5d76fed, zero NEW errors

Server: `git checkout c5d76fed -- server/` → `npm run typecheck -w server` → **0 errors**; restored; at HEAD → **exit 0** (`tsc --noEmit`, clean).

App: `git checkout c5d76fed -- app/` → `npm run typecheck -w app` → **34 errors** (raws /tmp/qms77-app-tsc-c5d.txt); at HEAD → **23 errors** (/tmp/qms77-app-tsc-after2.txt). `comm -13 base..after` on sorted error lists: **EMPTY — zero new errors** (20 errors REMOVED: the RED-test type errors this run resolves). The 23 remaining are pre-existing trunk debt in files this run did not touch (runDeckLock/EventEditorState cluster, useSurfaceContext, useAiChat.surfaceContext.test.ts, systemPromptForViewer.ts:46, useChatThread.deckLayout.test.tsx, etc.).

## BAR 4 — vitest zero-new proof (stash-base parity + comm of FAIL-file lists)

Server `src/drafts src/ai` (95 files): base (1596f87e, my edits stashed) = 11 FAIL files / 24 failed tests; HEAD = 10 FAIL files / 18 failed tests. `comm -3` of sorted FAIL-file lists shows ONLY `src/ai/AgentOrchestrator.recordDraftProposal.test.ts` flipping base→green. The 10 remaining FAIL files (AgentOrchestrator.bypass/golden/goldenWithSeeds/tubeGate/Forwarding, attachedProtocol, ChatbotCompileDeckSlot, chatbotCompile.e2e, createRecordIntent, submitSuggestionTool.tubeSchema) are pre-existing trunk drift, present identically at base. (createRecordIntent.test.ts pins a stale 3-intent menu and already fails at base — untouched.)
Note: the 5 golden enum-pin files (submitSuggestionTool{,.analysis,.protocolEdit,.workstate}, shorthandChat) failed transiently mid-run when the menu widened; they are DELIBERATE golden diffs (same precedent as PB-CH-8's eighth intent) and were repaired in the same commit — final FAIL lists contain none of them.

App `src/event-editor/right-pane/ai src/shared/ai src/shared/hooks src/types` (57 files): base = 10 FAIL files / 16 failed tests; HEAD = 5 FAIL files / 0 failed tests. `comm -3` shows exactly the 5 QMS7-7 RED files flipped to green; the 5 remaining are the pre-existing suite-load fails listed above.

Full-suite note (per brief): ZymoCampaignNegatives.test.ts fails at suite level on this base (lane-excluded schema YAML) — pre-existing, not mine; it is outside the touched families above.

## BAR 5 — fork detector + bait greps (verbatim)

`grep -rln compileWorkstateDraft app/src | grep -v test` →

    app/src/shared/api/client.ts
    app/src/shared/ai/useWorkstateProposalFlow.ts

Exactly the two allowed files (flow + transport). No second flow hook, no second pending-ref, no new card component, no orchestrator→FormDraftService call (the relay test's mutation tripwire store proves zero writes; the arm emits the envelope verbatim and returns).

`grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai --include='*.ts' --include='*.tsx' | grep -v "\.test\."` → **0 hits** (all hits are test fixtures/comments — bait-1 clean). No kind→schema map, no prefix table: id derived from the fetched schema's `properties.id.pattern`; card labels from the ui-v1 projection; materialType vocabulary from the schema enum.

`grep -E "^  [a-z-]+:" config/drafting/adapters.yaml` → sequence-authoring, workstate, analysis, record-drafting — **exactly ONE new block** (AS-ORCH-L1-132 pin).

State-literal leak (bait-7): pinned by the preserved AC-4 test (RecordDraftAdapter.test.ts:226-235): `payload.state` undefined, no `status`, lifecycleId equals the schema const read from the schema, lifecycle read fallback yields 'draft'. AC-5 test (:269-273) proves a smuggled `state:'approved'`/wrong lifecycleId is Ajv-rejected at staging → blocked card, zero writes.

Silent retarget (bait-3): flow test pins the server 409 "Draft target changed. Start a new draft." surfacing as a blocked card with no accept path; supersede rides the existing compileSeqRef/pendingDraftRef path (zero new state).

exactOptionalPropertyTypes (bait-5): recordFields spread conditionally at both sites (`...(recordFields ? { recordFields } : {})` in the flow setCard, `{...(flow.card.recordFields ? { recordFields: flow.card.recordFields } : {})}` in AiTabPanel) — house style copied from :106-121.

## Assumptions

A1. **Ownership-table deltas forced by the preserved RED suite (flagged for orchestrator).** The resume brief assigns finishing 1596f87e to GREEN; those preserved tests pin seams the spec's ownership table under-listed:
   - app/src/event-editor/right-pane/ai/assistStream.ts — pinned by assistStream.recordDraft.test.ts (union member + `case 'record_draft_proposal'` source-pin). The analysis precedent (PB-CH-5) lives in the same file.
   - app/src/event-editor/right-pane/ai/useChatThread.ts — pinned by AiTabPanel.recordDraft.test.tsx (the panel's chat hook; `onAnalysisProposal` — the pattern being copied — lives HERE, not only in useAiChat.ts).
   - app/src/shared/api/client.ts — typecheck-forced: the transport's `adapter: 'workstate' | 'analysis'` literal must accept the new constant (the spec's own fork-detector text names client.ts as the transport half of the seam). 2-line type widening (adapter union + `recordFields?: unknown` on the adapter-blind result), zero behavior change.
   - app/src/event-editor/right-pane/ai/WorkstateProposalCard.css — the card component's own imported stylesheet (the recordFields block needs the theme-token styles; same light+dark convention).
   None is a schema/, RecordRegistryPage, or other-surface file; all are inside the AI/drafts/proposal surface the BRANCH ANCHOR RULING assigns to QMS7-7.
A2. **useWorkstateProposalFlow.ts beyond the union line:** the flow gained the `recordFields` optional on `WorkstateProposalCardState` + one conditional spread in the compile setCard. Justification: the file's documented role is "Mirrors WorkstateProposalCard's props", and the preserved RED test (useWorkstateProposalFlow.test.tsx, "the compiled recordFields ride into the card state") pins exactly this. proposeWorkstate/acceptWorkstate/rejectWorkstate logic, refs, and identity handling are byte-untouched (verifiable in the b0876041 diff).
A3. **systemPromptForViewer.ts: NO change, measured not skipped.** First-hand: `systemPromptKindForTab` maps tab.kind 'registry' → null → NO_VIEWER (systemPromptForViewer.ts:42, :179-180). The agent_intent menu is not gated per intent by surface (buildAgentIntentToolDef only renders surface ids into descriptions; toolFilter filters tool NAMES, not intents; the compose_analysis arm has no surface check). compose_record_draft is therefore already available on the prompt surface the registry tabs resolve to — same as compose_analysis on /analysis. No availability extension was needed; widening others would violate the spec's "do not widen other surfaces' availability".
A4. Test-harness repairs in the inherited RED files (assertions unchanged, only fixtures/pattern anchors): the QMS7-7 flow describe got its own COMPILED_RECORD beforeEach fixture (the file-global beforeEach mocks the workstate DRAFT-11 fixture); the AiTabPanel source-pin anchors `<WorkstateProposalCard\n` on the JSX open tag (a prose comment mention is not a render site — the count was 2 at base for that reason); the useAiChat harness rides the existing 'analysis' AiSurface ('registry' is not in the generic-stack AiSurface union; the /registry mount rides useChatThread, pinned in AiTabPanel.recordDraft.test.tsx).
A5. Orchestrator arm written this run (not inherited): shape-copied from the compose_analysis arm — verbatim emit of ONE record_draft_proposal event + tool_result success:true + notes "Proposed a record draft — review the card; nothing was written."; no-envelope case uses the existing error channel (success:false, corrective error naming `recordDraft`, NO event); invalid envelopes still emit verbatim (compile endpoint owns the diagnostic — bait-8).
A6. YAML-reload trap: adapters.yaml changed (sanctioned block), so the browser gate must run after a lane-stack restart — orchestrator's job at merge; this coder run verified via worktree-local vitest only, never the lane stack.

## diff --stat c5d76fed..HEAD (git -c core.fileMode=false)

     .../right-pane/ai/AiTabPanel.recordDraft.test.tsx  | 353 +++++++++++++++++++++
     app/src/event-editor/right-pane/ai/AiTabPanel.tsx  |   6 +
     .../right-pane/ai/WorkstateProposalCard.css        |  19 ++
     .../ai/WorkstateProposalCard.recordFields.test.tsx |  96 ++++++
     .../right-pane/ai/WorkstateProposalCard.tsx        |  30 ++
     .../right-pane/ai/assistStream.recordDraft.test.ts |  93 ++++++
     app/src/event-editor/right-pane/ai/assistStream.ts |  20 +-
     .../event-editor/right-pane/ai/useChatThread.ts    |  24 +-
     .../shared/ai/useWorkstateProposalFlow.test.tsx    | 130 ++++++++
     app/src/shared/ai/useWorkstateProposalFlow.ts      |  17 +-
     app/src/shared/api/client.ts                       |  13 +-
     .../hooks/useAiChat.recordDraftProposal.test.tsx   | 124 ++++++++
     app/src/shared/hooks/useAiChat.ts                  |  51 ++-
     app/src/types/ai.ts                                |  18 ++
     config/drafting/adapters.yaml                      |  14 +
     .../AgentOrchestrator.recordDraftProposal.test.ts  | 198 ++++++++++++
     .../src/ai/AgentOrchestrator.shorthandChat.test.ts |   2 +
     server/src/ai/AgentOrchestrator.ts                 |  80 +++++
     .../src/ai/submitSuggestionTool.analysis.test.ts   |   4 +
     .../ai/submitSuggestionTool.protocolEdit.test.ts   |   2 +
     server/src/ai/submitSuggestionTool.test.ts         |   4 +-
     server/src/ai/submitSuggestionTool.ts              |  38 ++-
     .../src/ai/submitSuggestionTool.workstate.test.ts  |   2 +
     server/src/ai/types.ts                             |  12 +
     server/src/drafts/RecordDraftAdapter.test.ts       | 337 ++++++++++++++++++++
     server/src/drafts/adapters.ts                      |  27 ++
     server/src/drafts/recordDraftCompile.ts            | 348 ++++++++++++++++++++
     27 files changed, 2049 insertions(+), 13 deletions(-)

(schema/** untouched; RecordRegistryPage.tsx untouched; FormDraftService.ts untouched — the generic pipeline rode it with zero hunks.)

## Unresolved / for the orchestrator

- AC-7 (cl-browser-reviewer VERDICT) is the orchestrator's gate, not the coder's: preflight `curl :5192/api/health | jq .components.ai.available`, lane-stack restart REQUIRED before the gate (adapters.yaml changed — YAML-reload trap), then the scripted /registry lap per the spec's gate flow.
- Ownership-table deltas A1 (assistStream.ts, useChatThread.ts, client.ts, card CSS) are flagged for orchestrator sign-off; each is forced by a preserved RED test or the typecheck, with evidence above.
- OQ-2 residue (stated per ruling): accept writes via ctx.store.create with stage()-embedded provenance (createdAt/updatedAt/createdBy) — field-identical to a POST /records create; the handler's LIFECYCLE/ARCHIVE guard legs do not run on this path (training-material creates carry no covered refs, so the guards would no-op).

QMS7-7 RESUME DONE b08760411e5d3566fffd2306b72216dc596872f0
