# Plan — Term panel covers labware & equipment, with a kind-scoped override search

Date: 2026-09-21 21:53 EDT
Repo: `/mnt/vast/home/brad/git/computable-lab`
Status: IMPLEMENTED 2026-09-21 (see §0 status below). Not a kanban spec — do NOT drop this in `~/.hermes/specs/inbox/`.

## 0. Implementation status (2026-09-21)

Landed, tested, and browser-verified by direct implementation:

| Task | What | Evidence |
|------|------|----------|
| 1 | `draftTermManifest` classifies labware + equipment, adds `kind` | `6e60dbb6`; `draftTermManifest.test.ts` 12 tests incl. 5 new |
| 2 | Orchestrator feeds the whole draft (events + 3 requirement arrays) to the manifest | `8f810ebd`; `AgentOrchestrator.reconcileQuantities.test.ts` 3 tests (eq/labware rows reach termManifest) |
| 3 | TermPanel groups by kind + dispatches search per kind | `db05cc54`; `TermPanel.test.tsx` 9 tests (3 new); app tsc clean for the path (pre-existing errors elsewhere unchanged) |
| 4 | Threading check: `kind` flows result → panel unchanged | no-op (DraftTermRow import already threaded) |

Browser-verified on `RUN-2026-09-19-run-vwr8` (SOP rule 12 — unit tests do not count):
drafting "Add 200uL of DMEM to A2, put a 96 well plate in slot B2, and place a water
bath set to 55 on the bench" produced **Terms (3) · 1 new** grouped under three section
headers:

    MATERIALS   DMEM                  · unmatched · new
    LABWARE     plate2                · ontology term · CL:96_well_plate
    EQUIPMENT   water bath 55          · ontology term · equipment:water_bath

Clicking the LABWARE row's Search ran a **labware-definition** search ("plate" →
Generic 24/96-well plates, Definition badges) — not materials — proving the kind-scoped
override dispatch works live. The test ghost was discarded; the run was left clean.

Full server gate: 78 tests pass across `draftTermManifest`,
`AgentOrchestrator.reconcileQuantities`, `forceMaterialClarifications`,
`reconcileDraftQuantities`, `recoverInventedMaterialFields`. `server tsc --noEmit` clean
for the changed files.

## Goal

In the event-editor AI review dialogue, the term panel shows **every** thing this step
adds — materials, labwares, equipments — each tagged as local-record / ontology /
vendor / new (minted), and clicking a row opens a slash-search scoped to that kind
(material / labware / equipment) so the biologist can override what the resolution
spine chose.

---

## Current context / assumptions

Measured 2026-09-21 (files read directly from the repo):

- The draft's terms are classified **once**, server-side, by `draftTermManifest`
  (`server/src/ai/draftTermManifest.ts`). It reads ONLY the five material ref fields
  on each `event.details` (`material_spec_ref`, `material_instance_ref`,
  `aliquot_ref`, `vendor_product_ref`, `material_ref`) and emits
  `{ label, source, id, field, eventIndex, vendor?, catalogNumber? }` where
  `source ∈ { local-record, ontology, vendor-product, minted }`.
- The orchestrator builds the manifest with **only the events**:
  `AgentOrchestrator.ts:2419 termManifest: draftTermManifest(result.events)`.
  Labware and equipment requirements live on the same `AgentResult` as
  `labwareAdditions[]`, `labwareRequirements[]`, `equipmentRequirements[]`
  (`server/src/ai/types.ts:640-644`, shapes at `:542-558` and `:612`), but are never
  fed to the manifest — so **labware and equipment never appear in the term panel at
  all**. (Assumption: this is the observed gap; verified the call site passes events only.)
- The app renders the manifest verbatim in `TermPanel.tsx`
  (`app/src/event-editor/right-pane/ai/TermPanel.tsx`), mounted by `ChangesPanel.tsx`
  between the change rows and the Accept/Discard actions. Each row already has
  Search / Accept / Clarify actions (the plan-friction work, 2026-09-20).
- The panel's search is hardwired to the **material** resolver: `TermPanel.tsx:24`
  imports `resolveMaterial` and `TermPanel.tsx:108-111` uses
  `search ?? resolveMaterial` as `resolve`. There are existing resolvers for the other
  two kinds already exported from `app/src/shared/taptab/slashMenu/resolvers.ts`:
  `resolveLabware` (`:338`) and `resolveEquipment` (`:390`) — same `SlashResolver`
  contract, same `SlashSuggestionList` rendering.
