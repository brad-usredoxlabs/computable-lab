# PROTO-AI-9 UI acceptance gate — VERBATIM wash flow + D2 rail refresh — LANE 2

VERDICT: accept

Served candidate: a89719df (cl/integration-2 HEAD, post wellsfix merge l2t1815)
Base URL: http://localhost:5193 (API same-origin via :3093 proxy). Receipts: this directory
(root trail.json consolidates flows.flowAC / flowA2C2 / flowC3 / flowB; decision shots at root shots/).

## Pre-flight (before reviewing)
1. GET /api/records/PRT-4iaey2 (BEFORE): contentSha 2dc60f715e57a972e0a46d002ddd93d78e54c67b,
   steps 16, labwareRoles 5, instrumentRoles 3 — matches the stated baseline exactly.
2. Served module: curl :5193/src/event-editor/right-pane/ai/AiTabPanel.tsx | grep -c cl:records-changed -> 1.
3. git log --oneline -1 cl/integration-2 -> a89719df "Merge PROTO-AI-9 wellsfix (l2t1815)". Confirmed.
Lane stack listeners :5193/:3093 up; never touched :5174/:3001.

## Acceptance criteria — results

C1. DIFF SHOWS EXACTLY THOSE OPS — PASS (retry attempt 2)
  Attempt 1 (flowAC): UI turn sj7h74 emitted ops=1 (backend log) — the model flaked and dropped
  the delete; panel showed only "+step ... Wash the lysate ... after step-3". Per gate notes the
  flake was retried, not counted against the candidate.
  Attempt 2 (flowA2C2, turn avlevo, ops=2): diff rendered exactly two rows:
    "+step (new step) — now: Wash the lysate — kind wash | after step-3"
    "-step step-6 — was: Centrifuge the lysate at maximum speed for 5 minutes ... "
  Header: REVIEW CHANGES, target PRT-4iaey2.
  Shots: shots/03-verbatim-diff-two-rows.png, shots/04-verbatim-diff-two-rows-full.png
  (flake attempt: shots/02-flake-attempt-single-row-diff.png)

C2. PROPOSE-NEVER-WRITE — PASS
  flowAC: shaBefore 2dc60f71 == shaAfterProposal 2dc60f71.
  flowA2C2: shaBefore2 7c13b655 == shaAfterRetryProposal 7c13b655.
  flowC3: shaBeforeC3 5e109a0f == shaAfterC3Proposal 5e109a0f. Zero record PUTs on any proposal turn.

C3. ACCEPT -> RAIL RENUMBERS, SHA ADVANCES EXACTLY ONCE, INPUT READY, NO 422 — PASS
  Verbatim-flow accept chain: 2dc60f71 -> 7c13b655 (attempt 1, insert-only due to flake) ->
  5e109a0f (retry, insert+delete). Backend ledger: exactly 3 record PUTs across the entire gate,
  one per successful Accept; ZERO statusCode-422 responses (the prior gate's defect class is gone).
  Retry-accept result: 17 steps, wash kind at ordinal 4 (after step-3), 'Centrifuge the lysate'
  step-6 DELETED, ordinals contiguous 1..17 (trail shaAfterRetryAccept).
  .changes-panel__apply-error probed ~0.4s and ~3s after each successful Accept: NULL both times.
  After accept: panel unmounted, apply control absent (doubleAcceptCheck), header back to
  AI ASSISTANT, chat input visible. Shot: shots/06-rail-after-accept-no-reload.png.

C4. REJECT -> SHA UNCHANGED, INPUT READY — PASS (flowB, separate run)
  Proposal "~step step-17 — now: Final read" shown; clicked .changes-panel__btn--discard.
  sha 0a623e2b before == after; panel gone; header AI ASSISTANT; input present.
  Shots: shots/10-proposal-before-reject.png, shots/11-after-reject-chat-ready.png.

C5. LABWARE-ROLE REQUEST -> LABWARE COUNT +1 AFTER ACCEPT — PASS (flowC3)
  Ask: "add a labware role named reagent-reservoir for a 12-channel multichannel reservoir ..."
  Proposal: "+labware role reagent-reservoir — ... expectedLabwareKinds: CL:12_well_reservoir_vertical".
  Accept -> record labwareRoles 5 -> 6 (roleId reagent-reservoir present), sha 5e109a0f -> 0a623e2b
  (exactly once). Shots: shots/08-c3-labware-proposal.png, shots/09-c3-rail-badge-Labware6-no-reload.png.
  NOTE: the literal spec ask ("sterile 15 ml conical") and a first retry (deepwell plate) both
  produced a proposal whose roleId ALREADY EXISTS in the fixture baseline (added by prior-gate
  accepts). Accept then correctly wrote NOTHING and surfaced the truthful gate error
  "Edit op 0 (labware_add): Labware role ... already exists." with the panel kept open —
  correct propose-never-write behavior, re-observed prior-gate D3, not a new defect.
  flowC3 used a role name not in the baseline to exercise the +1 criterion cleanly.

C6. (D2 RAIL REFRESH — THIS REPAIR) RAIL REFRESHES WITHOUT PAGE RELOAD — PASS
  Same page session, NO reload between goto and after-accept probes:
  - Steps: rail step count 16 -> 17 after accept (flowAC railAfterAcceptNoReload; also
    flowA2C2 rail 17 + contiguously renumbered ordinals).
  - LABWARE badge: [data-testid='protocol-nav-labware'] textContent
    "▸Labware5" (shots/07-c3-fixture-badge-Labware5.png) -> "▸Labware6" after accept
    (shots/09-c3-rail-badge-Labware6-no-reload.png) — same DOM session, reload:false.
  The cl:records-changed success-branch dispatch in handleProtocolAccept works as specced.

## Trail hygiene
- All step targets matched ended URLs (/runs/RUN-2026-09-19-run-vwr8 throughout).
- consoleErrors: only the pre-existing WorkspaceTabStrip duplicate-key React warning
  (explicitly out of scope per the wellsfix spec) — marked pre-existing, not caused by this flow.
- Final fixture state (written by the gate's own accepts): sha 0a623e2b, steps 17, labwareRoles 6,
  instrumentRoles 3. Two "Wash the lysate" steps (ordinals 4,5) are the expected consequence of
  the verbatim flow being accepted twice (attempt 1 flake-applied the insert; the retry applied
  insert+delete). Not a defect.

## Findings (non-blocking, for the backlog)
F1 (cosmetic, medium-low) — ChangesPanel Accept/Reject render as UNSTYLED joined text
  "RejectAccept" with no button chrome or gap (both ops in one visual token; they ARE clickable
  — flow clicks succeeded — but read as dead text). No CSS anywhere defines .changes-panel__btn /
  .changes-panel__actions (grep of app/src finds zero CSS references). Route /runs/RUN-...-vwr8,
  selectors .changes-panel__btn--discard / [data-testid='changes-apply'].
  Screenshots: shots/03-verbatim-diff-two-rows.png, shots/10-proposal-before-reject.png.
  Prior gates recorded the panel textually only; the vision pass makes it plainly visible.
F2 (pre-existing observation, unchanged) — duplicate labware_add proposals are only caught at
  Accept (prior D3). apply-error line renders in plain text despite role="alert".
F3 (pre-existing, unrelated) — run-page breadcrumb repeats the project name and shows the
  "Saturaday" fixture typo; deck canvas shows the "Click to choose labware" placeholder in
  manual mode; AI chat shows "(no response)" bubble when the model emits prose-less turns.

VERDICT: accept
