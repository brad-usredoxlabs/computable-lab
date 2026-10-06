# PROTO-AI-9 in-scope repair — step_insert payload contract (token l2t1420)

Worker: cl-senior, lane 2, worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-9-stepinsert-lane2-l2t1420`
(branch `wt/PROTO-AI-9-stepinsert-lane2-l2t1420`, off `cl/integration-2` @ bb48b96e). No merge performed.

Authority read first: `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-stepinsert-payload-decision.md`
(architect Option (i), §3 dispatch). NOTE: the fix-spec file named in the dispatch
(`.hermes/plans/2026-10-05_1420-PROTO-AI-9-stepinsert-payload-fix.md`) does NOT exist at either
`~/.hermes/plans/` or the worktree's `.hermes/plans/` (verified with find). The architect decision
document + the dispatch's own §3 restatement are complete and were followed; flagging the missing
file for the orchestrator's bookkeeping, not as a work blocker.

## Route chosen: if/then over locally declared payload properties (architect's preferred mechanism)

Why:
- The architect named if/then "preferred"; the `$ref`-to-record-defs route would have loaded
  protocol.schema.yaml (the whole record schema: FAIRCommon, roles, phases, execution meta, the
  ProtocolStep base) into the ENVELOPE validator — a much larger dependency surface on the hot
  proposal path.
- Copy route chosen with drift control per the decision's mitigation: WellSelector/Expr are
  VERBATIM copies with provenance line comments, and `working_concentration`/`ratio` $ref the SAME
  shared datatype files the record payloads $ref
  (`./datatypes/concentration.schema.yaml`, `./datatypes/reference-ratio.schema.yaml` — resolving
  through the shared `$id` namespace to `schema/core/datatypes/*.yaml`, exactly how
  protocol.schema.yaml resolves them), so those vocabularies CANNOT drift.
- consequence: ENVELOPE_FILES in `server/src/ai/protocolEditValidation.ts` gained the two leaf
  datatype files (protocol.schema.yaml itself NOT loaded), mirrored in the ProtocolEditOpSchema
  test harness file list.
- All role slots (target/source labwareRole, material.materialRole, instrumentRole) are
  `$ref: #/$defs/RoleId` — no-fabrication: proposals can only cite declared-role-shaped ids.
- Ajv production config is `strict: true`; the per-kind `then` overrides on transfer source/target
  restate `type: object` (caught by the AgentOrchestrator.protocolEdit suite — the strict-mode
  failure is impossible in the strict:false schema-test harness, which is why running BOTH layers
  mattered).
- Per-kind requiredness is `allOf: [ { if: kind==X then required:[...] }, … ]`; the add_material
  `then` also mirrors the record `oneOf: [volume_uL | working_concentration]`. Record fields
  stepId/ordinal/settings are NOT declared on the op → the closed object
  (`unevaluatedProperties:false`) rejects any attempt to leak them.

## Per-kind field table implemented (● = required in the op)

| kind | payload fields |
|---|---|
| add_material | ●target{labwareRole}, ●wells, ●material{materialRole \| materialId} (anyOf, at least one), oneOf ●[volume_uL \| working_concentration], ratio?, wells uses WellSelector |
| transfer | ●source{labwareRole,●wells}, ●target{labwareRole,●wells}, ●volume_uL, working_concentration?, ratio? |
| mix | ●target{labwareRole}, ●wells, cycles?, volume_uL? |
| wash | ●target{labwareRole}, ●wells, ●cycles, washVolume_uL? |
| incubate | ●target{labwareRole}, ●duration_min, wells?, temperature_C? |
| read | ●target{labwareRole}, ●modality (enum copied from StepRead :995-997), wells?, channels?, instrumentRole? |
| harvest | ●source{labwareRole}, ●wells, volume_uL?, producesArtifactId? |
| other | ●description (mirrors StepOther) |

All numerics are the Expr shape (number | boolean | string | {param}) copied verbatim from
protocol.schema.yaml:654-667 — the record Expr is NOT object-only, so literals ride. wells are the
WellSelector oneOf copied verbatim from :612-649. Envelope header + StepInsertOp description record
the ruling and mirrored line numbers (:855-895, :897-924, :930-944, :946-960, :962-978, :980-1002,
:1009-1028, :1030-1037; WellSelector :612-649, Expr :654-667).

One deliberate envelope narrowing over the record (documented in the schema description): the
record's StepAddMaterial.material always requires materialRole; the op allows
{materialRole}\|{materialId} per the architect's §3.1 table ("at least one"). Every op-valid
payload still validates as a record step ONLY via materialRole — an insert proposing a bare
materialId will pass the envelope and fail the record PUT like any model-cited-but-invalid value;
the record schema stays the record authority. Flagging for the orchestrator: if the browser gate
shows the model emitting materialId-only inserts, tighten the envelope to materialRole-required.

## Changes (real diff summary, `git diff --stat`)

```
 app/src/event-editor/right-pane/protocol/protocolEditOps.test.ts    |  38 +++
 app/src/event-editor/right-pane/protocol/protocolEditOps.ts         |  58 ++++-
 schema/workflow/protocol-edit-op.schema.yaml                        | 260 +++++++++++++++-
 server/prompts/event-graph-agent.md                                 |   3 +-
 server/src/ai/AgentOrchestrator.protocolEditRecovery.test.ts        |   9 +-
 server/src/ai/coerceAgentIntent.test.ts                             |   6 +-
 server/src/ai/protocolEditValidation.ts                             |  13 +-
 server/src/schema/ProtocolEditOpSchema.test.ts                      | 164 +++++++++++-
 8 files changed, 538 insertions(+), 13 deletions(-)
```

Per file (architect §3 mapping):
- §3.1 `schema/workflow/protocol-edit-op.schema.yaml` — StepInsertOp reworked as above; new
  $defs WellSelector/Expr/InsertTarget/InsertSource/InsertMaterial (copied, provenance-commented).
- §3.2 `server/prompts/event-graph-agent.md` — :125 step_insert line rewritten to
  `{ label, kind, afterStepId | beforeStepId, <per-kind payload fields> }` with the compact
  per-kind REQUIRED/OPTIONAL list; Hard rules extended: payload values must cite roles/ids DECLARED
  in the ATTACHED PROTOCOL block or values the user stated; unknown required value → ASK the user,
  never guess numbers or role names. (attachedProtocol.test.ts string pins verified to still pass.)
- §3.3 `server/src/ai/protocolEditValidation.ts` — ENVELOPE_FILES += the two datatype leaves
  (required by the shared-$ref hybrid of the copy route). Test harness list mirrored.
  `server/src/schema/ProtocolEditOpSchema.test.ts` — RED-FIRST additions: per-kind complete-payload
  ACCEPTs (8 kinds) + add_material working_concentration arm; drop-one-required-field REJECTs
  asserting `/ops/0` + `missingProperty == field` (10 pairs); add_material neither-quantity-arm
  REJECT; unknown property REJECT; labwareRole/materialRole pattern-violation REJECTs at
  `/ops/0/target/labwareRole` and `/ops/0/material/materialRole` (note: the envelope RoleId pattern
  permits underscores — the existing test's old "underscore" example is an ACCEPT case, so the new
  rejects use 'Plate'/'plate reader'); stepId/ordinal leak REJECT; malformed WellSelector REJECT at
  `/ops/0/wells`; modality enum REJECT at `/ops/0/modality`; anchor oneOf regressions kept
  (both-anchors and no-anchor reject; no-anchor fixture given a full wash payload so anchor is
  the ONLY failure).
- §3.4 `app/.../protocolEditOps.ts` — ProtocolEditOp step_insert arm gained the optional payload
  fields via `InsertPayloadFields` (absent OR value; app tsconfig has no exactOptionalPropertyTypes
  — that flag is server-side — but the applier never writes undefined: it copies only defined
  fields). Applier builds `{ stepId: mint(), label, kind, description?(+derived rich), ...picks }`
  with EXPLICIT picks over the declared INSERT_PAYLOAD_FIELDS list — never a spread of the op, so
  op/anchor keys cannot leak. insertProtocolStep/ordinal untouched. `server/src/ai/types.ts`
  checked: `protocolEdit?: { ops: unknown[] }` — an opaque schema-owned array, NOT a hand-rolled
  op mirror → no change (as §3.4 directs).
- Fixtures moved to the new contract (payload-less wash inserts are envelope-INVALID by design):
  AgentOrchestrator.protocolEditRecovery.test.ts LIVE_OPS and coerceAgentIntent.test.ts wash ops
  now carry the complete wash payload.

## RED → GREEN evidence

RED (before schema implementation):
- `npx vitest run src/schema/ProtocolEditOpSchema.test.ts` → **24 failed | 28 passed** (every new
  payload fixture failing under the old op shape).
- `npx vitest run src/event-editor/right-pane/protocol/protocolEditOps.test.ts` (app) →
  **2 failed | 16 passed** (the two new payload-passthrough tests).

GREEN (after implementation):
- `npx vitest run src/schema/ProtocolEditOpSchema.test.ts` → 52 passed (52).
- targeted protocol_edit server batch (`vitest run` over ProtocolEditOpSchema, AgentOrchestrator.
  protocolEdit, AgentOrchestrator.protocolEditRecovery, coerceAgentIntent, attachedProtocol,
  submitSuggestionTool.protocolEdit, submitSuggestionTool, coerceDraftArgs, shadowTelemetry) →
  **9 files / 119 tests, ALL PASS**. (Intermediate run caught the Ajv strict-mode issue → fixed.)
- `npm run test:unit -w app -- --run protocolEditOps.test.ts ChangesPanel.test.tsx AiTabPanel.protocolEdit.test.tsx`
  → **3 files / 39 tests, ALL PASS** (ChangesPanel render contract untouched, no regression).

Full-suite NEW-failure check (honest accounting): `npm run test:run -w server` reports
282 failed / 4442 passed / 70 skipped. Baseline captured by STASHING my changes and re-running the
full server suite on pristine bb48b96e: **282 failed** — the failing-file sets are IDENTICAL (diff
shows one baseline-only flake, src/foundry/FoundryPdfCollector.test.ts, which PASSED with my
changes; the failures are environmental: pipeline/fixture paths resolving outside the worktree,
missing tmp registries, appliance/seed availability). NEW server failures: **zero**. All 9
protocol_edit suites pass explicitly (above), which is the load-bearing targeted evidence.

## Typecheck compare (NEW only)

- server: baseline (pristine) 44 `error TS` lines; after 44; `diff` → identical. NEW: 0.
  (Task said baseline 33; the pristine tree here measured 44 — same-file breakdown
  RecordStoreImpl 14 / AgentOrchestrator 8 / SequenceService 5 / …; all pre-existing, none in
  touched files. Reported as measured, not as briefed.)
- app: baseline 40; after 40; `diff` → identical. NEW: 0. (Task said 47; measured 40.)

## Out-of-scope respected

StepUpdateOp.kind kind-change gap untouched (still open — see architect §4 residual risk; needs its
own orchestrator tracking item). No other schema/lint/ui YAML, no intent dispatch, no ChangesPanel
render change, no :3001/:5174, no AI profile, no lane-stack restart. Brad's live tree untouched.

## Blockers

None blocking. Two bookkeeping notes for the orchestrator:
1. The dispatch's fix-spec file does not exist on disk (paths checked above); the architect
   decision doc governed.
2. Re-verification (architect §3.5: :3093 restart + verbatim acceptance on PRT-4iaey2 + browser
   receipts) is the orchestrator/browser-reviewer gate — YAML edits need the restart to reload
   under tsx --watch (lane note); my pass is NOT the acceptance gate.
