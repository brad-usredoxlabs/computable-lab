# PB-CH-5 repair — analysis_proposal branch in the generic chat stack (spec)

Lane 2. Item: PB-CH-5 (residual obligation, NOT new campaign scope). Orch-authored spec
(orchestrator verified every cite below at trunk d3c73f00; no composer needed for a change
this small). Server-only emission is already correct — this is an APP-side fix. UI-visible
effect only (a card appears where a silent drop happened) -> browser evidence is an orch
gate (reuse orchgate5 send), not a full cl-browser-reviewer run, per the PB-CH-6 precedent
of orch-authored SSE gates.

## Problem (evidence: decisions/PB-CH-5-analysis-proposal-drop-finding.md, receipts/PB-CH-6/2026-10-08_orchgate5/)

Server emits `{type:'analysis_proposal', analysis}` (AgentOrchestrator.ts:2337, type in
server/src/ai/types.ts). On the /analysis mount the frame is SILENTLY DROPPED:
- app/src/types/ai.ts AiStreamEvent union (:132-146) has AiWorkstateProposalEvent and
  AiAgentActionEvent but NO analysis_proposal member (the run-page path uses the separate
  assistStream.ts union, app/src/event-editor/right-pane/ai/assistStream.ts:259,450-455 —
  that one is fine, do not touch).
- app/src/shared/hooks/useAiChat.ts handles workstate_proposal (:488) and agent_action
  (:517) only; analysis_proposal falls through the loop — the exact silent-drop defect
  class PB-CH-6 exists to close, on the channel PB-CH-5 introduced.
- app/src/analysis/AnalysisChatPanel.tsx wires onWorkstateProposal/onAgentAction
  (:45-48) but no analysis callback exists to register.

## Fix (smallest additive, mirrors the workstate_proposal branch verbatim)

1. app/src/types/ai.ts: add `AiAnalysisProposalEvent { type:'analysis_proposal';
   analysis: Record<string, unknown> }` to the AiStreamEvent union (mirror
   AiWorkstateProposalEvent's shape and comment discipline; reference assistStream.ts:259
   as the server-frame source of truth).
2. app/src/shared/hooks/useAiChat.ts: add `onAnalysisProposal?: (analysis:
   Record<string, unknown>) => void` to UseAiChatOptions (doc comment mirroring
   :167-176 — verbatim relay, compile is the trust boundary), a ref pair mirroring
   :232-233, and a branch mirroring the workstate_proposal block (:480-515) EXACTLY:
   callback -> never-break-the-turn wrapper (throwing host surfaces a system line naming
   the analysis proposal, turn continues); NO callback -> NAMED system bubble
   ("...proposed an analysis ... cannot show ... cards ... Nothing was written.") —
   never a silent drop. `continue` at the end. Do NOT fork logic: if it is cleaner to
   generalize the workstate branch over the frame kind, do it WITHIN the existing block
   shape and keep the named-bubble texts distinct per frame kind (the existing test pins
   the workstate wording).
3. app/src/analysis/AnalysisChatPanel.tsx: register
   `onAnalysisProposal: (intent) => { void flow.proposeWorkstate('analysis', intent) }`
   (useWorkstateProposalFlow.proposeWorkstate(adapter, intent) — shared/ai/
   useWorkstateProposalFlow.ts:56; same adapter-parameter discipline AiTabPanel.tsx:635-637
   already uses; 'analysis' is a valid WorkstateAdapter there).
4. NO server change. NO AiTabPanel/useChatThread/assistStream change. No new lint/YAML.

## RED test first (PB-CH-6 harness verbatim)

Extend app/src/shared/hooks/useAiChat.channelEnvelopes.test.tsx (or add
useAiChat.analysisProposal.test.tsx mirroring it exactly — same mocked streamAssist
frames() helper): 
- analysis_proposal frame fires onAnalysisProposal with the VERBATIM analysis payload;
- NO callback registered -> NAMED system bubble naming the analysis proposal, never
  swallowed;
- a throwing callback -> system line, turn continues (done frame still processed).
Plus an AnalysisChatPanel-level test (mirror AnalysisPage.chat.test.tsx conventions):
analysis_proposal frame -> flow.proposeWorkstate called with adapter 'analysis' and the
verbatim intent (mock useWorkstateProposalFlow or spy via the card rendering
data-testid='workstate-card' if simpler — prefer the spy on the flow hook).

## Verification gates (coder runs, outputs verbatim in report)

- RED evidence first: new analysis_proposal tests FAIL on trunk pre-fix (frame falls
  through: callback never fires / no bubble), for the RIGHT reason (transcript).
- GREEN: targeted app suites — the new file(s) + useAiChat.channelEnvelopes.test.tsx +
  analysisChat.health.test.tsx + AnalysisPage.chat.test.tsx all green.
  `cd <wt>/app && npx vitest run <targeted files>`.
- app tsc SET identity vs trunk baseline (47 lines/24 files at d3c73f00 — RE-MEASURE at
  step 1 before any edit and comm -3 vs your own capture; zero new).
- server/** diff EMPTY; git -c core.fileMode=false throughout.

## Boundaries

Do not touch server/, AiTabPanel.tsx, useChatThread.ts, assistStream.ts, sidebarState,
ChangesPanel. No schema/lint YAML. app/** only, files named above. Report:
<worktree>/.hermes/plans/PB-CH-5-fix-analysis-proposal-branch-report.wip-<token>.md.
End stdout with exactly `PB-CH-5-FIX CODER DONE` or
`PB-CH-5-FIX CODER BLOCKED: <portion> — evidence: <path>`.
