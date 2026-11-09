# SPEC — L2-CHAT-UI-1 LEG D0: chain-card port onto the universal pane (HarnessChatPane)

Status: AUTHORED by orch l2t0235 from architect ruling
decisions/CHATUI1-legD-OQ2-chain-port-ruling-l2t0135.md (RULING (a); §3 is binding scope,
quoted structurally below — the ruling already carries scope/anchors/verify, no architect
re-ask). RATIFIED by orch first-hand: ruling cites re-checked at trunk d1f1e0df (l2t0135
amendment), ruling committed 1303881a.

## Claim gate (binding, ruling §5)
- Branch off trunk AFTER all LEG C sub-legs merge (LEG C merges -> D0 -> D -> E).
- D0 must merge green + browser-gated BEFORE leg D may claim.
- Coder dispatch obeys fleet rules: free appliance-2 slot + 60-min start stagger.

## Goal
After leg D deletes AiTabPanel, the chain_proposal frame must still render
ChainProposalCard on the universal pane. Today ChainProposalCard's only non-test mount is
AiTabPanel.tsx:50/:1491; HarnessChatPane.tsx:170-175 renders WorkstateProposalCard
unconditionally; useSurfaceChat.ts:39-43 wires workstate/analysis/record-draft +
agent_action but NOT onChainProposal (which useAiChat relays at :715-716, :1279-1281).
Post-D the frame would fire into nothing — a silent drop of a ratified behavior family
(MATRES-CHAIN OQ-3(a)).

## Scope (reuse-first; ONE leg; zero YAML)
1. app/src/agent/useSurfaceChat.ts — add
   `onChainProposal: (intent) => void flow.proposeWorkstate('chain', intent)`
   (adapter union constant useWorkstateProposalFlow.ts:44; 'chain' adapter declared data
   at config/drafting/adapters.yaml; shape copies the record-drafting line :41; precedent
   AiTabPanel.tsx:931-933).
2. app/src/shared/ai/useWorkstateProposalFlow.ts — put the pending card's ADAPTER into
   card state: add `adapter: WorkstateAdapter` to WorkstateProposalCardState, set at
   :103-150 where `adapter` is already in hand. Removes the need for AiTabPanel's private
   flowCardAdapterRef (:851,:898) on the universal path. chainCard already rides
   flow.card (:64,:133-150).
3. app/src/agent/HarnessChatPane.tsx — branch on the card's adapter exactly as
   AiTabPanel.tsx:1490-1506 does: 'chain' -> <ChainProposalCard phase card summary
   diagnostics draftId revision onAccept={flow.acceptWorkstate}
   onReject={flow.rejectWorkstate} /> with the same conditional-spread key-absent
   discipline; else the existing WorkstateProposalCard render (:170-175). Switch on the
   ADAPTER constant only — no surface-name branching (ChatLog/pane stay surface-agnostic).
4. Tests (new vitest, RED first, same commit): a 'chain' proposeWorkstate on the flow
   renders ChainProposalCard via HarnessChatPane (testid); accept/reject drive the flow;
   a non-chain card still renders WorkstateProposalCard unchanged.

## Owned files (disjoint from leg C/D)
agent/useSurfaceChat.ts, shared/ai/useWorkstateProposalFlow.ts, agent/HarnessChatPane.tsx,
agent/HarnessChatPane.css (only if the wall needs a class), + the two test files.
NOT owned / untouched: ChainProposalCard.tsx (byte-identical — it SURVIVES AiTabPanel
because HarnessChatPane now imports it), AiTabPanel.tsx, RightPane.tsx, ChangesPanel*,
useAiChat.ts, server, ALL YAML (zero YAML edits).

## Verified by
- cd app && npx vitest run src/agent src/shared/ai green; re-measured app tsc count no
  worse than the post-LEG-C merged baseline.
- RED-first evidence in report (test fails at base, passes at head).
- BROWSER GATE (:5193, tier-1 cl-browser-reviewer): on the DECK surface (endpoint
  'event-editor', DeckSurfaceChat.tsx:165 — the surface the chain behavior was gated on),
  drive a chain intent via the e2e stub builders (deck-ghost-shorthand precedent) -> the
  ChainProposalCard wall renders in HarnessChatPane with server-built card strings
  verbatim; reject leaves no leak. Receipts:
  /home/brad/.hermes/cl/receipts/L2-CHAT-UI-1/leg-D0-<tag>/ (trail.json + screenshots +
  VERDICT).
- adversarial review (cloud OpenRouter deepseek-v4.1-flash) ACCEPT before merge.

## Deliverable (unique path)
/home/brad/.hermes/cl/lanes/2/deliverables/L2-CHAT-UI-1-report.legD0-l2t<tick>.md —
per-work-item diffs with file:line, RED evidence, test/tsc RAW baseline-vs-head counts,
deviations, honest limitations. End 'STATUS: complete' then exactly:
`L2CHATUI1-LEGD0 DONE <full 40-char sha>`.
Commit EARLY and OFTEN (engine-pressure survival).

## Out of scope (ruling §2/§5)
- Protocol-edit review port: NOT needed — routed ReviewAiPanel protocol mode
  (ReviewAiPanel.tsx:35/:226-242/:316-319 via ProtocolReviewHostPage.tsx:84) is its live
  home. A universal protocol-edit chat card is a SEPARATE future item (Brad decision
  required; new campaign task).
- Leg D itself (AiTabPanel deletion): re-branches off the post-D0 tip, must carry the
  verbatim §4 deletion note from the ruling in report AND deletion commit body.
