# Spec — PROTO-AI-6 · Attached-protocol context injection + prompt contract for `protocol_edit`

Lane 2 · Campaign `ai-protocol-edit-and-router` (list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` @ `51419ada` (PROTO-AI-2 merged; op envelope exists).
Item id: **PROTO-AI-6** · deps PROTO-AI-1 (✓ done, grounding map), PROTO-AI-2 (✓ done) · owner: `cl-senior`.

## Goal
When an event-editor chat has a protocol ATTACHED, the outbound model request must carry a compact
ground-truth context block so the model can make honest `protocol_edit` proposals:

- protocol identity: `recordId` + current `sha`;
- `steps`: for each step `{ stepId, ordinal, label, kind }` (ordinal, stepId, label, kind — nothing more);
- declared roles: `{ roleId, description, expectedLabwareKinds }` for labwareRoles, and the
  instrumentRole equivalent (`roleId`, `description`, `allowedInstrumentIds`).

Plus a `protocol_edit` instruction section in the system prompt stating the op vocabulary (mirroring
`schema/workflow/protocol-edit-op.schema.yaml`) and the hard rules below.

No protocol attached → no context block and NO `protocol_edit` guidance in the prompt.

## Deliverable (UNIQUE output path)
- **Canonical product files** (deliverable):
  - `server/src/ai/types.ts` — add an optional `attachedProtocol?` field to `EditorContext`.
  - `server/src/ai/systemPrompt.ts` — a `formatAttachedProtocol(context)` appender wired into the
    existing `extraContexts` list (see orientation).
  - `server/prompts/event-graph-agent.md` — the `protocol_edit` section (ops vocabulary + hard rules).
  - `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` + `assistStream.ts` (and any small plumbing) —
    populate the attached-protocol payload into the request context when a protocol is attached.
  - New/updated server tests (mocked inference client) capturing the outbound request.
- **Report** (UNIQUE path, write exactly this; orchestrator promotes):
  `.hermes/plans/PROTO-AI-6-report.wip-l2t0940.md` — include the captured-request evidence, the golden
  prompt diff, the final prompt block verbatim, and every assumption. Do NOT write
  `.hermes/plans/PROTO-AI-6-report.md` yourself.

## Environment
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-6-lane2-l2t0940`, branch `wt/PROTO-AI-6-lane2-l2t0940`, off `cl/integration-2`.
- Lane stack: backend `:3093`, frontend `:5193`. A `server/prompts/*.md` edit is a prompt change — if you
  edit any YAML under `schema/` run
  `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 2 restart` before a live check.
  (You should NOT need to edit `schema/`.) NEVER touch `:3001`/`:5174` or `.../git/computable-lab`.
- `exactOptionalPropertyTypes` is ON for the backend: build optional fields with conditional spread, never `undefined`.
- Tests: `npm run test:run -w server` (targeted) and `npm run typecheck -w server`; app unit tests
  `npm run test:unit -w app` if you touch app files.
- BASELINE FACT (confirmed by the orchestrator): the FULL `npm run test:run -w server` is RED at trunk
  baseline (~91 files). Signal = your TARGETED suite green + no NEW baseline failures.

## Orchestrator orientation (from the PROTO-AI-1 grounding map — VERIFY the sites yourself, then cite)
**The attached-protocol block does NOT exist today. You create it.**
- App context builder: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:167-258` (`useMemo`) builds
  `{studyId, activeTab, systemPrompt id/body, deck scope, accepted event-graph projection, draftRevision,
  graphLemur}` — no protocol payload, no steps, no roles.
- Stream call: `app/src/event-editor/right-pane/ai/assistStream.ts:23-40` → `POST /api/ai/assist/stream`
  (registered `server/src/api/routes.ts:645`); body carries `prompt/surface/context/history/protocolStepContext`.
- Server fold: `server/src/api/handlers/AIHandlers.ts:287` (`assistStream`) → `EditorContext`
  (`...context` spread at `:408-415`).
- Prompt render: `server/src/ai/AgentOrchestrator.ts:1033-1034` → `buildSurfaceAwarePrompt` →
  `buildSystemPrompt` (`server/src/ai/systemPrompt.ts:393-404, 444-471`) over template
  `server/prompts/event-graph-agent.md`.
- Existing append-only contexts live in `extraContexts` at `server/src/ai/systemPrompt.ts:464-470`
  (e.g. `formatProtocolStepContext` :478-490 for a single selected step). Add `formatAttachedProtocol`
  there, gated on `context.attachedProtocol` being present.
- `EditorContext` interface: `server/src/ai/types.ts:323-422` — no `attachedProtocol` today.
- `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts` is a static per-viewer preamble; it is
  NOT the injection site (do not put the protocol block there).
- The protocol rail already resolves the attached protocol payload — `ProtocolTabPanel.tsx` resolves
  run → plannedRunRef → protocolRef (`:1000-1005, 1113-1147`). Confirm the exact state/context that
  holds the resolved payload and whether `AiTabPanel.tsx` can read it without a new fetch; if a small
  shared accessor is needed, keep it minimal.

## Envelope mirror (MUST match PROTO-AI-2 exactly — do not paraphrase)
Read `schema/workflow/protocol-edit-op.schema.yaml` and mirror the op vocabulary verbatim:
`step_update | step_insert | step_delete | labware_add | labware_update | labware_delete |
equipment_add | equipment_update | equipment_delete`. Notable rulings encoded in that envelope:
- stepId pattern `^[a-z][a-z0-9-]*$`; **roleId is underscore/digit-tolerant** (`^[a-z0-9][a-z0-9_-]*$`) —
  never tell the model roleIds are hyphen-only.
- `step_update.settings` is ALWAYS the `Setting[]` array form (even for `kind: read`).
- EQUIPMENT ops carry `allowedInstrumentIds`; LABWARE ops carry `expectedLabwareKinds`.
- No concrete-instance object/reference anywhere in the envelope.

## Hard rules to state in the prompt section
- Never invent stepIds or roleIds; cite only ids present in the provided context block.
- Labware/equipment edits are ROLE declarations against DESIGN refs (`expectedLabwareKinds` /
  `allowedInstrumentIds`) — never concrete labware instances.
- One `protocol_edit` intent; propose-never-write (the server never persists a proposal).
- Stale `expectedSha` means stop and ask the user to reload (no auto re-propose).
- Prompt budget: the SMALLEST block that gets it right (Brad's standing ruling) — no boilerplate.

## Scout status (recorded this tick)
`cl-scout` was unavailable for these orientation questions (see PROTO-AI-4 spec note: with
`compression.enabled: false` a longer scout session hard-errors on context overflow). The orientation
above is the orchestrator's own verified read of the PROTO-AI-1 grounding map.

## Acceptance criteria (task `verified by`, verbatim)
- Tests with a mocked inference client: attached-protocol request capture contains protocol identity +
  all stepIds + role list; no-attachment capture lacks both; golden prompt tests updated deliberately
  (diff in handoff, no rubber-stamp).
- `npm run typecheck -w server` clean for touched files.

## Method
- RED first: capture-request tests before wiring.
- Cite every injection site with file:line in your report; if a grounding-map line has drifted, say so
  and cite the current line.
- No UI/visual change is involved, so no browser review is required — but do not silently change chat
  behaviour beyond the added context.
- Report each consequential assumption; never invent a config value.

## Out of scope
- The `protocol_edit` intent enum / dispatcher branch (PROTO-AI-7), the applier (PROTO-AI-8), the UI
  (PROTO-AI-9). Do NOT add the intent here.
- Deciding whether to fill/remove the dead `{{EXECUTION_CONTEXT}}` placeholder (note it; a separate call).
