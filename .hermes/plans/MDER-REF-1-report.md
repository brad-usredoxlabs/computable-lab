# MDER-REF-1 — coder report (lane 2, l2t1955)

Repair of the broken cross-schema $ref in schema/lab/material-derivation.schema.yaml
(four pointers to a non-existent path; first validation of any material-derivation
record threw at Ajv compile). DATA-only fix + RED-first lock test.

Worktree: /mnt/vast/home/brad/git/wt/MDER-REF-1-lane2-l2t1955
Branch:   cl/lane2-mderref1-l2t1955
Base:     21defa3922200b0fdb29d5c9a1a18926a4cd8ebb (dispatch-tip / PINNED_TIP)

## Commits

- fd5b5495 fix(lane2): MDER-REF-1 — repoint material-derivation's 4 broken cross-schema
  $refs to './datatypes/ref.schema.yaml' + RED-first lock test
  (2 files changed, 102 insertions(+), 4 deletions(-))

## The fix (DATA-only, 4 pointers)

schema/lab/material-derivation.schema.yaml lines 45/49/51/53:
`$ref: '../core/ref.schema.yaml'` -> `$ref: './datatypes/ref.schema.yaml'`
(identical quoted-string form every other schema uses, e.g. aliquot.schema.yaml:28).
Under the schema's $id (.../computable-lab/material-derivation.schema.yaml) this
resolves to .../computable-lab/datatypes/ref.schema.yaml — the real datatype
(schema/core/datatypes/ref.schema.yaml, $id .../computable-lab/datatypes/ref.schema.yaml).
Zero registry/code changes. Post-fix tree-wide grep confirms no remaining
`core/ref.schema.yaml` pointer anywhere in schema/ (grep exit 1).

## RED run (BEFORE fix) — raw vitest output, throw verbatim

Command: cd server && npx vitest run src/schema/MaterialDerivationRefSchema.test.ts

    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/MDER-REF-1-lane2-l2t1955/server

     ❯ src/schema/MaterialDerivationRefSchema.test.ts  (3 tests | 3 failed) 151ms
       ❯ ... > compiles material-derivation through addSchema + getSchema (RED: throws "can't resolve reference ../core/ref.schema.yaml")
         → can't resolve reference ../core/ref.schema.yaml from id https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml
       ❯ ... > validates a well-formed material-derivation payload with record refs
         → can't resolve reference ../core/ref.schema.yaml from id https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml
       ❯ ... > rejects an inputs entry missing the required kind as a DATA error naming inputs
         → can't resolve reference ../core/ref.schema.yaml from id https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml

    Error: can't resolve reference ../core/ref.schema.yaml from id https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml
     ❯ Object.code .../ajv@8.20.0/node_modules/ajv/lib/vocabularies/core/ref.ts:19:39
    Serialized Error: { missingRef: 'https://computable-lab.com/schema/core/ref.schema.yaml', missingSchema: 'https://computable-lab.com/schema/core/ref.schema.yaml' }

     Test Files  1 failed (1)
          Tests  3 failed (3)

RED throw reproduced verbatim, matching the orch boot-simulation measurement.
(Note the serialized missingRef shows the exact mis-resolution: relative-to-$id
resolution lands on .../schema/core/ref.schema.yaml — does not exist.)

## GREEN run (after fix) — raw vitest output

    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/MDER-REF-1-lane2-l2t1955/server

     ✓ src/schema/MaterialDerivationRefSchema.test.ts  (3 tests) 83ms

     Test Files  1 passed (1)
          Tests  3 passed (3)

Lock test (server/src/schema/MaterialDerivationRefSchema.test.ts, new) mirrors the
production boot path (server.ts: addSchema each entry, then getSchema/validate) on a
hermetic explicit file list (core/datatypes/ref.schema.yaml +
lab/material-derivation.schema.yaml), sibling convention of BiologicalTypesSchema.test.ts:
1. getSchema(MDER_SCHEMA_ID) compiles (RED: threw);
2. well-formed payload with {kind:'record', id, type} refs validates valid:true;
3. inputs entry {id:'STU-1'} missing required kind is REJECTED as a data error —
   errors name 'inputs' and keyword 'required' (not a validator throw).

