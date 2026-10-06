# PROTO-AI-2/AI-8 in-scope repair spec — StepUpdateOp kind-change payload contract

Task class: PROTO-AI-9's own in-scope repair class (acceptance gate), recorded under **PROTO-AI-2**
(op vocabulary / envelope) + **PROTO-AI-8** (applier) per the architect decision §2. Authority:
`decisions/PROTO-AI-9-stepupdate-kindchange-decision.md` (Option (i) RELAXED, 2026-10-05). Base: trunk
`cl/integration-2`. Token: `l2t1600` (assign a fresh token at dispatch).

## HARD SEQUENCING (binding)
Dispatch ONLY AFTER the in-flight `step_insert` repair (worker l2t1420) has MERGED into
`cl/integration-2`. This change edits the SAME files (envelope `StepUpdateOp` region, prompt line :124,
envelope test file). Rebasing before the insert merge invites conflicts on insert-owned regions.
Nothing here touches `StepInsertOp`, its prompt line (:125), or its tests.

## Problem (architect-verified against source; orchestrator spot-checked)
`StepUpdateOp` (`schema/workflow/protocol-edit-op.schema.yaml`:136-168) declares `kind`
(`$ref #/$defs/StepKind`) with `unevaluatedProperties: false` and NO per-kind payload props; the applier
(`app/src/event-editor/right-pane/protocol/protocolEditOps.ts:147`) sets `changes.kind = op.kind` only.
So `step_update { stepId, kind: <non-other> }` on a step lacking the new kind's required payload is
envelope-VALID but UNAPPLIABLE (record PUT 422, zero write) — and the redraft loop CANNOT succeed
because the envelope refuses the fix. D3 grants AI kind editing → gap in a granted capability.

