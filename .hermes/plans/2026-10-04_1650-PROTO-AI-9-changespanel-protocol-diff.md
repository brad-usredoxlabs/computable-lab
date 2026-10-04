# PROTO-AI-9 spec — ChangesPanel protocol-edit diffs + AiTabPanel accept/reject wiring (UI)

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-8 (client apply path). Dispatch only
once AI-8 is merged (the orchestrator confirms). Branch off `cl/integration-2` in your OWN worktree.
ONE worker. UI change → `cl-browser-reviewer` gate against :5193 is the acceptance gate.

## Goal (LOCKED decision D1: NO new rail approval surface)
Render a `protocol_edit` proposal in the EXISTING ChangesPanel review surface — the place Brad
already looks — and wire Accept/Reject in `AiTabPanel.tsx` following `handleDeckLayout`'s
discipline (proposal shown for review, sidebar reset so the input returns — NEVER leave sidebar
`interpreting`). Event-graph review must stay byte-unchanged. Propose-never-write means nothing
without review here.

## Orientation — verified anchors (orchestrator read on current trunk `a3637ab1`; confirm by reading)
- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` TODAY (`:3-63`): props
  `{ changes: EventGraphChange[]; warnings: ValidationGap[]; onApply; onDiscard }`; per-change it
  reads ONLY `change.op` (prefix `+`/`-`/`~`, `:35-39`) and `change.description` (`:40`);
  `warnings[].severity` classes `:23`, `.message` `:25`. Keep `EventGraphChange` byte-identical so
  event-graph review cannot break.
- `app/src/event-editor/right-pane/ai/sidebarState.ts`: `EventGraphChange` (`:23-27`),
  `ValidationGap` (`:29-33`), the reviewing state (`:47-58`), `draft-ready` action (`:73-77`),
  reducer `draft-ready` (`:123-131`). `primaryActionLabel`/`headerLabel` (`:148-176`).
- **The minimum additive contract is already specified** in
  `.hermes/plans/PROTO-AI-1-grounding-map.md` § (e) (lines ~296-355): optional
  `ProtocolEditDiff`/`ProtocolEditOp`/`StepFieldBeforeAfter`/`RoleBeforeAfter` types added to
  `sidebarState.ts` (all optional so every existing dispatch compiles unchanged), an optional
  `protocolDiff?: ProtocolEditDiff` on the reviewing state + `draft-ready` action, and the ONLY
  behavioural hook: branch `onApply` (`AiTabPanel.tsx:764-767`) as
  `protocolDiff ? applyProtocolOps(...) : editor?.actions.commitPreview()`. Read it and follow it.
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`: `onDraftResult` (`:302-325`) is where a
  draft result becomes sidebar state — a `protocol_edit` emission branches here (its own emission
  type added in PROTO-AI-7) INDEPENDENT of the event-graph path. ChangesPanel mount `:759-772`;
  commit/`commitPreview` also at `:805-806`. An `attachedProtocol` value already exists in the
  context `useMemo` (`:298`, PROTO-AI-6) — reuse it to name the target protocol.
- **The applier** (PROTO-AI-8, merged): `app/src/event-editor/right-pane/protocol/protocolEditOps.ts`
  — `applyOps(payload, ops)` pure + the getRecord → apply → ONE `updateRecord(id, payload,
  {expectedSha})` orchestration. D4 stale-sha → surface EXACTLY
  `Someone changed this protocol - reload and try again.`

## Requirements
- ChangesPanel (or a sibling it delegates to) renders a protocol-edit proposal: target protocol
  named; per-op before/after — step text, kind, settings, position; role section add/update/remove
  incl. `expectedLabwareKinds`. Reuse the `+ / ~ / -` prefix convention. Event-graph rendering
  untouched.
- Accept → PROTO-AI-8 applier → truthful success/conflict state (D4 message on stale sha).
  Duplicate Accept cannot replay: disable the action post-apply AND rely on AI-8 idempotence.
- Reject → zero mutation. Swapping the attached protocol invalidates an open proposal.
- NEVER leave the sidebar `interpreting` while a proposal is shown for review.

## Scope / ownership
- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` (+ test)
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- `app/src/event-editor/right-pane/ai/sidebarState.ts` (+ its test)
- Do NOT touch server code, the applier's internals (AI-8), the intent dispatch (AI-7), or
  introduce any rail approval surface (D1).

## Acceptance criteria (VERIFY)
- Unit: existing ChangesPanel / event-graph review suites stay green (byte-compatible
  `EventGraphChange`); new tests cover protocol-diff rendering, Accept→apply, Reject→zero
  mutation, and the D4 conflict message path.
- **`cl-browser-reviewer` receipts against http://localhost:5193** (orchestrator merges then
  dispatches — see the AI-10 spec Notes for the merge-then-review sequencing the lane stack
  forces): ask "add a wash step after step 3 and delete the redundant centrifuge step" → the diff
  shows exactly those ops and the record is UNCHANGED pre-accept (GET before/after sha in the
  trail); Accept → rail renumbers, sha advances ONCE, input is ready again; Reject → sha
  unchanged; a labware-role request → LABWARE count +1 after accept. `VERDICT: accept` is the gate.

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-9-report.wip-<token>.md` (canonical name untouched).
- Commit on your branch `wt/PROTO-AI-9-lane2-<token>` off current `cl/integration-2` HEAD.
  Do NOT merge. Do NOT edit the task list.

## Notes
- cl-scout orientation: bounded recon was done for the sibling PROTO-AI-10; for this task the
  authoritative contract is the grounding-map § (e) above — read it. Verify every anchor by reading.
- exactOptionalPropertyTypes is on for the server; the app follows repo conventions. Keep every
  new sidebarState field optional so existing dispatches compile unchanged.
