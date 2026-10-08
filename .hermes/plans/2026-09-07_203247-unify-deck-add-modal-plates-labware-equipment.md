# Unify the deck "add" flow: one modal (Plates / Labware / Equipment tabs) that places at the click point

## Goal

Replace the two separate add-dialogs (`AddLabwareDialog` + `AddEquipmentDialog`) with **one** "Add to deck" modal that opens when the user clicks a deck position or lawn point, offers a type selector (Plates / Labware / Equipment; Robot deferred — see Open Questions), shows catalog-defaults-and-lab-definitions first then Exa-then-ontology hits, lets the user name the item, and **places it at the exact point they clicked**.

## Current context / assumptions

- Two co-existing dialogs today, both in `app/src/event-editor/deck/`:
  - `AddLabwareDialog.tsx` — opened on deck-slot click (`DeckSlot.tsx:205`) and lawn click (`LawnSurface.tsx:342`). Groups a static catalog (`LABWARE_TYPE_LABELS` from `app/src/types/labware.ts`) by `LabwareCategory` (`plate/reservoir/tube/tiprack/glassware`), plus an Exa tier at the bottom driven by `useVendorExaSearch({ category: 'labware' })`. Click-to-place (no name, no submit button). `surfaceKind: 'slot' | 'lawn'` filters lawn-only types.
  - `AddEquipmentDialog.tsx` — **separate**, opened only from the lawn title-bar button `⚙️ + Add equipment (Exa)` (`LawnSurface.tsx:226`). Has an instrument-kind picker, an Exa search, a name field, and an explicit **"Add to bench"** submit. Placed via `LawnSurface.handleEquipmentPick` (`LawnSurface.tsx:146`) which **stages a staggered top-left position — it does NOT use a click point**. This is exactly the user's complaint: "it doesn't actually PLACE the equipment. But how would it know WHERE."
- User's desired model (verbatim): "the user clicks the deck, chooses what type of thing they want to place [type selector], they see the defaults and what the lab has [catalog + lab definitions], there is a search that finds defaults-and-already-added-first-then-exa-and-ontology hits. Whichever thing they select, they can name it and click add and it gets added at the point that they clicked."
- **Placement already happens from the click point** for the labware path: `LawnSurface.handleSurfaceClick` → `screenToLawnMm` → `dialogState.xMm/yMm`, then `handlePick` clamps + `actions.placeNewLabware`. Equipment just never got routed through it. So the fix is: route *every* tab through the same click-aware `handlePick`.
- Search sources already available (no new backend routes needed):
  - Catalog defaults: static `LABWARE_TYPE_LABELS` (in `app/src/types/labware.ts`).
  - "What the lab has" (lab definitions registry): `apiClient.searchLabwareDefinitions({ q, limit })` → `{ hits: [{ recordId, label, kind: 'labware-definition' }] }`. Developer comment at `server/src/api/routes.ts:681` calls it "defaults / shipped + study definitions". Record → editor shape via `labwareRecordToEditorLabware`.
  - Exa vendor: `useVendorExaSearch` (`app/src/shared/vendor-exa/useVendorExaSearch.ts`) + `apiClient.createFromVendorExa(hit)` (mints `EQP-`/`LBW-` records).
  - Ontology: `apiClient.resolve({ term, kinds })` → `ResolveCandidate[]` (`client.ts:214`); tier 4 = `vendor` (Exa), tier 2/3 = OAK/OLS4 ontology. For equipment/labware the ontology tiers are sparsely populated — treat resolve() as the "ontology" tier and expect it to often come back empty for this domain.
- The two existing test files to evolve: `AddLabwareDialog.test.tsx` (3 tests), `AddEquipmentDialog.test.tsx` (2 tests).
- Instrument kind picker + silhouettes (`InstrumentGlyphs.tsx`, `inferInstrumentKind`) and the `instrument` labware type (`labware.ts:1015`) stay as-is; only the *surface* that hosts them changes.

## Architecture / proposed approach

