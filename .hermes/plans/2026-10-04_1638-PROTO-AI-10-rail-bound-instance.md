# PROTO-AI-10 spec — Rail shows the run's bound instance beside declared roles (UI)

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-4 ✓ (merged).
Branch off `cl/integration-2` in your OWN worktree. ONE worker on this item.
UI change → `cl-browser-reviewer` gate against :5193 is the acceptance gate.

## Goal
In the EXISTING collapsible LABWARE / EQUIPMENT rail sections, when the attached protocol is
open inside a RUN whose planned-run carries `LabwareBinding` entries, show the bound concrete
instance identity beside each matching `roleId`. Protocol-only context or unbound roles →
role-only, zero guessing. Two roles bound to different instances of the same design stay
distinguishable. Switching run/protocol clears stale bindings. READ-ONLY display — binding
creation stays the setup wizard's job (out of scope).

Makes Brad's chain visible end-to-end: step → identity-bearing role → the concrete 96-well
deepwell plate the run bound — without letting concrete instances leak into the reusable
protocol (LOCKED decision D2).

## Orientation — verified anchors (orchestrator read on current trunk `47c19004`; confirm by reading)
- **The rail's resource sections ARE `ResourceSection`** inside
  `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx` (:335-384). It renders
  `roles: ProtocolRoleSummary[]`; mounted twice at `:215-226` as `resources.labwares`
  ("LABWARE") and `resources.equipment` ("EQUIPMENT"). DO NOT rebuild it — extend it.
  A protocol declaring none renders no section at all (`ProtocolNavPanel.tsx:355`).
- **The context**: `ProtocolResources` / `ProtocolRoleSummary` live in
  `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` (:45-62); `resources` is
  published via `sel.setResources(...)` (:114-116).
- **The publication site is `app/src/run/RunProtocolStepsLoader.tsx`**:
  `resolveRunProtocol(runId)` (:35-77) already resolves run → plannedRunRef (PLR) →
  `protocolRef`, and FETCHES the PLR record into `plrEnv` / `pp`. It then fetches the steps
  record and publishes `sel.setResources(protocolResourceSummaries(payload))`
  (`protocolStepEditing.ts:35-40`). **=> the PLR payload `pp` is ALREADY IN HAND exactly at
  the one place that publishes `resources`. Read its `bindings` there.**
- **Binding shape**: `schema/workflow/planned-run.schema.yaml` — `bindings` array
  (:103-111) of `$defs/LabwareBinding` (:285-297): `{ roleId (required string),
  labwareInstanceRef? ($ref ./datatypes/ref.schema.yaml), labwareGeometryRef? ($ref) }`.
  (Sibling defs MaterialBinding/InstrumentBinding/... exist; this task reads LABWARE
  bindings only. Do NOT add schema — the shape already exists.)
- **Ref-display convention (cite, do not invent a widget)**: refs are `{ id, type|kind, label|name }`
  or a bare string. The repo's canonical ref renderer is `describeRef(ref)` in
  `app/src/event-editor/right-pane/protocol/ProtocolIdentity.tsx:74-82` — it renders
  `"<type|kind|record> <label> (<id>)"` (label omitted when it equals or is absent vs id), and
  `protocolDisplayName` (`:58-71`) resolves a display name `title → name → ref label → recordId`.
  Reuse that convention (a lighter `label ?? id` read such as `refId()` in
  `app/src/event-editor/rail/KnowledgeRailSection.tsx:27-31` is acceptable for a compact rail line,
  but do NOT invent a new widget).

## Design (minimum additive)
- Extend `RunProtocolStepsLoader.resolveRunProtocol`/load effect to ALSO read the PLR's
  `bindings`, keep entries carrying a `labwareInstanceRef`, and publish a
  `roleId → { instanceRef, geometryRef? }` map beside `resources`.
- Extend `ProtocolResources` (or add a sibling optional context value) with the binding map
  as an OPTIONAL field so every existing dispatch/consumer compiles unchanged.
- Extend `ResourceSection` to render, beside a MATCHED `roleId` only, the bound instance
  identity (`labwareInstanceRef.label ?? labwareInstanceRef.id`) using the rail's existing
  CSS conventions (`ProtocolNavPanel.css`). Unmatched roles render exactly as today.
- **Clearing**: the loader re-runs per `runId`; ensure the binding map resets (to empty)
  exactly when `resources` does — no stale labels after a run/protocol switch.
- READ-ONLY: no binding create/edit UI, no writes.

## Scope / ownership
- `app/src/run/RunProtocolStepsLoader.tsx` (+ its test `RunProtocolStepsLoader.test.tsx`)
- `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` (optional field/value)
- `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx` (+ test) and
  `ProtocolNavPanel.css`
- Do NOT touch server code, any schema YAML (no change needed), the AI intent path, or the
  binding setup wizard.

## Acceptance criteria (VERIFY, do not assert)
- Unit / loader-join tests: a run whose PLR carries `LabwareBinding`s publishes a
  `roleId → instance` map; unbound roles and protocol-only (no-run) context publish an empty
  map; two roles bound to different instances of the SAME design stay distinguishable;
  switching `runId` clears stale bindings.
- `npm run test:unit -w app` targeted suites green; existing `ProtocolNavPanel` /
  `ProtocolSelectionContext` / `RunProtocolStepsLoader` suites green.
- **`cl-browser-reviewer` receipts against http://localhost:5193** (orchestrator dispatches
  after merge — see note): bound run shows the correct instance ref beside its role(s);
  unbound / protocol-only context shows none; no stale labels after a run/protocol switch;
  collapsed-by-default section behaviour intact. `VERDICT: accept` is the gate.

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-10-report.wip-<token>.md` (canonical name untouched).
- Commit on your branch `wt/PROTO-AI-10-lane2-<token>` off current `cl/integration-2` HEAD.
  Do NOT merge. Do NOT edit the task list.

## Notes
- **Orientation recon (cl-scout screening, verified where load-bearing)**: a `cl-scout` pass on
  the current trunk corroborated this spec's premise — there is NO code path today that loads a
  run's `LabwareBinding` entries (with `labwareInstanceRef`/`labwareGeometryRef`) into the
  event-editor's protocol surfaces; `ProtocolSelectionContext.tsx` holds only the DECLARED
  `ProtocolResources`/`ProtocolIdentityRef`, and `ProtocolNavPanel.tsx` consumes them with no
  direct LabwareBinding load. The scout also named `ProtocolTabPanel.fetchSteps`
  (`:1118-1135`) as the run→`plannedRunRef`→`protocolRef` resolution and `describeRef` as the
  ref renderer (both folded in above). Scout output is SCREENING, not authority — the anchors
  above were re-verified by direct reads.
- **UI gate sequencing**: `cl-lane-stack.sh` serves ONLY the trunk worktree
  (`/mnt/vast/home/brad/git/cl-integration-2`) on :5193, so the candidate must be in the
  trunk for the reviewer to see it. Sequence: worker commits → orchestrator merges to
  `cl/integration-2` → `cl-lane-stack.sh 2 restart` → `cl-browser-reviewer` on :5193. If the
  verdict is `fix`, repair on the worker branch, re-merge (orchestrator), re-review.
- exactOptionalPropertyTypes is on for the server; the app follows the repo's own
  conventions. Keep the new context field optional so existing dispatches compile unchanged.
