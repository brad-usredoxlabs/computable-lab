# PROTO-AI-2 worker report — protocol_edit op envelope (wip-l2t1791110117)

Worker: cl-senior · worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-2-lane2-l2t1791110117`
(branch `wt/PROTO-AI-2-lane2-l2t1791110117`, HEAD `46539270`). No git commands run
against the tree beyond `git status`/`git log` reads. No files outside the worktree touched.

## Files changed (all NEW; nothing else touched)

1. `schema/workflow/protocol-edit-op.schema.yaml` — the op envelope. Registered
   JSON Schema (`$id: https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml`,
   discovered by SchemaLoader's `*.schema.yaml`). Envelope `{protocolId?, ops[>=1]}`;
   discriminator-closed op union `step_update | step_insert | step_delete |
   labware_add|update|delete | equipment_add|update|delete`; `unevaluatedProperties:false`
   at EVERY object level (D2); settings items `$ref ./setting.schema.yaml` (no
   re-declaration); kind enum copied verbatim from protocol.schema.yaml:773;
   stepId pattern copied verbatim from :755. Header comment encodes the rulings below.
2. `schema/workflow/protocol-edit-op.lint.yaml` — `lintVersion: 1`, `rules: []`.
   Follows the `protocol.lint.yaml` precedent: the one known non-schema rule
   (`step-description-richtext-sync` — post-apply plain/rich text consistency)
   needs array quantification + path-to-path equality that the predicate DSL
   (exists/nonEmpty/regex/equals/in/all/any/not) does not support, so it is
   documented as an intended rule pending the PROTO-AI-3 DSL extension.
   Deliberately NO executable rule authored (writing a fake passing rule would
   be worse than none).
3. `server/src/schema/ProtocolEditOpSchema.test.ts` — RED-first contract suite,
   harness copied from `ProtocolProseFieldsSchema.test.ts` (SchemaRegistry +
   `loadSchemasFromContent` + `createValidator({strict:false})`), loading ONLY
   `protocol-edit-op.schema.yaml` + its `$ref` dependency `setting.schema.yaml`
   (setting.schema.yaml has no further $refs — verified by its file contents).

## Rulings implemented (encoded in the schema header comment)

- SETTINGS ADJUDICATION (map open question 6): `step_update.settings` is ALWAYS
  the array form `Setting[]` ($ref setting.schema.yaml), uniform across every
  kind. `StepRead.settings`-as-object (protocol.schema.yaml:1004-1007) is a
  realization artifact, NOT an edit target; an op carrying an object for
  `settings` is REJECTED at `/ops/<i>/settings` (type error), including
  `kind: read`. Test: 'REJECTS settings given as an OBJECT … even for kind=read'.
- RICH TEXT (map §(e)): `descriptionRichText` is NOT an op field — closed op
  objects reject it; applier (PROTO-AI-8) derives it; post-apply guard declared
  in the lint file.
- protocolId OPTIONAL (spec recommendation adopted): attached-protocol scope
  binds the target; field is the out-of-scope override.
- roleId pattern: `LabwareRole.roleId`/`InstrumentRole.roleId` are declared
  plain `type: string` with NO pattern (protocol.schema.yaml:429-431, :461-463),
  so there was nothing to copy verbatim. The envelope pins the SAME symbolic-id
  convention the base file uses for every other local id (stepId :755, phaseId
  :789, variantId :729, phases[].id :320, InputContext.role :526):
  `^[a-z][a-z0-9-]*$`. This is what the spec's acceptance list demands
  (uppercase/underscore/leading-digit roleIds must be rejected). NOTE flagged
  in-schema and below.

## Validation error paths proven by the tests (Ajv instancePath via AjvValidator.convertAjvError)

| Rejection | Offending path(s) named in errors |
|---|---|
| unknown op name | `/ops/0/op` (enum at EditOp; the bare discriminator reports only `/ops/0`, so the op enum is pinned at the union level too) |
| unknown field, envelope level | `/` (unevaluatedProperties) |
| unknown field, inside an op | `/ops/0` (params.unevaluatedProperty names the field — Ajv reports `unevaluatedProperty`, not `additionalProperty`, for closed-by-unevaluated objects) |
| unknown field, inside a settings entry | `/ops/0/settings/0` |
| malformed stepId (uppercase/underscore/leading digit) | `/ops/0/stepId` (pattern) |
| malformed roleId (uppercase/underscore/leading digit) | `/ops/0/roleId` (pattern) |
| inline concrete-instance object (`instanceRef` on labware op) | `/ops/0` + params.unevaluatedProperty='instanceRef' |
| settings as OBJECT (even kind=read) | `/ops/0/settings` (type: array expected) |
| kind outside enum | `/ops/0/kind` |
| both anchors / no anchor on step_insert | rejected (oneOf required pair); empty ops → `/ops`; ops not array → `/ops`; step_update w/o stepId → `/ops/0` (required) |

## Commands + REAL output tails

RED (schema file absent, tests authored first):
`npm run test:run -w server -- src/schema/ProtocolEditOpSchema.test.ts`
```
 Test Files  1 failed (1)
      Tests  22 failed (22)
