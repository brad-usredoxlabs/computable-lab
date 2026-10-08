# Plan: editable equipment settings + declarative cycling programs

Date: 2026-09-12 · Status: PLAN

## Goal

Let a scientist edit the settings of a placed instrument (water bath → target
temperature; heater-shaker → time + RPM; thermocycler → a multi-step cycling
program) from the focus pane, with the settings declared by the linked
equipment-class record and validated by the single Ajv authority.

## Current context / assumptions

- Equipment is first-class (NOT labware): `app/src/types/equipment.ts`
  `Equipment { equipmentId, recordId?, name, instrumentKind, equipmentClassRef?,
  settings: Record<string, unknown>, notes? }`. `settings` already round-trips
  through deck save → `kind:'equipment'` labwares entry → hydrate
  (`app/src/event-editor/eventGraphPersistence.ts` `mintEquipmentLabels`,
  `equipmentRecord`).
- The equipment-class record declares capability declaratively
  (`schema/lab/equipment-class.schema.yaml`): `settingsDefinition[]` each
  `{ key, label, valueType, unit?, min?, max?, enum? }` where
  `valueType ∈ [number, string, boolean, enum]`. Seeds:
  `records/seed/equipment-class/eqc-water-bath.yaml` (temperature_c),
  `eqc-qpcr.yaml` (anneal_temperature_c, cycles).
- Clicking a placed instrument opens `EquipmentFocus`
  (`app/src/event-editor/focus/EquipmentFocus.tsx`) — currently READ-ONLY: it
  renders the settings values + acceptsLabware and has a Close button. The tile
  chip (`app/src/event-editor/deck/EquipmentTile.tsx` `settingsChipText`) is
  also read-only.
- The event editor reducer (`app/src/event-editor/EventEditorContext.tsx`) has
  `place_equipment` / `placeEquipment` but NO action to update a placed
  equipment's `settings`.
- Steps are localized to realizations via `POST
  /protocols/:id/steps/:stepId/subgraph`
  (`server/src/api/routes/protocol-steps.ts`); labwares[] entries may already
  carry `kind:'equipment'` + settings.
- There is NO multi-level / structured settings type today. `valueType` has no
  `profile`/`object`/`array` — a cycling program (initial hold; 30× of two
  steps) cannot be declared or validated.

## Architecture / approach

Make the equipment-class schema the single source of truth for editable
settings. Add two `valueType`s — `duration_sec` (number with a seconds unit) and
`profile` (a structured, schema-defined cycling program) — to
`settingsDefinition`, with Ajv validating instances. Make `EquipmentFocus`
editable: it renders controls from the loaded `settingsDefinition` (number →
spinner, enum → dropdown, profile → a cycling-program editor) and dispatches a
new `update_equipment_settings` reducer action that mutates the placed
equipment's `settings`. The cycling program rides on the equipment's `settings`
(not new storage), so the existing mint/hydrate persistence carries it with zero
backend change; a step realization that includes the thermocycler carries the
program through the already-wired `kind:'equipment'` subgraph path.

## Step-by-step tasks

### Phase A — equipment instance settings editing (water bath / heater-shaker)

#### Task A1 (RED): test that an equipment settings editor action exists
`app/src/event-editor/EventEditorContext.test.ts` (create if absent; mirror the
`makeState` fixture in `app/src/event-editor/deck/LawnSurface.equipment.test.tsx`
lines 26–68). Add a test named
`equipment settings update mutates the placed equipment`:

```ts
import { eventEditorReducer, eventEditorInitialState } from './EventEditorContext'
import type { Equipment } from '../types/equipment'

const bath: Equipment = {
  equipmentId: 'eqp-1',
  name: 'Water bath 1',
  instrumentKind: 'water_bath',
  settings: { temperature_c: 50 },
}

it('equipment settings update mutates the placed equipment', () => {
  const placed = eventEditorReducer(
    eventEditorInitialState,
    { type: 'place_equipment', equipment: bath, location: { kind: 'lawn', xMm: 10, yMm: 10 }, orientation: 'landscape' },
  )
  const updated = eventEditorReducer(placed, {
    type: 'update_equipment_settings',
    equipmentId: 'eqp-1',
    settings: { temperature_c: 65 },
  })
  expect(updated.equipments['eqp-1']).toMatchObject({ settings: { temperature_c: 65 } })
  expect(updated.placements).toHaveLength(1)
})
```

Run (fails — action type absent):
`cd app && npx vitest run src/event-editor/EventEditorContext.test.ts`

