# PROTO-AI-7 spec — `protocol_edit` intent: enum, parser, dispatch branch, zero-write guarantee

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-2 ✓, PROTO-AI-6 ✓ (both merged).
Branch off `cl/integration-2` in your OWN worktree. ONE worker on this item.

## Goal
Wire `protocol_edit` as a fourth intent on the EXISTING forced `agent_intent` tool — never a second
forced tool, never a free-prose path, never a silent write. A protocol_edit turn validates the
payload against the PROTO-AI-2 registered schema and emits the proposal to the client; it runs
NOTHING else (no event-graph compiler, no record read-modify-write). Propose-never-write must be
structurally true.

## Orientation — verified anchors (orchestrator read on current trunk; confirm by reading)
- `server/src/ai/submitSuggestionTool.ts`:
  - intent enum: line **439** currently `enum: ['event_graph', 'deck_layout', 'create_record']`
    → after this task it reads exactly `[event_graph, deck_layout, create_record, protocol_edit]`.
  - `AgentIntentArgs` union: **:467** (`intent: 'event_graph' | 'deck_layout' | 'create_record' | 'unknown'`).
  - `parseAgentIntentArgs`: **:473-475** (branches on the three known intents; unknown → 'unknown').
  - tool description text at **:431 / :441** (the intent menu prose) — update it for the new intent.
- `server/src/ai/AgentOrchestrator.ts` dispatch: `create_record` at **:1853**, `deck_layout` at
  **:1892-1920**, deck_layout returns early ~**:2004**. Add the `protocol_edit` branch beside these.
- The op envelope contract: `schema/workflow/protocol-edit-op.schema.yaml`
  ($id `https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml`) with its
  companion `schema/workflow/protocol-edit-op.lint.yaml` — validate the model payload against the
  REGISTERED schema (loadable by SchemaRegistry), not a hand-rolled shape.
- The attached-protocol prompt context block + the op vocabulary are ALREADY in the prompt
  (PROTO-AI-6, `server/prompts/event-graph-agent.md` marker-gated region): the model is told to
  answer with `{ "ops": [...] }`. This task gives that guidance a validated dispatch branch.

## Scope / ownership
- `server/src/ai/submitSuggestionTool.ts` (+ test `submitSuggestionTool.test.ts`)
- `server/src/ai/AgentOrchestrator.ts` (+ new `AgentOrchestrator.protocolEdit.test.ts`)
- App-side emission type(s) under `app/src/event-editor/right-pane/ai/` ONLY to add the proposal
  payload TYPE now (UI lands in PROTO-AI-9); do NOT build UI here.
- Do NOT touch: the schema envelope (PROTO-AI-2, merged), the prompt (PROTO-AI-6, merged), or the
  applier (PROTO-AI-8).

## Acceptance criteria (VERIFY, do not assert)
- RED-first `submitSuggestionTool.test.ts`: `protocol_edit` parses with its `ops` array retained
  VERBATIM; unknown intents still fall to `intent: 'unknown'`; enum exactness (exactly four intents).
- New `AgentOrchestrator.protocolEdit.test.ts`:
  - a `protocol_edit` turn yields the proposal emission AND spies on store/repo prove **ZERO
    mutation calls** (no create/update/delete);
  - schema-invalid payload → a corrective error surfaced the SAME way other validation failures
    surface today (do not invent a new channel);
  - the other three intents regression-tested unchanged; golden tests stay green.
- `npm run test:run -w server` targeted suites green; full-suite failing-file set no worse than the
  RED baseline (~125 failed at trunk — measure before/after, report the delta).
- `npx tsc --noEmit -p server/tsconfig.json` zero new errors.

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-7-report.wip-<token>.md`.
- Commit on your branch `wt/PROTO-AI-7-lane2-<token>` off current `cl/integration-2` HEAD. Do NOT merge.

## Notes
- cl-scout is currently impaired; orientation above is from orchestrator local inspection of the
  current trunk — verify the anchors by reading the files.
- exactOptionalPropertyTypes is on (server).
- PROTO-AI-6 already ships the prompt vocabulary; your branch must not re-add it. If the emission
  type name you choose would collide with an existing name, pick a distinct one and note it.