- Row actions round-trip through the existing plain-turn channel:
  `AiTabPanel.tsx:482-494` → `termConfirmPrompt` / `termClarifyPrompt`
  (`termFollowUpPrompt.ts`). A confirmed pick emits a `[[kind:id|label]]` mention the
  harness already grounds. This works for any kind **if** the mention type matches
  (`material` / `labware` / `equipment`). The app-side `DraftTermRow` type
  (`TermPanel.tsx:50-62`) has `source`, `id`, `label`, `field`, `eventIndex`, vendor,
  suggestions — but **no `kind`**, so the panel cannot pick a resolver per row today.
- App/server type mirrors: app `AiLabwareRequirement`/`AiLabwareAddition`/
  `AiEquipmentRequirement` at `app/src/types/ai.ts:184-260`; the result bounces them
  through `AssistDraftResult` (`assistStream.ts:60-73`). `AiTabPanel.tsx:291-293`
  already reads them off `result`.

Assumptions checked:
1. `draftTermManifest` is called in exactly one production place
   (`AgentOrchestrator.ts:2419`) and is covered by `draftTermManifest.test.ts` — the
   plan changes its signature, so both must move together.
2. `SlashResolver` is the same contract used by the material resolver — reusing it for
   labware/equipment needs no new infra.
3. The existing `resolveLabware` / `resolveEquipment` search surfaces are the thing a
   "click into a term → /m-style search" should open. If either is thin on a fresh
   appliance, that is a resolver-content issue, not a panel-scoping issue — do not
   special-case it here.

---

## Architecture / proposed approach

Extend `draftTermManifest` to take the whole draft (events **plus** the three
requirement arrays) and to also classify labware and equipment into the same
`{ label, source, id, kind, field }` rows, adding a `kind: 'material'|'labware'|'equipment'`
discriminator. The panel then groups by kind and, on open search, dispatches to
`resolveMaterial` / `resolveLabware` / `resolveEquipment` based on the row's `kind`
instead of always `resolveMaterial`. No new search UI and no new round-trip channel —
the existing plain-turn mention grounding handles an override of any kind.

---

## Step-by-step tasks

Each task: RED test → run → implement → GREEN → commit.

### Task 1 — `draftTermManifest` also classifies labware and equipment (server)

**Files:** `server/src/ai/draftTermManifest.ts`, `server/src/ai/draftTermManifest.test.ts`,
`server/src/ai/types.ts`

**Objective:** the manifest can be built from a whole `AgentResult`-shaped draft and
emits kind-tagged rows for materials, labwares and equipments.

**RED first** — add to `draftTermManifest.test.ts`:

```ts
describe('labware and equipment appear in the manifest, kind-tagged', () => {
  const wholeDraft = {
    events: [
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' } } },
    ],
    labwareRequirements: [{ classCurie: 'CL:96_well_plate' }],
    labwareAdditions: [{ recordId: 'LBW-7X2Q' }],
    equipmentRequirements: [{ recordId: 'EQP-thermocycler-1', handle: 'cycler 1' }],
  };

  it('classifies a requested labware class (definition) as ontology-ish', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.kind === 'labware' && t.label === 'CL:96_well_plate')!;
    expect(row.kind).toBe('labware');
  });

  it('classifies a concrete labware addition as local-record', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.id === 'LBW-7X2Q')!;
    expect(row.source).toBe('local-record');
    expect(row.kind).toBe('labware');
  });

  it('classifies equipment with a recordId as local-record', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.id === 'EQP-thermocycler-1')!;
    expect(row.source).toBe('local-record');
    expect(row.kind).toBe('equipment');
    expect(row.label).toBe('cycler 1'); // prefer handle/name over the id
  });

  it('treats a generic equipment classCurie (no record) as a new/ontology term', () => {
    const m = draftTermManifest({
      events: [],
      equipmentRequirements: [{ classCurie: 'equipment:water_bath', handle: 'bath 55' }],
    });
    const row = m.find((t) => t.kind === 'equipment')!;
    expect(row.label).toBe('bath 55');
    expect(row.id).toBe('equipment:water_bath');
  });

  it('dedupes across events and requirements by label|source|kind', () => {
    const m = draftTermManifest({
      events: [{ event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' } } }],
      labwareAdditions: [{ recordId: 'LBW-7X2Q' }],
    });
    expect(m.filter((t) => t.id === 'LBW-7X2Q')).toHaveLength(1);
  });
});
```

Run — expect FAIL (`kind` does not exist; overload not accepted):
`cd server && npx vitest run src/ai/draftTermManifest.test.ts`

