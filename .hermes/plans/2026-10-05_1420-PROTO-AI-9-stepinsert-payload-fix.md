# PROTO-AI-9 in-scope repair spec — step_insert payload contract (architect decision 2026-10-05)

Task: PROTO-AI-9 (acceptance gate). Repair recorded under this task per persistence protocol §Decision
routing 3 (bounded in-scope repair; architect ruled WITHIN approved intent, no Brad amendment).
Decision of record: `decisions/PROTO-AI-9-stepinsert-payload-decision.md` (Option (i)).
Base: trunk `cl/integration-2` @ `bb48b96e`. Token: `l2t1420`.

## Problem (verified)
A `protocol_edit` `step_insert` with any `kind` except `other` is envelope-VALID but UNAPPLIABLE: the
inserted step matches no `protocol.schema.yaml` kind payload, so the apply PUT 422s deterministically
(zero write). `StepInsertOp` (protocol-edit-op.schema.yaml:170-200) cannot carry payload fields;
`StepWash`:946-960, `StepMix`:930-944, `StepIncubate`:962-978, `StepTransfer`:900-928,
`StepRead`:980-1007, `StepHarvest`:1009-1028, `StepAddMaterial`:860-897 all require payload the envelope
cannot express. The prompt (`event-graph-agent.md:125`) mirrors the envelope; the applier
(`protocolEditOps.ts:151-162`) builds `{stepId,label,kind,description?}` only.

## Fix (architect §3; do NOT deviate from the decision)
1. `schema/workflow/protocol-edit-op.schema.yaml` — rework `$defs.StepInsertOp`: keep
   op/anchor/label/kind/description + `unevaluatedProperties: false`; add per-kind payload properties +
   per-kind requiredness mirroring the record schema (architect §3.1 table: add_material, transfer, mix,
   wash, incubate, read, harvest, other). Per-kind requiredness via `allOf` `if/then` over locally
   declared properties that `$ref` shared shapes, OR the `$ref`-to-record-defs route (then
   `server/src/ai/protocolEditValidation.ts` `ENVELOPE_FILES` must gain `workflow/protocol.schema.yaml`
   + transitive deps). `labwareRole` must be `$ref: #/$defs/RoleId`; wells = WellSelector shape; numerics
   = Expr shape (or plain numeric if Expr is object-only). Do NOT leak `stepId`/`ordinal`/`settings`
   into the insert op. Header comment must record the ruling + mirrored line numbers ("copied, not
   invented" convention already in the file).
2. `server/prompts/event-graph-agent.md` — rewrite the `step_insert` line (:125) to
   `{ label, kind, afterStepId | beforeStepId, <per-kind payload fields> }` with a compact per-kind
   required list; extend Hard rules (:130-131): payload values (labwareRole/wells/materialRole/
   instrumentRole) must cite declared roles/ids in the ATTACHED PROTOCOL block or values the user
   stated; if a required value is unknown, ASK the user — never guess numbers or role names.
3. `server/src/ai/protocolEditValidation.ts` (+ `server/src/schema/ProtocolEditOpSchema.test.ts`) —
   ONLY if the `$ref` route is taken (ENVELOPE_FILES). Tests: per-kind ACCEPT fixtures (complete
   payload) + REJECT fixtures (missing one required payload field per kind → field-level path named;
   unknown property; roleId pattern violation) + the anchor `oneOf` regression.
4. `app/src/event-editor/right-pane/protocol/protocolEditOps.ts` — add the optional per-kind payload
   fields to the op type (exactOptionalPropertyTypes: absent OR value, never `undefined`); applier
   `step_insert` case builds `{stepId: mint(), label, kind, description?(+derived rich), ...payloadFields}`
   with EXPLICIT picks (never a spread of the op — op/anchor keys must not leak into the record).
   `insertProtocolStep`/ordinal handling unchanged. Mirror `server/src/ai/types.ts` only if it hand-rolls
   the op shape (envelope stays the authority).

## Out of scope (do NOT touch)
- `StepUpdateOp.kind` kind-change gap (architect §4) — separate tracking item; must not regress.
- Any other schema/lint/ui YAML; the intent dispatch; the ChangesPanel render contract (cosmetic payload
  diff is for the browser gate to judge).
- Brad's live tree, :3001/:5174, the AI profile; `cl-lane-stack.sh 2 restart` (BLOCKING — use only
  `status`).

## Verification (worker)
- `npm run test:run -w server` (or the targeted `ProtocolEditOpSchema.test.ts` + protocol_edit suites) —
  report NEW failures only.
- `npm run test:unit -w app -- --run protocolEditOps.test.ts` — report NEW failures only.
- `npm run typecheck -w server` and `-w app` — compare to baselines (server 33, app 47); report NEW only.
- Commit on the worktree branch; do NOT merge. Write the unique report (below).

## Acceptance (orchestrator, after merge)
- Envelope accepts a complete `step_insert kind:wash {label, kind, afterStepId, target, wells, cycles}`
  and rejects one missing `target`/`wells`/`cycles` with a field-level path.
- After `cl-lane-stack.sh 2 restart` (YAML change), the verbatim flow
  "add a wash step after step 3 and delete the redundant centrifuge step" on PRT-4iaey2 → Accept →
  rail renumbers, sha advances ONCE, no 422; `cl-browser-reviewer` vs :5193 → VERDICT: accept.
- Then PROTO-AI-9 may be marked done.

## Unique paths
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-9-stepinsert-lane2-l2t1420` (branch
  `wt/PROTO-AI-9-stepinsert-lane2-l2t1420`, off trunk `bb48b96e`).
- Worker log: `~/.hermes/cl/lanes/2/logs/PROTO-AI-9-stepinsert-l2t1420.log`.
- Worker report (UNIQUE): `.hermes/plans/PROTO-AI-9-stepinsert-report.wip-l2t1420.md`.
