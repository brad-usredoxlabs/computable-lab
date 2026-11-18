# L2-ONTOLOGY-ANCHOR-SOURCES-1 / unit o3uispec-fix2 — report

Worktree: /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2
Branch: cl/lane2-ontology-o3uispec-1913 (base 39b4bffbb3494bb9aa8d9ab2cfea0a5644f03a8e)
Lane: 2

## Seam
`schema/ui/ui-v1.schema.yaml:217` declared the `props.sources` enum as
`["local", "ols", "vendor-search", "local-records"]` while the shipped
`schema/workflow/labware-definition.ui.yaml:43` ships
`sources: ["ols", "local-obo"]`. Real Ajv 2020-12 therefore marked the
shipped spec INVALID (adversarial review D1) and nothing in the tree could
see it (the server loader hand-rolls its own checks and never validates
*.ui.yaml against ui-v1). Fix: add `local-obo` to the enum (policy in YAML)
+ one pin test running real Ajv over the real ui.yaml.

## Changed files (2)
1. `schema/ui/ui-v1.schema.yaml` — 1 line: :217 enum now
   `["local", "ols", "vendor-search", "local-records", "local-obo"]`.
2. `server/src/ui/UiSpecSourcesEnum.test.ts` — NEW, 61 lines. Reads all three
   real YAML files (ui-v1, labware-definition.ui.yaml,
   registry/ontology-sources.schema.yaml) via `readFileSync` + `load`
   from 'js-yaml' (same SCHEMA_DIR pattern as
   LabwareDefinitionUiSpec.test.ts:20), compiles ui-v1 with
   `new Ajv2020({ strict: false })` (`import Ajv2020 from 'ajv/dist/2020.js'`,
   same import as server/src/validation/AjvValidator.ts:17) and asserts:
   (a) `validate(uiSpec).errors === null` over the REAL shipped ui.yaml;
   (b) the enum contains 'local-obo' (names the exact keyword on failure);
   (c) enum membership == {local, ols, vendor-search, local-records,
   local-obo}; (d) every registry loader ($defs.source.properties.loader
   enum) maps onto a ui-v1 sources member (local-obo→local-obo,
   ols4→ols) so future sources stay paired.

## Commits
- 2d7ac7f7 test(ui): g-o3uispec-fix2 RED — shipped labware-definition.ui.yaml violates ui-v1 sources enum
- ea1c0e38 fix(schema): ui-v1 sources enum admits local-obo (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec-fix2)
- (this commit) docs: report + marker + test file compaction/fix for registry pairing

## Verification (all run inside the worktree; full logs in
/home/brad/.hermes/plans/receipts/L2-ONTO-o3uispec-fix2-{RED,GREEN,REGRESSION,PROBE-RED,TSC}.txt)

Commands (verbatim):
```
cd server && npx vitest run src/ui/UiSpecSourcesEnum.test.ts
cd server && npx vitest run src/ui/LabwareDefinitionUiSpec.test.ts src/ui/UiReadonlySpellingProjection.test.ts
cd server && npx tsc --noEmit
git -c core.fileMode=false status --short
```

### RED (before step 2; after commit 2d7ac7f7, schema still 4-member)
4 tests, all failed:
- real-Ajv test: `validate.errors` =
  `[{"instancePath":"/form/sections/0/fields/2/props/sources/1",
    "schemaPath":"#/definitions/field/properties/props/properties/sources/items/enum",
    "keyword":"enum",
    "params":{"allowedValues":["local","ols","vendor-search","local-records"]},
    "message":"must be equal to one of the allowed values"}]`
  — byte-identical to adversarial review D1's raw output.
- enum-contains-local-obo: `expected [ 'local', 'ols', …(2) ] to include 'local-obo'`
- membership: `expected [ 'local', 'local-records', …(2) ] to deeply equal [ 'local', 'local-obo', …(3) ]`
- registry↔ui pairing: `ui-v1 enum must cover registry loader local-obo: expected [ 'local', 'ols', …(2) ] to include 'local-obo'`
Tail: `Test Files  1 failed (1)` / `Tests  4 failed (4)`.

### GREEN (after step 2, commit ea1c0e38)
`Test Files  1 passed (1)` / `Tests  4 passed (4)` — real Ajv reports zero
validation errors on the real labware-definition.ui.yaml.

### Mutation probe (step 3)
Reverted ONLY the enum line to the 4-member form, re-ran the same test
command: `Tests  4 failed (4)` with the raw
`must be equal to one of the allowed values` error again (receipt
L2-ONTO-o3uispec-fix2-PROBE-RED.txt) — teeth proven. Restored the line;
`git status --short` then showed only the (uncommitted) test file, and a
re-run was green (`Tests  4 passed (4)`). No commit made for the probe.

Note (test defect found during GREEN, fixed before exit): the first draft
of test 4 asserted the registry loader enum ⊆ ui-v1 enum verbatim, but the
registry vocabulary is `local-obo | ols4` while ui-v1 names the OLS source
`ols` — two different vocabularies (verified: `ols4` is the loader name at
schema/registry/ontology-sources.schema.yaml:59, `ols` the ui-v1 member).
The test was corrected to pair via an explicit loader→source map
(local-obo→local-obo, ols4→ols); the schema fix itself needed no change.
The test file was also compacted 90→61 lines (output budget ≤ 90).

### Regression (baseline: both green at HEAD)
`Test Files  2 passed (2)` / `Tests  5 passed (5)`
(LabwareDefinitionUiSpec.test.ts 4 passed; UiReadonlySpellingProjection.test.ts 1 passed).

### Typecheck
`cd server && npx tsc --noEmit` → rc=0 (receipt is 0 bytes = no diagnostics;
baseline rc=0 at HEAD).

### Cleanliness at exit
`git -c core.fileMode=false status --short` → clean after the report commit.

## Acceptance mapping
1. Pin test green at HEAD of this run; RED before the schema line changed — raw outputs above.
2. Real Ajv over real labware-definition.ui.yaml vs ui-v1 → zero errors.
3. Mutation probe: reverting only the enum line fails the test again.
4. Regression + tsc unchanged green; worktree clean; marker below.

## Next actions
None for this unit. Reviewer: rerun the two vitest commands above; the
RED/GREEN/probe receipts are outside git at /home/brad/.hermes/plans/receipts/.

## Marker
Marker sha = 3d3268678311509a2a2422c7cf966aa91bff8fa7 — the commit that
CONTAINS this report (verified with `git cat-file -e
3d3268678311509a2a2422c7cf966aa91bff8fa7:.hermes/plans/reports/L2-ONTOLOGY-ANCHOR-SOURCES-1-o3uispec-fix2-report.md`).
The marker line below was appended by the immediately following marker
commit, same convention as o3uispec-fix1 (marker at 39b4bffb pointing at
report commit d14f61b7).

L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT o3uispec-fix2 DONE 3d3268678311509a2a2422c7cf966aa91bff8fa7
L2-ONTO-o3uispec-fix2 UNIT o3uispec-fix2 DONE 3d3268678311509a2a2422c7cf966aa91bff8fa7
L2-ONTO-o3uispec-fix2 UNIT unit DONE 3d3268678311509a2a2422c7cf966aa91bff8fa7
