# RULING — L2-CHAT-UI-1 OQ-2 (leg-D claim gate) — chain cards + protocol-edit review after AiTabPanel dies

Architect ruling, 2026-10-30, for lane-2 orch (request l2t0135). Trunk verified at d1f1e0df
(leg B merged a99a5e3a; leg C running). All cites below re-read first-hand at this tip.

RULING: (a) — a dedicated chain PORT leg (named LEG D0) must merge BEFORE leg D's deletion.
Protocol-edit review needs NO port leg: its live home already exists (evidence §2). Leg D
still carries the deletion note in §3 recording what AiTabPanel-side rendering dies with it.

## 1. Why the chain card cannot be signed off as "separate future item"

- ChainProposalCard mounts ONLY inside AiTabPanel (AiTabPanel.tsx:50 import, :1491 JSX — the
  only non-test mount; graph/RunWorkspacePage.tsx:68 is a comment on a dead-routed page).
- The universal pane has NO chain branch: HarnessChatPane.tsx:170-175 renders
  WorkstateProposalCard from proposalFlow.card, unconditionally — no adapter switch.
- useSurfaceChat wires workstate/analysis/record-draft + agent_action
  (agent/useSurfaceChat.ts:39-43) but NOT onChainProposal, while useAiChat declares
  (useAiChat.ts:538) and relays (useAiChat.ts:715-716, :1279-1281) the chain_proposal frame.
  So after leg D the frame fires into nothing: a silent behavior drop.
- Leg D's own gate forbids exactly this (spec:78 "leg D MUST NOT merge while any task-named
  behavior has no live home") and the ratification (spec §11, OQ-2 RULED deferral bound).
- Chain is a ratified, gated behavior family (MATRES-CHAIN OQ-3(a), gate D1/D2 receipts
  2026-10-24_115822, cited at AiTabPanel.tsx:925-933). Deleting its only mount without a
  port would undo work the campaign deliberately landed. (b) is therefore not available
  on the honest reading of "live home."

## 2. Why protocol-edit review does NOT need a port leg

- The campaign review surface is the EXISTING ChangesPanel diff (D1) — and ChangesPanel
  protocol mode ALREADY has a routed, non-AiTabPanel home: ReviewAiPanel.tsx:35 imports
  ChangesPanel + protocolEditDiffFrom, builds the diff (:226-242), renders
  protocolDiff (:316-319), and is mounted routed via ProtocolReviewHostPage.tsx:32,:84.
- Leg D's own rule protects it: surviving shared components are NOT collateral-deleted
  (spec §4 leg D: ChangesPanel named in the CSS-survival list; ReviewAiPanel is the ONLY
  non-AiTabPanel engine-agnostic precedent). ChangesPanel.tsx/.css and protocolEditOps.ts
  survive byte-identical.
- What DOES die with AiTabPanel: its OWN ChangesPanel protocolDiff arm
  (AiTabPanel.tsx:1550-1553 + the protocolEdit done-arm :469-511). That arm only rendered
  on RightPane fallback surfaces (chat-less hosts), which spec §4 leg C verified "have none
  today" — a legacy-engine path with no registrar/attach flow. Dropping it drops no live
  routed behavior. Protocol-edit review stays on its bespoke surface, which also honors
  Brad's standard: the review surface is protocol-review's, not a bolt-on to every pane.
- No port = no duplicate review machinery; the ReviewAiPanel render is the single home
  (one term, one surface).

## 3. LEG D0 — chain-card port onto the universal pane (ONE leg, not two)

Gate: D0 branches off trunk AFTER all leg C sub-legs merge, merges green + browser-gated
BEFORE leg D may claim. (Chain and protocol-edit were considered as two legs; rejected —
only chain needs code, so a second leg would be an empty wrapper.)

Minimum scope (reuse-first; the machinery ALREADY exists — zero new flow):
1. app/src/agent/useSurfaceChat.ts — add
   `onChainProposal: (intent) => void flow.proposeWorkstate('chain', intent)`
   (one constant on an existing adapter union, useWorkstateProposalFlow.ts:44; the
   'chain' adapter is declared data at config/drafting/adapters.yaml per :34-35 — reuse,
   not new hardcoding; copies the record-drafting line :41 verbatim in shape; precedent
   AiTabPanel.tsx:931-933).
