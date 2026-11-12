# L2-JOURNEY-PORTS-1 — unit u1vocab (lane 2)

Worktree: /home/brad/cl-wt/L2-JOURNEY-PORTS-u1vocab-lane2
Branch: cl/lane2-journeyports-u1vocab-2249
Base (verified at STEP 0): d454d41814b67fa7794e0a10d5b10f4a4cfee84c, tree clean.

## Scope delivered (exactly the two owned files)

- `schema/workflow/journey-port.schema.yaml` (NEW, 86 lines) — draft 2020-12 vocabulary
  schema, `$id https://computable-lab.com/schema/computable-lab/journey-port.schema.yaml`,
  one `$defs` entry per port: SequenceSetReference, AlignmentReference, MaterialReference,
  LabwareDefinitionReference, CommittedRecordReference, StagedDraftReference.
  Every def is `type: object`, `additionalProperties: false`, and requires `version`
  plus its own fields. `CommittedRecordReference` requires `receipt_id`;
  `StagedDraftReference` declares only `draft_id` (+ `version`), so the closed shape
  refuses both `receipt_id` and `record_id`. Root is closed as well and is documented
  as a vocabulary container (callers validate `#/$defs/<Port>`).
- `server/src/schema/JourneyPortSchema.test.ts` (NEW, 213 lines) — `// @vitest-environment node`,
  harness identical to ControlledDocumentSchemas.test.ts (real `loadAllSchemas(schema/)`
  → `createSchemaRegistry` → `createValidator`), 9 tests.

Total 299 lines, 2 files (budget: <=2 files, <=300 lines).

## Layer-vocabulary decision (REVIEWER BAIT 1)

The item text glosses layers as `concept | formulation | instance | aliquot | composition`.
The SHIPPED registry (`schema/lab/material-profile.registry.yaml`, `clarification.layers`
keys at lines 27-51) declares `material, material-spec, material-instance, aliquot,
vendor-product`, and its header says the hierarchy "must never be collapsed".
The enum uses the REGISTRY's five keys. No synonym, no gloss name, no `composition`.
Test (d) sorts and compares the enum to the registry keys, so either side gaining or
losing a layer fails loudly.

## Hardcode boundary (REVIEWER BAIT 2)

No field, port-kind or layer literal in TypeScript beyond the schema `$id` and the six
`$defs` keys used to locate fixtures. Fixtures are derived at runtime from the schema
document: `required` lists, declared property-key sets (`Object.keys(properties)`) and
`enum[0]`. The committed-vs-staged distinction is derived as
`properties(CommittedRecordReference) \ properties(StagedDraftReference)`; the test
asserts that every such distinguishing property is REQUIRED by the committed port
(this is what pins `receipt_id`), then deletes each from a fully-populated payload.
The material layer key is located as "the single enum-bearing property".
Rejection assertions check the Ajv error `keyword` + `params` (`missingProperty`,
`additionalProperty`, `allowedValues`) and the instancePath, so no rejection is vacuous.

## Verification (raw)

Targeted test:
```
 ✓ src/schema/JourneyPortSchema.test.ts  (9 tests) 334ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

RED proof before the schema existed (test written first):
```
 FAIL  src/schema/JourneyPortSchema.test.ts > journey port vocabulary schema > ...
TypeError: Cannot read properties of undefined (reading 'schema')
 ❯ doc src/schema/JourneyPortSchema.test.ts:84:58
 Test Files  1 failed (1)
      Tests  9 failed (9)
```

Mutation probe 1 — `aliquot` -> `aliquots` in MaterialReference's enum, then reverted:
```
Array [
-   "aliquot",
+   "aliquots",
    "material",
    "material-instance",
    "material-spec",
    "vendor-product",
  ]
 ❯ src/schema/JourneyPortSchema.test.ts:211:26
      Tests  1 failed | 8 passed (9)
```
Reverted; restored schema line is
`schema/workflow/journey-port.schema.yaml:56 enum: [material, material-spec, material-instance, aliquot, vendor-product]`.

Mutation probe 2 — dropped `receipt_id` from the CommittedRecordReference `required`
list, then reverted. (First attempt did NOT fire: the deletion fixture was derived from
`required`, so removing `receipt_id` from `required` also removed it from the fixture —
vacuous. Fixed by populating EVERY declared property into the deletion fixture and
deriving the rule as "every committed-only property must be required".)
```
 FAIL  ... > requires every committed-only property a staged draft must never carry (the receipt)