## Scoped suite (spec-mandated) — raw output

Command: cd server && npx vitest run src/schema/MaterialDerivationRefSchema.test.ts src/schema/BiologicalTypesSchema.test.ts src/schema/RequirementFulfillmentSchemas.test.ts

     ✓ src/schema/MaterialDerivationRefSchema.test.ts  (3 tests) 104ms
     ✓ src/schema/BiologicalTypesSchema.test.ts  (6 tests) 235ms
     ✓ src/schema/RequirementFulfillmentSchemas.test.ts  (27 tests) 871ms

     Test Files  3 passed (3)
          Tests  36 passed (36)

Re-run after the commit (post-commit confirmation): 3 files / 36 tests passed.

## Wider src/schema/ directory parity (zero-new-fail proof)

Full src/schema/ run with the fix: 11 failed | 36 passed | 5 skipped (52 files);
58 failed | 475 passed | 53 skipped (586 tests).
Same run with the schema fix stashed (base state, new test present in RED):
12 failed files. Comm of sorted FAIL-file lists (before vs after):

    7d6
    < src/schema/MaterialDerivationRefSchema.test.ts

i.e. the ONLY difference is my own lock test flipping RED->GREEN; the 11 pre-existing
failing files (CandidateMapperSchemaConformance, ConcentrationFirstSchemaContract,
ContextChainSchemaContracts, ControlledDocumentSchemas, EventGraphSemanticKeySchema,
governanceSchemas, ProcurementSchemaContracts, ProtocolPhasesSchema,
ProtocolProseFieldsSchema, Wave25OQ1SeamSchema, Wave2ProtocolIntentSchema — e.g.
missingRef datatypes/revision-ref.schema.yaml) are identical at base and after:
ZERO NEW failing files.

## Server tsc sorted diff — zero NEW

Baseline captured at dispatch tip BEFORE any edit: npx tsc --noEmit | sort -> 29 lines.
After fix + new test: npx tsc --noEmit | sort -> 29 lines; diff = empty ("TSC ZERO NEW").
Note: server tsconfig excludes **/*.test.ts (trunk convention), so the new test file is
not in the project typecheck; it was additionally typechecked standalone with the
project flags (--strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess
--moduleResolution bundler etc.): exit 0, zero errors.

## Zero-diff proof

    $ git -c core.fileMode=false diff --stat 21defa3922200b0fdb29d5c9a1a18926a4cd8ebb
     schema/lab/material-derivation.schema.yaml         |  8 +-
     .../src/schema/MaterialDerivationRefSchema.test.ts | 98 ++++++++++++++++++++++
     2 files changed, 102 insertions(+), 4 deletions(-)

Exactly the two owned files. `git status --short` clean after commit.

## Assumptions

- AS-MDER-BASE-PROVISIONING: the worktree lacked the gitignored `server/schema`
  symlink (trunk checkout has it: server/schema -> <checkout>/schema; .gitignore:44
  ignores server/schema). BiologicalTypesSchema.test.ts resolves schemas via
  process.cwd()/schema, so it ENOENT-failed at base until the equivalent untracked
  symlink server/schema -> <worktree>/schema was created (matches trunk precedent;
  untracked, not part of any diff). After provisioning, both baseline suites pass at
  base — the base failure was a provisioning gap, not code.
- AS-MDER-REF-POINTER-FORM: './datatypes/ref.schema.yaml' chosen empirically as the
  convention-matching form (aliquot.schema.yaml:28 and the rest of the tree use it
  under the same flat $id namespace); verified GREEN by the lock test, not assumed.
- No live :3093 probe performed (spec: tests are the gate, live probe optional) ->
  no lane-stack restart.
- node_modules and server/schema symlinks left untracked as instructed; all git via
  `git -c core.fileMode=false`.

STATUS: complete
