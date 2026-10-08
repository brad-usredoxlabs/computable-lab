# Plan — AI protocol-edit tool call (edit the attached protocol from the chat pane)

Status: PLAN (not executed). Written 2026-10-03 after recon of the emission seam,
the protocol write path, and the protocol record shape.

## The ask (verbatim intent)

> the main AI chat pane on the right of the event editor has the ability to do
> different types of tool calls. I want to add another type which is to edit the
> attached protocol. It should have full CRUD functions per step: edit the text,
> delete the step, add a step as well as CRUD functions for labwares and
> equipment.

## What already exists (do NOT rebuild)

The taxonomy has exactly one forced emission tool, `agent_intent`, whose `intent`
enum IS the "type of tool call" menu:

- `server/src/ai/submitSuggestionTool.ts:424` — `AGENT_INTENT_TOOL_NAME = 'agent_intent'`
- `server/src/ai/submitSuggestionTool.ts` — `AGENT_INTENT_TOOL_DEF.function.parameters.properties.intent.enum`
  is `['event_graph', 'deck_layout', 'create_record']`; the draft-event fields are
  spliced in verbatim from `DRAFT_ARGS_PROPERTIES`.
- `server/src/ai/submitSuggestionTool.ts:473` — `parseAgentIntentArgs` decodes the intent
  and drops anything it does not recognise to `intent: 'unknown'`.
- `server/src/ai/AgentOrchestrator.ts:1845` — the single dispatch site
  (`if (submitCall.function.name === AGENT_INTENT_TOOL_NAME)`), where `event_graph`,
  `deck_layout` and `create_record` are branched on.
- `server/prompts/event-graph-agent.md` — "Available Tools" + "Output Format" sections
  are the model-facing contract for the existing intents.

Server-side protocol step CRUD ALREADY EXISTS — the AI tool must ride it, not invent a path:

- `server/src/api/routes/protocol-steps.ts`
  - `GET  /protocols/:protocolId/steps`
  - `POST /protocols/:protocolId/steps`      (create; body = CreateStepRequest, :112)
  - `PATCH /protocols/:protocolId/steps/:stepId` (partial update + idempotent upsert, :95)
  - `DELETE /protocols/:protocolId/steps/:stepId` (rebuilds contiguous ordinals, :154)
  - `GET/PATCH /protocols/:protocolId/steps/:stepId/settings`
  - `GET /protocols/:protocolId/steps/:stepId/graph`

Client-side, the left rail already performs step CRUD with optimistic locking
(`expectedSha`), and it is the reference implementation for the write half:

- `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx` (removeStep / undoDelete /
  publishSteps) — `getRecord` → mutate payload → `updateRecord(id, payload, { expectedSha })`.
- `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts` — the pure edit
  functions (`editableProtocolSteps`, `insertProtocolStep`, `deleteProtocolStep`,
  `updateMembership`) plus the GATES that must also gate the AI: kind must be `protocol`
  (inherited steps are not editable), controlled protocols are locked, ≥1 step must
  remain, executed steps (`executionMeta.startedAt/completedAt`) cannot be deleted.
- `app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.tsx` — the human editor
  for one step (text via TipTap, add-before/after, delete).

The AI chat pane's emission handling is the front half:

- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — `handleDeckLayout` is the template
  for "an intent that is NOT a draft": it applies, then `sidebarDispatch({type:'reset'})`
  so the input returns (`references/ai-panel-emissions.md` — never leave the sidebar in
  `'interpreting'`).
- `app/src/event-editor/right-pane/ai/useChatThread.ts`, `draftPreview.ts`,
  `ChangesPanel.tsx`, `sidebarState.ts` — the draft review surface + state machine.

## The protocol record shape (this decides what "labware/equipment CRUD" means)

`schema/workflow/protocol.schema.yaml`:

- `steps[]` — `ProtocolStep { stepId, label, ordinal, kind, description?, notes?, phaseId?, … }`
- `roles.labwareRoles[]` / `roles.instrumentRoles[]` / `roles.materialRoles[]` —
  `{ roleId, description? }`. A protocol DECLARES abstract roles; a RUN binds concrete
  labware instances to them (`schema/workflow/protocol.schema.yaml:182-202`).
- There is no top-level `labwares` / `equipment` array. Live sample (PRT-wlj0qm):
  8 `labwareRoles`, 10 `instrumentRoles`, 17 steps.

So "CRUD for labwares and equipment" on a PROTOCOL = add / rename / re-describe / remove
ROLE declarations, not concrete instances. Binding instances is the run's job (the setup
wizard). Getting this wrong is the single largest design risk in this plan.

## LOCKED decisions

1. One new intent on the existing forced tool; never a second forced tool and never a
   free-prose path. `intent: 'protocol_edit'`.
2. The AI proposes; the human accepts. No silent record write from an AI turn — the
   existing draft/accept muscle is reused (see open question 1 for the exact surface).
3. Every write goes through the existing step endpoints / `expectedSha` optimistic lock —
   the AI path must NOT get a privileged bypass. A stale sha surfaces as a conflict to
   the user, and re-proposing is the recovery.