**Implement:**
- In `server/src/ai/draftTermManifest.ts`:
  - Add `kind: 'material' | 'labware' | 'equipment'` to `DraftTermUse`.
  - Change the export signature to accept the whole draft:
    ```ts
    export interface DraftTermInput {
      events?: readonly unknown[];
      labwareRequirements?: readonly Array<{ classCurie?: string; handle?: string; reason?: string }>;
      labwareAdditions?: readonly Array<{ recordId?: string; reason?: string }>;
      equipmentRequirements?: readonly Array<{ recordId?: string; classCurie?: string; handle?: string; reason?: string }>;
    }
    export function draftTermManifest(input: DraftTermInput | readonly unknown[] | undefined): DraftTermUse[]
    ```
    Accept an array (back-compat: treat as `{ events: array }`) or the new object.
  - In the events loop, set `kind: 'material'` on each existing row.
  - Add a `classifyReq` helper: `requirementRow(req, kind, field, opts)` that pushes a
    deduped row. For each requirement:
    - `labwareAdditions[].recordId` → `{ label: recordId, id: recordId, source: 'local-record', kind: 'labware', field: 'labwareAdditions' }`.
    - `labwareRequirements[].classCurie` (definition, not yet a lab) → `{ label: handle ?? classCurie, id: classCurie, source: 'ontology', kind: 'labware', field: 'labwareRequirements' }`.
    - `equipmentRequirements[]` with `recordId` → `{ label: handle ?? recordId, source: 'local-record', kind: 'equipment', field: 'equipmentRequirements' }`.
    - `equipmentRequirements[]` with only `classCurie` → `{ label: handle ?? classCurie, id: classCurie, source: 'ontology', kind: 'equipment', field: 'equipmentRequirements' }`.
  - Dedupe across all sources by `label|source|kind` (extend the existing `seen` set to
    include `kind` so a material and a labware with the same label are not collapsed
    — the hierarchy must not be flattened).
- In `server/src/ai/types.ts`, `AgentResult` already carries the three arrays; no change
  needed here unless the manifest imports their types — use inline structural types to
  avoid a circular import.

Run — expect GREEN, then commit:
`cd server && npx vitest run src/ai/draftTermManifest.test.ts`
`git add server/src/ai/draftTermManifest.ts server/src/ai/draftTermManifest.test.ts && git commit -m "feat(ai): draftTermManifest classifies labware and equipment, kind-tagged"`

---

### Task 2 — Feed the whole draft to the manifest at the call site (server)

**Files:** `server/src/ai/AgentOrchestrator.ts`

**Objective:** `termManifest` is built from events **and** the requirement arrays, so a
draft that also places labware / equipment shows those rows.

**RED first** — in `AgentOrchestrator.reconcileQuantities.test.ts` (or the closest
forced-tool draft test), extend the DMEM draft to also carry an
`equipmentRequirements: [{ recordId: 'EQP-water-bath-1', handle: 'bath 55' }]` and
assert `result.termManifest` contains a row with `kind: 'equipment'` and
`id: 'EQP-water-bath-1'`.
Run — expect FAIL (`termManifest` has no equipment row).

**Implement:** change `AgentOrchestrator.ts:2417-2419`:
```ts
result = {
  ...result,
  termManifest: draftTermManifest({
    events: result.events,
    ...(result.labwareAdditions?.length ? { labwareAdditions: result.labwareAdditions } : {}),
    ...(result.labwareRequirements?.length ? { labwareRequirements: result.labwareRequirements } : {}),
    ...(result.equipmentRequirements?.length ? { equipmentRequirements: result.equipmentRequirements } : {}),
  }),
  ...
};
```
Run — expect GREEN. Commit.

---

### Task 3 — TermPanel resolves per kind and groups by kind (app)

**Files:** `app/src/event-editor/right-pane/ai/TermPanel.tsx`, `TermPanel.test.tsx`

**Objective:** rows are grouped under kind headers (Materials / Labware / Equipment) and
each row's search dispatches to the right resolver.

**RED first** — add to `TermPanel.test.tsx` (mock `resolveMaterial`, `resolveLabware`,
`resolveEquipment` via the component's `search` prop is material-only today; so make the
test assert via injected per-kind resolvers):
- Render `TermPanel` with `terms=[{label:'CL:96_well_plate', source:'ontology', id:'CL:96_well_plate', kind:'labware'}]`
  and click the row's Search → assert the search effect calls the injected labware
  resolver, not `resolveMaterial`.
- Render terms of all three kinds → assert three section headers exist
  (`Materials`, `Labware`, `Equipment`) and each row is under the right one.
Run — expect FAIL (no `kind`, no grouping, resolver fixed).

**Implement:**
- Add `kind?: 'material' | 'labware' | 'equipment'` to `DraftTermRow`
  (`TermPanel.tsx:50-62`), defaulting to `'material'`.
