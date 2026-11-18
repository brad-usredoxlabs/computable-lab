# L2-SEED-LABLOCAL-1 u1fix2 Report — SBS 127x85 Footprint Fix

## Task
Fix the 8-well-reservoir physical_geometry from 85x85 to 127x85 (SBS standard) and pin with one assertion in the existing test.

## Changes
1. `schema/registry/labware-definitions/8-well-reservoir.yaml` — changed `length: 85` to `length: 127` (line 31)
2. `server/src/registry/LabwareDefinitionRegistry.test.ts` — added 2 lines to the existing `it('8-well-reservoir has rows=1, columns=8')` block:
   - `const geom = entry!.physical_geometry as { overall_dimensions_mm: { length: number; width: number } };`
   - `expect(geom.overall_dimensions_mm).toEqual({ length: 127, width: 85 });`

## RED Evidence (before YAML fix)
```
FAIL  src/registry/LabwareDefinitionRegistry.test.ts > LabwareDefinitionRegistry > 8-well-reservoir has rows=1, columns=8
AssertionError: expected { length: 85, width: 85 } to deeply equal { length: 127, width: 85 }
  Object {
-   "length": 127,
+   "length": 85,
    "width": 85,
  }
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
```

## GREEN Evidence (after YAML fix)
```
✓ src/registry/LabwareDefinitionRegistry.test.ts  (11 tests) 35ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

## Invariants Preserved
- topology: rows=1, columns=8, well_pitch_mm=9, addressing=grid — unchanged
- capacity: max_well_volume_uL=25000, min_working_volume_uL=500 — unchanged
- platform_aliases: both opentrons_ot2/reservoir_8 and generic/generic/reservoir_8@v1 — unchanged
- recordId: lbw-def-generic-8-well-reservoir — unchanged
- id: 8-well-reservoir — unchanged
- All 11 existing tests pass — unchanged

## Verification Commands
- `cd server && npx vitest run src/registry/LabwareDefinitionRegistry.test.ts` — 11 passed
- `git -c core.fileMode=false status --short` — only `?? app/node_modules`

## Commit
sha: 9aa87dc715224eb255ec7a5b06d697acfa27e004
message: `seed lablocal fix-2: SBS 127x85 footprint for 8-well reservoir (advc c1 m1)`

L2-SEED-LABLOCAL-1-u1fix2 UNIT 2 DONE 9aa87dc715224eb255ec7a5b06d697acfa27e004