## Fix (architect §3/§4; do NOT deviate)
1. `schema/workflow/protocol-edit-op.schema.yaml` — extend `$defs.StepUpdateOp` (touch ONLY this region
   + appended `$defs`; NEVER `$defs.StepInsertOp`):
   - keep `required: [op, stepId]`, `unevaluatedProperties: false`, existing props.
   - add `allOf:` one branch per kind:
     `if: { required: [kind], properties: { kind: { const: <kind> } } }` → `then: { properties: {
     <that kind's payload props> } }` (NO `then.required`). The `required: [kind]` in each `if` is
     MANDATORY (else a properties-only `if` matches when `kind` is absent and the wrong whitelist applies).
   - per-kind whitelists COPY the record payload props (copied route, NOT `$ref` into
     `protocol.schema.yaml`; `ENVELOPE_FILES` stays as-is — zero new $ref deps):
     add_material: target{labwareRole:`$ref #/$defs/RoleId`}, wells, material{materialRole, materialId?},
       volume_uL, working_concentration, ratio
     transfer: source{labwareRole, wells}, target{labwareRole, wells}, volume_uL, working_concentration,
       ratio, mappingHint
     mix: target{labwareRole}, wells, cycles, volume_uL
     wash: target{labwareRole}, wells, cycles, washVolume_uL
     incubate: target{labwareRole}, wells, duration_min, temperature_C
     read: target{labwareRole}, wells, modality(enum copied from StepRead :997), channels,
       instrumentRole (NOT read's object `settings` — array adjudication stands)
     harvest: source{labwareRole}, wells, volume_uL, producesArtifactId
     other: (no payload props)
   - copy `WellSelector` (:612-649) / `Expr` (:654-660) shapes into envelope `$defs` with provenance
     line-number comments ("copied, not invented" convention already in the file).
   - add envelope `$defs/StepPayloadFields` (kind → allowed-payload-field lists as DATA), header-commented
     "mirrored by the applier; parity asserted in ProtocolEditOpSchema.test.ts".
   - header comment records the ruling + provenance line numbers + the §4 superseded-field disposition.
2. `server/prompts/event-graph-agent.md` — rewrite ONLY line :124 (the insert repair owns :125):
   payload fields are proposable ONLY together with a new `kind`; include ONLY the new kind's fields the
   user's request actually changes (values already on the step need no restatement); cite declared roles
   only; unknown required value → ask in the review dialogue, never guess numbers.
3. `server/src/ai/protocolEditValidation.ts` — expected NO-OP (copied route keeps `ENVELOPE_FILES`
   :34-37 unchanged). Verify only.
4. `app/src/event-editor/right-pane/protocol/protocolEditOps.ts`:
   - type :65: add optional per-kind payload fields (exactOptionalPropertyTypes — absent OR value,
     never `undefined`).
   - `step_update` case :139-149: when `op.kind` present, REBUILD the changed step as
     `{ ...baseFields, kind: op.kind, ...explicitPayloadPicksFromOp }` where baseFields = stepId, label,
     ordinal, description, descriptionRichText?, notes, settings, executionMeta, isOptional, phaseId,
     phase, plannedOffset, semanticVerb, methodRequirement, executionPreference, subGraphRef
     (everything ProtocolStep :752-839 declares OUTSIDE payloads); superseded payload cleanup per §4.
     When `op.kind` ABSENT: EXACT current behaviour, byte for byte.
   - payload-key SUPERSET + per-kind allow-sets mirrored from envelope `$defs/StepPayloadFields`
     (explicit picks, never a spread of the op). `server/src/ai/types.ts:732` keeps `ops` opaque.
5. **Superseded-field disposition (architect §4):** on a kind change, DROP every payload field NOT
   allowed by the NEW kind's per-kind set; keep base fields untouched. wash→mix KEEPS `cycles`
   (mix's optional) but drops `washVolume_uL`; any→other wipes all payload.

## Out of scope (do NOT touch)
- `StepInsertOp` / its prompt line :125 / its tests (in-flight repair l2t1420 owns them).
- The `kind→read` + object-`settings` pre-existing hazard (architect §5 — separate tracking item).
- Any other schema/lint/ui YAML; the intent dispatch; the ChangesPanel render contract.
- Brad's live tree, :3001/:5174, the AI profile; `cl-lane-stack.sh 2 restart` (BLOCKING — use `status`).

## Verification (worker, RED-first)
- `server/src/schema/ProtocolEditOpSchema.test.ts`:
  ACCEPT `{stepId, kind:'incubate', duration_min:720}` (delta-only, no target — the relaxed signature
  case); `{stepId, kind:'other'}`; `{stepId, kind:'wash', target:{labwareRole:'plate'}, wells:…, cycles:3}`.
  REJECT: payload field WITHOUT `kind`; wrong-kind field with kind (`{kind:'wash', duration_min:30}`);
  unknown field; `kind:'read'` with an OBJECT `settings`.
  DRIFT lock: a test asserting `$defs/StepPayloadFields` per-kind sets == the required+optional payload
  props of the corresponding `protocol.schema.yaml` defs (parse both files).
- `app/.../protocolEditOps.test.ts`: (a) wash→incubate: `duration_min` applied, `washVolume_uL` dropped,
  `target`/`wells` kept, `cycles` dropped; (b) wash→mix: `cycles` KEPT, `washVolume_uL` dropped;
  (c) label-only update byte-identical to today (ordinary-edit regression guard; reuse existing fixtures);
  (d) mix→other wipes all payload, keeps `description`.
- `npm run test:run -w server` (targeted) + `npm run test:unit -w app -- --run protocolEditOps.test.ts`
  — report NEW failures only. `npm run typecheck -w server` (baseline 33) and `-w app` (baseline 47).
- Commit on the worktree branch; do NOT merge. Write the unique report.

## Acceptance (orchestrator, after merge)
- Envelope accepts the delta-only incubate case; rejects wrong-kind / no-kind payload with a field-level path.
- `cl-lane-stack.sh 2 restart` (YAML change; BLOCKING → background=true) then browser-gate on :5193
  (architect §3.6): (1) "change step N from wash to incubate overnight" → proposal carries kind +
  duration_min → Accept → rail shows incubate, superseded wash fields gone, sha advances once;
  (2) wash→mix Accept keeps cycles; (3) negative: wrong-kind payload → envelope rejection feeds the
  review dialogue, no broken Accept; (4) an ordinary text edit still accepts cleanly. VERDICT: accept.

## Unique paths (assign a fresh token at dispatch)
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-2-stepupdate-lane2-<token>` (branch off trunk).
- Worker log: `~/.hermes/cl/lanes/2/logs/PROTO-AI-2-stepupdate-<token>.log`.
- Worker report (UNIQUE): `.hermes/plans/PROTO-AI-2-stepupdate-report.wip-<token>.md`.