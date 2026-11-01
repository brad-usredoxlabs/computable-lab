# FAME-3 OQ-4 decision request — chat intent channel for an EDIT proposal (peak assignment)

Requested by: lane-1 orchestrator tick 20261101T0240 (-0500).
Answer path (watched): the sibling file
`2026-11-01_fame-3-oq4-intent-channel-decision.md` (write your decision THERE; unique,
atomic write). Item: FAME-3 spec `.hermes/plans/2026-11-01_fame-3-spec.md` §10 W6, §17 OQ-4.
Trunk at decision time: fa5628e4 (docs) atop 903c2016.

## Question (one, bounded)
For the chat leg "The peak at 15.673 minutes is palmitate" -> peak-assignment PROPOSAL card ->
human accept writes ONE assignment entry onto the target gc-method record: which intent channel?

Option A — extend `compose_record_draft` with an `operation: "edit-record"` variant (the
recordDraft adapter family grows an edit mode: target record id + patch-shaped payload, compile
resolves+validates, accept applies one governed PUT).
Option B — a NEW draft adapter (`peak_assignment_draft`-style) registered in
server/src/drafts/adapters.ts:35 with its own compile/accept pair, plus a new intent term in
server/src/ai/submitSuggestionTool.ts:455ff.

Second sub-ruling either way: does the `analysis` surface gain a review-write-wall entry
(config/review-write-wall.yaml:72 currently lists only [protocol-review]), or does the proposal
card surface through the existing workstate/proposal flow without a wall row?

## First-hand evidence (orchestrator-verified @ fa5628e4 / live :3092)
- draftRoutes.ts:6-16: POST /drafts/{compile,accept} -> FormDraftService, actor-resolved;
  StagingStore.ts:21 — only accept touches the real store; FormDraftService.ts:56-60.
- adapters.ts:35 `draftAdapters` registry; the recordDraft adapter derives NEW record ids from
  id.pattern (adapters.ts:94-102) — composed records are NEW only; no edit path exists today.
- protocol_edit ops apply to attached protocols via the event-editor review panel
  (useWorkstateProposalFlow.ts:1-15,:171-183), not to arbitrary records.
- Server emits `record_draft_proposal` (AgentOrchestrator.ts:3259-3335); unhandled frames get a
  named bubble (useAiChat.recordDraftProposal.test.tsx:83); the EVENT-EDITOR mounts the callback
  (AiTabPanel.tsx:884), the ANALYSIS mount does not (AnalysisChatPanel.tsx:33-56 wires only
  workstate + analysis-intent).
- The resolve spine already answers unknown nouns with a mint-only tier-5 candidate and NO invented
  CURIE (live: POST /api/resolve {"term":"palmitate"} -> single mint candidate; FAME-LOCAL:palmitate
  lookup 404). Never-guess doctrine: AgentOrchestrator.ts:565.
- Write discipline the accept leg must honor: assignment_state arrives IN the approved envelope
  (default provisional); "NO state/status field is ever written" by the loop (adapters.ts comment);
  gc-method is mutable-head (appendOnlyKinds = audit-event, signature only) under lifecycleId
  registry-ops; PUT /api/records/:id is the door; edit-discipline/signature surface per the
  revision contract (81454a4e).
- review-write-wall.yaml:72 lists surfaces [protocol-review] only.

## Constraints
- Propose-never-write is non-negotiable; human accept only (Brad's AI-loop rulings + protocol-edit
  precedent). No new ontology vocabulary; no compound literals in code.
- Bounded diff: FAME-3 is one lane item; the smallest channel that reuses the existing
  compile->card->accept wall is preferred UNLESS A/B materially diverge in trust-surface risk.
- The manual-editor leg (W2-W4) ships regardless; your answer gates ONLY W6.

## Context you may not have in memory
FAME-1 coder (acquisitionStatus run-sheet stamping) and FAME-2 coder (real peak_table revision)
are LIVE in coder slots; FAME-4 deps FAME-2+FAME-3. If you need scope beyond A/B (e.g. a generic
record-edit draft contract), say so as a named amendment — do not silently widen FAME-3.
