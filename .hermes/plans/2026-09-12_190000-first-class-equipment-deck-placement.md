# Plan: place first-class instrument (equipment) records on the deck

Date: 2026-09-12 · Status: PLAN

## Goal

Place a first-class EQUIPMENT entity (an EQP- record or one minted from an
equipment-class) on the bench, carrying `settings` and `acceptsLabware` — never
as an `instrument`-typed labware with bogus well geometry — and have the AI
resolver, the deck, and the step sub-graph carry it.

## Current context / assumptions (already done)

- Declarative equipment model is DONE + tested: `schema/lab/equipment-class.schema.yaml`
  (`settingsDefinition`, `acceptsLabware`), `schema/lab/equipment.schema.yaml`
  (instance `settings`, `equipmentClassRef`), seeds
  `records/seed/equipment-class/eqc-water-bath.yaml` + `eqc-qpcr.yaml`,
  `records/seed/equipment/eqp-water-bath.yaml` (class-linked). Verified by
  `server/src/schema/EquipmentFirstClass.test.ts` (5 pass).
- The deck currently models equipment as labware:
  `app/src/types/labware.ts` `Labware.labwareType==='instrument'` + `instrumentKind`
  (glyphs: `app/src/event-editor/deck/InstrumentGlyphs.tsx`).
  `app/src/types/labwareRequirement.ts` `createLabwareFromRequirement` builds that
  instrument-labware for `equipment:<kind>`.
- Placement model: `app/src/event-editor/types.ts`
  `EventEditorPlacement { placementId, labwareId, location }`; deck renders via
  `state.labwares[placement.labwareId]`
  (`app/src/event-editor/deck/LawnSurface.tsx:219,268`). Editor state
  `app/src/event-editor/EventEditorContext.tsx` has `labwares: Record<string,Labware>`.
- `AddToDeckDialog` (`app/src/event-editor/deck/AddToDeckDialog.tsx`) `buildLabware`:
  for a kind chip / EQP- record it does `createLabware('instrument', name)` +
  `.instrumentKind` — the shape to retire.

## Architecture / approach

