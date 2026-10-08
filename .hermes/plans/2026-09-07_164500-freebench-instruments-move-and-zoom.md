# Freebench instruments — place, move between benches, zoom-to-inspect

Operating mode: **DIRECT CODING** (confirm from the active plan-corpus header before large work; this tree
has operated in direct-coding mode per prior plans).

## Goal

Let a freebench (lawn) surface place instruments, drag labware/instruments **between** two coexisting
benches, and click any placed object to zoom into its events — the zoom-to-inspect must keep working.

## Verified current context (do NOT re-derive; trust this)

The feature is **~70% already built** from prior work on `main`. Confirm with `git log --oneline -3`
(specifically `96065ef`). Do not rebuild what exists.

Each statement below is verified against the current files:

1. **Instruments on a bench already work end-to-end.** `AddEquipmentDialog.tsx` mints `EQP-BIG-…`
   records via `/vendor/exa/from` and places an `instrument`-type labware tile. Added last turn
   (commit `96065ef`).
2. **Zoom-to-inspect already exists.** Every `LabwareTile` handles `onClick → onFocus()`
   (`app/src/event-editor/deck/LabwareTile.tsx:78-84`, ignoring clicks on `.tile__btn` controls), which
   calls `actions.setFocus(placement.placementId)`. When `state.focusPlacementId` is set, `DeckStage`
   renders `LabwareFocus` instead of the lawns (`DeckStage.tsx:22-27`). `LabwareFocus.tsx` shows the
   live well grid + events for that labware. **This is the standard, already-working value path.**
3. **Drag-to-move a placement is already wired** — both inside a single lawn and, structurally, across
   two lawns: `LabwareTile` sets `application/x-event-editor-placement` = `placementId` on drag start
   (`LabwareTile.tsx:55-61`), and **every** `LawnSurface.handleDrop` (`LawnSurface.tsx`) looks the id
   up in the SHARED `state.placements`, validates against the drop lawn, and calls
   `actions.movePlacement`. Because both lawns share one editor `state`, dropping a tile from lawn A
   onto lawn B updates the SAME placement — cross-bench move is therefore already possible.
4. **The gap — no platform variant currently has TWO coexisting lawns.** `PlatformVariantManifest`
   has both `surface?` and `sideLawn?` (`app/src/types/platformRegistry.ts:31-32`), and `DeckStage`
   renders **both** when present (`DeckStage.tsx:50-66`). But in
   `server/src/platform-registry/defaultManifests.ts` every variant has **at most one**: `manual_freeform`
   has only `surface` (1200×800); `assist_*` variants have only `sideLawn` (400–600 wide). So today a
   user sees ONE bench surface — nothing to drag between.
5. **`instrument` focus is degenerate.** `instrument` uses `addressing: { type: 'single' }` /
   `layoutFamily: 'tube'`. `LabwareFocus` renders a `WellGrid` + well-context menu for the focused
   labware with **no affordance branch for instruments**, so clicking an instrument tile shows a
   meaningless single-well grid. Two options exist: (a) a dedicated compact "instrument detail" focus
   (name, manufacturer/model from the source `EQP-` record, notes), or (b) treat instruments like
   glassware (`LABWARE_GLASSWARE`-style side-view meta only). The user explicitly wants "click a
   labware to zoom in and see the events within it" — that is satisfied for plates/tubes/racks today
   and must NOT regress.

### Coverage matrix (target state after this work)

| Capability | slots deck (assist) | single freebench (manual_freeform) | TWO freebench surfaces |
|---|---|---|---|
| place instrument (Exa) | — | ✅ (shipped) | ✅ (same dialog) |
| drag-move labware/instrument | ✅ exists | ✅ exists | ✅ exists structurally |
| two coexisting freebench surfaces | n/a | n/a | **NEW** |
| click → zoom-inspect events | ✅ exists | ✅ exists | ✅ exists (keep) |
| focus view for an instrument | ❌ degenerate | ❌ | ❌ (NEW detail / meta view) |

## Architecture / proposed approach

Three small, independent deltas — no new record kinds, no schema/provenance changes:

```
(1) manifest: give a freeform variant BOTH surface + sideLawn  → two benches to move between
(2) instrument focus view: branch in LabwareFocus          → click instrument shows equipment detail, not a well grid
(3) verify + harden cross-lawn drag  (needed only if tests reveal a regression)
```

