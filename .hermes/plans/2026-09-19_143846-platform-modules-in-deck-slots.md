# Plan — platform modules as slot-resident equipment (deck model unification)

Date: 2026-09-19 14:38 EDT
Repo: `/mnt/vast/home/brad/git/computable-lab`
Status: PLAN (not executed)
Extracted from: `2026-09-19_130430-deck-equipment-via-agent.md` §5.2 (Decision D3,
deferred by Brad's O10 ruling) and DEF-2 in its §10 deferred list.
Relationship: independent of that plan's phases, but **reuses its capability model**
(D2 rev 2 — `equipment-capability` verbs + seat) rather than inventing a module
record type. Depends on seated placements (DEF-1) only for Phase 4.
Read first: `2026-09-19_130430-deck-equipment-via-agent.md` §3.1, §5.1, §5.2.

## 1. Goal

Make a **platform module** (Opentrons Heater-Shaker, Temperature Module, Magnetic
Module; Flex Waste Chute and Staging Column) a first-class deck object: placeable in
a deck slot, carrying labware seated on top, with its capability (verbs, settings)
readable by the editor, the compiler, and the event ledger — instead of a bare
string id in one deck model and nothing in the other.

## 2. Verified current state (2026-09-19)

- `config/platforms/opentrons_ot2.yaml:11-17` declares
  `modules: [heater_shaker, temperature, magnetic]`; `opentrons_flex.yaml` adds
  `waste_chute`, `gripper_staging`. Type: `PlatformModuleManifest { id, label }`
  (`app/src/types/platformRegistry.ts:35`) — id + label only, no capability, no
  settings, no seat.
- **Graph deck** (`app/src/graph/LabwareEventEditor.tsx` +
  `labware/DeckVisualizationPanel.tsx`): a placement carries a bare
  `moduleId?: string`, and one slot can hold both a module and a labware
  (`DeckVisualizationPanel.tsx:786` sets `{moduleId, labwareId}`) — so "module in a
  slot with a plate on top" is expressible today, with zero semantics. Module
  glyphs are a hardcoded emoji switch (`moduleEmoji`, `:306-312`).
- **Run deck** (`app/src/event-editor/*`): no module concept at all. Placements are
  `{kind:'slot'} | {kind:'lawn'}` (`event-editor/types.ts:16-18`); equipment is
  first-class but **lawn-only** (`entityKind:'equipment'`, guarded at
  `EventEditorContext.tsx:537` — "lawn-only bench equipment must never be promoted
  onto an automation slot").
- **Robot/execution side has its own notion**: `execution-environment.schema.yaml`
  slots carry `slot_type` with enum `[standard, special, trash, heater, magnet,
  hotel]` + `compatible_footprints`; `robot-plan.schema.yaml` has a
  `compatibilityReport` with honored/dropped hints per event. This is a *third*
  model of the same reality.
- No `ECP-`, `EQC-` or `EQP-` record exists for any module (module ids live only in
  platform config).

## 3. Why this was split out

The deck-equipment plan D2 rev 2 gives equipment a *capability* (verbs + seat +
acceptance). A module is the same kind of thing — an Opentrons Heater-Shaker module
declares `heat` + `shake` with a `place_on` seat and a capacity of 1 — **except**
that it is mounted in a deck slot rather than standing on the bench. Folding it into
that plan would have meant changing the placement model, both deck editors, and the
compiler while also shipping the water-bath path. Brad's ruling: its own plan.

## 4. Design

**Recommendation: a module IS an equipment entity whose placement happens to be a
slot.** Not a new record type, not a slot-typed special case.

- The module's capability/settings reuse `ECP-`/`EQC-` exactly as D2 rev 2 defines
  them (`heat`/`shake` verbs, `seat: place_on`, `capacity: 1`, settings
  `temperature_c`/`rpm`/`duration_sec`).
- `PlacementLocation` does **not** need a new kind: a module placement is
  `{kind:'slot', slotId}` with `entityKind: 'equipment'`. `entityKind` already
  exists for lawn equipment; the change is that *modules* may take a slot, while
  bench instruments still may not (the `:537` guard stays, narrowed to
  non-modules).
- The **platform manifest stops being the vocabulary** and becomes the *mounting*
  fact: which module ids exist for a variant, their labels, and which slots accept
  them. Capability lives in the ECP- record. The glyph comes from data
  (capability/kind), not `moduleEmoji`.
- Module-vs-lab-asset: a module is part of the robot, so it defaults to platform
  configuration rather than an `EQP-` lab asset — but see O-M1.

Rejected alternatives:

- *Type the slot* (`slot.moduleRef`) — keeps the module outside the equipment model,
  so it can never carry capability/settings, and the compiler keeps its third
  vocabulary.
- *Seat-only* (module as a "surface" the labware sits on, with no entity) — loses
  the module's own settings, which D5's ledger needs (a plate shaken on the module
  at 300 rpm).

## 5. Phases

Every task RED-first; commands run from the repo root unless noted. Restart the
backend after `server/` changes (rule 13) before browser steps.

### Phase 1 — module vocabulary as data, capability-linked

- **Task 1.1 (RED)** — extend `PlatformModuleManifest` with the mounting facts
  (`slotIds?: string[]`, `capabilityRef?: Ref`) and assert in a new
  `app/src/types/platformModules.test.ts` that the OT-2 heater-shaker module
  resolves to an `ECP-` capability ref and its label, and that **no** module glyph
  is hardcoded in TS.
- **Task 1.2 (GREEN)** — `config/platforms/opentrons_ot2.yaml` +
  `opentrons_flex.yaml`: declare `capabilityRef` per module; type + loader follow
  (`app/src/types/platformRegistry.ts`, `server/src/platform-registry/*`).
- **Task 1.3** — replace `moduleEmoji` (`DeckVisualizationPanel.tsx:306-312`) with
  a data-driven glyph resolved from the module's capability/kind, keeping the same
  visual for existing ids.
- **Gate** — the new test + `npx vitest run src/graph/labware` and
  `src/event-editor/deck`; typecheck diff for touched files.

### Phase 2 — run deck accepts a module in a slot

- **Task 2.1 (RED)** — `LabwareFocus.equipment.test.tsx`-style test in the deck
  suite: a module placement (`{kind:'slot', slotId:'2'}`, `entityKind:'equipment'`)
  renders in the slot on the OT-2 variant, and a bench instrument placement in a
  slot is still rejected by `validatePlacement`.
- **Task 2.2 (GREEN)** — narrow the `:537` lawn-only guard to bench equipment
  (equipment without a module marker), allow slot placements for modules, and make
  the slot renderer mount `EquipmentTile`.
- **Task 2.3** — the module's settings surface in the focus pane (`EquipmentFocus`)
  with its capability's `settingsDefinition`.
- **Gate** — deck suite + a browser pass on `/runs/:runId` with the OT-2 variant.

### Phase 3 — graph deck reconciliation + migration

- **Task 3.1 (RED)** — a test asserting a persisted `deckLayout` entry carrying
  `moduleId` hydrates into a module *placement* (not a bare string), and that a
  round-trip preserves it.
- **Task 3.2 (GREEN)** — replace `moduleId` handling in
  `LabwareEventEditor.tsx` (`:1007`, `:1198`, `:1557`, `:2244-2249`) and
  `DeckVisualizationPanel.tsx` (`:720-870`) with the placement model; keep a
  read-compat shim for existing records.
- **Task 3.3** — write a migration note in the plan's status section listing which
  persisted graphs used `moduleId` (grep the records/data dir) so the shim can be
  retired deliberately.
- **Gate** — `npx vitest run src/graph/labware src/event-editor` + the existing
  deck e2e specs.

### Phase 4 — labware seated on a module (depends on DEF-1 in the other plan)

- **Task 4.1 (RED)** — with seated placements available, assert labware seats onto
  the module in the same slot (`seatIndex` ignored at capacity 1) and that the
  module's capability gates acceptance (a plate rejected by a Magnetic Module).
- **Task 4.2 (GREEN)** — the slot renderer draws the stack (module + seated item);
  the compiler emits the matching `slot_type` (`heater` | `magnet`) and
  `compatible_footprints` for `execution-environment`, and honors
  `robot-plan.compatibilityReport` hints.
- **Task 4.3** — D5's ledger: labware seated on a module snapshots the module's
  settings (`temperature_c`, `rpm`) into the relocation event.
- **Gate** — `cd server && npx vitest run src/compiler` (deck geometry + robot plan
  checks) + `execution-environment` schema tests.

## 6. Open questions (need Brad / vendor evidence)

- **O-M1** — is an Opentrons module a *platform configuration* (part of the robot,
  no `EQP-` record) or a lab-owned asset with an `EQP-` record (the lab bought it,
  it can be moved between robots)? My read: configuration by default, with an
  optional `EQP-` link when the lab tracks it as an asset.
- **O-M2** — which slots accept which module per variant? The OT-2/Flex docs are the
  source (ground via Exa per the sibling plan's O8 ruling; never invent slot lists).
- **O-M3** — does mounting a module change the seated labware's height/geometry
  (module deck height ≈ a plate's standing position)? This decides whether DEF-3
  (stacked seats) and the module work share one geometry model.
- **O-M4** — do the Flex `gripper_staging` / `waste_chute` entries belong in this
  model at all? They are not labware-holding seats. My read: they stay manifest-only
  mounting facts with no capability until a real need appears.
- **O-M5** — must an existing persisted run that used `moduleId` keep working
  byte-identically (compat shim indefinitely), or is a one-time migration
  acceptable?

## 7. Non-goals

- Module firmware/protocol compilation (the OT engine's module commands) — this plan
  is about the deck model and the ledger, not robot execution.
- Waste-chute / staging semantics.
- Anything on the sibling plan's §10 deferred list beyond DEF-1/DEF-2.
