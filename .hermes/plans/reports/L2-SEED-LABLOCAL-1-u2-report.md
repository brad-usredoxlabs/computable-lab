# L2-SEED-LABLOCAL-1 Unit 2 Report

## Summary
Declared flask_t25 and flask_t75 T-flask labware types as registry-tier data, plus two resolution pins in the registry test.

## Baseline (RED)
- Base commit: 451fbeb0bbdacc4b335ca5aaa7726fa4b3438fa2
- `npx vitest run src/registry/LabwareDefinitionRegistry.test.ts` -> 10 tests passed (10)
- `getLabwareDefinitionRegistry().get('flask_t25')` -> undefined

## Changed Files (3)
1. schema/registry/labware-definitions/flask_t25.yaml (NEW)
2. schema/registry/labware-definitions/flask_t75.yaml (NEW)
3. server/src/registry/LabwareDefinitionRegistry.test.ts (2 appended test blocks)

## Design Decisions
- Modelled flask_t25.yaml and flask_t75.yaml on flask_250ml.yaml (object-form source, not bare string)
- Omitted compatibility_tags (T-flasks are plastic, NOT lawn-only per labware.ts:146)
- Omitted platform_aliases (not needed for generic definitions)
- Omitted specificity (Ajv schema does not declare it; 12-well-reservoir.yaml's version is Ajv-invalid)
- Capacity values copied from client's geometry (labware.ts:1066/1074)

## Mutation Probes
1. Removed both YAMLs -> 2 test failures (flask_t25 and flask_t75 both undefined)
2. Changed flask_t25 legacy_labware_types to [flask_250ml] -> 1 failure (toContain('flask_t25') failed with ['flask_250ml'])
3. Reverted mutation -> all 12 tests pass

## Verification
- `npx vitest run src/registry/LabwareDefinitionRegistry.test.ts` -> Tests 12 passed (12)
- Registry probe: flask_t25 single 25000 ['flask_t25']; flask_t75 single 75000 ['flask_t75']
- git status: only the 3 owned paths changed (plus untracked node_modules symlinks)

L2-SEED-LABLOCAL-1-u2 UNIT 2 DONE f1ffa05d6a734f5089a5c7fe3a3de186edf0aabc