#### Task A2 (GREEN): add the reducer action
In `app/src/event-editor/EventEditorContext.tsx`:
1. Extend `EventEditorAction` (after the `place_equipment` union member, ~line 341):
```ts
| { type: 'update_equipment_settings'; equipmentId: string; settings: Record<string, unknown> }
```
2. Add a reducer case (after the `place_equipment` case, ~line 702):
```ts
case 'update_equipment_settings': {
  const current = state.equipments[action.equipmentId]
  if (!current) return state
  return {
    ...state,
    equipments: {
      ...state.equipments,
      [action.equipmentId]: { ...current, settings: action.settings },
    },
  }
}
```
3. Add to `EventEditorActions` interface + actions object (near `placeEquipment`, ~line 1321):
```ts
updateEquipmentSettings: (equipmentId: string, settings: Record<string, unknown>) =>
  dispatch({ type: 'update_equipment_settings', equipmentId, settings }),
```
Rerun the A1 test → pass. Then `cd app && npm run typecheck`.

#### Task A3 (RED): EquipmentFocus renders editable controls from settingsDefinition
`app/src/event-editor/focus/LabwareFocus.equipment.test.tsx` (already mocks
`getRecord` returning a class with `settingsDefinition: [{ key: 'temperature_c',
label: 'Target temperature', valueType: 'number', unit: '°C' }]`). Add to the
existing `describe`:
```ts
it('renders an editable settings control for a number setting', async () => {
  // reuse the existing mocked class record + a focused water bath placement
  const input = await screen.findByTestId('equipment-setting-input-temperature_c')
  expect(input.getAttribute('type')).toBe('number')
  // dispatch not wired yet — this fails because the input does not exist
})
```
Run → fails (no input rendered).

#### Task A4 (GREEN): build the settings form
Extend `app/src/event-editor/focus/EquipmentFocus.tsx`:
- Change its signature to accept dispatch: add a second optional prop
  `onUpdateSettings?: (equipmentId: string, settings: Record<string, unknown>) => void`.
- Below `cls` (class record), build a `draft` state; for each
  `cls.settingsDefinition` entry render a control keyed
  `equipment-setting-input-${key}` with `data-testid` of the same name:
  - `valueType 'number'` → `<input type="number" ... />`
  - `valueType 'enum'` → `<select>` of `def.enum`
  - `valueType 'boolean'` → checkbox
  - `valueType 'string'` → text input
- Primary control style mirrors the existing `SettingsPanel`
  (`app/src/event-editor/right-pane/protocol/SettingsPanel.tsx`): label row +
  input + unit suffix; reuse its inline styles or the `focus__equipment-setting`
  classes already in `app/src/event-editor/styles/eventEditor.css` (§Equipment
  focus block).
- Add a `Save settings` button (`data-testid="equipment-settings-save"`) that
  calls `onUpdateSettings(equipment.equipmentId, draft)` and shows `saved`.
- In `app/src/event-editor/focus/LabwareFocus.tsx` pass the new prop from the
  reducer action (line ~395 `EquipmentFocus` call):
```ts
onUpdateSettings={(equipmentId, settings) =>
  actions.updateEquipmentSettings(equipmentId, settings)}
```
(the reducer action requires the A2 `updateEquipmentSettings` action wiring).
Rerun A3 → pass; then `cd app && npm run typecheck`.