A single new `AddToDeckDialog.tsx` that absorbs both existing dialogs' behavior behind a **type-tab selector** (`plates | labware | equipment`). It takes `surfaceKind` and the *resolved click target* (`{ kind: 'lawn', xMm, yMm, surfaceId }` or `{ kind: 'slot', slotId }`) up front — so `onPick(labware)` always means "place at the target that was clicked." `LawnSurface` and `DeckSlot` both mount it (no more separate equipment button), deleting `AddEquipmentDialog.tsx` and `LawnSurface.handleEquipmentPick`. Search is a merged ranker: catalog defaults + lab definitions first, then Exa, then resolve()/ontology; every tab shares one query input, a name field, and an explicit **Add** submit button. `handlePickEquipment`-style staggered placement is removed entirely.

## Step-by-step tasks

TDD per task: write/extend the failing test first, run it to confirm it fails, implement minimally, run to confirm pass, commit. Commands run from the repo root `/mnt/vast/home/brad/git/computable-lab` (app workspace) unless noted. App typecheck: `npm run typecheck -w app`. Run a single test: `cd app && npx vitest run <file>`.

### Task 1 — Introduce the type-tab model + ranked-search helper (pure, TDD)

Add a small pure module so the tab model and the cross-source ranking are unit-testable without React.

File `app/src/event-editor/deck/addDeckDialogModel.ts`:

```ts
import type { LabwareCategory } from '../../types/labware'

export type AddDeckTab = 'plates' | 'labware' | 'equipment'

export interface AddDeckSourceItem {
  /** Stable key for dedupe */ key: string
  source: 'catalog' | 'lab-db' | 'exa' | 'ontology'
  label: string
  kind: 'labware' | 'instrument'
}
```

Column-split rule: `plate` category belongs to the `plates` tab; everything else (`reservoir/tube/tiprack/glassware/instrument`) belongs to `labware` (plates split out because there are dozens). The `instrument` labware type belongs to the `equipment` tab, never `labware`.

Implement the merge/rank:

```ts
export function isPlateCategory(cat: LabwareCategory): boolean {
  return cat === 'plate'
}

/** Reorder: catalog + lab-db first (the "defaults and what the lab has"),
 *  then exa, then ontology. Within a tier keep input order. Dedupe by key. */
export function mergeAndRankDeckSources(
  bundles: { catalog: AddDeckSourceItem[]; labDb: AddDeckSourceItem[]; exa: AddDeckSourceItem[]; ontology: AddDeckSourceItem[] },
): AddDeckSourceItem[] {
  const seen = new Set<string>()
  const out: AddDeckSourceItem[] = []
  for (const list of [bundles.catalog, bundles.labDb, bundles.exa, bundles.ontology]) {
    for (const item of list) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      out.push(item)
    }
  }
  return out
}
```

New test `app/src/event-editor/deck/addDeckDialogModel.test.ts`:
- `isPlateCategory('plate') === true`, `isPlateCategory('tiprack') === false`.
- `mergeAndRankDeckSources` returns catalog-then-labDb-then-exa-then-ontology order.
- dedupe: same `key` across `catalog` and `labDb` appears once.

Verify: `cd app && npx vitest run src/event-editor/deck/addDeckDialogModel.test.ts` → 3 pass. Commit: `git add app/src/event-editor/deck/addDeckDialogModel.ts app/src/event-editor/deck/addDeckDialogModel.test.ts && git commit -m "feat(deck): add-deck type-tab model + cross-source ranker (pure)"`.

### Task 2 — Build `AddToDeckDialog.tsx` (merged dialog, all tabs)

Create `app/src/event-editor/deck/AddToDeckDialog.tsx` — a merge of the two existing dialogs, keyed by an active `AddDeckTab`:

Props:
```ts
interface AddToDeckDialogProps {
  open: boolean
  contextLabel: string
  surfaceKind: 'slot' | 'lawn'
  onClose: () => void
  /** Always "place at the target that was clicked". Target captured by caller. */
  onPick: (labware: Labware) => void
}
```

