# L2-P1-DEFINITION-BIND-1 / u1bind — report

Worktree: /home/brad/cl-wt/L2-P1-DEFINITION-BIND-1-lane2
Branch: l2/p1-definition-bind-1
Base: 6340cea43eae585414d58d1093e144ce1a2c8043
Commits: 2fee1a7de (RED test), 08272b20b (GREEN fix)

## What was wrong (measured, not assumed)

The AI apply path resolves the addition's store record and holds it
(`useSurfaceChat` -> `onAddLabwareFromRecord(record, addition)` in
LabwareEventEditor.tsx), but the handler fed that record to
`labwareRecordToEditorLabware`, which derives editor geometry from
`pickEditorLabwareType(record)` -> `createLabware(plate_96)` ->
`getLabwareDefinitionByLegacyType('plate_96')` — the first-wins legacy map
(labwareDefinition.ts:277-284). For every 96-well definition record that is
`opentrons/nest_96_wellplate_200ul_flat@v1`, 200 uL, regardless of the
confirmed definition. The RED run's control leg reproduces the gate verbatim:

  labwareRecordToEditorLabware({recordId:'lbw-def-generic-96-well-plate',
  name:'Generic 96-Well Plate', labwareType:'plate_96', format:8x12})
  -> definitionId 'opentrons/nest_96_wellplate_200ul_flat@v1', maxVolume 200 uL

## Fix (spec decision 1 — topology-intact definition placement)

1. app/src/types/labware.ts (+52 lines, additions only):
   - `LabwareDefinitionRecordPayload` — the shape GET /api/records returns for a
     labware-definition record (recordId/id/display_name/topology/capacity/
     render_hints/physical_geometry/legacy_labware_types).
   - `labwareDefinitionRecordToEditorLabware(record, fallbackRecordId)` —
     topology-carries-definition records go through
     `createLabwareFromDefinitionPayload` (the existing intact constructor,
     unmodified) so topology, capacity, definitionId and sourceRecordId survive;
     returns null for any other record.
2. app/src/graph/LabwareEventEditor.tsx (+24/-2): the AI `onAddLabwareFromRecord`
   handler tries the intact helper first and dispatches the resulting Labware via
   the same `ADD_LABWARE` action the context method uses; when the helper declines
   (non-definition record) it calls the existing `addLabwareFromRecord` path
   unchanged.

Deviation from the brief, stated plainly: the brief named
`aiLabwareAdditionToDraftLabware` (A1) as the fix site. A1 is the *draft-ghost
preview* mapper and receives only the AiLabwareAddition — no record — so it has
no access to the confirmed definition's topology; with recordId alone it can only
reach the client definition mirror, which does not contain the store-backed
definitions (labware.ts imports only labwareDefinition.ts; `generic/96_well_plate@v1`
is absent from that table at base — verified). Putting the fix at A1 would have
required either new client data (out of scope) or the collapse itself. The
persisting seam for the same addition, in the same owned file, does hold the
record, so the intact placement was applied there. A1 is untouched and still
runs the unchanged legacy chain, so the ghost preview matches what a
non-definition record produces today.

## Acceptance map

AC1 (generic binds generic, 350 uL, definitionId naming it, not nest):
  PASS — src/types/labwareDefinitionBind.test.ts "AC1" leg asserts
  geometry.maxVolume_uL === 350, definitionId === 'generic/96_well_plate@v1',
  definitionId not containing 'nest', sourceRecordId
  'lbw-def-generic-96-well-plate', name 'Generic 96-Well Plate'.
  The fixture is the record body verbatim from
  records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml.
  Verified at the seam the apply path uses (helper + record the handler holds),
  not through A1 — see deviation above.
AC1 control: the legacy mapper on the same record still yields nest 200 uL
  (asserted) — this is the gate's measured defect, now bypassed.
AC2 (intact constructor semantics; three bodies byte-identical):
  PASS — `git diff 6340cea43 -- app/src/types/labware.ts` shows 0 removed lines;
  labwareRecordToEditorLabware, createLabware, pickEditorLabwareType,
  createLabwareFromDefinitionPayload bodies untouched; the new code only calls
  createLabwareFromDefinitionPayload.
AC3 (non-definition records keep the existing fallback chain):
  PASS — AC3 leg: helper returns null for a topology-less flex tip rack record,
  and labwareRecordToEditorLabware still yields labwareType 'tiprack_flex_200',
  200 uL, sourceRecordId unchanged. Runtime: the handler's `??` keeps
  addLabwareFromRecord (context) as the sole path for those records.
AC4 (src/types suite + tsc delta 0):
  PASS — see below.

## Command results (final commit 08272b20b, app/)

RED: `npx vitest run src/types/labwareDefinitionBind.test.ts`
  Test Files 1 failed (1) | Tests 2 failed | 1 passed (3)
   - "TypeError: labwareDefinitionRecordToEditorLabware is not a function" (x2)
   - control leg PASSED at base: collapse to nest, 200 uL confirmed.

GREEN: `npx vitest run src/types/labwareDefinitionBind.test.ts`
  Test Files 1 passed (1) | Tests 3 passed (3)

Suite: `npx vitest run src/types/`
  Test Files 8 passed (8) | Tests 59 passed (59)
  Baseline at base 6340cea43: 7 files / 56 tests green; +1 file / +3 tests are
  this unit's new file. Delta 0 failures.

Types: `npx tsc --noEmit` (app/)
  17 errors total, identical to the recorded baseline of 17, all pre-existing
  (server/src module resolution, SchemaRecordForm, RefCombobox test, tabNavPlugin,
  RecordCreatePanel tests). None in labware.ts, LabwareEventEditor.tsx or the new
  test file. Delta 0.

## Files changed

  app/src/types/labware.ts                    +52 (additions only)
  app/src/graph/LabwareEventEditor.tsx        +24 -2 (AI apply handler only)
  app/src/types/labwareDefinitionBind.test.ts +83 (new)

3 files, 157 added lines — 7 over the 150-line budget, entirely doc comments and
the new test file; no fourth file, nothing outside SCOPE touched.

## Next actions / blockers

- No YAML changed, so no lane-stack reload is needed for the code; the browser
  reviewer still owns acceptance on the live lane stack (prompt-1 replay:
  confirm "Definition · Generic 96-Well Plate" in chat, then check the deck entry
  reports 350 uL and definitionId generic/96_well_plate@v1).
- Residual, deliberately out of scope: `createLabwareFromDefinition` hardcodes
  wellShape 'round' for grid addressing, so the generic plate renders round wells.
  That is a separate surface (well shape from definition data) and was not
  touched here; AC1's assertions are capacity + definitionId, as specified.
- Not changed, flagged for the orchestrator: A1's draft ghost for a store-backed
  definition still previews as the legacy vendor plate until the preview path can
  receive the resolved record (needs a data decision, not a mapping fix).