2. app/src/shared/ai/useWorkstateProposalFlow.ts — put the
   pending card's ADAPTER into card state (add `adapter: WorkstateAdapter` to
   WorkstateProposalCardState, set at :103-150 where `adapter` is already in hand).
   Today the adapter truth lives in AiTabPanel's private flowCardAdapterRef (:851,:898) —
   the pane cannot branch without it; moving it into the shared flow REMOVES a private
   ref rather than adding machinery. chainCard already rides flow.card (:64,:133-150).
3. app/src/agent/HarnessChatPane.tsx — branch on the card's adapter exactly as
   AiTabPanel.tsx:1490-1506 does: 'chain' -> <ChainProposalCard phase card summary
   diagnostics draftId revision onAccept={flow.acceptWorkstate} onReject=
   {flow.rejectWorkstate} /> with the same conditional-spread key-absent discipline;
   else the existing WorkstateProposalCard render (:170-175). One switch on the ADAPTER
   constant — no surface-name branching anywhere (ChatLog/pane stay surface-agnostic).
4. Tests (new vitest in the same commit, RED first): a 'chain' proposeWorkstate on the
   flow renders ChainProposalCard via HarnessChatPane (testid), accept/reject drive the
   flow; a non-chain card still renders WorkstateProposalCard unchanged.
Owned files (disjoint from leg C/D): agent/useSurfaceChat.ts,
shared/ai/useWorkstateProposalFlow.ts, agent/HarnessChatPane.tsx,
agent/HarnessChatPane.css (only if the wall needs a class), + the two test files.
NOT owned / untouched: ChainProposalCard.tsx (byte-identical; it SURVIVES AiTabPanel
because HarnessChatPane now imports it), AiTabPanel.tsx, RightPane.tsx, ChangesPanel*,
useAiChat.ts, server, YAML (zero YAML edits).
Verify: cd app && npx vitest run src/agent src/shared/ai && re-measured tsc count no worse
than leg C's merged baseline. Browser gate (:5193, tier-1): on the deck (endpoint
'event-editor', DeckSurfaceChat.tsx:165 — the surface the chain behavior was gated on),
drive a chain intent via the e2e stub builders (deck-ghost-shorthand precedent) -> the
ChainProposalCard wall renders in HarnessChatPane with server-built card strings verbatim,
reject leaves no leak; receipt under receipts/L2-CHAT-UI-1/leg-D0-<tag>/.

## 4. Deletion note leg D must carry (verbatim, in the leg-D report AND the deletion commit
message body), recording the AiTabPanel-side protocol-edit rendering that dies with the file:

  DELETION NOTE (OQ-2 ruling CHATUI1-legD-OQ2-chain-port-ruling-l2t0135): deleting
  AiTabPanel removes its private ChangesPanel protocolDiff arm (AiTabPanel.tsx:469-511,
  :1550-1553), which only rendered on the legacy chat-less RightPane fallback and served
  no routed behavior (leg C verified C1-C4 "have none today"). Protocol-edit review is
  NOT dropped: its live home is the routed ReviewAiPanel protocol mode
  (ReviewAiPanel.tsx:35/:226-242/:316-319 via ProtocolReviewHostPage.tsx:84) on the
  existing ChangesPanel diff (campaign decision D1); ChangesPanel.tsx/.css and
  protocolEditOps.ts survive byte-identical as ReviewAiPanel's dependencies. Chain-card
  behavior is NOT dropped either: it moved to the universal pane in LEG D0
  (useSurfaceChat onChainProposal + HarnessChatPane adapter branch), which merged before
  this deletion.

## 5. Sequencing (binding for orch)

claim order: leg C sub-legs merge -> LEG D0 (above) merges green incl. browser gate ->
leg D re-branches off the post-D0 tip and claims, carrying §4's note. A universal
protocol-edit chat card (every pane) remains a SEPARATE future item; if Brad wants it,
it is a new campaign task, not a leg of this item.

END-RULING
