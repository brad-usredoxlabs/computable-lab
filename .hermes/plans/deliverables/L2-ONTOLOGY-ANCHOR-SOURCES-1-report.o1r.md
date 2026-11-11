# L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT o1r Report

## Summary
Created the ontology-source registry as DATA: one YAML naming each servable source
plus its JSON schema and a conformance test. Three files authored:

1. `config/ontology-sources.yaml` — 27 lines, 3 entries (LWO local-obo, LEQ local-obo, OLS4 remote)
2. `schema/registry/ontology-sources.schema.yaml` — 98 lines, draft 2020-12 with if/then guards
3. `server/src/schema/OntologySourcesRegistry.test.ts` — 182 lines, 6 test legs

NOTE: The original o1r report (line 52) cited stats 28/84/232 which did not match any commit.
Re-measured at commit 2d93f6a7: config=27, schema=98, test=182.

## Namespace IRIs Used
- LWO: `https://brad-usredoxlabs.github.io/lab-ontologies/lwo` (declared in the OBO header `id:` field)
- LEQ: `https://brad-usredoxlabs.github.io/lab-ontologies/leq` (declared in the OBO header `id:` field)
- OLS4: `https://www.ebi.ac.uk/ols4` (the EBI OLS4 base URL, not an ontology IRI — it's a remote tier)

These IRIs come from the `id:` field in each OBO file's header and the binding file.
No computable-lab-hosted IRI was invented for an external vocabulary.

## Absolute Paths (verifiable)
- `/home/brad/git/lab-ontologies/dist/lwo-2026-08-15/lwo/lwo.base.obo` (25329 bytes, 71 [Term] stanzas)
- `/home/brad/git/lab-ontologies/dist/leq-2026-08-15/leq/leq.base.obo` (36383 bytes, 100 [Term] stanzas)

## Mutation Probes
(a) Changed LWO path to `nope.obo` — test RED naming source id "lwo"; reverted byte-identically.
(b) Changed LWO root to `LWO:9999999` — test RED naming source id "lwo"; reverted byte-identically.
After reverting, `git status --short` shows clean tree.

## Test Results
- `OntologySourcesRegistry.test.ts`: 6/6 passed (1 file passed)
- `EquipmentCapabilityData.test.ts`: 13/13 passed (baseline preserved)
- Typecheck: zero diagnostics

## Hardcode Boundary
Scan of all non-test TS files in `server/src` and `app/src`: no hardcoded `LWO:` or `LEQ:` found.
The existing `LabwareDefinitionAnchor.test.ts` uses `LWO:0000100` but that's a test file — excluded.

## Known Debt (not this unit's scope)
- `schema/lab/equipment.schema.yaml:43` has `kind: { const: ontology }` but the ref pattern
  cannot match a `LEQ:` CURIE. That mismatch is for a later unit.

## Changed Files
- `config/ontology-sources.yaml` (new)
- `schema/registry/ontology-sources.schema.yaml` (new)
- `server/src/schema/OntologySourcesRegistry.test.ts` (new)

## Verification Commands
cd /home/brad/cl-wt/L2-ONTO-SRC-o1r-lane2/server && node node_modules/vitest/vitest.mjs run src/schema/OntologySourcesRegistry.test.ts
cd /home/brad/cl-wt/L2-ONTO-SRC-o1r-lane2/server && ./node_modules/.bin/tsc --noEmit -p .
cd /home/brad/cl-wt/L2-ONTO-SRC-o1r-lane2 && git -c core.fileMode=false status --short


## o1rfix (advc c1 minors D1-D7)

Re-measurement at the original o1r commit 2d93f6a7: config=27, schema=98, test=182 (not 28/84/232 as
the original report claimed).

### D1 — Schema pattern constraints

Before: `id` had only `minLength: 1` (accepted "LWO Thing!"), `namespace_iri` had only
`minLength: 1` (accepted "lwo"), `path` had no pattern (accepted "relative/path.obo"), `root`
had no pattern (accepted "banana").

After: added `pattern: "^[a-z0-9][a-z0-9-]*$"` to `id`, `pattern: "^https?://\\S+$"` to
`namespace_iri` (with rewired description that no longer claims "must end with prefix + '/' or '#'"),
`pattern: "^/"` to `path`, `pattern: "^[A-Za-z][A-Za-z0-9._-]*:[A-Za-z0-9_.-]+$"` to `root`.
All three shipped entries validate. Negative fixture 3 (`root: 'banana'`) is rejected by the schema.

### D2/D3 — De-vacuum leg (v) and pin two enabled locals

Before: leg (v) counted `enabled` and `local-obo` independently — an OLS4-only registry with
`enabled: true` would satisfy both assertions. Setting all locals to `enabled: false` or
deleting the LWO entry kept the suite green.

After: added leg (v.bis) asserting `enabledLocals.length >= 2` and `new Set(roots).size >= 2`.

Mutation Probe A (D3): deleted the LWO entry from config — leg (v.bis) FAILED with
"at least two enabled local-obo sources: expected 1 to be greater than or equal to 2".
Restored byte-identically (sha256 d1c28d73... matches before/after).

Mutation Probe B (D2): set both local entries to `enabled: false` — leg (v.bis) FAILED with
"at least two enabled local-obo sources: expected 0 to be greater than or equal to 2".
Restored byte-identically.

### D4 — Both directions of if/then loader discipline

Before: only the ols4-with-path direction had a negative fixture. A local-obo entry missing
path/root would pass validation.

After: added negative fixture 2 (local-obo without path/root — rejected) and negative fixture 3
(invalid root value "banana" — rejected by root pattern).

### D5 — TSX scan and no-swallow error

Before: `collectTsFiles` matched `endsWith('.ts')` only — every `.tsx` file was invisible.
The `try { ... } catch { }` around `collectTsFiles(appDir)` silently narrowed the set on error.

After: `collectTsFiles` matches `/\\.(ts|tsx|mts|cts)$/` and excludes `/\\.test\\.(ts|tsx)$/`.
Leg (vi) replaces the try/catch with `expect(existsSync(appDir), 'app/src must exist for the
hardcode boundary scan').toBe(true)` followed by unconditional collection.

### D6 — Attribute missing OBO path to source id

Before: `readFileSync(path, 'utf8')` threw bare ENOENT that did not name the source.

After: added `expect(existsSync(path), \`${src.id}: path missing\`).toBe(true)` before
`readFileSync`, so a bad path names its source id.

### D7 — Report marker + stats correction

Before: the report cited stats 28/84/232 (not matching any commit) and named marker
`2d93f6a7` whose tree contained neither the marker nor the fixes.

After: re-measured stats at 2d93f6a7 are 27/98/182. The o1rfix section documents all six fixes.
The marker below cites 5dfe1ba0, the commit containing all six fixes; the marker line itself
post-dates it in a report-only commit (contained-sha convention, precedent L2-NOUN-RESOLUTION-POLICY-1
a1fix closeout 7cd10fbd naming b5f51297).

## Post-o1rfix Verification
- Tests: 7 passed (7), 0 skipped (1 file passed)
- Typecheck: exit 0, zero diagnostics (server/tsconfig.json excludes *.test.ts)
- Hardcode boundary: zero hits (grep across server/src and app/src for LWO:, LEQ:, OLS4:)
- Tree clean: `git -c core.fileMode=false status --short` shows no entries
- Config unchanged: sha256 d1c28d73fa7fdaa8a72807fef85fec4dc1873f0c280d2847ee06920906f00bc1

## Post-o1rfix Changed Files
- `schema/registry/ontology-sources.schema.yaml` (+4 lines: 4 patterns, 1 description rewrite; 98 -> 102)
- `server/src/schema/OntologySourcesRegistry.test.ts` (+47 lines: 1 new leg, 3 new fixtures, D5/D6 fixes; 182 -> 229)

L2-ONTOLOGY-ANCHOR-SOURCES-1-o1rfix UNIT o1rfix DONE 5dfe1ba061dd3ac9a8a80f2e3261cdd19efae949