Behavior:
- Tab bar across the top: `Plates | Labware | Equipment` (buttons with `aria-pressed`). For `surfaceKind === 'slot'`, hide the `Equipment` tab (instruments are lawn-only, unchanged from today) — or keep it tabbed but disable + tooltip; simplest: hide it.
- One search input (`ee-dialog__search`) reused across tabs, plus a name input ("Name on deck (optional)"). For the `equipment` tab, additionally render the existing instrument-kind picker chips (`ee-dialog__kinds`, from AddEquipmentDialog) — reuse `INSTRUMENT_KINDS`/`INSTRUMENT_KIND_LABELS`/`InstrumentGlyph`.
- Source wiring per tab:
  - `plates` + `labware`: catalog entries from `LABWARE_TYPE_LABELS` filtered by column (`isPlateCategory(LABWARE_CATEGORIES[t])`) and by query; lab-db hits from `apiClient.searchLabwareDefinitions` (debounced on query, `limit: 12`); Exa via `useVendorExaSearch({ category: labware-tab ? 'labware' : undefined, controlled: { query } })` — for the `plates` tab reuse `category: 'labware'` (Exa has no finer plate split); ontology via `apiClient.resolve({ term: query, kinds: ['labware'], localOnly: true })` guarded by a try/catch and nonempty query.
  - `equipment`: catalog is `[]` (no built-in instruments); lab-db `[]`; Exa via `useVendorExaSearch({ category: 'equipment', controlled: { query } })`; ontology via `apiClient.resolve({ term: query, kinds: ['equipment'] })`.