Introduce a real `Equipment` entity type + an `equipments: Record<string, Equip-me>`
collection in the editor, discriminate the placement by entity kind
(`entityKind: 'labware'|'equipment'`, default `'labware'`), and make the
resolver/AddToDeckDialog mint & place the equipment entity (EQP- record first,
else mint from a class with the user's settings). The renderer branches on
`entityKind` and reuses `InstrumentGlyphs` (equipment still carries
`instrumentKind` for the silhouette) plus a settings chip. The step sub-graph
carries equipment + settings (Phase 4).

## Step-by-step tasks (TDD; commit each)

### Phase 1 — Equipment entity type + placement discriminator

Task 1.1 (RED): `app/src/event-editor/types.ts` — add an exhaustive test that an
`EventEditorPlacement` with `entityKind:'equipment'` + `equipmentId` type-checks
(put the test in `app/src/event-editor/eventGraphPersistence.test.ts`, asserting
`parseEditorLayoutPlacements` round-trips an equipment placement). Run (fails —
field absent): `cd app && npx vitest run src/event-editor/eventGraphPersistence.test.ts`.

Task 1.2 (GREEN): add to `app/src/types/equipment.ts` (NEW):
```ts
import type { InstrumentKind } from './labware'
/** First-class bench equipment: a record (EQP-) or a minted-from-class entity.
 *  NEVER labware geometry. `instrumentKind` drives the silhouette glyph only. */
export interface Equipment {
  equipmentId: string
  /** The EQP- record id when placed from a real record, else `eqp:`-minted. */
  recordId?: string
  name: string
  instrumentKind: InstrumentKind
  /** equipment-class ref: `{ kind:'record', type:'equipment-class', id }` */
  equipmentClassRef?: { kind: 'record'; type: 'equipment-class'; id: string }
  /** concrete config, keyed by the class settingsDefinition, e.g. { temperature_c: 55 } */
  settings: Record<string, unknown>
  notes?: string
}
```
In `app/src/event-editor/types.ts` extend:
```ts
export type PlacementEntityKind = 'labware' | 'equipment'
export interface EventEditorPlacement {
  placementId: string
  /** entity the placement carries */
  entityKind: PlacementEntityKind
  /** valid when entityKind==='labware' */
  labwareId?: string
  /** valid when entityKind==='equipment' */
  equipmentId?: string
  location: PlacementLocation
  orientation: LabwareOrientation
}
```
Default existing code paths to `entityKind==='labware'` (make it required in the
TYPE but always set it; update the ~6 construction sites found by typecheck).

Task 1.3 (GREEN): `app/src/event-editor/EventEditorContext.tsx` — add
`equipments: Record<string, Equipment>` to `EventEditorState` + `initialState`,
and a `place_equipment` action (mirror `place_new_labware`) + reducer case that
stamps the placement with `entityKind:'equipment'` + `equipmentId`. Update
`eventGraphPersistence.ts` `parseEditorLayoutPlacements` to read
`entityKind`/`equipmentId` and `buildEditorLayoutSnapshot` to write them (keep
back-compat: absent entityKind → labware). Run first the persistence test (R→G),
then `npm run typecheck -w app`.

### Phase 2 — render equipment entities on the deck

Task 2.1 (RED): add a test to `app/src/event-editor/deck/DeckStage.test.tsx`
(or a new `LawnSurface.equipment.test.tsx` mirroring `LawnSurface.moveAcross.test.tsx`)
that places an equipment placement and asserts the tile renders (find the
equipment's name text). Run → fails (renderer skips unknown entity).

Task 2.2 (GREEN): in `app/src/event-editor/deck/LawnSurface.tsx` (~line 219/268),
when `placement.entityKind==='equipment'`, resolve the entity from
`state.equipments[placement.equipmentId]` and render the `InstrumentGlyph`
silhouette (equipment.instrumentKind) + a settings chip (e.g. `55 °C`) instead of
a well grid. Reuse `InstrumentGlyphs`. Add a `settings` chip component
(`app/src/event-editor/deck/EquipmentTile.tsx`) rendering
`equipment.settings` as human text (e.g. `temperature_c → "55 °C"`). Run the R test → pass.

Task 2.3: `AppShell`/state plumbing — thread `state.equipments` wherever
`state.labwares` is read for deck rendering so equipment placements resolve.
Grep `state.labwares[` in `app/src/event-editor/deck/*` and make both maps
available where placements are rendered. Verify: `npm run typecheck -w app`.

### Phase 3 — AddToDeckDialog + AI resolver place equipment, not instrument-labware

Task 3.1 (RED): extend `app/src/types/labwareRequirement.test.ts`:
`createLabwareFromRequirement({ classCurie:'equipment:water_bath' })` must return
an `Equipment` (not a labware) with `settings` and `instrumentKind:'water_bath'`.
Run → fails.

Task 3.2 (GREEN): add `app/src/types/equipmentRequirement.ts`:
```ts
export function createEquipmentFromRequirement(
  classCurie: string, name?: string, settings?: Record<string, unknown>): Equipment {
  const kind = inferInstrumentKind(classCurie) // 'water_bath','qpcr',...
  return {
    equipmentId: `eqp:${classCurie}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,
    name: name || INSTRUMENT_KIND_LABELS[kind],
    instrumentKind: kind,
    settings: settings ?? {},
    ...(classCurie.startsWith('equipment:') ? { equipmentClassRef: { kind:'record', type:'equipment-class', id: classCurie } } : {}),
  }
}
```
In `app/src/event-editor/right-pane/ai/draftPreview.ts`, `buildPreviewFromDraft`:
when `inferInstrumentKind(req.classCurie)!=='generic'`, create an EQUIPMENT
placement (`entityKind:'equipment'`) on the lawn (reuse `nextLawnPosition`) and
return it in a NEW `previewEquipments` field of `EventEditorPreview`
(`app/src/event-editor/EventEditorContext.tsx`) — keep labware requirements on
the existing labware path. Update the failing test → pass. Coverage:
`cd app && npx vitest run src/types/labwareRequirement.test.ts src/event-editor/right-pane/ai/draftPreview.test.ts`.

Task 3.3 (records-first): when the deck context can resolve it, prefer a real
seed/EQP- equipment record for the requested kind: query
`client.searchRecords(label, ['equipment'])`, filter `origin==='local'`, pick the
best kind match (record id `EQP-`); use its `name`+`recordId`, else mint via
Equation `createEquipmentFromRequirement`. Add a unit test to
`app/src/event-editor/deck/addDeckDialogModel.test.ts` asserting the local EQP-
record is chosen before the generic mint. Run it.

Task 3.4: `AddToDeckDialog.tsx` `buildLabware` — for the Equipment tab, build an
`Equipment` placement (Task 3.2 shape), not `createLabware('instrument', …)`.
The Equipment tab already mints `EQP-` (Exa) or lists seed equipment (local);
return an equipment entity with `recordId` from those. Update
`app/src/event-editor/deck/AddToDeckDialog.test.tsx` assertions (currently expect
`labwareType==='instrument'`) to expect an Equipment entity. Run:
`cd app && npx vitest run src/event-editor/deck/AddToDeckDialog.test.tsx`.

### Phase 4 — step sub-graph carries equipment + settings

Task 4.1 (RED): add a server test committing a focused step's realization that
includes equipment — `server/src/api/routes/protocol-steps.test.ts` (or nearest)
POSTs `/protocols/:id/steps/:stepId/subgraph` with `equipments`
(a water bath, settings `{temperature_c:55}`) + `events` (an `incubate` at temp)
and asserts 200 + the minted EVG's payload contains them. Run → fails.

Task 4.2 (GREEN): extend the subgraph route (`server/src/api/routes/RealizationCompileGate.ts`
+ `POST /protocols/:id/steps/:stepId/subgraph`) to accept + mint `equipment` labwares
from the realization payload (event-graph schema `labwares[]` entries may carry
`kind:'equipment'`; `schema/workflow/event-graph.schema.yaml` — add a
discriminated branch so an equipment entry has `settings` — validate via the
existing gate). Client: `patchStepSubgraph` payload carries `equipments` (keep
`labwares` for labware). Run the R test → pass:
`cd server && npx vitest run src/api/routes/protocol-steps.test.ts`.

Task 4.3 (e2e): extend `app/e2e/deck-equipment-via-agent.spec.ts` (add a second
test) that: selects Step 1 (`[data-testid="step-investigate-concept"]` in the run
workspace, or the corresponding run-surface), asks the agent to place two water
baths at 55/70 °C (intercept `/ai/assist/stream` returning equipment
requirements with settings), accepts, and asserts Step 1's compiled graph
(`GET /protocols/:id/steps/:stepId/graph`) contains two equipment with those
temperature settings. Command:
`cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium`.

## Tests / validation (gate)

- `cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck` (server + app)
- `cd app && npx vitest run src/types/equipmentRequirement.test.ts
  src/types/labwareRequirement.test.ts src/event-editor/right-pane/ai/draftPreview.test.ts
  src/event-editor/deck/AddToDeckDialog.test.tsx src/event-editor/deck/LawnSurface.equipment.test.tsx`
- `cd server && npx vitest run src/schema/EquipmentFirstClass.test.ts src/api/routes/protocol-steps.test.ts`
- `cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts e2e/deck-switch-via-agent.spec.ts --project=chromium`
- Restart backend (SOUL.md rule 13) after schema/route changes; real-LLM smoke:
  "place two water baths on the bench, one at 55 °C" → model emits
  `equipment:water_bath` (settings temperature_c) and the deck places two
  equipment tiles with temperature chips.

## Risks / tradeoffs / open questions

- Risk: changing `EventEditorPlacement` ripples to `eventGraphPersistence`,
  `buildFixSeed`, `LabwareEventEditor`, and deck drag/drop. Mitigate: make
  `entityKind` default-to-`'labware'` on every write path; typecheck is the gate.
- Tradeoff: equipment keeps `instrumentKind` for the silhouette glyph
  (UI concern) while capability lives in the class/record (data concern). Keep
  the glyph mapping as a presentation concern only.
- Open: does settings editing (a temperature spinner on a placed water bath)
  ship in this pass? Recommended Phase 4 only (prototype the read-only chip);
  a live editor comes after.
- Open: should a placed-from-record equipment keep a live `equipmentClassRef`
  (so settings validate against `settingsDefinition` + `acceptsLabware`)?
  Recommended yes — the deck placement should mint/attach the class ref so the
  "qPCR accepts plate_96" lint can fire.
- Open: the run-workspace AI chat vs the step-detail inline chat — which surface's
  Accept commits to the focused step's `subGraphRef` remains the Phase-3-overlap
  decision; Task 4.3 targets the step-detail panel (the one already wired to
  `patchStepSubgraph`).