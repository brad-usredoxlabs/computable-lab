# PROTO-AI-7 report (wip-l2t1605) — `protocol_edit` intent: enum, parser, dispatch, zero-write proof

Branch `wt/PROTO-AI-7-lane2-l2t1605` off `cl/integration-2` @ `47c19004`.
Owner: cl-senior · Lane 2 · campaign ai-protocol-edit-and-router.

## What shipped

`protocol_edit` is the FOURTH intent on the EXISTING forced `agent_intent`
tool (no second forced tool, no free-prose path, no silent write). A
protocol_edit turn validates `{ protocolId?, ops: [...] }` against the
PROTO-AI-2 REGISTERED envelope
(`schema/workflow/protocol-edit-op.schema.yaml`, $id
`https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml`)
and emits the proposal on the AgentResult. Structurally NOTHING ELSE RUNS:
verified by spies on `store.create/update/delete` (plus `executeTool` and
`runChatbotCompile`), zero calls, asserted in tests.

Dispatch returns EARLY, beside the `create_record` / `deck_layout` branches,
before the draft path — mirroring their shape (tool_result event, AgentSummary,
single log line).

## Changed files (tracked, committed on my branch)

- `server/src/ai/submitSuggestionTool.ts`
  - intent enum `:439` → exactly `[event_graph, deck_layout, create_record, protocol_edit]`.
  - tool description + intent description prose updated for the fourth intent.
  - tool schema gains `ops` (array, minItems 1, permissive item mirroring the
    envelope's op vocabulary — the AUTHORITATIVE gate is Ajv against the
    registered schema, the tool shape only lets the model fill it) and
    optional `protocolId`.
  - `AgentIntentArgs` union + `parseAgentIntentArgs`: `protocol_edit` parses;
    `ops` retained BY REFERENCE (identity-asserted in tests — no copy/filter/
    reorder between the model and the validator); unknown intents unchanged.
  - `KNOWN_SUBMISSION_KEYS` += `ops`, `protocolId` (no "unrecognized field"
    misdiagnosis on protocol_edit turns).
- `server/src/ai/protocolEditValidation.ts` — NEW. Loads the registered
  envelope (+ its declared `setting.schema.yaml` dependency) through the
  repo's own pipeline (loadSchemasFromContent → SchemaRegistry →
  AjvValidator, server.ts boot order), lazily once per process. Schema root
  resolved via APP_BASE_PATH / cwd / module-relative candidates. A load
  failure is reported as a validation failure with cause, never a silent pass.
  No hand-rolled shape; vocabulary stays DATA.
- `server/src/ai/AgentOrchestrator.ts` — protocol_edit branch after
  deck_layout. Valid → `{ success: true, protocolEdit: { ops, protocolId? } }`.
  Invalid → `{ success: false, error: 'protocol_edit proposal rejected by the
  protocol-edit-op schema: <path: message (suggestion)> …' }` — the SAME
  channel create_record/deck_layout validation failures use today (no new
  channel). Ajv teaching suggestions ride along for the corrective turn.
- `server/src/ai/types.ts` — `AgentResult.protocolEdit?: { ops: unknown[]; protocolId?: string }`
  (+doc). Ops stay an opaque validated array: the op shape is schema-owned, so
  no TypeScript mirror of the union (CL principle: TS interprets, never hardcodes).
- `app/src/event-editor/right-pane/ai/assistStream.ts` — `AiProtocolEditProposal`
  type + `AssistDraftResult.protocolEdit?` (the emission payload TYPE only;
  zero UI — that is PROTO-AI-9). Name `AiProtocolEditProposal` checked against
  existing names (no collision; no `protocolEdit*` name existed).
- Tests (RED-first, written before implementation):
  - `server/src/ai/submitSuggestionTool.protocolEdit.test.ts` NEW — enum
    exactness (exactly four), `ops` on the tool schema, ops retained VERBATIM
    (identity), protocolId retention/non-string drop, unknown → 'unknown'.
  - `server/src/ai/AgentOrchestrator.protocolEdit.test.ts` NEW — valid turn
    yields the proposal; protocolId override; SPIES PROVE ZERO store
    create/update/delete + no executeTool + no runChatbotCompile; schema-invalid
    payload → corrective error in the existing channel naming `ops`, still zero
    writes; missing ops rejected; OBJECT-form `settings` rejected (proves the
    registered schema, not a hand-rolled shape, is the gate); regression trio
    create_record / deck_layout / event_graph unchanged.
  - `server/src/ai/submitSuggestionTool.test.ts` — three-intent pin updated to
    four (RED first; was green at baseline 17 tests).

## Verified anchors (read, confirmed)

All spec anchors were accurate: enum at submitSuggestionTool.ts:439, union :467,
parser :473-475, deck_layout return ~:2004 (before my insert). One anchor is
now stale BY DESIGN of PROTO-AI-6, see assumption 3.

## Evidence (exact commands + results)

RED (before implementation): the three new/updated suites → `11 failed | 20 passed`
across 3 files (enum, parser, dispatch failures only).

Targeted GREEN (final state):
`npx vitest run` (cwd server/) over
src/ai/submitSuggestionTool.protocolEdit.test.ts, src/ai/AgentOrchestrator.protocolEdit.test.ts,
src/ai/submitSuggestionTool.test.ts, src/ai/submitSuggestionTool.equipment.test.ts,
src/ai/createRecordIntent.test.ts, src/ai/coerceAgentIntent.test.ts,
src/ai/selectSubmitCall.test.ts, src/ai/attachedProtocol.test.ts,
src/schema/ProtocolEditOpSchema.test.ts
→ **Test Files 9 passed (9); Tests 92 passed (92)**.
Golden suites also re-run alongside (12-file pass; the only failure,
AgentOrchestrator.golden.test.ts's bypass test, is byte-identical to the trunk
baseline failure — pre-existing, not golden-registry drift from this change).