- Render the merged, ranked rows (`mergeAndRankDeckSources`) as selectable rows with a source badge: `LAB`/`WEB`/`◇` (use the existing `.ee-dialog__vendor-row` + `--selected` styling). Clicking a row marks it selected (staged, like AddEquipmentDialog's `selectedHit`); do **not** place on click.
- Submit: a footer with **Cancel** and **Add to deck** (reuse `.ee-dialog__footer`/`.ee-dialog__btn--primary` CSS added for AddEquipmentDialog). Add is disabled until a row is selected. On submit:
  - catalog/lab-db row → `createLabware(type, name)` (catalog) or `labwareRecordToEditorLabware(record)` (lab-db) → `onPick`.
  - exa row → `apiClient.createFromVendorExa(hit)` → for equipment build the `instrument` type with `sourceRecordId`/`instrumentKind` (move the body of AddEquipmentDialog's current `handleSubmit` here); for labware use `labwareRecordToEditorLabware` (as AddLabwareDialog does today) → `onPick`.
  - ontology row → mint via `createFromVendorExa`-style is not applicable; instead map a resolve candidate to a generic `instrument`/`other` labware with `notes` carrying the CURIE (best-effort — see Risks). Keep minimal: for equipment `createLabware('instrument', candidate.label)`, for labware `createLabware('other', candidate.label)`.
- Reset all draft state (`setQuery/setCustomName/setSelectedHit/setSelectedKind/setActiveTab`) in the `if (!open)` effect. Declare **all** hooks including `useVendorExaSearch` **above** the early `if (!open) return null` return (Rules of Hooks — the exact bug already hit AddLabwareDialog).

Write/extend `app/src/event-editor/deck/AddToDeckDialog.test.tsx` (port both existing suites, add tab tests):
- `plates` tab shows `96-Well Plate (200 µL)` but not `25 mL Beaker`; `labware` tab shows the beaker not the plate.
- equipment tab: on selecting an Exa hit then "Add to deck", `createFromVendorExa` is called and `onPick` receives an `instrument` labware carrying the minted `sourceRecordId` and its `instrumentKind`.
- slot surface hides the Equipment tab.
- mounting the dialog with the search empty renders catalog defaults (no Exa fetch for empty query beyond the existing hook's behavior).

### Task 3 — Repoint `LawnSurface` to the unified dialog, delete the equipment button + staggered placement

Edit `app/src/event-editor/deck/LawnSurface.tsx`:
- Remove `import { AddEquipmentDialog }`, `equipmentOpen` state, the `⚙️ + Add equipment (Exa)` button (lines ~226-234), and `handleEquipmentPick` (lines 146-171).
- Replace the two dialog mounts (lines ~342-354) with one `<AddToDeckDialog open={dialogState.open} contextLabel=... surfaceKind="lawn" onClose=... onPick={handlePick} />`, deleting the separate `AddEquipmentDialog` mount.
- Confirm `handlePick` (which uses `dialogState.xMm/yMm` — the click point) is the *only* placement path. Add a guard: if `picked.labwareType === 'instrument'`, reuse the same clamp/validate/place code (it already works — instrument `layoutFamily: 'tube'` uses `TILE_MM_HEIGHT`).

Edit `app/src/event-editor/deck/AddEquipmentDialog.tsx` → delete the file (its behavior now lives in AddToDeckDialog). Delete `app/src/event-editor/deck/AddEquipmentDialog.test.tsx` (superseded by Task 2's suite). Also delete the `AddEquipmentDialog` import in `AddLabwareDialog.tsx:64` comment reference only (comment text, non-functional). Remove the `LawnSurface.tsx:349` mount reference.

### Task 4 — Repoint `DeckSlot` to the unified dialog

Edit `app/src/event-editor/deck/DeckSlot.tsx`:
- Replace `import { AddLabwareDialog }` with `import { AddToDeckDialog }`.
- Replace the mount at lines 205-211 with `<AddToDeckDialog open={dialogOpen} contextLabel={`Slot ${slot.id}`} surfaceKind="slot" onClose={() => setDialogOpen(false)} onPick={handlePick} />`.
- `handlePick` already validates and places at the slot — no change needed; it now also handles the `plates`/`labware` tabs identically.
- Update `AddLabwareDialog.tsx` references in `DeckSlot.test` if such exists (check `git grep AddLabwareDialog app/src --include=*.test.*`).

### Task 5 — Wire the search sources and reconnect tab switching (integration test)

Extend `app/src/event-editor/deck/AddToDeckDialog.test.tsx`:
- Switching `Plates → Equipment` changes the fetched Exa category (assert `searchVendorExa` called with `{ category: 'equipment' }`) and clears the unselected draft.
- With a query, catalog + lab-db hits render above Exa hits in DOM order (assert row order).
- "Add to deck" is disabled with no selection and enabled after selecting a catalog row; clicking it places via `onPick` with the entered custom name.

### Task 6 — Verify end-to-end in the real browser (SOP rule 12)

Backend + frontend must be running (`:3001`/`:5174`). This is the user's hard requirement: **UI changes must be browser-verified against the live stack**, not just unit tests.
- Seed a scratch deck record into the shared store (`/home/brad/.computable-lab/worktrees/main/records/unknown/`), e.g. `EVG-ADD-VERIFY__add-to-deck-verify.yaml` (`kind: event-graph`, `methodContext.platform: manual`, `deckVariant: manual_freeform`).
- Using `browser_exec`: open `http://localhost:5174/deck/EVG-ADD-VERIFY`, select the bench surface, click an empty point, confirm the unified modal opens with **Plates | Labware | Equipment** tabs.
- Switch to Equipment, type `thermomixer`, select an Exa hit, click **Add to deck**, confirm the tile lands **at the point clicked** (not top-left-staged).
- Switch to Plates, click a cell-culture plate (e.g. 6-Well), name it, Add, confirm it lands at a second distinct click point.
- Clean up the scratch seed + any minted `EQP-`/`LBW-` records afterward (`rm -f` in the records dir).

## Tests / validation summary

- Pure model test (`addDeckDialogModel.test.ts`): tab-split + merge/rank + dedupe.
- Component tests (`AddToDeckDialog.test.tsx`): tab visibility, exa/ontology/lab-db wiring per tab, select-then-add submit, slot hides equipment, order of catalog-before-exa.
- Removed-suite check: `AddLabwareDialog.test.tsx` + `AddEquipmentDialog.test.tsx` either ported into the new suite or deleted. `git grep -i "addlabware\|addequipment\|AddEquipmentDialog" app/src --include=*.tsx` should return only the new file + comment texts.
- `npm run typecheck -w app` green; full deck suite green (re-run `cd app && npx vitest run src/event-editor/deck` — note `LabwareGlyph` may already be red on clean main; that is pre-existing and out of scope).
- Browser drive of the live stack (Task 6) with scratch-cleanup afterward.

## Status (2026-09-07 — implemented)

All six tasks done, committed as `3c8235f`, `e9c6969`, `77eafb9`:
- AddToDeckDialog (Plates | Labware | Equipment tabs) replaces AddLabwareDialog + AddEquipmentDialog (both deleted).
- LawnSurface + DeckSlot mount AddToDeckDialog; staggered equipment placement and the `⚙️ + Add equipment` button removed — everything places at the clicked point.
- App typecheck green; AddToDeckDialog suite 7/7; deck suite green except the pre-existing LabwareGlyph 384-well failure (fails on clean HEAD too).
- Browser-verified live: unified dialog opens on lawn click; Equipment tab streams real Exa hits and the minted ThermoMixer tile lands **at the click point**; Plates tab places a custom-named plate at a second click point; old equipment button gone. Scratch seed + minted EQP record cleaned up.
- Robot tab intentionally omitted (no LabwareType models robots-on-deck; see Open Questions).

## Risks, tradeoffs, and open questions

- **Ontology for labware/equipment is sparse.** `apiClient.resolve` tiers 2/3 (OAK/OLS4) barely have labware/equipment terms, so the ontology tier will usually render nothing; the value here is catalog + lab-db + Exa. Don't over-invest in ontology row minting — map candidate → generic `other`/`instrument` with a CURIE note, best-effort, and be honest in the summary that ontology coverage for this domain is thin.
- **Dedupe keying.** Catalog keys are `LabwareType` names; lab-db keys are `recordId`; Exa keys are `hit.url`; ontology keys are `curie`. Merge by `key` across sources only dedupes when two sources genuinely share the same physical thing (rare across these distinct key spaces) — that's acceptable; do not force-fabricate cross-space matches.
- **Instrument kind default.** Preserve `inferInstrumentKind(hit.title)` auto-classification plus explicit chip override; do not regress the silhouettes feature.
- **Deleting `AddEquipmentDialog.tsx` removes a committed public surface.** It's a UI component only (not an API endpoint), and its behavior is preserved in AddToDeckDialog — safe to delete. Keep `searchEquipmentExa`/`createEquipmentFromExaCandidate` **as dead code** (still-registered backend route — do not delete the API surface in this change).
- **Slot vs Equipment.** User said "equipment, robot, etc." as the type selector; today instruments are lawn-only and can't sit on an automation-deck slot. Hiding the Equipment tab on `surfaceKind="slot"` is the least-surprise choice and matches current validation. If the user wants instruments on deck slots too, that's a separate schema/validation change.
- **Open question — "Robot" tab.** The codebase models robots/tools as `ToolSwitcher` pipettes/robot arms, not as placeable deck labware. There is no `LabwareType` for "robot." The plan intentionally omits a Robot tab (YAGNI): if Brad wants a Robot tab, the implementer should confirm what "robot" means as a deck placement (a pipetting robot module? a fixed instrument?) before building — adding a fake tab with nothing behind it is worse than omitting it. (Do not ask during planning; the plan proceeds without it and this note preserves the decision.)
- **Name+Add on all tabs is a behavior change** for the plates/labware tabs (today they insta-place on click). This is exactly what the user asked for ("they can name it and click add") and what fixes the "no submit button" complaint from the earlier equipment work — keep it consistent across tabs.
- **CSS reuse.** `.ee-dialog__footer`, `.ee-dialog__btn`, `.ee-dialog__vendor-row--selected`, `.ee-dialog__kinds` already exist in `app/src/event-editor/styles/eventEditor.css`; only new tokens needed are a `.ee-dialog__tab-bar`/`.ee-dialog__tab` style. No backend or schema changes anywhere in this plan.