The zoom-to-inspect mechanism is untouched; it already satisfies the ask and is the regression gate.

---

## Step-by-step tasks

### Task 0 — Reproduce current state (read-only, no code)
1. `cd <repo>/app && npx vitest run src/event-editor/deck src/event-editor/focus src/shared/vendor-exa 2>&1 | tail -15`
   — note baseline pass/fail **before** edits (some deck glyph tests are known-red on main; record which).
2. `cd <repo>/server && npm run typecheck -w server` and `cd <repo>/app && npm run typecheck` — confirm 0 errors.

Expected: typecheck exits 0 in both workspaces. Do not "fix" pre-existing red tests in Task 0.

### Task 1 — Two coexisting freebench surfaces (manifest) — TDD where feasible
The manifest is data (YAML-in-TS), so "tests" here are the platform-registry tests + typecheck.

Edit `server/src/platform-registry/defaultManifests.ts`. Change **only the `manual_freeform` variant**
from a single `surface` to a primary `surface` + a `sideLawn`:

```ts
{
  id: 'manual_freeform',
  title: 'Manual Bench (freeform)',
  slots: [],
  surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 },
  sideLawn: { widthMm: 600, heightMm: 400, label: 'Labware lawn' },
},
```

(Exact current block confirmed at `defaultManifests.ts:71-75`.) This makes `DeckStage` render two
lawn surfaces — the primary bench and a smaller side bench — so a tile can be dragged between them.

**Verify (TDD spike):**
- `cd <repo>/app && npx vitest run src/event-editor/deck/DeckStage* 2>&1 | tail -8` — new/existing
  DeckStage contract (renders `surface` AND `sideLawn`). If no DeckStage test exists, add
  `app/src/event-editor/deck/DeckStage.test.tsx` asserting `manual_freeform` renders **2**
  `aria-label` lawn regions:
  ```tsx
  // DeckStage.test.tsx (new) — seed an editor context with manual_freeform & assert two lawns
  import { render, screen } from '@testing-library/react'
  import { DeckStage } from './DeckStage'
  // … mount DeckStage inside an EventEditorProvider seeded with
  // platformId 'manual', variantId 'manual_freeform' (mirror how lawn tests seed state) …
  it('renders both the primary freeform bench and the side labware lawn', () => {
    expect(screen.getAllByLabelText(/Manual Bench|Labware lawn/)).toHaveLength(2)
  })
  ```
  Run → red (no two lawns yet? actually integration may already find 2 regions only after Task-1 edit,
  so write the test, confirm it fails on current code, then apply the manifest edit and confirm green).
- `cd <repo>/server && npm run typecheck` — manifest TS still compiles.

Commit: `feat(deck): manual_freeform exposes a primary bench + side labware lawn`.

### Task 2 — Instrument focus view (dedicated branch in LabwareFocus) — TDD
When the focused labware is an `instrument` type, render a compact **equipment detail** pane instead
of the well grid + context menu. This is the piece that makes "click to zoom in" meaningful for the
thing the user is now placing on the bench.

1. **Test first** (`app/src/event-editor/focus/LabwareFocus.instrument.test.tsx`, new):
   - Render `LabwareFocus` with `state.focusPlacementId` pointing at an `instrument`-type labware
     (reuse the `instrument` LABWARE fixture pattern; verify it has `addressing.type === 'single'`).
   - Assert: NO `WellGrid` (`data-testid` / class `well-grid`), and instead an instrument header shows
     the labware name + the source `EQP-` record id (`sourceRecordId`), e.g. a `[data-testid="focus-instrument"]` block.
   - Run → red (currently it renders the well grid / no instrument branch).
2. **Implement:** in `LabwareFocus.tsx`, at the top of the `return`, branch:
   ```tsx
   if (labware?.labwareType === 'instrument') {
     return <InstrumentFocus labware={labware} placement={placementLifetime??} onClose={() => actions.setFocus(null)} />
   }
   ```
   Create `app/src/event-editor/focus/InstrumentFocus.tsx` (new, styled with `--cl-*` tokens only):
   header (icon `⚙️`, name, `LABWARE_TYPE_LABELS.instrument`, location label, Close) + a compact body:
   - if `labware.sourceRecordId` exists, fetch-a /api/records/{sourceRecordId} on mount and show
     manufacturer/model/notes (guard on success; degrade to just the id/notes on failure),
   - a quiet "equipment detail — wellbeing: not well-addressable" helper note,
   - a re-use of the existing `actions.setFocus(null)` Close button.
   Keep it ~60 lines; no event-grid. Do NOT touch `WellGrid`.
