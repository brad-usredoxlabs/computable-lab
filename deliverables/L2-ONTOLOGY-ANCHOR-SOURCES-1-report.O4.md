# L2-ONTOLOGY-ANCHOR-SOURCES-1 — Unit O4 (u4bind) report

Item: L2-ONTOLOGY-ANCHOR-SOURCES-1 (lane 2)
Worktree: /home/brad/cl-wt/L2-ONTOLOGY-u4bind-lane2
Branch: cl/lane2-ontology-u4bind-1342
Base: 29f153cdbbcc17252fa266ced34b73bf757a74d1
Code commit: edfe8b1c601f46a77473db4d5eee415e3c55ac76

## What landed

The ontology repo's shipped bindings file is now the only data source for a
`labwareType -> LWO class` lookup, and labware-definition search hits carry the
mapped CURIE as an optional `lwoClass`.

- `config/ontology-bindings.yaml` (NEW) — declares `version`, `path` (absolute,
  into the read-only ontology repo), `source_id: "lwo"`, `map_key:
  "labware_type_to_lwo"`. No mapping is re-encoded; the CURIEs live only in the
  ontology repo's data file.
- `schema/registry/ontology-bindings.schema.yaml` (NEW) — closed schema
  (`unevaluatedProperties: false`, all four required; `path` must be absolute).
- `server/src/resolve/bindings/labwareTypeBinding.ts` (NEW) — reads the config,
  then `doc[config.map_key]`; per-entry class is `entry[config.source_id]`, so
  neither the map key nor the entry field literal appears in TS. Exports
  `loadLabwareTypeBindings(opts)` (report with per-key entries incl. explicit
  `lwoClass: string | null`, plus named `failures`) and
  `lookupLabwareClass(labwareType, opts)` (exact match, null for unknown).
  Cache keyed by (config path, data path); failures are never cached.
  Default `strict: true` throws a NAMED error containing the failing path;
  `strict: false` answers null lookups and returns the named failure instead of
  a silent empty map.
- `server/src/api/labwareDefinitionSearch.ts` — `LabwareDefinitionSearchHit`
  gains exactly one optional field `lwoClass?: string`. In `toHit`, the FIRST
  `legacy_labware_types` entry is looked up; the key is assigned only when the
  data yields a non-null CURIE (so `exactOptionalPropertyTypes` holds and a
  null/unknown mapping leaves the key ABSENT).
- `server/src/api/labwareDefinitionSearch.test.ts` (NEW) — 9 cases (a–f from the
  brief, with (a) and (f) each split in two/three).

Total added lines: 300 (7 config + 32 schema + 123 module + 123 test + 15 search).

## Measured discrepancy from the brief (recorded, not silently resolved)

1. The brief's baseline `cd server && npx vitest run
   src/api/labwareDefinitionSearch.test.ts` → `Tests 8 passed (8)` does NOT
   reproduce at 29f153cd: the file did not exist. `git log --all --` for that
   path returns nothing; `grep -rln searchLabwareDefinitions` found only the
   module, routes and two app files. I therefore CREATED the test file with the
   new cases (no existing case was modified or deleted — there were none). The
   four pre-existing behavior areas of `searchLabwareDefinitions` (registry
   tier, record-store union, token fold, dedupe) remain untested by this file,
   as before; this unit did not change them.
2. `git -C /home/brad/git/lab-ontologies status --short` is NOT empty on this
   host, but the dirt is pre-existing file-MODE drift only:
   `git diff --numstat` = 50 files, `0 insertions(+), 0 deletions(-)`;
   `git -C ... -c core.fileMode=false status --short` is EMPTY; the bindings
   file mtime is 2026-09-04 (untouched by this run). Content is unmodified.

## Verification (raw)

Targeted tests:
```
RUN  v1.6.1 /home/brad/cl-wt/L2-ONTOLOGY-u4bind-lane2/server

 ✓ src/api/labwareDefinitionSearch.test.ts  (9 tests) 99ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```
```
RUN  v1.6.1 /home/brad/cl-wt/L2-ONTOLOGY-u4bind-lane2/server

 ✓ src/schema/OntologySourcesRegistry.test.ts  (7 tests) 122ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Typecheck (`cd server && npx tsc --noEmit`): rc=0, zero output lines.

Schema validator (literal run via tsx over the shipped files):
```
schema load errors: []
schema id: https://computable-lab.com/schema/computable-lab/ontology-bindings.schema.yaml
SHIPPED valid: true errors: []
PATH-LESS valid: false
  error path: "/" | keyword: required | message: Missing required property: path | params: {"missingProperty":"path"}
```

Hardcode boundary:
```
$ grep -rn "LWO:" server/src app/src --include=*.ts --include=*.tsx | grep -v test
LWO: rc=1            (no matches)
$ grep -rn "labware_type_to_lwo\|lwo.base.obo" server/src app/src --include=*.ts --include=*.tsx
mapkey rc=1          (no matches)
```

Ontology repo untouched (content check):
```
$ git -C /home/brad/git/lab-ontologies -c core.fileMode=false status --short
(empty)
```

Worktree at exit: clean (`git status --short` empty after code commit; report
committed separately).

## RED-first evidence

Before the module existed, the new test file failed to load:
```
FAIL  src/api/labwareDefinitionSearch.test.ts
Error: Failed to load url ../resolve/bindings/labwareTypeBinding.js ... Does the file exist?
 Test Files  1 failed (1) / Tests  no tests
```
Then 9/9 green after the implementation.

## Notes / next actions

- Config is new YAML: the orchestrator must reload the lane stack before live
  browser verification of AC1–AC3.
- Browser gate reads: AC1 plate hit carries a re-readable `LWO:` CURIE; AC2
  slide-typed definition returns with `lwoClass` ABSENT; AC3 config is the only
  path/key naming site and deleting it fails loudly by name.
- Not in this unit: O5 boot wiring (architect-barred), app-side display of
  `lwoClass` (no app files touched).

L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT O4 DONE edfe8b1c601f46a77473db4d5eee415e3c55ac76
L2-ONTOLOGY-ANCHOR-SOURCES-1-u4bind UNIT unit DONE edfe8b1c601f46a77473db4d5eee415e3c55ac76
