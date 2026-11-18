# L2-SEED-LABLOCAL-1 Unit 3 Report

## Summary
Declared single-trough 25 mL reservoir as registry-tier data, plus two resolution pins in the registry test.

## Baseline (RED)
- Base commit: dad15801ff0f2c0a9cd329695ef2c3a1f8321046
- `npx vitest run src/registry/LabwareDefinitionRegistry.test.ts` -> 13 tests passed (13)
- `getLabwareDefinitionRegistry().get('reservoir_25ml_single')` -> undefined

## Changed Files (2)
1. schema/registry/labware-definitions/single-trough-25ml-reservoir.yaml (NEW)
2. server/src/registry/LabwareDefinitionRegistry.test.ts (2 appended test blocks)

## Design Decisions
- Modelled single-trough-25ml-reservoir.yaml on flask_t25.yaml (object-form source, not bare string)
- Omitted physical_geometry block (per schema guidance: omit unknown values)
- Capacity 25000 uL copied from expected reservoir spec
- Aspiration hints: single_well_multichannel_source true (single trough behavior)
- platform_aliases with generic/reservoir_25ml_single for getByAlias resolution

## Mutation Probes
1. Removed YAML -> 2 test failures (reservoir_25ml_single undefined and alias unresolved)
2. Removed aspiration_hints block -> 1 failure (Cannot read properties of undefined)
3. Restored -> all 15 tests pass

## Verification
- `npx vitest run src/registry/LabwareDefinitionRegistry.test.ts` -> Tests 15 passed (15)
- Registry probe: reservoir_25ml_single single 25000 with single_well_multichannel_source true
- git status: only the 2 owned paths changed (plus untracked node_modules symlinks)

L2-SEED-LABLOCAL-1-u3 UNIT 3 DONE 49c1e73c340ec87b3e9ca305b4949434ed96619d