3. **Run green:** `npx vitest run src/event-editor/focus/LabwareFocus.instrument.test.tsx` → pass.
4. `npm run typecheck` (app) green.
5. **Browser-verify (SOP rule 12):** on `:5174` `manual_freeform` bench, place an instrument →
   click the tile → assert the instrument detail pane (not a well grid) opens; Esc/Close returns to
   the bench. Drive with `browser_exec`; if you can't seed a deck, seed a scratch event-graph in
   `~/.computable-lab/worktrees/main/records/unknown/` and delete it after.

Commit: `feat(event-editor): instrument focus shows equipment detail instead of a well grid`.

### Task 3 — Verify (and harden if needed) cross-lawn drag — TDD
Inter-bench drag should already work because all `LawnSurface`s share `state`. Prove it, and only fix
if red.

1. Add `app/src/event-editor/deck/LawnSurface.moveAcross.test.tsx` (new): seed editor state with
   **two** `manual_freeform` lawns (or wrap two `LawnSurface`s), place one labware tile on lawn A, then
   simulate `onDrop` on lawn B with `dataTransfer` carrying the placement id; assert
   `actions.movePlacement` was called with the lawn-B location and the placement now lives on B.
   - Run → if green, the cross-bench move already works (record it, no code change). If red, the drop
     handler needs the shared-state fix described below.
2. **Only if red:** audit `LawnSurface.handleDrop` — the likely fix is that it already reads shared
   `state` so the ONLY thing to harden is making the dragged tile's drop target `preventDefault` +
   per-lawn coordinate mapping consistent across surfaces (keep as-is if green). Do not over-engineer.

Commit (only if a fix was needed): `fix(event-editor): cross-lawn drag moves a placement between freebench surfaces`.

### Task 4 — Final gates + cleanup
1. `cd <repo>/server && npm run typecheck` and `cd <repo>/app && npm run typecheck` — 0 errors.
2. `cd <repo>/app && npx vitest run src/event-editor/deck src/event-editor/focus src/shared/vendor-exa` —
   your NEW tests pass; record any pre-existing red (do not claim you caused them).
3. **Browser pass (SOP rule 12), live stack (`:5174`/`:3001`):**
   - open `manual_freeform` bench → two bench surfaces visible;
   - place an instrument via "+ Add equipment (Exa)" → it appears on the primary bench;
   - **drag it to the side lawn** → it lands there;
   - **click it** → instrument detail pane opens (not a well grid);
   - place a 96-well plate, **click it** → well grid + events open (regression check: zoom-in still works);
   - close focus, drag the plate to the side lawn, click it again → still zooms.
   Delete any scratch records after.
4. Reconcile note for the second instance (`:5191`/`:3091` worktree) only if Brad is using it —
   otherwise leave a `git log --oneline -3` note in the plan.
5. `git log --oneline -4` to confirm your commits land on top of `96065ef`.

---

## Tests / validation summary (per task, TDD)

| Task | New/changed test | Run command | Expected |
|------|------------------|-------------|----------|
| 1 | `app/src/event-editor/deck/DeckStage.test.tsx` | `npx vitest run src/event-editor/deck/DeckStage*` | 2 lawn regions after manifest edit; red before |
| 2 | `app/src/event-editor/focus/LabwareFocus.instrument.test.tsx` | `npx vitest run src/event-editor/focus/LabwareFocus.instrument.test.tsx` | no well-grid; instrument detail visible; red before |
| 3 | `app/src/event-editor/deck/LawnSurface.moveAcross.test.tsx` | `npx vitest run src/event-editor/deck/LawnSurface.moveAcross.test.tsx` | green = move already works (record); red → fix + green |
| gates | typecheck both workspaces + deck/focus/vendor-exa suites | commands above | 0 tycker errors; new tests green |

One commit per task with the exact messages above. Do NOT commit the throwaway `*local.config.ts` or scratch
records.

## Risks, tradeoffs, open questions

