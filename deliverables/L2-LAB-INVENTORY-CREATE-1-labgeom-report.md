# L2-LAB-INVENTORY-CREATE-1 / labgeom (g3 LEG D, D4 "geometry unobservable")

Worktree: /home/brad/cl-wt/L2-LABINV-labgeom-lane2
Branch: cl/lane2-labinv-labgeom-0239
Base: f42df07599cb064fb3d713bfdaff52a674e8db23
Unit: 1 of 1 (shelf-row definition join and g4 gate legs NOT in scope)

## Decision

The create modal already receives every labware-definition envelope as the
`definitions` prop (loaded once by LabCollectionView). The missing observation
was a purely presentational readout, so the fix resolves the selected envelope
from that prop in-component — no second fetch, no schema change, no change to
the POST payload. `labwareId` remains the only definition-derived key sent
(`LabwareInstanceCreateModal.tsx:79` -> now `:94`). No new CSS class was needed:
the row reuses the existing `lab-modal__row` / `lab-modal__label` classes, so
`labModalStyles.ts` was NOT touched (2 files, not 3).

Readout rules implemented exactly as specified:
- `format.wellCount` number -> `<n> wells`
- `format.rows` + `format.cols` numbers -> `<rows>×<cols>`
- joined with ` · `; `wellNaming` appended only when a non-empty string and at
  least one count exists
- otherwise the literal `Geometry not declared on this definition`
- rendered as a plain `<span>` (no input/select, no aria-live), value derived
  from state on every render so switching definitions cannot show a stale value.

## RED (before touching the product file)

Command (from `app/`): `npx vitest run src/collections/LabwareInstanceCreateModal.test.tsx`
with `TMPDIR=/home/brad/.labgeom-scratch`.

RAW (tail):

```
    335|     // Declared geometry is projected from the definition — never type…
    336|     const readout = screen.getByTestId('labware-instance-definition-ge…
       |                            ^
 ❯ src/collections/LabwareInstanceCreateModal.test.tsx:336:28

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Duration  13.67s (transform 141ms, setup 1.25s, collect 1.81s, tests 146ms, environment 8.69s, prepare 358ms)
```

Failure body: `Unable to find an element by: [data-testid="labware-instance-definition-geometry"]`
(the 7 pre-existing arms stayed green). The arm asserts rendered TEXT
(`96 wells`, `8×12`, `A1..H12`, then the exact fallback string after switching
to the geometry-less trough), so deleting the row cannot leave it vacuously green.

## Diff summary (`git diff --stat f42df075..HEAD`)

```
 .../LabwareInstanceCreateModal.test.tsx            | 39 ++++++++++++++++++++++
 app/src/collections/LabwareInstanceCreateModal.tsx | 20 +++++++++++
 2 files changed, 59 insertions(+)
```

- test: third `MOCK_DEFINITIONS` entry `LW-PLATE-96F` (`96-well flat plate`,
  `format: { rows: 8, cols: 12, wellCount: 96, wellNaming: 'A1..H12' }`) plus ONE
  new arm `(viii)`; existing arms (i)-(vii) untouched.
- product: geometry projection before `return`, and one read-only row inserted
  between the definition row and the Label row. Payload untouched.

Measured size: 2 files, 59 added lines (budget 2 files / 70 lines).

## VERIFY

1) `cd app && npx vitest run src/collections/LabwareInstanceCreateModal.test.tsx`

```
 ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (8 tests) 132ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  11.01s (transform 115ms, setup 1.15s, collect 1.66s, tests 132ms, environment 7.24s, prepare 157ms)
```

(Pre-existing `act(...)` warning from the schema-fetch effect persists; not an
assertion failure and not introduced by this unit.)

2) `cd app && npx tsc --noEmit` — ENVIRONMENT DEVIATION, measured honestly:

```
src/editor/taptab/tabNavPlugin.ts(7,33): error TS2307: Cannot find module 'prosemirror-view' ...
src/editor/taptab/widgets/ObjectWidget.nested.test.tsx(53,27): error TS2307: Cannot find module 'ajv/dist/2020.js' ...
src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx(57,27): error TS2307: Cannot find module 'ajv/dist/2020.js' ...
src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx(448,23): error TS7006: Parameter 'e' implicitly has an 'any' type.
src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx(452,23): error TS7006: ...
src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx(565,20): error TS7006: ...
src/event-editor/create/RecordCreatePanel.gc16.test.tsx(31,27): error TS2307: Cannot find module 'ajv/dist/2020.js' ...
../server/src/schema/SchemaLoader.ts(16,36): error TS2307: Cannot find module 'yaml' ...
../server/src/ui/UISpecLoader.ts(9,18): error TS2307: Cannot find module 'yaml' ...
../server/src/validation/AjvValidator.ts(17,21): error TS2307: Cannot find module 'ajv/dist/2020.js' ...
../server/src/validation/AjvValidator.ts(18,73): error TS2307: Cannot find module 'ajv' ...
../server/src/validation/AjvValidator.ts(19,24): error TS2307: Cannot find module 'ajv-formats' ...
../server/src/validation/types.ts(8,32): error TS2307: Cannot find module 'ajv' ...
```

13 lines, exit 2, ZERO in either touched file. Proven pre-existing and
environmental, not caused by this unit: `app/node_modules` in this lane is a
symlink to `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`, a curated
subset with no `ajv`, `yaml` or `prosemirror-view`. A read-only `git archive`
export of base f42df075 (`app/src`, `app/tsconfig*.json`, `server/src`) run
against the same node_modules produced a byte-identical 13-line error list
(`diff` exit 0, after path normalization). No dependency install was attempted
(per brief). The brief's "0 errors" baseline therefore holds only on a
fully-installed checkout; in this lane it is an environment gap, not a diff
defect.

3) `git -c core.fileMode=false status --short` -> no output (STATUS_LINES=0).

## Not changed (explicit)

- POST payload: `labwareId` only; no `format`/geometry key, no `format: undefined`.
- Option text `name (recordId)`; schema-id-based `getSchema` enum read.
- `app/src/collections/LabCollectionView.tsx` (shelf rows) — untouched.
- `schema/**`, `server/**`, `labModalStyles.ts` — untouched.

## Follow-up (NOT this unit)

Shelf rows still show only the raw `labwareId` (`LabCollectionView.tsx:138`);
joining definition geometry onto instance rows is the next unit.

L2-LAB-INVENTORY-CREATE-1 UNIT 1 DONE 7a1e0dfe42a4fd9f65a222d4eab3fc34fdcdfb33
