# L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT o1r Report

## Summary
Created the ontology-source registry as DATA: one YAML naming each servable source
plus its JSON schema and a conformance test. Three files authored:

1. `config/ontology-sources.yaml` — 28 lines, 3 entries (LWO local-obo, LEQ local-obo, OLS4 remote)
2. `schema/registry/ontology-sources.schema.yaml` — 84 lines, draft 2020-12 with if/then guards
3. `server/src/schema/OntologySourcesRegistry.test.ts` — 232 lines, 6 test legs

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

L2-ONTOLOGY-ANCHOR-SOURCES-1-o1r UNIT o1r DONE 9df63880bb2e1aead4293d0041c929c237f9428c
