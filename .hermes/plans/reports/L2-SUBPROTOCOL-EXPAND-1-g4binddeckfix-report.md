# L2-SUBPROTOCOL-EXPAND-1 — unit g4binddeckfix (fix cycle 1 of g4bindfix2)

Lane 2; branch cl/lane2-subproto-g4bindfix2-0010; base 9958f592be9e432147e2837b2a0b650eaa11ab05.
Scope: the two MAJOR adversarial findings (deck labwares fabricated; deckbind fixtures
impossible). D-4 material filter and D-5 debounce accumulation were NOT touched.

## Findings fixed

F-M1 — BindingModeEditor.tsx deckLabwares (base lines 374-395) membership-tested the
persisted payload.labwareType against LABWARE_CONFIGS, but that field holds the schema
CATEGORY (plate, reservoir, …) while LABWARE_CONFIGS is keyed by the legacy RENDER enum.
Every bound record therefore collapsed to `plate_96` with a hardcoded
`addressing: { type: 'grid' }` and the default 8x12 geometry — fabricated configuration
(CLAUDE.md Hard Boundary).

F-M2 — BindingModeEditor.deckbind.test.tsx fixtures carried `labwareType: 'plate_96'` /
`'reservoir_12'`, payloads a shipped record cannot have, so the test could never see the
defect (vacuous pass).

## Changes

app/src/graph/BindingMode/BindingModeEditor.tsx
- deckLabwares now builds each object with the canonical mapper
  `labwareRecordToEditorLabware({ ...payload, recordId: record.recordId })`, then keeps
  `labwareId = binding.instanceRef`, `recordId = binding.instanceRef`, `name = roleId`.
- Deleted the `'plate_96'` default and the hardcoded `addressing: { type: 'grid' }`;
  the mapper's addressing/geometry/type are used verbatim.
- A bound record missing from labwareUniverse is skipped (no fabricated object).
- Imports: LABWARE_CONFIGS/LabwareType no longer used; added the mapper +
  LabwareRecordPayload. Nothing else in the file changed.

app/src/graph/BindingMode/BindingModeEditor.deckbind.test.tsx
- Fixtures now SHIPPED shape: LWI-PLATE1 `labwareType: 'plate'`, format {rows:8, cols:12};
  LWI-RES1 `labwareType: 'reservoir'`, format {rows:1, cols:12}.
- Test A keeps its D-4 pins (placementRoles ['plate'], not topping_medium, no MAT-TOP1
  labwareId, LWI-PLATE1 present) and adds shape assertions: plate resolves to
  labwareType 'plate_96' with addressing/geometry equal to what
  labwareRecordToEditorLabware produces for that record.
- New test C renders a plan with the reservoir role bound too and asserts the reservoir
  deck object equals the mapper output: labwareType 'reservoir_12', addressing type
  'linear', 12 linearLabels, reservoir geometry — not a plate.
- Extracted `mockGetRecordWithUI(plannedRun = mockPlannedRun)` so test C can serve a
  variant planned-run; beforeEach behaviour unchanged.
- Test B (D-5 debounce) untouched.

## Red / green evidence

RED (commit 940efa19, test change only, against base fix code):
  npx vitest run src/graph/BindingMode/BindingModeEditor.deckbind.test.tsx
  -> Test Files 1 failed (1) | Tests 2 failed | 1 passed (3)
     A: addressing expected {type:'grid', rows:8, columns:12, rowLabels, columnLabels}
        received {type:'grid'}
     C: expected 'reservoir_12', received 'plate_96'

GREEN (commit a2e6e9eb, fix applied):
  npx vitest run src/graph/BindingMode/BindingModeEditor.deckbind.test.tsx
  -> Test Files 1 passed (1) | Tests 3 passed (3)

  npx vitest run src/graph/BindingMode/
  -> Test Files 6 passed (6) | Tests 33 passed (33)

## Typecheck (honest state of this tree)

`npm run typecheck -w app` FAILS, but not on this change. This worktree's
app/node_modules is a symlink to /mnt/vast/home/brad/git/cl-integration-2/app/node_modules
(pnpm non-hoisted, no root node_modules), so `tsc --noEmit` cannot resolve
prosemirror-view, ajv, ajv-formats, yaml, etc.

Measured both sides with the same command:
- base 9958f592 (throwaway worktree + same node_modules symlink): 14 errors, none in
  BindingMode or labware.ts.
- this commit (a2e6e9eb): 14 errors, identical set, none in BindingMode or labware.ts.
So: no new errors; the "baseline clean" claim in the brief does not reproduce in this
checkout for environment reasons that pre-date the unit.

## Files changed
- app/src/graph/BindingMode/BindingModeEditor.tsx
- app/src/graph/BindingMode/BindingModeEditor.deckbind.test.tsx
- this report

## Next actions / residual risk
- The deck panel still falls back to 8x12 inside its own SVG render when
  addressing.rows/columns are absent (DeckVisualizationPanel.tsx:271-272); after this
  fix bound records always carry full grid/linear addressing, so that fallback is no
  longer reachable from this path. Behaviour outside scope; left untouched.
- Browser acceptance of prompt-1 deck journey remains with the browser reviewer.

L2-SUBPROTOCOL-EXPAND-1 UNIT g4binddeckfix DONE 055b3488712b142e6676932988018e66c9b27b7f