Error: ENOENT: no such file or directory, open '.../schema/workflow/protocol-edit-op.schema.yaml'
```

GREEN (target suite, worktree root):
`npm run test:run -w server -- src/schema/ProtocolEditOpSchema.test.ts`
```
 ✓ src/schema/ProtocolEditOpSchema.test.ts  (22 tests) 425ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Full suite (as instructed): `npm run test:run -w server`
```
 Test Files  120 failed | 476 passed | 9 skipped (605)
      Tests  263 failed | 4247 passed | 68 skipped (4798)
```
PRE-EXISTING, not introduced here — proven by baseline diff: with my three files
REMOVED, the same suites still fail identically (schema-dir discovery:
`integration.test.ts`/`SchemaRegistry.test.ts` → same 5 failures; sampled
`InferenceClient.config`/`Api.test`/`FixtureRunner`/`analysisService` → 3
failures on baseline; e.g. Api.test fails with "Hook timed out in 10000ms"
environment issues; integration.test.ts resolves `join(process.cwd(),'schema')`
which does not exist under `-w server`). My target suite passes 22/22 alongside;
`ProtocolProseFieldsSchema`, `studyRunRules`, `IdShape` remain green with my
schema present (checked together: 69 passed, the only 5 failures = the
pre-existing baseline ones).

Typecheck: `npm run typecheck -w server`
```
33 error TS lines — 0 mention ProtocolEditOp;
baseline WITHOUT my files: also exactly 33 error TS lines (identical).
```
No NEW type errors. All 33 are pre-existing trunk breakages
(AgentOrchestrator/MaterialProfileRegistry drift, RecordStoreImpl gitCommit,
lint AuthoringPolicy exports, revisions actor, etc.).

## Open questions for the orchestrator

1. **Underscore roleIds exist in the tree.** Real fixtures/roles use
   `plate_reader`, `reagent_reservoir`, `primary_sample_plate` (grep counts: 5,
   5, 5), and the base InstrumentRole's own doc example is `'plate_reader'`
   (protocol.schema.yaml:463). The envelope's pinned `^[a-z][a-z0-9-]*$` REJECTS
   those roleIds in ops. This follows the spec's acceptance list verbatim
   (underscore roleId must be rejected), but PROTO-AI-6's prompt must steer the
   model to exact declared roleIds, and if existing protocols legitimately carry
   underscore roleIds the applier/reviewer will hit envelope rejections on them.
   Decision needed: relax the roleId pattern (needs spec change), normalize
   existing roleIds, or accept. NOT resolved here — pattern kept per spec.
2. equipment_* field naming: the spec said "equipment_* identical against
   instrumentRoles"; InstrumentRole's third field is `allowedInstrumentIds`
   (NOT expectedLabwareKinds), so equipment ops carry `allowedInstrumentIds`.
   Implemented so; flag if the prompt (PROTO-AI-6) was written assuming
   `expectedLabwareKinds` on equipment ops.
3. Lint file ships `rules: []` with the one intended rule documented (mirrors
   protocol.lint.yaml's exact precedent). It becomes executable when PROTO-AI-3
   adds array quantification + path-to-path equality to the predicate DSL.
4. Duplicate-`op`-shape note: `EditOp` pins the op vocabulary as an enum at the
   union so unknown ops report at `/ops/<i>/op`; per-op branches still use
   `discriminator` (Ajv runs with `discriminator:true`) for precise per-branch
   errors. This is intentional error-path ergonomics, not drift.

## Integrity notes

- Three deliverable files only: `git status --short` (minus node_modules noise)
  shows exactly the three `??` paths above. No modifications to any existing
  file. No git add/commit/checkout/stash. No dev-stack touched.
- Final file hashes (post-restore verification): schema 3c8067e8…, lint
  79b2a714…, test 192d618a…; target suite re-run green after restore.

## FIX (roleId pattern) — orchestrator review defect

Defect: the envelope's RoleId pattern `^[a-z][a-z0-9-]*$` was too strict and
rejected the repository's real roleIds (data records carry underscores and
leading digits: instrument_centrifuge, labware_96_well_plate,
material_lysis_buffer, toppling_medium, plate_reader, 10-sds, 20-sds,
96-100-ethanol; LabwareRole/InstrumentRole.roleId are plain `type: string`
with NO pattern in protocol.schema.yaml).

Fix applied (2 files only):
1. schema/workflow/protocol-edit-op.schema.yaml — RoleId $def pattern ->
   `^[a-z0-9][a-z0-9_-]*$` (lowercase letters, digits, hyphen, underscore;
   may start with a digit or underscore; uppercase/spaces/punctuation
   rejected). Header IDENTIFIER PATTERNS block and RoleId description
   rewritten: the pattern is COPIED to MATCH the real roleId vocabulary in
   the data records because the base schema leaves roleId unconstrained.
   StepId pattern untouched (`^[a-z][a-z0-9-]*$`, all real stepIds compliant).
2. server/src/schema/ProtocolEditOpSchema.test.ts — roleId tests updated:
   ACCEPTS 'plate_reader', '10-sds', '96-100-ethanol'; REJECTS 'Plate'
   (uppercase), 'Plate Reader' (space), 'role!' (punctuation) at
   /ops/0/roleId. All other tests unchanged.

Test output tail (real run):

    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/PROTO-AI-2-lane2-l2t1791110117/server

     ✓ src/schema/ProtocolEditOpSchema.test.ts  (25 tests) 554ms

     Test Files  1 passed (1)
          Tests  25 passed (25)