- Import `resolveLabware`, `resolveEquipment` alongside `resolveMaterial`.
- Replace the single `resolve` memo (`:108-111`) with a per-kind resolver map:
  ```ts
  const DEFAULT_RESOLVERS = {
    material: resolveMaterial,
    labware: resolveLabware,
    equipment: resolveEquipment,
  }
  // in component:
  const searchResolvers = useMemo(() => ({
    material: search ?? resolveMaterial,
    labware: resolveLabware,
    equipment: resolveEquipment,
  }), [search])
  ```
  and in the search effect (`TermPanel.tsx:116-136`) select by the active row's kind:
  ```ts
  const kind = searching !== null ? terms[searching]?.kind ?? 'material' : 'material'
  const resolve = searchResolvers[kind]
  ```
- Group rows before render: `const sections = ['material','labware','equipment']`
  filter each, render a `<div className="term-panel__section">` with a header label
  (`Materials` / `Labware` / `Equipment`) when that section has rows. Keep the exact
  row markup and testids (`term-row-${index}`) — add a stable per-section index for the
  data-testid so tests can target within a section.
- CSS in `ai.css`: a `.term-panel__section-header` rule (small caps, muted) — copy the
  heading idiom already present in the panel.
Run — expect GREEN. Commit.

---

### Task 4 — Wire the whole-draft manifest through the app result types (threading)

**Files:** `app/src/event-editor/right-pane/ai/assistStream.ts`, `app/src/event-editor/right-pane/ai/sidebarState.ts`, `AiTabPanel.tsx`

**Objective:** `kind` survives the server→panel wire so the panel can group and route.

**Do (minimal):**
- `assistStream.ts:58 DraftTermRow` is `import type { DraftTermRow } from './TermPanel'`
  — since `DraftTermRow` already gains `kind` in Task 3, no structural change here. Verify
  typecheck: `cd app && npx tsc --noEmit`.
- `AiTabPanel.tsx:284 terms: result.termManifest ?? []` flows through unchanged.

**Verify:** app typecheck clean. No RED needed (pure threading). Commit only if a file
changed (likely none — mark as a no-op check).

---

## Tests / validation

Per task: exact `vitest run` command with expected PASS/FAIL and a commit. After all tasks:

- Server: `cd server && npx tsc --noEmit && npx vitest run src/ai/draftTermManifest.test.ts src/ai/AgentOrchestrator.reconcileQuantities.test.ts`
  — expect PASS, no type errors.
- App: `cd app && npx tsc --noEmit && npx vitest run src/event-editor/right-pane/ai/TermPanel.test.tsx`
  — expect PASS.
- Browser (SOP rule 12 — unit tests do not count): on
  `http://computable:5174/runs/RUN-2026-09-19-run-vwr8`, draft "Add 100 uL of DMEM" and a
  labware + equipment placement in one sentence, Accept into review, then confirm:
  1. The term panel shows sections Materials / Labware / Equipment with the right
     provenance tags (DMEM → new/minted; a concrete `LBW-`/`EQP-` record → local-record).
  2. Clicking a labware row's Search runs a labware-scoped search (not materials).
  3. Choosing a different labware/equipment row emits a course-correcting redraft turn
     that lands the new choice.

---

## Risks, tradeoffs, and open questions

1. **Do not flatten the hierarchy.** A material and a labware that share a label (e.g.
   two rows both labeled "96 well plate") must be two distinct manifest rows — the dedupe
   key becomes `label|source|kind`, never label alone. The `DraftTermRow` eventIndex/field
   already disambiguate within a kind.
2. **`resolveLabware`/`resolveEquipment` are used as-is.** If their first paint is thin on
   a seeded appliance, that's a resolver-content gap, out of scope here; the panel
   mechanism is kind-scoped regardless.
3. **Override round-trip.** A pick already emits `[[kind:id|label]]`; the harness grounds
   material/labware/equipment mentions already (resolveMentions + materialBinding). Verify
   the rename lands on the NEXT draft (it should — the mention rides the redraft), but note
   that for a labware/equipment row the override replaces the *line in the requirements
   arrays*, which the model re-emits on redraft. If a redraft drops the override instead of
   honoring it, that is a model-prompt matter, not this panel — capture it as a follow-up,
   do not wire a second channel.
4. **Back-compat.** `draftTermManifest(events)` (array form) must keep working — all
   existing tests pass unchanged except the new ones. Keep the array branch.
5. **Grouping scope.** Only `labwareRequirements`/`labwareAdditions`/`equipmentRequirements`
   are surfaced as labware/equipment terms. Event `details.labwareId` (the plate an event
   targets) already lives on the deck and is out of scope — it is the canvas, not a new term.