4. The gates in `protocolStepEditing.ts` apply to the AI path identically (inherited
   protocol → not editable; controlled/locked → not editable; last step → cannot delete;
   executed step → cannot delete). They are the safety net against a model that is
   confidently wrong.
5. Labware/equipment CRUD means ROLE declarations on `roles.labwareRoles` /
   `roles.instrumentRoles` (decision above). Concrete binding stays out of scope.
6. No hardcoded edit vocabulary: the op set and the per-op field rules belong in data
   (prompt contract + a schema/lint spec for the op envelope), not in TypeScript branches.

## Phases (each names its RED test, files, verify command)

### Phase 1 — the intent exists and is parsed

- RED: `server/src/ai/submitSuggestionTool.test.ts` (new or extended) — an args payload
  `{intent:'protocol_edit', …}` parses to `intent:'protocol_edit'` with its ops retained;
  an unknown intent still falls back to `'unknown'`.
- Files: `server/src/ai/submitSuggestionTool.ts` (enum + `AgentIntentArgs` union +
  `parseAgentIntentArgs`), and the tool description text.
- Verify: `npx vitest run --root server src/ai/submitSuggestionTool.test.ts`.

### Phase 2 — the op envelope is declared, not hand-coded

- RED: schema/lint test asserting a malformed op list is rejected and a valid one passes
  (mirror `server/src/schema/ProtocolProseFieldsSchema.test.ts` for the harness style).
- Shape to ratify (data file, e.g. `schema/workflow/protocol-edit-op.schema.yaml`):
  ```
  ops: [
    { op: 'step_update',  stepId, label?, description?, notes? }
    { op: 'step_insert',  afterStepId, label, kind, description? }
    { op: 'step_delete',  stepId }
    { op: 'labware_add' | 'labware_update' | 'labware_delete',    roleId, description? }
    { op: 'equipment_add' | 'equipment_update' | 'equipment_delete', roleId, description? }
  ]
  ```
- Files: new schema + lint spec, `server/src/ai/` validator wiring.
- Verify: the schema test above + `npm run typecheck -w server`.

### Phase 3 — server emits the intent

- RED: `server/src/ai/AgentOrchestrator.protocolEdit.test.ts` — a turn whose forced tool
  call is `protocol_edit` returns the ops to the client and does NOT run the event-graph
  compiler.
- Files: `AgentOrchestrator.ts` branch beside the `deck_layout` branch (:1892),
  `server/prompts/event-graph-agent.md` (tools + output-format + a worked example, incl.
  "never invent step ids: read them from the provided protocol context"),
  `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts` if the protocol context
  is not already in the prompt (the model needs the current step list + role list).
- Verify: the new orchestrator test + `AgentOrchestrator.golden.test.ts` still green.

### Phase 4 — client applies through the existing lock, with review

- RED: `app/src/event-editor/right-pane/protocol/protocolEditOps.test.ts` — pure unit
  tests for each op against a fixture payload (insert/delete/update step, add/update/
  delete role), including the gates (inherited, locked, last step, executed step) and
  ordinal renumbering.
- Files: extend `protocolStepEditing.ts` with the role ops (mirroring
  `updateMembership`'s "touch only declared lists" discipline), a small
  `protocolEditOps.ts` apply-all, `AiTabPanel` intent handling + `sidebarDispatch reset`
  on completion, and the review surface (ChangesPanel or a rail diff — open question 3).
- Verify: the unit test, then browser-verify on `:5174` (ask the agent to add a step, see
  the proposal, accept, watch the rail renumber, then confirm on disk via the record API).

### Phase 5 — end-to-end acceptance

1. Attach a protocol to a run with the rail showing Labware / Equipment sections.
2. In the AI chat: "add a wash step after step 3 and delete the redundant centrifuge
   step" → the agent emits `protocol_edit` with two ops.
3. The proposal is reviewable (nothing written yet).
4. Accept → the record changes once, ordinals renumber, the rail updates, Labware /
   Equipment counts stay consistent.
5. Ask for a labware role addition → the Labware section count increments on accept.
6. Force a conflict (edit the same record in another tab) → the second accept reports a
   stale-sha conflict rather than clobbering.

## Non-goals / guardrails

- No concrete labware binding (run-time setup wizard owns it).
- No material-role CRUD in this pass (the same machinery would cover it later).
- No AI-authored controlled/cGMP protocol edits: the lock gates stay absolute.
- Not a second tool; not a free-prose answer path; not a silent write.
- The AI must never invent `stepId`s — it must read them from the protocol context the
  server now needs to include in the prompt.

## Open questions for Brad (these change the implementation, not the plumbing)

1. Review surface: reuse the existing ChangesPanel diff, or show protocol-edit ops in the
   left rail next to the affected step (accept/reject per op)?
2. Does "labware/equipment CRUD" mean the protocol's declared ROLE list (as specced), or
   did you also mean binding concrete labware instances to those roles from the chat?
3. Should the AI be allowed to add a step kind / settings (temperature, duration…), or
   text + position only for now?
4. On a stale-sha conflict, should the agent re-propose automatically, or is a plain
   "someone changed this protocol — reload and try again" the right stop?