AssertionError: CommittedRecordReference.required: expected [ 'version', 'record_id', …(1) ] to include 'receipt_id'
 ❯ src/schema/JourneyPortSchema.test.ts:168:62
      Tests  1 failed | 8 passed (9)
```
Reverted; restored line is
`journey-port.schema.yaml:73 required: [version, record_id, record_type, receipt_id]`.
Post-revert run: `Tests  9 passed (9)`.

Regression proof (new file under `schema/` must not disturb discovery):
```
cd server && npx vitest run src/schema/ControlledDocumentSchemas.test.ts
Test Files  1 failed (1)
     Tests  11 failed | 11 passed (22)
```
IMPORTANT — this is PRE-EXISTING at the base sha and NOT caused by this unit.
A/B proof: with `schema/workflow/journey-port.schema.yaml` moved aside (out of `schema/`)
the identical run gives `Tests  11 failed | 11 passed (22)` — same 22-test total, same
11 failures (the fixture test file never changed). The cause is a missing `$ref` target
in the trunk itself: `schema/core/datatypes/revision-ref.schema.yaml` does not exist in
this tree, while `schema/lab/controlled-document.schema.yaml:90`,
`schema/governance/signature.schema.yaml:58`, `schema/workflow/event-graph.schema.yaml:17`
and `schema/workflow/protocol.schema.yaml:327` reference it
(`git ls-files | grep revision-ref` finds only
`.hermes/plans/2026-10-24_1730-REVISION-REF-HARNESS-1-spec.md`). Other lane trees carry
that file; this base does not. The brief's composer-measured baseline (22 passed) is
therefore stale/unreproducible in this checkout — reported, not worked around. Fixing it
would mean adding a schema owned by another item (REVISION-REF-HARNESS-1), which is out
of this unit's owned-file scope.

Typecheck: `cd server && npx tsc --noEmit` is BLOCKED by a broken shared dependency
install, not by this change: `error TS2688: Cannot find type definition file for 'semver'`
— `server/node_modules/@types/semver` (symlink into
`/mnt/vast/home/brad/git/cl-integration-2/server/node_modules`) is an EMPTY directory.
No dependency installs are allowed. Substitute (project tsconfig excludes `**/*.test.ts`
anyway, so the test is outside the project program): file-scoped check under the
project's strict options, 0 errors in the new file:
```
npx tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess \
  --target ES2022 --module esnext --moduleResolution bundler --skipLibCheck --types node \
  src/schema/JourneyPortSchema.test.ts   -> 0 JourneyPortSchema.test.ts diagnostics
```

Tree at exit: `git -c core.fileMode=false status --short` -> clean.

## Deliberately NOT done (later legs of this item, not fudged here)

- No `.lint.yaml`, no `rules:`, no `journey-port.lint.yaml`: lint rules need a record host
  (`schemaId` + a stored record contract) that does not exist yet.
- No `.ui.yaml`, no `core/record.schema.yaml` kind: this is a vocabulary schema referenced
  by `$ref`, not a new stored record kind.
- No stack restart needed (schema YAML is read off disk by tests; nothing is served).

## Commits

- c8b5ce5a u1vocab: journey port vocabulary schema + contract test
- 163dc297 u1vocab: pin committed/staged distinction from declared properties
- a8ac2dd7 u1vocab: compact vocabulary + test under line budget; type-safe enum lookup

## Next actions

1. Reviewer: verify the enum really is the registry's five keys and that no TS literal
   encodes layer/field vocabulary.
2. Orchestrator: the `ControlledDocumentSchemas.test.ts` baseline claim needs re-measuring
   on this tree (missing `revision-ref.schema.yaml`); it is unrelated to this unit but
   hides an integration-state defect at d454d418.
3. Later legs of L2-JOURNEY-PORTS-1 (binding-site lint cases a/b and ui spec) are blocked
   on L2-JOURNEY-CAPABILITY-CATALOGUE-1 + the journey doc, as the brief states.

L2-JOURNEY-PORTS-1 UNIT u1vocab DONE a8ac2dd7c73551ecf4bfdab6e6835da7528f6ad2