Full server suite (`npm run test:run -w server`):
- baseline (same tree, before my edits, after worktree sync): 121 failed / 477 passed / 9 skipped files; 266 failed / 4315 passed tests.
- after: 120 failed / 480 passed / 9 skipped (609) files; 265 failed / 4330 passed / 68 skipped (4879) tests.
- Programmatic set-diff of FAIL lines: **ZERO new failing files, ZERO new failing tests**; 1 previously-failing test repaired (ControlledDocumentSchemas — flaky-adjacent, not mine). The task's ~125 baseline figure is the same pre-existing mass (missing lane-synced modules at first measurement).

Typecheck:
- `npx tsc --noEmit -p server/tsconfig.json` → 33 errors BEFORE and 33 AFTER;
  programmatic diff of (file, code, message) → **0 new, 0 changed**. All 33 are
  the pre-existing lane-sync drift (MaterialProfileRegistry members etc.).
- app `npx tsc --noEmit` → 34 errors, none in assistStream.ts / mentioning
  protocolEdit (purely additive interface; no baseline drift introduced).

App ai payload suites: assistStream.test.ts + draftPreview.test.ts → 26 passed.

## Assumptions & consequential notes (each deliberate)

1. **Worktree repair was required.** The fresh worktree was MISSING 62 files
   listed in `/home/brad/.hermes/cl/lanes/2/lane-exclude` (lane-synced
   untracked sources: materialRefFields.ts, createRecordIntent.test.ts, the
   golden suites' deps, etc.). Without them the tree cannot even import
   AgentOrchestrator (baseline: 135 failed files, tsc 50). I copied them FROM
   the cl-integration-2 checkout INTO my worktree (gitignored — never
   committed; worktree `git status` shows only my real changes). The first
   baseline measurement (135/221) predates the sync; ALL reported baselines are
   post-sync (121/266, tsc 33). The orchestrator should confirm this is the
   intended lane bootstrap.
2. **createRecordIntent.test.ts is lane-excluded** — it lives as a symlink into
   the computable-lab checkout. It pins the intent enum. I did NOT touch the
   trunk file (hard rule). I replaced the symlink IN MY WORKTREE with a local
   copy carrying the four-intent pin (gitignored, not committable).
   FOLLOW-UP REQUIRED for the orchestrator: the lane-exclude copy
   (`/mnt/vast/home/brad/git/computable-lab/server/src/ai/createRecordIntent.test.ts`,
   one-line enum update, shown in my worktree copy) must be synced before the
   merge or that suite goes RED post-merge. My exact local copy:
   `wt/PROTO-AI-7-lane2-l2t1605/server/src/ai/createRecordIntent.test.ts`.
3. **Prompt prose deliberately NOT extended with the new intent name.** The
   spec pointed at tool-description prose (updated). My first pass also added
   "protocol_edit" to FORCED_DRAFT_TOOL_INSTRUCTION / SUBMIT_SUGGESTION_INSTRUCTION
   — this BROKE the merged PROTO-AI-6 acceptance pin (`attachedProtocol.test.ts`:
   a no-attachment system prompt must not contain 'protocol_edit'; KV-cache
   byte-identical guarantee). Reverted; the four-intent vocabulary reaches the
   model via the tool-menu schema itself (request.tools, not the system
   message — outside the pin) plus the PROTO-AI-6 gated prompt region (not
   touched). Model discoverability when attached = tool enum + gated region;
   when NOT attached, protocol_edit is correctly unusable prose-wise as well.
4. `promptBudget.test.ts` was RED at baseline (41781 > 12000) and stays RED
   (pre-existing, not introduced; final instruction revert restores its exact
   baseline content; the tool-schema delta is +~1.9KB on a schema that already
   blew the budget 3x over at baseline). Flag for whoever owns that budget
   test — not in my scope to rebalance.
5. Emission rides the AgentResult (`result.protocolEdit`), which AIHandlers
   already spreads through the `done` event untouched (no handler change needed;
   verified no field-whitelist exists on that path).
6. The tool-schema `ops` item shape is deliberately permissive (mirrors op
   names/fields; ids as plain strings). The AUTHORITATIVE validation — patterns,
   oneOf anchors, settings array adjudication, unevaluatedProperties closure —
   is the registered schema at dispatch, proven by the object-settings test.
   Tightening the model-facing shape further is a prompt-tuning question for
   the campaign owner.
7. event_graph regression uses verb `mix` (not `add_material`): the existing
   material-clarification net drops an ungrounded add_material by design
   (pre-existing behavior, unrelated to this change).

## Out of scope honored

Schema envelope, prompt markdown, applier: untouched. UI: only the payload
TYPE landed (PROTO-AI-9 owns rendering). No second forced tool; tool_choice
still forces the one `agent_intent`.

## Resume / handoff state

- Merged-ready pending: orchestrator review + (a) the createRecordIntent.test.ts
  lane sync (note 2), (b) browser-review of the eventual PROTO-AI-9 surface —
  this lane had no UI, so no Playwright gate applies to THIS branch.
- Not merged, per task rules.