#### Task A5: seed heater-shaker class + deck save durability check
`records/seed/equipment-class/eqc-heater-shaker.yaml` (new):
```yaml
$schema: https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml
kind: equipment-class
id: EQC-HEATER-SHAKER
name: Heater Shaker
settingsDefinition:
  - key: temperature_c
    label: Target temperature
    valueType: number
    unit: "°C"
  - key: duration_sec
    label: Duration
    valueType: duration_sec
    unit: s
  - key: rpm
    label: Shake speed
    valueType: number
    unit: rpm
acceptsLabware: []
```
Verify settings already persist via deck save by adding one assertion to
`app/src/event-editor/eventGraphPersistence.test.ts` (the existing "mints
first-class equipment into the accepted payload" test): after `mintedBath`,
set `settings: { temperature_c: 55 }` and assert `hydrated.equipments[...]`
carries it (this already passes — documents the contract). Run:
`cd app && npx vitest run src/event-editor/eventGraphPersistence.test.ts`

### Phase B — declarative multi-level cycling program (thermocycler)

#### Task B1 (RED): Ajv rejects a profile not declared by settingsDefinition
`server/src/schema/EquipmentFirstClass.test.ts` (has the `loadEquipmentSchemas`
validator, lines 25–35). Add:
```ts
it('rejects an equipment instance whose settings key is not in settingsDefinition', async () => {
  const validator = await loadEquipmentSchemas()
  // schema change not present yet → this valueType is invalid → expect the test to be written to FAIL
  expect(validator.validate({ kind: 'equipment-class', id: 'EQC-TC', name: 'Thermocycler',
    settingsDefinition: [{ key: 'cycling_program', label: 'Cycling program', valueType: 'profile' }],
    acceptsLabware: ['plate_96'] }, 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml').valid).toBe(true)
})
```
Run → fails (`valueType: profile` not in the enum). This pins the new
`valueType` to the declarative schema.

#### Task B2 (GREEN): extend the equipment-class schema
`schema/lab/equipment-class.schema.yaml`:
1. In `settingsDefinition.items.properties`, extend the `valueType` enum:
```yaml
        valueType:
          type: string
          enum: [ number, string, boolean, enum, duration_sec, profile ]
```
2. Add a `profileDefinition` property (alongside `unit`/`min`/`max`/`enum`):
```yaml
        profileDefinition:
          type: object
          additionalProperties: false
          properties:
            initial:
              type: object
              additionalProperties: false
              required: [ temperature_c, duration_sec ]
              properties:
                temperature_c: { type: number }
                duration_sec: { type: number }
            cycles:
              type: object
              additionalProperties: false
              required: [ count, steps ]
              properties:
                count: { type: integer, exclusiveMinimum: 0 }
                steps:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    additionalProperties: false
                    required: [ temperature_c, duration_sec ]
                    properties:
                      temperature_c: { type: number }
                      duration_sec: { type: number }
```
Rerun B1 → pass.

#### Task B3 (RED): Ajv validates a cycling program instance
In `EquipmentFirstClass.test.ts` add:
```ts
it('accepts a thermocycler instance with a multi-step cycling program', async () => {
  const validator = await loadEquipmentSchemas()
  const out = validator.validate({
    kind: 'equipment', id: 'EQP-TC-1', name: 'TC1', status: 'active',
    equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-TC' },
    settings: {
      cycling_program: {
        initial: { temperature_c: 95, duration_sec: 60 },
        cycles: { count: 30, steps: [
          { temperature_c: 60, duration_sec: 30 },
          { temperature_c: 95, duration_sec: 5 },
        ] },
      },
    },
  }, 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml')
  expect(out.valid).toBe(true)
})
```
Run → fails (equipment.schema `settings` is `additionalProperties: true` but
nothing validates the profile shape — need the class-aware instance check).

#### Task B4 (GREEN): add class-aware instance validation
`server/src/schema/lab/equipment.schema.yaml` — the instance `settings` must
validate its keys/shapes against the linked class. Add a declarative
`allOf`-style coercion is not inline-able across records, so implement a lint
rule instead (SQL of the declarative lint engine, not TS): add
`server/src/schema/equipment-settings.lint.yaml` (new) with a
`settingsDefinition`-conformance predicate. If a generic "settings conform to
class" predicate is not yet expressible in
`server/src/lint` (Syntax check: run `cd server && npx vitest run
src/schema/EquipmentFirstClass.test.ts`), fall back to a small deterministic
check in `server/src/api/routes/protocol-steps.ts` (the subgraph gate already
validates labwares/equipment): when minting an equipment labwares entry (line
~703), validate `profileDefinition` shape structurally (temperature_c/duration_sec
present, steps non-empty) and reject with 422 on mismatch. Implement whichever
the lint predicate supports; at minimum assert in the B3 test that the ROUTE
(`POST /protocols/:id/steps/:stepId/subgraph`, using the real store +
`checkRealizationProposal`) rejects a malformed cycling_program with 422. Rerun
B3 + `server/src/api/routes/protocol-steps.test.ts` → pass.

#### Task B5: seed qPCR class with a real cycling program definition
Update `records/seed/equipment-class/eqc-qpcr.yaml` `settingsDefinition` to add:
```yaml
  - key: cycling_program
    label: Cycling program
    valueType: profile
    profileDefinition:
      initial:
        temperature_c: 95
        duration_sec: 180
      cycles:
        count: 40
        steps:
          - temperature_c: 95
            duration_sec: 5
          - temperature_c: 60
            duration_sec: 30
```
Run `cd server && npx vitest run src/schema/EquipmentFirstClass.test.ts` and
`cd server && npx vitest run src/seeds/labware.seed.test.ts` → pass.

#### Task B6 (RED): profile editor renders + commits a cycling program
In `LabwareFocus.equipment.test.tsx`, mock `getRecord` to return a class whose
`settingsDefinition` includes the `cycling_program profile` (copy the B5
`profileDefinition`), focus a thermocycler, then:
```ts
it('renders a cycling-program editor and saves a multi-step program', async () => {
  const editor = await screen.findByTestId('equipment-profile-editor-cycling_program')
  expect(editor).toBeTruthy()
  // stub the dispatched action via the mocked actions.updateEquipmentSettings
  fireEvent.click(screen.getByTestId('equipment-settings-save'))
  await waitFor(() => expect(mocks.updateEquipmentSettings)
    .toHaveBeenCalledWith('eqp-1', expect.objectContaining({ cycling_program: expect.any(Object) })))
})
```
Run → fails (`updateEquipmentSettings` action not in the test's context mock).

#### Task B7 (GREEN): build the cycling-program editor + tests
- In `app/src/event-editor/focus/EquipmentFocus.tsx`: when `def.valueType ===
  'profile'`, render a purpose-built editor
  (`data-testid="equipment-profile-editor-${def.key}"`) with:
  - an `Initial hold` row (temperature_c number + duration_sec number),
  - a `cycles.count` integer input,
  - a `cycles.steps[]` repeatable list (add/remove step rows, each with
    temperature_c + duration_sec),
  - the `settings[def.key]` value shaped as `{ initial, cycles: { count, steps } }`.
- Add `mocks.updateEquipmentSettings = vi.fn()` to the test's
  `vi.hoisted` block and the `actions` mock in
  `app/src/event-editor/focus/LabwareFocus.equipment.test.tsx`, so B6 exercises
  the save path.
Rerun B6 → pass; `cd app && npm run typecheck`.

### Phase C — end-to-end + browser gate

#### Task C1
Extend `app/e2e/deck-equipment-via-agent.spec.ts` (after the existing
click-focus → Close block) to:
1. re-focus the water bath, clear the temperature input, type `65`, save, Close,
2. assert the tile chip now reads `65 °C` (browser-verifies the edit persists
   from just the reducer, no LLM).
Command: `cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium`

#### Task C2 — validation gate
- `cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck` (server + app)
- `cd app && npx vitest run src/event-editor/EventEditorContext.test.ts src/event-editor/focus/LabwareFocus.equipment.test.tsx src/event-editor/eventGraphPersistence.test.ts`
- `cd server && npx vitest run src/schema/EquipmentFirstClass.test.ts src/schema/EventGraphEquipmentSchema.test.ts src/api/routes/protocol-steps.test.ts`
- `cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium`
- Restart the :3001 backend (SOUL.md rule 13) after schema changes; confirm the
  module authoring commands above reflect the updated `eqc-qpcr.yaml`.

## Tests / validation (gate)

- Every task follows RED → (run failing test) → GREEN → (run passing test) → `npm
  run typecheck`.
- Final gate identical to C2.

## Risks / tradeoffs / open questions

- **Lint vs TS for class-aware instance validation (B4):** the "settings must
  conform to the linked class's settingsDefinition/profileDefinition" check is a
  cross-record rule — the right home is a declarative lint predicate
  (`server/src/schema/*.lint.yaml`), not a hardcoded TS branch. If the lint DSL
  can't express "reject unknown settings key / malformed profile" yet, prefer the
  smallest TS check at the subgraph-mint boundary and file a follow-up to move it
  into lint YAML (per CLAUDE.md rule 1: business logic lives in lint specs).
- **Scope of "record" settings:** this plan makes settings editable on the
  PLACED equipment entity (editor state → EVG persistence). It does NOT add a
  PATCH endpoint to mutate a canonical `EQP-` record's `settings`. If the intent
  is "edit the stored instrument record" too, add a fourth phase: `PATCH
  /equipment/:id/settings` echoing the existing step-settings route pattern
  (protocol-steps.ts lines 598–650) plus a client `apiClient.updateEquipmentSettings`.
- **MicroProgram vs event carries:** the cycling program lives on the equipment
  `settings`; it reaches a step realization through the already-wired
  `kind:'equipment'` subgraph entry. No new event type (`macro_program` already
  accepts an opaque `program` object) is introduced — YAGNI until a step needs
  to vary the program from the equipment's configured default.
- **Value-type proliferation:** adding `duration_sec` and `profile` grows the
  enum; keep definitions additive and back-compatible (existing classes omit the
  new valueTypes and remain valid).