# PROTO-AI-8 spec — Client apply path: pure op applier, gates mirrored, single expectedSha write

Lane 2 · campaign `ai-protocol-edit-and-router` · deps PROTO-AI-5 (server write gates), PROTO-AI-7
(`protocol_edit` intent). Dispatch only once BOTH are merged (the orchestrator confirms).
Branch off `cl/integration-2` in your OWN worktree. ONE worker on this item.

## Goal
Turn a validated `protocol_edit` proposal into exactly the human editor's semantics: a PURE
applier that runs each op through the SAME gated functions the human editor uses, then persists
the whole record in ONE atomic `updateRecord` call under the human lock (`expectedSha`). Apply is
NOT a second gate implementation — it is the human gates, driven by data.

## Orientation — verified anchors (orchestrator read on current trunk `47c19004`; confirm by reading)
- **The human gate module** `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`
  (mirror its semantics — do NOT reimplement gates):
  - `editableProtocolSteps(payload)` `:43` — kind-only/inherited + content-lock gates.
  - `updateMembership(payload, anchorId, insertedId?, position?)` `:60` — keeps
    `variants[].stepIds` / `branch_axes` membership in sync on structural edits.
  - `insertProtocolStep(payload, anchorId, position, step)` `:74` — anchor + duplicate-stepId
    gates, splice, ordinal renumber 1..N.
  - `deleteProtocolStep(payload, stepId)` `:86` — ≥1-step + executed-undeletable gates, ordinal
    renumber.
- **stepId minting** (reuse EXACTLY): `ProtocolStepEditModal.tsx:88` —
  `` `step-${<12 random bytes hex>}` `` (`step-` + 24 lowercase hex). Legal under the schema
  pattern `^[a-z][a-z0-9-]*$`. Do NOT invent a different id shape.
- **The op envelope (PROTO-AI-2, merged)** `schema/workflow/protocol-edit-op.schema.yaml`:
  top-level `{ protocolId?: string, ops: EditOp[] }` (`:63-79`). Op vocabulary (enum `:112-121`),
  each `unevaluatedProperties:false`:
  - `step_update` {stepId, label?, description?, notes?, kind?, settings?} — `settings` is ALWAYS
    the `Setting[]` ARRAY form (setting.schema.yaml), uniform across kinds (`:136-168`).
  - `step_insert` {afterStepId XOR beforeStepId, label, kind, description?} — the NEW stepId is
    MINTED by the applier, never proposed (`:170-200`).
  - `step_delete` {stepId} (`:202-213`).
  - `labware_add|labware_update` {roleId, description?, expectedLabwareKinds?[]}
    (`:216-256`); `labware_delete` {roleId} (`:258+`); `equipment_*` identical against
    `roles.instrumentRoles`.
  - `StepKind` enum = `add_material|transfer|mix|wash|incubate|read|harvest|other` (`:101`).
- **Settings shape** (PROTO-AI-1(c)): step-level `settings: Setting[]` — `setting.schema.yaml`
  (`required [settingId,label,type]`, `type` enum incl. string/number/boolean/duration/
  temperature/volume/concentration/ratio/select). Use the SAME shape the human editor writes.
- **Rich text**: the human editor persists a `descriptionRichText { plainText, document }`
  companion on text edits (`ProtocolStepEditModal.tsx:89-91`). The op envelope carries only
  `description` (plain). Runtime-derived rule: when an op changes `description`, keep
  `descriptionRichText` consistent (derive it) OR explicitly clear it — decide one and document
  it; never leave plain and rich text contradicting each other.
- **The atomic write** (the rail's existing pattern): `apiClient.getRecord(id)` → apply → ONE
  `apiClient.updateRecord(id, payload, { expectedSha })`. No endpoint choreography, no
  per-op server calls.

## Scope / ownership
- `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts` — ADD role ops
  (`addLabwareRole`/`updateLabwareRole`/`deleteLabwareRole` + instrument equivalents),
  mirroring `updateMembership`'s touch-only-declared-lists discipline and popping empty
  `roles.labwareRoles`/`instrumentRoles` cleanly.
- NEW `app/src/event-editor/right-pane/protocol/protocolEditOps.ts` — `applyOps(payload, ops)`
  PURE function: applies ops in listed order through those gated fns; each gate rejection throws
  with op index + reason.
- Apply orchestration (getRecord → apply → single write) — co-locate with the applier or a thin
  hook in the same folder.
- Tests: `protocolEditOps.test.ts` (+ additions to `protocolStepEditing.test.ts`).
- Do NOT touch: the op schema, the prompt, the AI dispatch (PROTO-AI-7), the UI panel
  (PROTO-AI-9), or server code.

## Acceptance criteria (VERIFY, do not assert)
- RED-first `protocolEditOps.test.ts` on a fixture payload:
  - every op kind applies, incl. `step_update` with `kind` + `settings`;
  - each gate rejection throws naming the OP INDEX (last-step delete, executed-step delete,
    content-locked protocol, duplicate stepId on insert, role id collision);
  - ordinal renumbering after `step_delete`/`step_insert` matches the server rebuild;
  - **double-accept idempotence**: applying the same proposal twice is a no-op or a conflict,
    never a double mutation;
  - **sha-conflict path**: returns the EXACT message
    `Someone changed this protocol - reload and try again.` (D4: no auto re-propose) with ZERO
    writes queued.
- `npm run test:unit -w app` targeted suites green; existing `protocolStepEditing` suite green.
- No UI in this task; the browser gate belongs to PROTO-AI-9.

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-8-report.wip-<token>.md` (canonical name untouched).
- Commit on your branch `wt/PROTO-AI-8-lane2-<token>` off current `cl/integration-2` HEAD.
  Do NOT merge. Do NOT edit the task list.

## Notes
- cl-scout is currently impaired; orientation above is orchestrator local inspection of the
  current trunk — verify every anchor by reading the source before relying on it.
- D4 (binding): on stale `expectedSha`, STOP with the exact message above — never auto
  re-propose. This message string is an acceptance criterion; reproduce it verbatim.
- exactOptionalPropertyTypes is on for the server; the app follows repo conventions.
- The lane stack serves the TRUNK worktree, so no live E2E is possible pre-merge — this task's
  gate is the unit suite; the end-to-end browser proof lands with PROTO-AI-9.