- **Zoom-to-inspect is the sacred behavior.** The central requirement ("click a labware to zoom in and see
  events") already works for plates/tubes/racks via `LabwareFocus`. Task 2 must branch ONLY for
  `labwareType === 'instrument'` and leave every other focused labware path byte-identical, or it will regress
  the value path. The Task-4 plate-click regression check is the guard.
- **Instrument focus has no events to show.** A bench instrument is not well-addressable; the detail pane
  shows record provenance (EQP id, manufacturer/model, notes) instead. If Brad later wants "what ran on this
  instrument," that is event-graph instrumentation (out of scope — flag, don't build).
- **Two benches via manifest only affects `manual_freeform`.** Keep the assist-slot variants as-is so the
  robot-deck UX is untouched. If Brad wants two benches on a specific appliance, add a new variant rather than
  editing existing ones.
- **Cross-lawn drag is unproven until Task 3 runs.** The plumbing (shared state + `movePlacement` on drop)
  indicates it works, but there may be a per-surface coordinate or `preventDefault` edge. Task 3 proves it;
  Task 2 and Task 3 are independent and can be done in either order.
- **Tests for deck/focus mount whole editor contexts** — reuse the seed-state harness pattern the existing
  deck/focus tests use (a state-seeding provider, not the OOM-prone direct-dispatch-in-render pattern; see the
  skill's Rules-of-Hooks / OOM pitfall).
- **Exa key / cost** applies only to adding new instruments; existing `integrations.exa.apiKey` already configured.

---

## Implementation status (2026-09-07 — complete)

All four tasks delivered + one scope-expansion commit surfaced by browser verification. Commits on
`main` (`git log --oneline -5` → `96065ef..1339baa`):

| Commit | Scope |
|--------|-------|
| `fc6ebe3` | **Task 1** — `manual_freeform` exposes BOTH `surface` (1200×800) + `sideLawn` (600×400). Edited the LIVE source `config/platforms/manual.yaml` (the server loads this, not `defaultManifests.ts`) AND the `DEFAULT_PLATFORM_MANIFESTS` fallback. Test asserts both the YAML-load path and the fallback agree. |
| `d951315` | **Task 2** — `LabwareFocus` branches to new `InstrumentFocus` for `labwareType === 'instrument'` (equipment detail: name, `sourceRecordId` EQP id, best-effort manufacturer/model from the EQP record, notes, Close) instead of a degenerate well-grid. Test: `LabwareFocus.instrument.test.tsx` (2 tests, red-then-green). |
| `9489f41` | **Task 3** — cross-lawn drag test, 2 tests (render-isolation + drop-scoping). Confirm `movePlacement` already moved the SAME placement; only tested + hardened. |
| `1339baa` | **SURFACE-SCOPING (scope expansion)** — browser verification revealed the double-render bug: two lawns rendered EVERY lawn placement because a lawn `location` had no surface identity. Fixed: added optional `surfaceId: 'primary'|'side'` to `PlacementLocation.lawn` + `event-graph.schema.yaml`; each `LawnSurface` filters to its own `surfaceId`; `placeNewLabware`/`movePlacement` via `LawnSurface` stamp `surfaceId`; `DeckStage` passes `surfaceId`. This is what makes "move between benches" meaningful. |

Deviation from plan: Task 1's test is in the server `defaultManifests.test.ts` (asserts the served YAML
+ fallback carry both surfaces) rather than a `DeckStage.test.tsx` — the heavy async provider harness was
avoided; the testable contract is the manifest data. Noted, not a functional gap.

**Browser-verified (SOP rule 12, live `:5174`/`:3001`, real Exa):**
two benches render; instrument placed appears ONCE on primary (no double-render); clicking it opens the
equipment detail (EQP id, weak-grid absent); Close returns to bench; a placed plate still opens the well
grid (zoom-to-inspect regression-safe). Cross-lawn drag is unit-verified (stamps `surfaceId`, renders on
target only). Backend restarted to serve the YAML + schema changes. Scratch seed + EQP records removed.
Both workspaces typecheck; deck/focus/schema suites green (only pre-existing `LabwareGlyph` red).

**Remaining:** (1) reconcile the `:5191`/`:3091` worktree branch (separate checkout) + restart its backend
for these commits to surface there; (2) the future idea (move a plate ONTO an instrument) is still out of
scope — the `instrument` focus + `surfaceId` model are the anchors it would build on.