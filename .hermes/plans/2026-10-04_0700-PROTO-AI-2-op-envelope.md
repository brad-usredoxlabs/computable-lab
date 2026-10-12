# PROTO-AI-2 — Declarative op envelope: `protocol-edit-op.schema.yaml` (+ lint)

Lane 2 · campaign ai-protocol-edit-and-router · trunk `cl/integration-2`.
Worker: `cl-senior` in worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-2-lane2-l2t1791110117`
(branch `wt/PROTO-AI-2-lane2-l2t1791110117`, off trunk tip). Author: orchestrator, tick 2026-10-04T06:50.

## Goal
Author the ONE declarative contract that a `protocol_edit` proposal must satisfy:
`schema/workflow/protocol-edit-op.schema.yaml` — a registered JSON Schema (discovered by
`SchemaLoader`'s `*.schema.yaml` pattern under `schema/`, `$id` following the repo
convention `https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml`,
same family as `protocol.schema.yaml`). Commodity rule: op vocabulary and per-op field
policy are DATA, never a TS switchboard. This schema is consumed by (a) the model prompt
(PROTO-AI-6), (b) the server validator in the `protocol_edit` dispatch branch (PROTO-AI-7),
(c) the reviewer render (PROTO-AI-9), (d) the applier (PROTO-AI-8). Drift between the four
is the failure mode this file exists to prevent.

## Orientation (do NOT re-explore — from `.hermes/plans/PROTO-AI-1-grounding-map.md`)
- Envelope: a PROPOSAL, never a record. `{ protocolId?, ops: [...] }`.
- Op set: `step_update` `{stepId, label?, description?, notes?, kind?, settings?}`;
  `step_insert` `{afterStepId?|beforeStepId?, label, kind, description?}`;
  `step_delete` `{stepId}`; `labware_add|labware_update|labware_delete`
  `{roleId, description?, expectedLabwareKinds?[]}`; `equipment_*` identical against
  `instrumentRoles`.
- kind enum EXACTLY: `add_material | transfer | mix | wash | incubate | read | harvest | other`
  (map §(c): base ProtocolStep kinds; also `schema/workflow/protocol.schema.yaml:844-853`).
- stepId pattern `^[a-z][a-z0-9-]*$` (map §(b), `protocol.schema.yaml:753-755`).
- roleId pattern: match how `LabwareRole.roleId` / `InstrumentRole.roleId` are declared in
  `schema/workflow/protocol.schema.yaml` (~`:166-192`, `:424-435`) — read the file and copy
  the exact pattern, do not invent one.
- `expectedLabwareKinds` items are labware-DESIGN record ids (map §(c)/(e)).
- settings shape: reuse the EXISTING `$ref` to `setting.schema.yaml` — do NOT re-declare.
  `setting.schema.yaml` authority: required `[settingId,label,type]` (`:13-17`), `settingId`
  pattern `^[a-z][a-z0-9-]*$` (`:20-22`), 9-value `type` enum (`:34-35`), `unevaluatedProperties:false` (`:11`).
- NO concrete-instance object/ref anywhere in the envelope (D2). `unevaluatedProperties: false`
  at EVERY object level.

## Adjudication you OWN (map open question 6) — encode + document in a header comment
The `read`-step settings contradiction (base `ProtocolStep.settings` = array of Setting[]
`protocol.schema.yaml:823-829` vs `StepRead.settings` = object `:1004-1007`). RULE for this
envelope: `step_update.settings` is ALWAYS the array form (`Setting[]`, `$ref
setting.schema.yaml`), uniform across every kind. The `StepRead` object form is a
realization artifact, not a protocol edit target; an op carrying an object for `settings`
must be REJECTED. State this ruling in the schema's `description` header.

## Deliverables (unique output paths — yours alone)
- `schema/workflow/protocol-edit-op.schema.yaml` (new).
- `schema/workflow/protocol-edit-op.lint.yaml` (new) — ONLY for rules the schema cannot
  express. Known one: a `description` edit must keep `descriptionRichText` in sync /
  consistent with the protocol's text convention (map §(e) note). If you can express it
  purely in schema, skip the lint file; if you write it, follow `LintSpecLoader`'s format
  (`lintVersion: 1`, `rules:` with id/title/assert/message/scope/severity) exactly.
- `server/src/schema/ProtocolEditOpSchema.test.ts` (new) — RED-first contract tests, harness
  style copied from `server/src/schema/ProtocolProseFieldsSchema.test.ts` (SchemaRegistry +
  `loadSchemasFromContent` + `createValidator` over `schema/`): include the new file plus
  every `$ref` dependency (`setting.schema.yaml`, `core/datatypes/*` it pulls).
- A short worker report at `.hermes/plans/PROTO-AI-2-report-wip-l2t1791110117.md`
  (summary of the ruling, the exact validation error paths, and any open question).

## Acceptance (exact)
RED-first: write the failing expectations first, then the schema, then green. Tests must
prove — each valid op form passes; and each of these is REJECTED with the OFFENDING PATH
named in the Ajv error:
1. unknown op name; 2. unknown field at any level; 3. malformed `stepId`/`roleId`
(uppercase, underscore, leading digit); 4. an inline concrete-instance object anywhere
(e.g. `{roleId, instanceRef}` on a labware op, or `settings` as an object); 5. `kind` outside the enum.
Then: `npm run typecheck -w server` — no NEW type errors.
Report the real command output in the worker report.

## Boundaries
Touch ONLY the files above. Do NOT edit `protocol.schema.yaml`, `setting.schema.yaml`,
`LintEngine.ts`, or any app code. No git commits (orchestrator owns git). No dev-stack restart
needed (schema-only; the runner verifies via the unit suite, not the live stack).

## Open questions (resolve if cheap, else flag in report)
- Whether `protocolId` on the envelope is required (recommend optional; the attached-protocol
  scope already binds it — PROTO-AI-6/9).
- Exact roleId pattern (copy from protocol.schema.yaml, do not choose).