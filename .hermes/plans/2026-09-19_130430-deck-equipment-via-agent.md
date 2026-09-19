# Plan — bench equipment through the agent (water baths onto the deck + into Step 1)

Date: 2026-09-19 13:04 EDT
Repo: `/mnt/vast/home/brad/git/computable-lab`
Status: PLAN (not executed)
Decisions folded in: **D1** (data-sourced kind vocabulary — O5), **D2 rev 2**
(capability = verbs via `ECP-`; acceptance = physical class + seat + capacity, with
seat addresses; §5.1 + Phase 1.5), **D3** (modules as slot-resident equipment —
deferred to its own plan: `.hermes/plans/2026-09-19_143846-platform-modules-in-deck-slots.md`,
O10), **D4** (physical relocation is an event — `move_labware` beside `move_tube`,
§5.3), **D5** (an equipment placement snapshots the host's settings into the event
graph, §5.4), and **D6** (the AI authors equipment from a description + Exa
evidence, then places it — the actual goal, §5.5 + Phase 8).
Brad's rulings: all 20 open questions answered 2026-09-19 — indexed in **§9**; the
out-of-scope list he asked for is **§10 (deferred items)**.
Supersedes: `2026-09-12_170000-water-bath-equipment-and-step-subgraph.md` — keep its
intent and phase order, but its Phase 2 seam assumptions are wrong: the prompt
constant it names (`SUBMIT_SUGGESTION_INSTRUCTION` in `submitSuggestionTool.ts`)
is not the draft instruction, and it does not account for `previewEquipments`
already existing, nor for the lawn renderer being absent. This doc is the
corrected, execution-ready version.
Does not touch: `2026-09-19_121028-protocol-pipeline-consolidation.md` (tab
hosting / review surface). Phase 7 here depends on the step-sub-graph contract
that doc also consumes — see the note in Phase 7.

---

## 1. The reported failure

Brad, on `/runs/RUN-2026-09-19-run-vwr8` with a protocol attached, focused step 1
("Set two water baths to 55C and 70C"), asked the AI: *"add the water baths to the
deck."* Sequence:

1. Model: "I'll check what's available before placing anything." → 1 clarification
   (Questions panel offered `[[equipment:EQP-THERMO-SCIENTIFIC-TSGP05-3776|Thermo
   Scientific TSGP05 Water Bath]]`).
2. Brad answered with that equipment mention.
3. Model: **"I don't have a way to place equipment on the canvas from this
   surface"**, then called `compile_event_graph_draft`.

The model was right. This is not a model-quality problem and not a surface
problem — there is no legal way to express an equipment placement in the emission
contract. It refused instead of fabricating, which is the behaviour we want; it
failed only because the channel it needed does not exist.

## 2. Root cause (verified against the tree, 2026-09-19)

The forced draft tool is `agent_intent` (`server/src/ai/submitSuggestionTool.ts:308`)
and its intent menu has exactly two members (`:323`): `event_graph`, `deck_layout`.
Inside `event_graph`, the only placement channel is labware:

- `labwareRequirements[]` — `classCurie` must be a labware class (`:239-260`),
  description is explicit: "Computable labware class CURIE, e.g. CL:96_well_plate…".
- `labwareAdditions[]` — `recordId` of a labware record plus optional `deckSlot`
  (`:261-272`).

There is no equipment property anywhere in the tool schema, in
`AgentIntentArgs` (`:347`), or in the `AgentResult` the server returns
(`server/src/ai/types.ts:565+`). The forced-draft instruction
(`server/src/ai/AgentOrchestrator.ts:368-390`, `FORCED_DRAFT_TOOL_INSTRUCTION`)
says "If the requested operation is simple labware/deck setup, include
labwareRequirements with classCurie and deckSlot" — and never mentions equipment.
Clause 1 of that instruction also forbids prose answers and requires exactly one
`agent_intent` call per turn, so a model that cannot express the request has no
legal exit other than the fallback draft call.

The asymmetry that confuses triage: the agent can *ask about* equipment but not
*place* it.

- Clarification `kind` enum includes `'equipment'` (`:205`); the server maps that
  kind to menuProvider `/e` (`server/src/ai/clarifications.ts:35`); the client
  resolves `/e` options against real equipment records
  (`app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:32`) — that is
  where Brad's EQP- picker came from.
- But the same schema caps `menuProvider` at `['/m','/l','choice']` (`:208`) and
  `parseClarificationRequests` drops `/e` (`:466`), while the TS type
  (`server/src/ai/types.ts:486`) allows it. Decide whether to widen the schema in
  Phase 4 (Task 4.4) or leave it.

## 3. What already exists (do NOT rebuild these)

Committed on main today:

- `Equipment` as a first-class bench entity, explicitly NOT labware — no wells,
  no geometry (`app/src/types/equipment.ts`; note: **this file is untracked**, see
  Phase 0).
- Editor state + reducer: `state.equipments`, `previewEquipments`, the
  `place_equipment` action, `update_equipment_settings`
  (`app/src/event-editor/EventEditorContext.tsx:66`, `:341`, `:694`, `:1080`).
- **The commit path already handles equipment.** `commit_preview` merges
  `equipments: { ...state.equipments, ...preview.previewEquipments }` and appends
  `previewPlacements` (`:853-868`). Nothing needs adding there.
- Lawn-only policy is already encoded: lawn bench equipment must never be promoted
  onto an automation slot (`:537`, `isLawnOnlyLabwareType`).
- `EquipmentTile` renders the silhouette + name + settings chip
  (`app/src/event-editor/deck/EquipmentTile.tsx:103`, `:123-124`).
- `EquipmentFocus` pane with editable settings + cycling programs (`1bd691e7`).
- `AddToDeckDialog` Equipment tab is the working UI path: kind chip → `EQP-` mint
  → lawn placement (`app/src/event-editor/deck/AddToDeckDialog.tsx`, `TAB_KINDS`,
  `addDeckDialogModel.ts`), and `searchRecords(query, ['equipment'])` finds the
  lab's real equipment records.
- Declarative vocabulary that already exists as data:
  `schema/registry/instruments/*.yaml` (`instrument_type: qpcr`, loaded by
  `server/src/registry/InstrumentRegistry.ts:30`) and the `equipment-class` schema
  (`schema/lab/equipment-class.schema.yaml`) whose `settingsDefinition` /
  `acceptsLabware` are the class capability; `EQC-WATER-BATH` seed (untracked)
  declares `temperature_c` 0-99 °C.
- An e2e already proves the manual deck path end-to-end
  (`app/e2e/` equipment focus edits temperature; deck add asserts the local
  equipment record leads).

## 3.1 What "this equipment accepts these labwares" means today (inventory)

Brad's question — *do we have a concept of "this equipment accepts these labwares"?*
— answered against the tree, because the answer decides D2/Phase 1.5 below. Three
mechanisms exist; only one faces equipment; none expresses the lab reality.

1. **`equipment-class.acceptsLabware`** — class-level, a flat list of labware
   types (`schema/lab/equipment-class.schema.yaml:108`). Only three classes
   declare it: `EQC-QPCR: [plate_96]`, `EQC-HEATER-SHAKER: []`,
   `EQC-WATER-BATH: []` (`records/seed/equipment-class/`). The schema comment at
   `:54` states "only `acceptsLabware` instruments may receive labware placed onto
   them. Empty/absent acceptsLabware = accepts none" — so as authored, a water
   bath accepts nothing and a heater-shaker accepts nothing. The qPCR seed's note
   claims a tube or bath placement onto it "is rejected"; **no such rejection
   exists**. The only consumer is `EquipmentFocus.tsx:294`, which renders the list
   as a label. So `acceptsLabware` is display-only data gating a relationship that
   does not exist yet.
2. **`compatibility_tags`** on `labware-definition`
   (`schema/workflow/labware-definition.schema.yaml:178`) — free-text tags; only
   the glassware seeds use them (`[glassware, beaker, lawn-only]`). Nothing matches
   against them.
3. **`labware-compatibility-rule`** (`schema/workflow/labware-compatibility-rule.schema.yaml`)
   — a full record type for "geometry alone is insufficient": match on
   platform/deck_slot_id/labware_definition_id/pipette_capability_id → behavior
   (force_orientation, mapping_mode, severity, message). **Zero records exist**, and
   `app/src/event-editor/lib/placementRules.ts:30-33` documents evaluation as an
   explicit no-op. It is a schema waiting for a consumer.
4. Deck/robot-side only: `execution-environment` slots declare
   `compatible_footprints`, `labware-geometry` declares `compatibleRobots`. Not
   instrument-vs-labware.
5. **Platform modules exist, without semantics.** `config/platforms/*.yaml`
   declares `modules:` (`opentrons_ot2.yaml:11-17` → `heater_shaker`,
   `temperature`, `magnetic`; the Flex adds `waste_chute`, `gripper_staging`), and
   the *graph* deck's placements carry a bare `moduleId` string
   (`app/src/graph/labware/DeckVisualizationPanel.tsx:786` sets `{moduleId,
   labwareId}` on the same slot — i.e. "module in a slot with a plate on top" is
   already representable, as two ids with no class, no settings, and no
   acceptance). Module glyphs are a hardcoded emoji switch
   (`moduleEmoji`, `DeckVisualizationPanel.tsx:306-312`) — another TS vocabulary
   that duplicates manifest data. The *run* deck (event-editor) has no module
   concept at all: its equipment is lawn-only.
6. **An equipment-capability record type exists with zero records.**
   `schema/workflow/equipment-capability.schema.yaml` (`ECP-`) declares
   `capabilities[].verbRef` → `verb-definition`, `methods`,
   `backendImplementations`, and `constraints.acceptedLabware[]` with an optional
   `subModule` ("rotor model, adapter"). It is referenced from
   `schema/core/record.schema.yaml:55`, shown in the record registry
   (`app/src/pages/RecordRegistryPage.tsx`, kind `equipment-capability`) — and
   nothing authors it. This is the home D2 rev 2 builds on (§5.1).
7. **The verb vocabulary is data.** `schema/workflow/verb-definition.{schema,lint,ui}.yaml`
   + `schema/registry/verb-action-map.yaml`, with `verb-definition` records
   referenced by ECP-. The event-type enum (`plate-event.schema.yaml:23-44`) already
   carries `magnetize`, `elute`, `decant`, `discard`… but no `heat` / `shake` /
   `rock` / `move_labware` — capability verbs are authoring work, not code (D2/D4).
8. **Exa → equipment *creation* exists, but creates a bare record.** The UI path:
   `GET /equipment/exa-search` and `POST /vendor/exa/search` (`category:
   'equipment'`) search the web, and `POST /vendor/exa/from` →
   `createEquipment()` (`server/src/api/handlers/VendorExaHandlers.ts:186`) writes
   an `EQP-` record with `name`, `manufacturer`, `model`, `notes` (URL + snippet)
   and **`status: 'active'`** — no `equipmentClassRef`, no capability, no
   `settingsDefinition`, no seat. `AddToDeckDialog` wires that into a deck tile.
   And `resolveEquipment` (`app/src/shared/taptab/slashMenu/resolvers.ts:316`) —
   the resolver behind the AI's `/e` clarification menu — already returns local
   records **plus streaming Exa hits**, i.e. the agent's equipment picker is already
   doing a live web search. So grounding exists; authoring capability-bearing
   records from it does not (D6).
9. **Events carry ambient conditions, but never an equipment reference.**
   `plate-event.incubate.schema.yaml` has `temperature_C`; **no** `plate-event.*`
   schema mentions equipment or instrument. So "the plate was in the 55 °C bath at
   300 rpm" cannot be recorded today (D5).

What is missing, stated as the three cases:

- **No nesting.** `PlacementLocation` is only `{kind:'slot'}` or
  `{kind:'lawn'}` (`app/src/event-editor/types.ts:16-18`) and equipment is
  lawn-only with no wells, so nothing can be placed *onto* equipment. "The plate
  sits on the heater" and "the tray sucks in a plate" have nowhere to live, and
  `acceptsLabware` has nothing to gate.
- **No seat/affordance axis.** The three examples differ exactly here: a direct
  seat on a hot surface (heater-shaker), a received tray/chamber (QuantStudio),
  immersion in liquid (water bath). One flat list cannot distinguish them.
- **No open acceptance.** A water bath takes any tube size, reagent bottles,
  floats, even a jury-rigged deepwell — unconstrained, i.e. the opposite of `[]`
  ("none").
- **No vendor/design-keyed compatibility.** QuantStudio 5 takes 384 PCR plates of
  the Thermo design. There is no plate-design/family field anywhere:
  `schema/registry/labware-definitions/384-well-pcr-plate.yaml` is `source: generic`
  with geometry + platform aliases, so "384-well" and "Thermo-design 384" are
  indistinguishable. No Q5 class record exists (QuantStudio appears only as an
  example string in `schema/lab/measurement.schema.yaml` and in plan docs).

Also blocking the reported scenario directly: **an EQP- instance cannot store a
setting.** `schema/lab/equipment.schema.yaml` is `unevaluatedProperties: false`
with no `settings` property, so `server/src/schema/EquipmentFirstClass.test.ts`
is RED today ("accepts a water-bath equipment instance with a concrete
temperature setting"). The class declares `settingsDefinition: temperature_c`, the
editor holds it in state, and "two baths at 55 °C and 70 °C" has no legal
persistence home.

## 4. Baseline hazards — read before writing any code

The tree is mid-flight on this exact feature, and `main` does not typecheck. Three
concrete hazards:

**H1 — untracked source files that committed code imports.**
`app/src/types/equipment.ts` has no git history and is not in `HEAD`, yet
`EventEditorContext.tsx` (byte-identical to `HEAD`) does
`import type { Equipment } from '../types/equipment'`. Same shape for
`app/src/types/equipmentRequirement.ts`, `app/src/types/labwareFootprint.ts`,
plus their tests. A fresh clone cannot build. Nothing in this plan may be called
done until tracking is reconciled (Phase 0).

**H2 — the type-level work list is already printed by the compiler.**
`EventEditorPreview.previewEquipments` is REQUIRED (`EventEditorContext.tsx:62-66`)
but eight producers/consumers do not supply it. `npx tsc --noEmit -p app/tsconfig.json`
currently reports exactly:

```
app/src/event-editor/right-pane/ai/draftPreview.ts(275,5)          ← the producer (Phase 3)
app/src/event-editor/protocol/ProtocolPreviewBridge.tsx(75,26)
app/src/event-editor/deck/PreviewActionBar.test.tsx(57,7)
app/src/event-editor/deck/ProposedGraphModal.test.tsx(9,3)
app/src/event-editor/editorHistory.test.ts(230,75)
app/src/event-editor/fix-it/buildFixSeed.test.ts(59,7)
app/src/event-editor/focus/wellStateProjection.test.ts(22,11)
app/src/event-editor/lib/previewProjection.test.ts(25,3)
```

**RED test inventory** (failing now; these are the acceptance targets, do not
"fix" them by weakening assertions):

| Test | Fails because |
|---|---|
| `app/src/types/labware.instrumentKind.test.ts` (2) | `INSTRUMENT_KINDS` has no `water_bath`; `inferInstrumentKind` falls to `generic` |
| `app/src/types/equipmentRequirement.test.ts` (1) | same — `mints … for a kind CURIE` expects `instrumentKind === 'water_bath'` |
| `app/src/event-editor/deck/LawnSurface.equipment.test.tsx` (4) | `LawnSurface.tsx` has **zero** equipment handling (`grep -n equipment` → no hits); no tile, no ghost, no drag |
| `app/src/event-editor/focus/LabwareFocus.equipment.test.tsx` (5) | pre-existing; equipment placement taps (`entityKind`) — see Open question O4 |
| `server/src/schema/EquipmentFirstClass.test.ts` (1) | `equipment.schema.yaml` forbids `settings` on an EQP- instance (§3.1, Task 1.5.1) |

Green and reusable as-is: `app/src/types/labwareFootprint.test.ts` (11),
`app/src/event-editor/deck/LawnSurface.footprint.test.tsx` (1).

**H3 — the instance schema cannot hold the setting the class declares.**
`schema/lab/equipment.schema.yaml` is `unevaluatedProperties: false` with no
`settings` property, so an `EQP-` record cannot carry `temperature_c: 55`. The
editor holds settings in state and `EquipmentFocus` renders them; only persistence
is impossible. See §3.1 and Task 1.5.1.

## 5. Architecture of the fix

One new channel, mirroring the existing labware channel at every layer:

```
agent_intent(event_graph)
  └─ equipmentRequirements[]        NEW — {classCurie|recordId, handle?, settings?, reason?}
       ↓ server parse → AgentResult.equipmentRequirements + SSE `done`
       ↓ client spec: AssistDraftResult.equipmentRequirements
       ↓ resolve: records-first → generic kind → freeform  (mirrors AddToDeckDialog)
       ↓ mint via createEquipmentFromRequirement()  (already written, unwired)
       ↓ buildPreviewFromDraft() emits previewEquipments + lawn previewPlacements
       ↓ LawnSurface renders EquipmentTile (ghost when placement is preview-only)
       ↓ PreviewActionBar Accept → commit_preview (ALREADY merges equipments)
```

Invariants to hold:

- Equipment is never labware: no slots, no wells, no volume, no geometry. Placement
  is `{kind:'lawn'}` always; never let the auto-slot pass near it (`:537`).
- Equipment is never a `CL:` class CURIE. The requirement carries either an
  `equipment:<kind>` kind CURIE or an `EQP-` record id — never `CL:water_bath`.
- Never mint a rack for an unknown term (Task 3.2 guard) — the silent
  `tubeset_24` degradation (`app/src/types/labwareRequirement.ts:99`) is how
  "water baths" would have become a 24-tube rack had the model obeyed the prompt.
- Settings live on the instance (`Equipment.settings`, keyed by the class
  `settingsDefinition`) — that is where 55 °C vs 70 °C belongs, and it is why two
  baths are two instances of one class. Prerequisite: Task 1.5.1 (the EQP- schema
  must accept `settings` first).

### 5.1 Decision D2 rev 2 — capability = verbs; acceptance = physical class + seat

Brad's rulings (2026-09-19, all four confirmed): (1) re-base this on
`equipment-capability`, (2) express acceptance by **physical class**, (3) equipment
**may have seat addresses**, (4) physical relocation is an **event** (→ D4, §5.3).

**The record type already exists and was the missing home.**
`schema/workflow/equipment-capability.schema.yaml` defines `ECP-` records:
`capabilities[].verbRef` → `verb-definition` records, plus `methods`,
`backendImplementations`, and `constraints.acceptedLabware[]` whose optional
`subModule` is documented as "rotor model, **adapter** that enables this labware
acceptance". Zero `ECP-` records exist in the tree. So:

- The **capability axis is the verb set**, not a silhouette enum. Heat, shake,
  orbit, rock are *verbs*; `INSTRUMENT_KINDS` (`app/src/types/labware.ts:49-63`,
  `heater_shaker`, `vortex`, …) is demoted to a **render hint** with no semantic
  authority. An orbital shaker that mixes but doesn't heat is a capability record
  with `shake`/`rock` and no `heat` — not a variant of "heater-shaker".
- The **swappable top reuses `subModule`**; D2 rev 1's invented `accepts` block and
  `configurations` map are dropped. Class-level `acceptsLabware` becomes redundant
  (three seeds use it, display-only) and should be retired in favour of ECP-.

The lab realities that must all be expressible (Brad's taxonomy, 2026-09-19):

| Equipment | Capability verbs | Seat | Acceptance |
|---|---|---|---|
| Heaters that don't shake | `heat` | dry seat / bay | as its seat says |
| Orbital shakers, rockers | `shake` / `rock` | **flat platform**, no holder | **open** — any combination of flasks/plates/etc., n items |
| Heater-shakers | `heat` + `shake` | dry seat / bay | as its seat says |
| Heat blocks with fixed tube slots | `heat` (+) | **addressed slots** | **tubes only**, at addressed positions — no labware at all |
| Heaters/shakers taking 1, 2, 4 SBS plates | `heat` and/or `shake` | bay / dry seat | **SBS footprint**, capacity n |
| Our clamshell heater-shaker | `heat` (top **and** bottom) + `shake` | bay, capacity 4 | SBS footprint, height class standard **or** deepwell; settings temperature / RPM / timer |
| QuantStudio 5 | `read` (+ thermocycle) | chamber | 384-well **Thermo design family** |
| Water bath | `heat` / `incubate` | immersion | **open** — any tube size, bottles, floats, jury-rigged deepwell |

**Verb set (Brad's taxonomy, 2026-09-19).** Distinct physical capabilities, one verb
each; `orbit` is *not* a verb but a property of shaking, and mixing is a family:

```
process/handling:  heat | incubate | shake | rock | stir | sonicate | microwave | autoclave | read
mixing ⊃ { orbital-shaking, rocking, stir (stir bar) }      # types of mixing
shake.property:    motion: orbital | linear                # orbit is a shake property
```

`heat` ≠ `incubate` and `rock` ≠ `shake` (distinct verbs, not synonyms); `stir` is
the stir-bar mixing case. `sonicate`, `microwave`, `autoclave` are process verbs an
equipment capability can declare (a bath that sonicates, a microwave, an autoclave).
Author each as a `verb-definition` record; phrasing variants belong in the action
map, not in extra verbs.

**Model — extend `equipment-capability.constraints` (schema change), reusing
`subModule` for adapters:**

```yaml
# ECP-… (one record per equipment/class, capabilities[] each with its own seat)
constraints:
  seat: platform            # platform | bay | slots | immerse   (pose)
  addressing: none          # none | grid | linear  → seat addresses (see below)
  capacity: 4               # integer, or `unbounded`
  accepts:
    mode: open              # open | by_class | none   (no labware-definition ids)
    footprint: sbs          # sbs | <length_mm>x<width_mm> | any
    height_class: [standard, deepwell]
    well_counts: [96, 384]
    tube_size_class: any
    flask: true
    design_family: cl:thermo-384-pcr-design     # when the plate design is keyed
  subModule: cl:hs-adapter-96-deepwell          # adapter/top/rotor enabling this
  heat:
    from: [top, bottom]     # clamshell heats both ways — a method detail
```

- **Acceptance is a match on physical facts**, never a labware-definition id list
  (that is what makes "4 SBS plates, normal or deepwell" and "anything on a flat
  platform" expressible). The footprint half is *already data*:
  `physical_geometry.overall_dimensions_mm` on labware-definition, resolved by
  `app/src/types/labwareFootprint.ts` (`labwareFootprintMm`, SBS = 127×85).
  New facts to author: `height_class`, `design_family`.
- **Item kinds are not just labware.** A heat block accepts tubes; a bath accepts
  bottles and floats. Acceptance must range over tubes/floats/bottles as well as
  labware — today's `acceptedLabware` cannot express a tube-only seat.
- **Seat addresses are allowed (ruling 3) and are NOT wells.** A heat block's
  positions are `addressing: grid` *seat* addresses; the tube in one is referred to
  as (host, seatIndex) — e.g. "the tube in A3 of the block". No liquid geometry, so
  "equipment is never labware" still holds. An addressed seat with
  `accepts.tube_size_class` is the tube-only case; a bay with a footprint is the
  plate case.
- **Class vs instance is unchanged from rev 1:** the *class* declares the possible
  acceptances (one ECP- per adapter/rotor configuration via `subModule`); the
  *instance* declares which is fitted, as an ordinary enum
  `settingsDefinition` entry (`installed_adapter`) — `settingsDefinition` already
  supports `valueType: enum` (`equipment-class.schema.yaml:60-75`). Predicate:
  `instance.settings.installed_adapter` → the matching `subModule` capability →
  that capability's `accepts`.
- **Generic classes are CURIEs; vendor classes are records (O1/O7).** "Use CURIEs
  in general", with `cl:` (computable-lab) for "the most common things which are
  the generic entries". So a generic bench item's class is a CURIE
  (`cl:water-bath`, `cl:heat-block`, `cl:orbital-shaker`, `cl:tube-float`), and an
  `EQC-` record is reserved for a specific, evidenced model (the QuantStudio 5, the
  clamshell, a Thermo #123454321). An instance may reference either.
  This is the ruling that settles the `equipmentClassRef` disagreement in the RED
  test: the generic case points at `cl:water-bath`, not at `EQC-WATER-BATH`.
- **Enforcement stays in lint YAML** (business logic is data): a placement lint spec
  whose predicates read the capability's `accepts` + the item's physical facts.
  `labware-compatibility-rule` gains a real consumer, or is retired in favour of
  this.
- **The float is labware, not a special case** (`cl:tube-float` /
  `float_rack`): it accepts tubes and its own footprint/seat is what the bath
  accepts. The jury-rigged deepwell needs no special casing either — it seats
  directly or rides a float.

Invariants (rev 2):

- `mode: none` is the explicit "accepts nothing" (balance, freezer); `mode: open`
  must be authored as `open`, never as an empty list. Rev 1's ambiguity is gone
  because the two are different enum values.
- Acceptance is never inferred from free text at runtime. Missing data (no
  capability record, no `height_class`, no design family) **flags for the user** —
  never silently allowed, never silently degraded.
- `by_class`/`open` acceptance MUST be checkable from facts the item actually
  carries; if the fact is missing (e.g. no footprint), fail closed and say which
  fact is missing.
- Seat addresses require a host placement (`PlacementLocation {kind:'seated'}`,
  Task 1.5.6). Until that lands, the agent path (Phase 4) places *freestanding lawn*
  equipment only and must not claim to have seated or addressed anything.
- A capability's `subModule` MUST correspond to an `installed_adapter`-style enum
  value in the same equipment's settings, else the acceptance is unreadable.

### 5.2 Decision D3 — modules become slot-resident equipment (its own plan, O10)

Brad's heat-shaker answer exposed a second model gap. Ruling (O10): *"Make it its
own plan"* → **`.hermes/plans/2026-09-19_143846-platform-modules-in-deck-slots.md`**,
listed as DEF-2 in §10. Not implemented here; the boundary is:

- This plan's equipment is **lawn-resident bench equipment** (water bath, orbital
  shaker, heat block, clamshell, Q5).
- A **platform module** (Opentrons Heater-Shaker / Temperature / Magnetic; Flex
  Waste Chute / Staging) is mounted in a **deck slot** and carries labware seated on
  top — a deck-model change touching both deck editors and the compiler.

The evidence that made it a decision rather than a detail:

- `config/platforms/opentrons_ot2.yaml:11-17` declares the module vocabulary
  (`heater_shaker`, `temperature`, `magnetic`); the Flex adds two more.
- The graph deck stores `moduleId` on a slot placement next to `labwareId`
  (`DeckVisualizationPanel.tsx:786`), so "module in slot + plate on top" is
  already *expressible* — as two bare ids, with no class, no settings, no
  acceptance, and no link to the equipment entity.
- `execution-environment.schema.yaml` independently has `slot_type: heater |
  magnet`, so the robot-plan side has its own module notion.
- The run deck (event-editor) has none of this: equipment is lawn-only.

Boundary: this plan places **freestanding bench equipment only** (which is exactly
what the water-bath scenario needs). Until the modules plan lands, the agent may
author an Opentrons module's capability/settings data (Task 1.5.3) but must not
place it — a slot-mounted module is not expressible here.

### 5.3 Decision D4 — physical relocation is an event, distinct from pipetting

Brad's ruling (2026-09-19, #4): moving a tube **or a labware** is an event. Today
`transfer` means *pipetting liquid between wells* (volume + material), and physical
relocation is not modelled as a provenance act at all.

What exists vs what is missing:

- **Tube relocation exists and is in flight.** `place_tube` / `move_tube` /
  `remove_tube` are verbs in the liquid-handling pack (pinned by
  `app/src/shared/vocab/tubeVerbs.test.ts` — they reach `availableVerbs`, hence the
  AI) and members of both event-type enums (`app/src/types/events.ts:27-28,48-49`,
  `schema/workflow/events/plate-event.schema.yaml:34-36`,
  `schema/workflow/event-graph.schema.yaml:319-320`). Their details contracts exist
  (`plate-event.place-tube.schema.yaml`) but are **not wired into the canonical
  `details` oneOf** (`plate-event.schema.yaml:63-75`), and a live path validates a
  tube event only weakly. **Another session is actively fixing the `place_tube`
  producer** — all uncommitted in this tree
  (`.hermes/plans/handoffs/2026-09-19_place-tube-producer-fix-complete.md`).
  Coordinate before touching tube details.
- **Labware relocation does not exist as an event.** Moving a plate onto a heater /
  into the clamshell is deck *layout* today (`movePlacement`, `place_equipment`) —
  a UI/geometry act with no timeline entry. "Put the four plates in the clamshell"
  is provenance-relevant and cannot be recorded.
- **Cross-host tube moves are only structurally expressible.** `move_tube` details
  carry `source {labwareId, well}` / `target {labwareId, well}`, so different
  labwareIds are *possible*, but every live path (the focus gesture) builds both
  from one rack. Rack → heat block → bath float needs it deliberately.

Model:

```yaml
# new event type, parallel to move_tube
event_type: move_labware
details:
  from: { labwareId: <id>, placementId?: <id> }        # or bench/lawn host
  to:   { seatHostRef: <equipment/placement id>, seatIndex?: <addr> }
        # seatHostRef only meaningful once Task 1.5.6 lands (D2 ruling 3)
```

- Add `move_labware` to: the event-type enums + labels/icons/colors
  (`app/src/types/events.ts`), `plate-event.schema.yaml`, `event-graph.schema.yaml`,
  a new `plate-event.move-labware.schema.yaml` wired into the details `oneOf`, the
  vocab pack verb-definition (so it reaches `availableVerbs` → the agent), and lint.
- Widen `move_tube` to cross-host destinations and (later) seat destinations, in
  the same change that wires its details contract — **after** the in-flight tube
  work lands.
- **The agent needs no new intent**: relocation flows through the existing
  `event_graph` intent's `events[]`. It needs the verb in `availableVerbs` and a
  shaped details contract, which is exactly the Channel that shipped `place_tube`.
- Naming (decision D4a): `move_labware` (parallel to `move_tube`) rather than
  "transfer labware" — `transfer` is already the pipetting verb and overloading it
  is the conflation D4 exists to prevent.
- Lint guards: a `transfer` with no volume/material, or a `move_labware` /
  `move_tube` carrying wells+volume, must fail — the two families stay disjoint.

### 5.4 Decision D5 — an equipment placement records the settings it used

Brad's requirement (2026-09-19): when a labware is moved onto a heater or shaker,
**the event graph must capture the heat and RPM settings of the equipment.** Today
no event references equipment at all (§3.1 item 9), so a plate that sat in a 55 °C
bath at 300 rpm has no record of either condition.

Model — the relocation event carries a **snapshot**, not a pointer:

```yaml
event_type: move_labware
details:
  from: { labwareId: <id> }
  to:   { seatHostRef: <equipment/placement id>, seatIndex?: <addr> }
  host:                       # captured AT EVENT TIME — never a live reference
    hostRef: { kind: record, type: equipment, id: EQP-… }
    classRef?: { kind: record, type: equipment-class, id: EQC-… }
    capabilityRef?: { kind: record, type: equipment-capability, id: ECP-… }
    settings: { temperature_c: 55, rpm: 300, duration_sec: 600 }
    method?: cl:thermo-shake-v1        # the program/profile when one was used
```

- **Snapshot, not reference** — this is the ledger rule: if the operator later
  changes the bath to 70 °C, the historical event must not silently rewrite itself
  to claim the plate was at 70 °C. The *current* state stays on the equipment
  instance (`Equipment.settings`); the *historical* fact lives in the event.
- **Settings changes are their own events**, or the ledger has a hole. Today
  `update_equipment_settings` is an editor reducer action only
  (`EventEditorContext.tsx:341`), so changing a bath from 55 → 70 °C between two
  placements is invisible. Add `set_equipment_settings` (naming: O17) with
  `{hostRef, settings, at: t}`.
- **Capture is automatic, not the user's job**: the editor knows the host and its
  settings at the moment of a move, so it stamps them (same posture as the
  provenance stamping the draft path already does).
- **Lint**: a relocation into a seat whose capability declares `heat`/`shake` but
  carries no `settings` snapshot is a warning, not a silent pass — "you cannot claim
  a heat step without the temperature".
- **Downstream**: execution/robot plans and readout context want the same facts, so
  the snapshot shape should be reuse-friendly (it mirrors the `incubate`
  `temperature_C` precedent rather than inventing a parallel vocabulary).

### 5.5 Decision D6 — the AI authors the equipment (description + evidence → place)

Brad's goal (2026-09-19): given a user description plus an Exa search — *"you can
put two plates on it, it has a heat setting and an RPM setting, it's a Thermo
#123454321"* — the AI should **create the equipment** (class + capability +
instance) and **place it on the bench**. This is the real goal of the whole plan;
the water-bath placement is the first thin slice of it.

What exists: the Exa search (`/vendor/exa/search`, `category: 'equipment'`), the
live-Exa equipment resolver behind the AI's own `/e` clarification menu, and a
creator (`createEquipment`) that writes a bare `EQP-`. What is missing: authoring
the **capability-bearing** records from the description + evidence, and letting the
agent drive it.

Design:

1. **One creation path, one record set.** An equipment design produces three
   records, in the shapes D2 rev 2 established:
   - `equipment-class` (`EQC-`): name, manufacturing identity, `settingsDefinition`
     (temperature / RPM / timer, and the profile type when it cycles),
   - `equipment-capability` (`ECP-`): the verbs (`heat`, `shake`) + `seat`
     (`platform` / `bay` / `slots` / `immerse`) + `accepts` (capacity, footprint,
     height classes, tube sizes) — i.e. *what makes it usable*, which is exactly
     the part a vendor page does not state and the user does ("two plates", "heat
     and RPM"),
   - `equipment` (`EQP-`): the instance with `equipmentClassRef` + `settings`.
2. **Draft until confirmed.** `createEquipment` currently writes `status: 'active'`
   — that is the AI asserting a machine exists. AI-authored records must be
   `status: 'draft'` and only promoted on human Accept, mirroring how
   `ontologyBindings` draft-only entries materialize on accept. The deck shows the
   draft equipment as a ghost (the machinery in Phase 2 already renders
   `previewEquipments`).
3. **Evidence, not vibes.** The record carries the vendor `product_url` and the
   description snippet in notes (that is what `createEquipment` already does), and
   any *scientific* claim (a capability the user asserted rather than the vendor
   page) needs an evidence record — `schema/core/common.schema.yaml` deliberately
   excludes provenance from FAIRCommon ("use your event system + evidence
   records").
4. **Grounding rules (never fabricate).** A manufacturer/model/catalog number may
   only land in a record when a search hit supports it; otherwise it stays a
   clarification in the Questions panel (the `/e` menu already surfaces local +
   Exa candidates). Capabilities the user stated are attributed to the user
   description, not to the manufacturer. Never invent a SKU.
5. **How the agent drives it.** The deck chat has exactly one tool
   (`AgentOrchestrator.ts:803` returns `[AGENT_INTENT_TOOL_DEF]`), so equipment
   design rides the existing `equipmentRequirements` channel with an authoring
   shape (`{described_as, manufacturer?, model?, catalog_number?, capabilities[],
   seat, settings_definition[], evidence[]}`) and the server does the search +
   creation the way it already does live searches for clarifications. That keeps
   the forced-tool discipline (small local models stay structured) instead of
   opening web tools inside draft mode.
6. **One mint tree.** `AddToDeckDialog` currently mints a legacy `instrument`
   **labware tile** (`createLabware('instrument')` + `sourceRecordId`) while the
   first-class `Equipment` entity exists in `state.equipments`. The AI path must
   land on the first-class entity, and the dialog should converge onto it rather
   than becoming a second tree (R10).

Deliberately out of scope here: the *equipment-design UI* (a review surface for
proposed classes/capabilities). The deck ghost + Accept is the first review
surface; a richer one is its own plan.

## 6. Phases

Every task: RED test first → GREEN → the listed command → commit. Restart the
backend after any `server/` change (SOUL.md rule 13) before browser steps.

### Phase 0 — reconcile tracking and freeze the baseline (blocking, no feature code)

- **Task 0.1** — Decide tracking for the untracked source set
  (`app/src/types/equipment.ts`, `equipmentRequirement.ts`, `labwareFootprint.ts`
  + the three new test files + `records/seed/equipment-class/eqc-water-bath.yaml`
  + `schema/registry/tube-sizes/`). `git log --oneline -1 -- <path>` returning
  empty while a committed file imports it is the evidence for H1; either commit
  them or reconcile the imports. Ask before choosing: the "stop tracking lab
  artifacts" commit (`bb7445a6`) may have been deliberate for some of these.
- **Task 0.2** — Record the baseline in the plan: append the exact
  `npx tsc --noEmit -p app/tsconfig.json | wc -l` count and the RED inventory from
  §4 so progress is measurable. The app typecheck is dirty across other sessions;
  gate by diffing the error list for the files you touch, never by "typecheck
  passes".
- **Task 0.3** — Confirm nothing else is editing
  `LawnSurface.tsx` / `draftPreview.ts` / `InstrumentGlyphs.tsx` concurrently.

### Phase 1 — vocabulary: `water_bath` as a computable equipment kind

- **Task 1.1 (RED, exists)** — `app/src/types/labware.instrumentKind.test.ts`
  already asserts `INSTRUMENT_KINDS` contains `water_bath` and that
  `inferInstrumentKind` reads "water bath" / "Water Bath 55C" / "circulating water
  bath". Run it and watch it fail:
  `cd app && npx vitest run src/types/labware.instrumentKind.test.ts`
- **DECISION D1 (RESOLVED 2026-09-19, Brad: "data-sourced kind vocab")** — the app's
  `INSTRUMENT_KINDS`/`INSTRUMENT_KIND_LABELS`/`inferInstrumentKind`
  (`app/src/types/labware.ts:49-63`) is a hardcoded TS union duplicating a
  vocabulary that already exists as data (`schema/registry/instruments/*.yaml`
  `instrument_type`, and `equipment-class`/capability records). Ruling: option (b) —
  the **kind vocabulary comes from data** (registry + class records), and the TS
  side only *draws* (silhouette switch stays code; it is rendering, not policy).
  Acceptance test: every kind referenced by an instrument-definition / class /
  capability record renders, and no TS list is the source of truth.
- **Task 1.2 (GREEN)** — make the kind renderable in `app/src/types/labware.ts`
  (`water_bath` in whatever list remains as a *render hint* after D1) and add it to
  `INSTRUMENT_KIND_LABELS`; `inferInstrumentKind` may keep a fuzzy match for legacy
  labels, but data wins where a record declares the kind.
- **Task 1.3** — silhouette in
  `app/src/event-editor/deck/InstrumentGlyphs.tsx` (find the `heater_shaker`
  branch, add a `water_bath` rectangle reusing `--cl-*` tokens).
- **Task 1.4** — `AddToDeckDialog.test.tsx` already iterates `INSTRUMENT_KINDS`;
  add one assertion that a "Water bath" chip is present and selectable, mirroring
  the qPCR chip test.
- **Task 1.5** — `app/src/types/equipmentRequirement.test.ts` must go green
  (it asserts the minted `Equipment`: id `eqp:equipment:water_bath:*`, name from
  the handle, `instrumentKind: 'water_bath'`, `settings`, and an
  `equipmentClassRef` of `{kind:'record', type:'equipment-class', id:'equipment:water_bath'}`).
  Note the id shape in that expectation is the kind CURIE, not `EQC-WATER-BATH` —
  reconcile deliberately (Open question O1).

### Phase 1.5 — the acceptance model (D2 rev 2) + the relocation verb (D4)

Specs first, code second (CLAUDE.md rule 1). Schema + data + validation only — no
editor behaviour changes beyond consuming the check, so this is safe to land
before the plumbing. Everything here is inert until Phase 4's emission can carry a
seat intent.

- **Task 1.5.1 (RED, exists)** — the EQP- instance must be able to record a
  setting. `cd server && npx vitest run src/schema/EquipmentFirstClass.test.ts` →
  the "water-bath equipment instance with a concrete temperature setting" case
  fails today. GREEN: add `settings: { type: 'object', additionalProperties: true }`
  to `schema/lab/equipment.schema.yaml` and keep `unevaluatedProperties: false`.
  Values are keyed by the class's `settingsDefinition`, which the schema cannot
  see — class-keyed validation is Task 1.5.4's job, not a structural one. Add one
  test that an unknown key still *validates structurally* (so the pair of facts —
  structural here, class-keyed in lint — is explicit).
- **Task 1.5.2 (spec-first, RED then GREEN)** — extend
  `schema/workflow/equipment-capability.schema.yaml` (the `ECP-` record), NOT a new
  block on `equipment-class`: add to `constraints` the fields `seat`, `addressing`,
  `capacity`, and `accepts { mode, footprint, height_class, well_counts,
  tube_size_class, flask, design_family }`. `subModule` already exists there — keep
  it as the adapter/rotor hook, do not invent a second one. In the same wave retire
  `acceptsLabware` from `equipment-class` (data + the `EquipmentFocus` display +
  `LabwareFocus.equipment.test.tsx` fixtures, R6). RED in
  `server/src/schema/EquipmentCapabilitySeat.test.ts`: (a)
  `{seat: platform, accepts:{mode: open}}` validates; (b) `seat: 'in_the_water'`
  fails; (c) `accepts.mode: by_class` with *no* physical fact fails (an acceptance
  with nothing to match on is unreadable); (d) a tube-only seat
  (`addressing: grid` + `tube_size_class`, no footprint) validates — a heat block is
  legitimate; (e) `addressing` outside `none|grid|linear` fails; (f) `capacity`
  accepts an integer or `unbounded` and rejects anything else.
- **Task 1.5.3 (data, STOP AND ASK)** — author `ECP-` capability records (Brad's
  taxonomy, 2026-09-19); each equipment or class gets one, with a capability entry
  per verb and its own seat:
  - **Water bath** — verb `heat`/`incubate`; `seat: immerse`, `mode: open`,
    `capacity: unbounded`; accepts tubes of any size, bottles, floats.
  - **Clamshell heater-shaker (the lab's)** — verbs `heat` + `shake`;
    `seat: bay`, `capacity: 4`, `accepts: {mode: by_class, footprint: sbs,
    height_class: [standard, deepwell]}`; `heat.from: [top, bottom]`; settings
    temperature / RPM / timer.
  - **Opentrons Heater-Shaker** — verbs `heat` + `shake`; one capability per
    `subModule` (the swappable top): currently the 96-deepwell adapter, swappable to
    a flat 384 adapter; `seat: bay`, `capacity: 1`.
  - **Heat block with fixed tube slots** — verb `heat`; `seat: slots`,
    `addressing: grid`, tube-only acceptance (`tube_size_class`), **no** labware.
  - **Orbital shaker / rocker** — verb `shake`/`rock`, no heat;
    `seat: platform`, `mode: open` (any combination of flasks/plates).
  - Existing `EQC-QPCR` / `EQC-HEATER-SHAKER` facts migrate into ECP- records, and
    per O12 **both** the generic heater-shaker/thermomixer kind and the Opentrons
    module stay (different equipment, both real in the lab).
  - Generic classes are CURIE-identified (`cl:water-bath`, `cl:heat-block`,
    `cl:orbital-shaker`, `cl:tube-float`, …) per O1/O7; `EQC-` records only for
    evidenced vendor models. The float is authored as a **labware-definition**
    (`float_rack`), not a constraint term.
  - Author the **verb-definition records** for the verb set in §5.1 — `heat`,
    `incubate`, `shake` (property `motion: orbital|linear`), `rock`, `stir`,
    `sonicate`, `microwave`, `autoclave`, `read` — with mixing as a family
    (`cl:mixing ⊃ {orbital-shaking, rocking, stir}`), and one verb per physical
    capability. Phrasing variants go in the action map.
  Resolution: Brad's O8 ruling — *"this is why we have an Exa MCP service"* — means
  the adapter/top names, the clamshell's model, the heat block's capacity and size
  classes, and whether the lab owns a rocker/rocker-shaker are **grounded from
  vendor evidence via Exa**, not asked of Brad. Only genuinely un-googleable facts
  come back as questions. Never invent a part number or SKU.
- **Task 1.5.4 (GREEN)** — one pure predicate, `equipmentSeatAccepts(...)`,
  answering "may this item seat in/on this equipment right now?" from: the
  capability's `accepts` × the item's physical facts (footprint via the EXISTING
  `labwareFootprintMm`, `height_class`, well count, `design_family`, tube size) ×
  the instance's `installed_adapter`/`subModule` selection. Tests cover the whole
  taxonomy table in §5.1: open platform accepts a flask *and* a plate in the same
  seat; the clamshell accepts 4 standard **or** deepwell SBS plates and rejects a
  1536-well plate or a non-SBS footprint; the heat block accepts a tube but **not**
  a plate (and reports the seat address); the bath accepts a float and a bottle;
  Q5 accepts only the Thermo design family; the Opentrons module accepts deepwell
  only while that adapter is `installed_adapter` and nothing when it is unset.
  Consume it from a placement lint spec so the rule stays data and TS only
  interprets.
- **Task 1.5.5 (spec-first)** — `labware-definition`: add `height_class` and
  `design_family` (+ optional `vendor_refs`) to
  `schema/workflow/labware-definition.schema.yaml` with a schema test. Do **not** add
  a footprint field — `physical_geometry.overall_dimensions_mm` already carries it
  and `labwareFootprintMm` resolves it in one place; the predicate must call that,
  not re-derive. The Thermo-design 384 entry itself is authored in Task 1.5.7 from
  Exa evidence; leave the generic `384-well-pcr-plate.yaml` family-less so the Q5
  rejection case stays testable. Also author `float_rack` (O7: the float is
  labware) with tube-only acceptance and a bath-seatable footprint.
- **Task 1.5.6 (DEFERRED per O6 — goes to the deferred list, §10)** — the seating
  relationship: `PlacementLocation` gains `{kind:'seated', hostPlacementId,
  seatIndex?}` with `seatIndex` used when the host's capability declares
  `addressing`; the deck renders a seated item; capacity is enforced; save format /
  undo / focus pane follow. Not in this landing. Until it exists the agent places
  *freestanding lawn* equipment only and must not claim to have seated or addressed
  anything. Record the consequence plainly: **the AI can place a water bath on the
  bench, but cannot yet express "this plate is IN the bath" or "the tube in A3 of
  the block"** — even though D5's settings snapshot is already written for the day
  seating lands.
- **Task 1.5.7 (data — authored via Exa per O8, no longer blocked on Brad)** —
  author `EQC-QUANTSTUDIO5` + its `ECP-` capability (`seat: chamber`,
  `accepts: {mode: by_class, well_counts: [384], design_family:
  cl:thermo-384-pcr-design}`, verb `read`), the Thermo 384 plate
  `labware-definition` (with `design_family` + `vendor_refs`), and an `EQP-`
  instance record. Ground the model identity, the plate design's real name, and the
  SKU from the **Exa MCP service** (vendor pages / Thermo catalog) rather than from
  guesswork; a Q5 that only says "384" would accept a generic plate, which is the
  exact conflation D2 exists to prevent. The machine's serial/asset/location is the
  lab's own fact — leave those fields absent rather than inventing them, and let the
  user fill them in the record editor.
- **Task 1.5.8 (D4 + D5 — relocation is an event; coordinate first)** — add
  `move_labware` as an event type parallel to `move_tube`: the enum + labels/icons/
  colors (`app/src/types/events.ts`), `plate-event.schema.yaml` and
  `event-graph.schema.yaml`, a new `plate-event.move-labware.schema.yaml` details
  contract **wired into the canonical details `oneOf`** (`plate-event.schema.yaml:63-75`
  currently omits the tube schemas too), the vocab pack verb + a `verb-definition`
  record so it reaches `availableVerbs` → the agent, and lint guards keeping
  `transfer` (wells + volume) disjoint from relocation (hosts + addresses). Widen
  `move_tube` to cross-host (rack → heat block → bath float) in the same change that
  wires its details contract. **D5 in the same contract**: `move_labware` (and a
  tube moved into a seat) carries the `host` **settings snapshot**
  (`hostRef`, `classRef?`, `capabilityRef?`, `settings{temperature_c, rpm,
  duration_sec}`, `method?`) stamped by the editor at move time, plus a new
  `set_equipment_settings` event so a 55 → 70 °C change is in the ledger rather
  than only in editor state. Tests: the snapshot survives a later settings change
  (history is immutable), and the lint warning fires for a heated seat with no
  settings. **Do this only after the in-flight `place_tube` producer work lands**
  (`.hermes/plans/handoffs/2026-09-19_place-tube-producer-fix-complete.md`,
  uncommitted in this tree) — same files.

Gate:

```
cd server && npx vitest run src/schema/EquipmentFirstClass.test.ts \
  src/schema/EquipmentCapabilitySeat.test.ts
cd app && npx vitest run src/types/labware.instrumentKind.test.ts \
  src/shared/vocab/tubeVerbs.test.ts
```

Plus a data review: no `acceptsLabware` on any equipment class, and no
`ECP-` capability whose `accepts.mode` contradicts its seat (a platform seat with
`mode: none`, an addressed tube seat with a footprint, …).

### Phase 2 — the deck renders equipment (lawn placement + ghost + drag)

`LawnSurface.tsx` has no equipment branch today. `LawnSurface.equipment.test.tsx`
is the spec.

- **Task 2.1 (RED, exists)** — `cd app && npx vitest run src/event-editor/deck/LawnSurface.equipment.test.tsx`
  → 4 failures ("Unable to find an element with the text: /Water bath 1/").
- **Task 2.2 (GREEN)** — render committed equipment placements from
  `state.placements` where `entityKind === 'equipment'` by resolving
  `equipmentId` against `state.equipments`, and preview ghosts from
  `state.preview.previewEquipments` (+ `previewPlacements`), mounting
  `EquipmentTile`. Ghost tiles must be visually marked and must not be draggable
  into committed state.
- **Task 2.3** — drag-to-move a committed equipment placement on the lawn
  (`movePlacement`), per the 4th failing assertion.
- **Task 2.4** — assert the negative: an equipment placement renders NO well grid
  and leaks nothing into `state.labwares` (3rd failing assertion).
- **Task 2.5 (O4: "absorb them")** — while Phase 2 is open, fix the pre-existing
  equipment failures this plan owns: `LabwareFocus.equipment.test.tsx` (5) and the
  `entityKind` / `equipmentId` type errors on `EventEditorPlacement`
  (`app/src/event-editor/types.ts:16-23`). They are the same feature — the placement
  model must carry `entityKind`/`equipmentId` for the deck to resolve an equipment
  tile at all.
- **Gate:** the file green, plus
  `npx vitest run src/event-editor/deck` and a `grep` of the typecheck diff.

### Phase 3 — the preview producer (client)

- **Task 3.1 (RED)** — extend
  `app/src/event-editor/right-pane/ai/draftPreview.test.ts`: a draft carrying one
  water-bath equipment requirement yields `preview.previewEquipments` with one
  minted `Equipment`, and a `previewPlacements` entry at `{kind:'lawn'}` with
  `entityKind:'equipment'` — never a slot, never a `previewLabwares` entry.
- **Task 3.2 (RED)** — the guard: a requirement whose `classCurie` is not a known
  labware class AND not an `equipment:` kind must NOT mint a labware at all.
  Today `labwareTypeForRequirement` returns `tubeset_24`
  (`app/src/types/labwareRequirement.ts:99`). Assert "no labware, and the skip is
  reported", then implement (skip list entry is the existing mechanism —
  `sourceSkips`).
- **Task 3.3 (GREEN)** — `buildPreviewFromDraft`
  (`app/src/event-editor/right-pane/ai/draftPreview.ts:197`) accepts
  `equipmentRequirements`, mints through `createEquipmentFromRequirement`, assigns
  a lawn position (reuse `nextLawnPosition` + the footprint helpers in
  `app/src/types/labwareFootprint.ts`), and returns `previewEquipments` in the
  preview object.
- **Task 3.4** — fix the remaining `previewEquipments` call sites (H2 list): the
  tests get `previewEquipments: {}`, `ProtocolPreviewBridge.tsx:75` gets the real
  bucket. Gate: `npx tsc --noEmit -p app/tsconfig.json | grep previewEquipments`
  returns nothing.
- **Task 3.5** — resolution order for a requested instrument, inside the resolve
  step, mirroring `AddToDeckDialog`: (1) the lab's equipment records
  (`searchRecords(query, ['equipment'])`, prefer local) → `recordId` + real name;
  (2) the generic kind (`equipment:water_bath`); (3) freeform handle from the
  user's exact words. Unit-test the order with a mocked search.

### Phase 4 — the emission contract (server)

- **Task 4.1 (RED)** — `server/src/ai/submitSuggestionTool.test.ts`: assert the
  `agent_intent` (and `compile_event_graph_draft`) schema exposes
  `equipmentRequirements` with the intended field set, and that
  `parseSubmitSuggestionArgs` carries it onto `AgentResult`.
- **Task 4.2 (GREEN)** — add the property to
  `AGENT_INTENT_TOOL_DEF`/`COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF` (`:277-345`) and to
  the draft args reuse list (`:335-342`); parse it in
  `parseSubmitSuggestionArgs` (`:623`); add
  `equipmentRequirements?: AgentEquipmentRequirement[]` to `AgentResult`
  (`server/src/ai/types.ts`), mirroring `AgentLabwareRequirement`.
  Field set: `{ classCurie?, recordId?, handle?, reason?, settings? }` with the
  description stating the rules — bench equipment only (water bath, heat block,
  shaker, vortex, qPCR), `equipment:<kind>` for a generic kind or an `EQP-` id for
  a real record, NEVER a `CL:` CURIE, settings keyed by the class
  `settingsDefinition` (e.g. `temperature_c: 55`), and never a deck slot
  (equipment is lawn-only).
  **D2 dependency:** the description must match what the model can actually claim.
  Until Phase 1.5.6 lands, equipment emissions are *freestanding lawn placements* —
  do not offer, and do not let the model emit, a `seatOn`/`placedIn` field. If
  seating is accepted into scope, add `seat: {hostRef|hostHandle, seatIndex?}` here
  in the same change as the placement model so the contract never advertises a
  relationship the editor cannot render.
  **D2 rev 2 (capability):** each equipment requirement names a **capability**, not
  a labware type — `{equipment, verb(s), subModule?}` (e.g. water bath + `heat`;
  heater-shaker + `shake` on the 384 adapter) — because acceptance is the
  capability's seat, resolved from physical facts at validation time. The model
  never asserts compatibility; the lint spec (Task 1.5.4) decides, and a rejected
  seat comes back as a clarification, not a silent drop.
  **D4 (relocation):** once `move_labware` exists, the model emits it as an
  ordinary event through `events[]` — no new intent. The prompt must keep it
  distinct from `transfer` (wells + volume) in one line, since that adjacency is
  where the tube-producer drift came from.
- **Task 4.3 (GREEN)** — a bullet in `FORCED_DRAFT_TOOL_INSTRUCTION`
  (`server/src/ai/AgentOrchestrator.ts:368-390`) telling the model that bench
  EQUIPMENT is requested through `equipmentRequirements`, with the
  `equipment:`-not-`CL:` rule spelled out, and that a request like "add the water
  baths to the deck" is a placement, not a prose refusal. Unit-assert the
  instruction text contains `equipmentRequirements`.
- **Task 4.4** — reconcile the clarification asymmetry: either widen the
  `menuProvider` enum to include `/e` (`:208`) and stop dropping it in
  `parseClarificationRequests` (`:466`) so the model can ask for an equipment menu
  directly, or document why `/e` stays server-derived. Do not leave the TS type
  advertising `/e` while both schema and parser reject it.

### Phase 5 — client transport

- **Task 5.1 (RED)** — `assistStream` unit: a `done` result carrying
  `equipmentRequirements` surfaces to `onDraftResult` and is described by
  `summarizeDraftResult` (today it would render as "(no response)").
- **Task 5.2 (GREEN)** — add `equipmentRequirements` to `AssistDraftResult`
  (`app/src/event-editor/right-pane/ai/assistStream.ts:49-61`) and a summary line
  to `summarizeDraftResult` (`:92-115`) — "Proposed equipment: water bath (55 °C)".
- **Task 5.3 (GREEN)** — thread it through `AiTabPanel`'s `onDraftResult`
  (builds the preview via `draftPreview`) and the `previewEquipments` bucket.

### Phase 6 — end to end

- **Task 6.1** — `app/e2e/deck-equipment-via-agent.spec.ts` (new), modelled on
  `e2e/deck-switch-via-agent.spec.ts`: intercept `/api/ai/assist/stream` with a
  crafted SSE where `agent_intent` emits `equipmentRequirements` for two water
  baths (settings 55 / 70). Assert: two equipment tiles ghost on the LAWN (no rack,
  no slot, no well grid), the chat input stays usable, Accept commits them, and a
  reload keeps them. Run `cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium`.
- **Task 6.2 (real model, mandatory — the emission prompt changed)** — restart the
  backend, then re-run Brad's repro verbatim on
  `/runs/RUN-2026-09-19-run-vwr8`: attach the protocol, focus step 1 "Set two
  water baths to 55C and 70C", ask "add the water baths to the deck", answer the
  equipment clarification. Pass = the trace shows `agent_intent` carrying
  `equipmentRequirements` (NOT a prose refusal, NOT a fallback
  `compile_event_graph_draft`).
- **Task 6.3 (browser verification, SOP rule 12)** — drive the real deck in
  Chromium: two bath tiles on the lawn with 55 °C / 70 °C chips, correct
  silhouettes, settings editable in the focus pane, surviving reload; screenshot
  or DOM-assert (`getComputedStyle` / `data-*`), not just a curl.

### Phase 7 — attribution into the focused step's sub-graph

Depends on Phase 6 passing. The step-realization contract is shared with
`2026-09-19_121028-protocol-pipeline-consolidation.md` — coordinate before
touching the commit path.

- **Task 7.1 (read, no code)** — confirm the focused-step plumbing:
  `ProtocolPreviewBridge.tsx:58` already stamps `_protocolStepId` on ghosted
  events; `StepInvestigationPanel.tsx:71/281/303` commits via `onSaveRealization`
  → `POST /protocols/:id/steps/:stepId/subgraph`
  (`server/src/api/routes/protocol-steps.ts`).
- **Task 7.2 (RED → GREEN)** — ghosted equipment requirements + their
  temperature events must inherit `_protocolStepId = focusedStepId`, so Accept
  writes them into step 1's `subGraphRef` rather than the loose deck. Extend
  `StepInvestigationPanel.test.tsx` (accept test) to assert the equipment
  placement and the set-temperature events land in the step commit payload.
- **Task 7.3** — server-side verification: after the commit,
  `GET /api/protocols/:id/steps/:stepId/graph` includes both water-bath entities
  and the temperature events. Extend `server/src/api/routes/protocol-steps.test.ts`.

### Phase 8 — the AI authors the equipment (D6, the actual goal)

Depends on Phase 1.5 (the capability/seat model) and Phase 2 (ghost rendering of
draft equipment). This is the phase that fulfils *"describe it and the AI builds
it"*; Phases 1-7 make it possible.

- **Task 8.1 (server, RED then GREEN)** — teach the creator to author the whole
  record set instead of a bare `EQP-`. Today
  `createEquipment()` (`server/src/api/handlers/VendorExaHandlers.ts:186`) writes
  `{name, manufacturer, model, notes}` with `status: 'active'`. Extend it (or add a
  service beside it, but ONE path) to write:
  `equipment-class` (`EQC-`, with `settingsDefinition`), `equipment-capability`
  (`ECP-`, with the verbs + `seat` + `accepts`), and `equipment` (`EQP-`, with
  `equipmentClassRef`, concrete `settings`) — all `status: 'draft'`, all carrying
  the vendor `product_url` + description in notes. Test: a description + an Exa hit
  yields the three linked records, ids matching the schema patterns
  (`^EQC-`, `^ECP-`, `^EQP-`), `status: 'draft'`, and the URL preserved. No hit →
  no record (clarification instead).
- **Task 8.2 (emission, RED then GREEN)** — extend the `equipmentRequirements`
  item with the authoring shape `{ described_as, manufacturer?, model?,
  catalog_number?, capabilities[], seat, settings_definition[], evidence[] }`, add
  it to `AgentResult` (`server/src/ai/types.ts`) and the prompt bullet
  (`FORCED_DRAFT_TOOL_INSTRUCTION`), and assert in
  `submitSuggestionTool.test.ts` that (a) the schema carries it, (b) a manufacturer
  with no evidence is rejected or downgraded to a clarification, (c) capabilities
  carry an attribution to `user-description` vs `vendor-evidence`.
- **Task 8.3 (client, RED then GREEN)** — `draftPreview` builds the authored
  equipment into `previewEquipments` (Phase 3's bucket) carrying the draft class +
  capability refs, plus a `previewPlacements` lawn ghost; the deck tile shows the
  draft state (it is proposed, not a fact).
- **Task 8.4 (accept path, RED then GREEN)** — Accept promotes `draft → active` and
  writes the records through the store, mirroring how `ontologyBindings` draft-only
  entries materialize on human accept — the ghost becomes a real bench tile whose
  capability is live for acceptance checks (Phase 1.5's predicate now has data to
  read). Test both directions: reject leaves no records behind; accept leaves
  exactly the three, active, linked.
- **Task 8.5 (evidence)** — a capability the *user* asserted ("it has a heat
  setting and an RPM setting") that the vendor page does not evidence gets an
  evidence record / explicit attribution rather than being asserted as
  manufacturer fact (`schema/core/common.schema.yaml` says provenance lives in the
  event system + evidence records, not in FAIRCommon).
- **Task 8.6 (real model + browser — Brad's exact example)** — on the run deck,
  type: *"a shaker that takes two plates, has a heat setting and an RPM setting —
  it's a Thermo #123454321"*. Pass = the agent searches (Exa + local), proposes one
  equipment design (class + capability + instance) with the vendor URL attached,
  ghosts it on the lawn with its seat/capacity visible, and Accept writes the three
  draft→active records and leaves a placed, acceptance-checked instrument. Fail
  loudly if it invents a SKU or asserts capabilities the evidence does not support.
- **Gate** — `cd server && npx vitest run src/api/handlers/VendorExaHandlers.test.ts
  src/ai/submitSuggestionTool.test.ts src/schema/EquipmentCapabilitySeat.test.ts`;
  `cd app && npx vitest run src/event-editor/right-pane/ai/draftPreview.test.ts`;
  Playwright spec for the authored-equipment flow; then the real-model 8.6 run.

### Adjacent (separate plan, same seam — do not silently fold in)

The `deck_layout` intent is emitted by the server
(`AgentOrchestrator.ts:1664-1700`, `AgentResult.deckLayout`) but nothing on the
client applies it: `useChatThread` has no `onDeckLayout`, `AssistDraftResult` has
no `deckLayout`, `summarizeDraftResult` ignores it, and
`app/src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx` fails to
typecheck. "Switch the deck" via chat is a no-op today. Same
server-emits/client-ignores shape as this bug — worth its own small plan.

## 7. Acceptance gates

```
# after each phase
cd app && npx vitest run src/types/labware.instrumentKind.test.ts \
  src/types/equipmentRequirement.test.ts \
  src/types/labwareRequirement.test.ts \
  src/event-editor/deck/LawnSurface.equipment.test.tsx \
  src/event-editor/deck/AddToDeckDialog.test.tsx \
  src/event-editor/right-pane/ai/draftPreview.test.ts
cd server && npx vitest run src/ai/submitSuggestionTool.test.ts \
  src/schema/EquipmentFirstClass.test.ts \
  src/schema/EquipmentCapabilitySeat.test.ts
cd app && npx playwright test e2e/deck-equipment-via-agent.spec.ts --project=chromium

# typecheck: never "it passes" — diff the error set for the files you touched
npx tsc --noEmit -p app/tsconfig.json | grep -E "previewEquipments|equipment|LawnSurface|draftPreview|labware\."
```

Done = Phase 6.2 (real model, real prompt) + 6.3 (browser) both pass, Phase 0 is
reconciled, and no new typecheck errors in touched files.

## 8. Risks and open questions

- **R1 (high) — blast radius on the shared preview→ghost→commit path.**
  `EventEditorPreview` is consumed by the deck, focus, fix-it, history and the
  protocol bridge. Land Phase 3 + 3.4 as one unit so the required-field change
  never sits half-applied.
- **R2 — the guard (Task 3.2) changes behaviour for genuinely unknown labware:**
  "place a rack" stops silently becoming a 24-tube rack and starts asking/flagging.
  Intended correctness fix, but it will surface more clarifications. Call out to
  Brad.
- **R3 — prompt churn.** Phase 4.3 changes the draft instructions, which the local
  small models are sensitive to; re-run the deck-switch and draft smoke tests, not
  just the equipment one.
- **R4 — a minted `Equipment` vs a real `EQP-` record.** `AddToDeckDialog` mints
  on add; the agent path must decide whether a records-first match reuses the
  record (`recordId` set) and whether an Accept of a freeform/generic bath writes
  an `EQP-` record. Default: follow the dialog (reuse when a record matched, mint
  otherwise) — confirm (O1).
- **R5 — the acceptance model (D2 rev 2) is bigger than this feature.** It now
  spans: an `equipment-capability` schema extension, `ECP-` data authoring for six
  equipment shapes, a labware-definition field addition, a predicate + lint spec,
  and (Task 1.5.6, deferred) the seating placement. Tasks 1.5.1-1.5.5 + 1.5.7 are
  bounded; 1.5.6 touches deck geometry, drag/drop, the save format and undo — keep
  it out of the first landing unless Brad wants it.
- **R6 — retiring `acceptsLabware` is a data migration.** Three seed classes plus
  `EquipmentFocus`'s display (`:294`) and `LabwareFocus.equipment.test.tsx` fixtures
  read it. Migrate data + display + fixtures in one change (Task 1.5.2), or the deck
  shows a stale acceptance list.
- **R7 — `equipment-capability` is a strict schema with a `oneOf`.** It is
  `unevaluatedProperties: false` with `oneOf: [equipmentRef, equipmentClassRef]`, so
  the extension (Task 1.5.2) must keep exactly-one-reference valid and add the new
  constraint fields without breaking existing ECP- validation. Zero records exist
  today, which is the good news: no migration.
- **R8 — the details `oneOf` has a `$ref` mismatch.** `plate-event.schema.yaml:63-75`
  omits the tube details schemas entirely (the handoff calls it a known `$ref`
  namespace mismatch), which is how an unshaped `place_tube` payload got through.
  Task 1.5.8 must fix the wiring, not just add a file — and it collides with the
  other session's uncommitted tube work, so sequence it after theirs lands.
- **R9 — capability verbs are new vocabulary.** `heat` / `shake` / `rock` /
  `orbit` / `move_labware` are not verb-definition records yet. Authoring them is
  data work with a real risk of synonym drift (is `rock` a `shake`? is `heat` the
  same as the existing `incubate`?); keep one verb per physical capability and let
  the action map handle phrasing.
- **R10 — two equipment mint trees.** `AddToDeckDialog` mints a legacy `instrument`
  **labware tile** (`createLabware('instrument', …)` + `sourceRecordId`, with
  `instrumentKind` as the semantic carrier) while the first-class `Equipment` entity
  lives in `state.equipments` with `entityKind:'equipment'`. D6's authoring path must
  land on the first-class entity, and the dialog should converge onto it — two trees
  is how `acceptsLabware` ended up disagreeing with reality.
- **R11 — AI-authored records default to `status: 'active'`.** `createEquipment`
  writes active today, i.e. the AI could assert a machine exists in the lab. D6
  requires draft-first with promotion on Accept; any task that creates a record
  directly must be treated as a correctness bug in review.
- **R12 — provenance is deliberately not a schema field.** `schema/core/common.schema.yaml`
  states FAIRCommon excludes provenance ("use your event system + evidence
  records"), so the vendor URL in `notes` is a stopgap. Task 8.5 decides where a
  user-asserted capability is attributed; do not let "the AI said so" become a
  manufacturer fact.
- **R13 — the settings snapshot is a new event-shaped fact with execution
  consumers.** `execution-environment` / `robot-plan` and the readout context will
  want the same numbers; keep the snapshot shape aligned with the existing
  `incubate.temperature_C` precedent instead of inventing a parallel vocabulary.

## 9. Rulings (Brad, 2026-09-19) — the open questions, answered

Brad answered all twenty in-line on 2026-09-19. Each ruling is folded into the
decision named; this table is the index, not a second source of truth.

| # | Ruling (Brad's words where short) | Folded into |
|---|---|---|
| O1 | "I think we should use CURIEs in general." | §5.1 — a *generic* equipment class is CURIE-identified (`cl:water-bath`, `cl:heat-block`, `cl:orbital-shaker`); only a vendor/model-specific class earns an `EQC-` record (QS5, the clamshell) |
| O2 | "the instrument should have a setting but when a tube or a plate is transferred to the instrument the instrument setting should be collected in the event graph" | **D5** — instance holds the current setting, the event holds the historical snapshot; both, exactly as modeled |
| O3 | "Ephemeral until accept." | **D6.2** + Tasks 8.1/8.4 — nothing is written to the store until Accept |
| O4 | "Absorb them" | Phase 0/2 absorb the pre-existing `LabwareFocus.equipment` failures + the `entityKind`/`equipmentId` type errors (no separate cleanup task) |
| O5 | "data-sourced kind vocab." | **D1 option (b)** — kind vocabulary from registry/class data, TS only draws |
| O6 | "defer." | Task 1.5.6 deferred → Deferred items (§10) |
| O7 | "we've been using cl: (computable-lab) namespace for the most common things which are the generic entries. Float should be labware." | §5.1/Tasks — `cl:` throughout (not `cf:`); the float is a `labware-definition` |
| O8 | "Just make the QS5 and the labware records. This is why we have an Exa MCP service." | Task 1.5.7 — no longer blocked on Brad; ground the model/plate design through Exa, never invent a SKU |
| O9 | (earlier) Opentrons heater-shaker, swappable top | §5.1 — capability per `subModule`; adapter names also groundable via Exa |
| O10 | "Make it its own plan and finish the session with a deferred items list." | §5.2 → its own plan (`2026-09-19_<time>-platform-modules-in-deck-slots.md`) + §10 |
| O11 | "a configuration value is fine for now." | §5.1 — adapter = instance configuration value, not a tracked part |
| O12 | "both may exist." | Task 1.5.3 — keep the generic `EQC-HEATER-SHAKER`/`EQP-HEATER-SHAKER` alongside the Opentrons module |
| O13 | "Rock is distinct from shake, heat is distinct from incubate, orbit is a type of shaking. If we WANTED to describe it, I would say that orbital shaking and rocking are both types of mixing." + added verbs: **sonicate, microwave, stir, incubate, autoclave** | §5.1 verb set — see the taxonomy below |
| O14 | "In this case its four seats holding one plate but there COULD BE a 4-stack heater shaker." | §5.1 — `capacity: 4`, one plate per seat; stacking noted as a real variant → Deferred items |
| O15 | "Fine, move." | **D4** — `move_labware` |
| O16 | "automatic, and as I mentioned before, if the tube is moved into a heatblock, the event graph needs to obtain the heat block setting." | **D4/D5** — the drag/placement emits the relocation event automatically, and a tube moved *into* a heat block snapshots the block's setting too (not only labware moves) |

Still open (4) — my recommended defaults stand unless Brad rules otherwise:

- **O17** — settings-change event name/type: a new `set_equipment_settings` event
  that the existing `update_equipment_settings` reducer action also emits
  (recommended), vs promoting the action into the event enum.
- **O18** — the snapshot carries concrete settings + `method`, with class/capability
  as refs (recommended), vs embedding the class's `settingsDefinition` for later
  interpretation.
- **O19** — the agent reuses an existing class/capability when manufacturer + model
  match a record, and mints otherwise (recommended, mirrors the material path).
- **O20** — a user-asserted capability gets an attribution (`source:
  user-description`) on the capability, with an evidence record reserved for
  scientific claims (recommended middle ground), vs always an evidence record.

## 10. Deferred items (the session's explicit out-of-scope list)

Per Brad's O10 ruling — *"Make it its own plan and finish the session with a
deferred items list"* — this is the canonical list of what this plan does **not**
do. Anything here must not be started inside this plan's phases.

| # | Deferred | Why / where it goes |
|---|---|---|
| DEF-1 | **Seated placements** — `PlacementLocation {kind:'seated'}` + seat addressing, i.e. "this plate is IN the bath", "the tube in A3 of the block" (Task 1.5.6) | O6 "defer". Deck-model change (geometry, drag/drop, save format, undo). D5's settings snapshot is already shaped for the day it lands |
| DEF-2 | **Platform modules as slot-resident equipment (D3)** | O10 → its own plan: `2026-09-19_143846-platform-modules-in-deck-slots.md` |
| DEF-3 | **Stacked seats** — a 4-stack heater-shaker (O14: "there COULD BE a 4-stack heater shaker") | The seat/`capacity` model holds 4 independent seats; stacking is a distinct seat shape. Revisit once seating (DEF-1) exists |
| DEF-4 | **The equipment-design review UI** — a surface to review AI-proposed `EQC-`/`ECP-` records before promotion | D6 uses the deck ghost + Accept as the first review surface; a richer editor is its own plan |
| DEF-5 | **`deck_layout`'s missing client half** — `onDeckLayout` in `useChatThread`, `AssistDraftResult.deckLayout`, `summarizeDraftResult`; server emits it, nothing applies it | Adjacent section above; same "server emits / client ignores" shape |
| DEF-6 | **Adapters/rotors as tracked physical parts** (lots, instances) | O11: "a configuration value is fine for now" — revisit if the lab starts tracking them as inventory |
| DEF-7 | **`labware-compatibility-rule`** — retire it or make it the consumer of the new predicate | D2 leaves it: it has zero records and a documented no-op; decide once the lint spec exists |
| DEF-8 | **O17-O20 rulings** — settings-event name/type, snapshot shape, records-first class reuse, user-asserted-capability attribution | Recommended defaults recorded in §9 stand; confirm at Task 1.5.8 / 8.1 time rather than blocking |
| DEF-9 | **Converging the legacy `instrument`-labware mint path** onto the first-class `Equipment` entity (R10) | Phase 8 lands the AI path on the first-class entity; the AddToDeckDialog convergence can follow as cleanup if it does not fit Task 8.1 |
| DEF-10 | **Storage/instrument analysis-surface work** referencing the QS5 (see `.hermes/plans/2026-09-05_153000-storage-instrument-analysis-surface.md`) | Not equipment *capability* work; do not fold in |

## 11. Implementation status (2026-09-19, after Brad's "Finish the implementation!")

Answers folded in before implementing: **O17 = "We'd say 'Set the heater shaker to
70C'. So I guess set?"** (so the settings-change verb is `set`), **O18 = snapshot of
what it was set at while the item was on the equipment, never a live pointer**,
**O19 = records-first reuse with a duplicate warning**, **O20 = attribution**, plus
two rulings from the same message: **`CL:snake_case` is the namespace convention**
and **generic kinds become registry definitions** (not `EQC-` records).

### Done and verified (every line below ran green)

| Phase / task | What landed | Evidence |
|---|---|---|
| Phase 1 (Task 1.1-1.4) | `water_bath` kind: union + label + `inferInstrumentKind` branch (underscore-tolerant) + water-bath glyph | `app/src/types/labware.instrumentKind.test.ts` 2/2, `AddToDeckDialog.test.tsx` 12/12 |
| O1/O7 ruling | `Equipment.equipmentClassRef` is a real `Ref`: an `EQC-` record **or** a `CL:` CURIE. `createEquipmentFromRequirement` normalizes `equipment:<kind>` / bare kind / `CL:` → one CURIE and derives the entity id from it | `app/src/types/equipmentRequirement.test.ts` 6/6 |
| Task 1.5.1 | `EQP-` instances can carry `settings` (the `unevaluatedProperties` wall that made two baths at 55/70 °C unpublishable) + a `physicalFootprintMm` stamp slot | `server/src/schema/EquipmentFirstClass.test.ts` 7/7 |
| Task 1.5.2 | Acceptance lives on the capability: `constraints.seat` (platform/bay/slots/immerse), `addressing`, `capacity`, `accepts{mode,footprint,height_class,well_counts,tube_size_class,flask,design_family}`, `heat.from`; `acceptedLabware` deprecated; `equipmentClassRef` accepts a `CL:` CURIE. Machine limits (`rpmMax`) stay open beside the strict acceptance keys | `server/src/schema/EquipmentCapabilitySeat.test.ts` 11/11, `BackendFoundations.test.ts` 2/2 |
| Task 1.5.2b (retirement) | `acceptsLabware` **removed** from the class schema + the three seeds + the pane. The focus pane now renders "What it takes" from the equipment's capability records, with an explicit "Not recorded" state | `app/src/event-editor/focus/LabwareFocus.equipment.test.tsx` 9/9 (2 new: capability-driven text, and no-invented-acceptance) |
| Task 1.5.3 | 10 `VERB-` records (heat, incubate, shake, rock, stir, sonicate, microwave, autoclave, read, **set**), 8 `ECP-` records (water bath, heat block, orbital shaker, rocker, clamshell, Opentrons heater-shaker, qPCR, QuantStudio 5), `EQC-QUANTSTUDIO5`, and the lab's instances linked to their classes (`EQP-WATER-BATH`, `EQP-HEATER-SHAKER`, `EQP-QPCR`, `EQP-HEAT-BLOCK`, `EQP-PLATE-SHAKER`, `EQP-CLAMSHELL-HEATER-SHAKER`, `EQP-QUANTSTUDIO5`) | `server/src/schema/EquipmentCapabilityData.test.ts` 13/13 (validates every record + verb/class referential integrity) |
| **Generic kinds as registry definitions** (new ruling) | `schema/registry/equipment-kinds/*.yaml` (6 kinds) + `server/src/registry/EquipmentKindRegistry.ts` (zod + `RegistryLoader`, the same pattern as labware-definitions and instruments). This is where a `CL:` kind's `settingsDefinition` lives | `server/src/registry/EquipmentKindRegistry.test.ts` 5/5 (incl. every `CL:` kind a capability references must exist) |
| Task 1.5.4 (the predicate) | `EquipmentAcceptanceService`: three verdicts — `accepted` / `rejected` (naming the failed physical fact) / `unknown` (no capability data → flagged, never assumed). Built on a refactored `EquipmentCapabilityService.inventoryEquipmentCapabilities` (equipment + class records, CURIE classes included) | `server/src/capabilities/EquipmentAcceptanceService.test.ts` 12/12, `EquipmentCapabilityService.test.ts` 2/2 |
| Task 1.5.5 (facts) | `height_class` + `design_family` on `labware-definition.schema.yaml` (and the zod registry schema, which strips unknown keys) + declared on the 96/384 plate definitions; `labwarePhysicalFacts()` reads a vessel's facts from data, leaving a fact ABSENT when no data carries it | `server/src/capabilities/labwarePhysicalFacts.test.ts` 7/7 (incl. the chain: labware → facts → verdict) |
| Phase 2 | The deck renders equipment: committed + ghost equipment placements resolve from `state.equipments` / `previewEquipments` and draw `EquipmentTile` (never a well grid); drag clamps via `equipmentFootprintMm` (one source of tile geometry with the preview) | `app/src/event-editor/deck/LawnSurface.equipment.test.tsx` 4/4, `LawnSurface.footprint.test.tsx` |
| Phase 3 | `buildPreviewFromDraft` accepts `equipmentRequirements`, mints the Equipment, places it on the bench (never a slot, even under a locked run scope), and refuses to mint labware from an `equipment:` token (kills the silent `tubeset_24` collapse) | `app/src/event-editor/right-pane/ai/draftPreview.test.ts` 10/10 (5 new) |
| Phase 4 | `equipmentRequirements` on `submit_suggestion` **and** `agent_intent` with the rules in the description (not labware, never a slot, `equipment:<kind>`, records-first + duplicate warning, settings keyed by `settingsDefinition`, no seat field while the editor cannot render one); parser + `AgentResult` field; misfiled `equipment:` tokens are routed out of `labwareRequirements`; a forced-draft instruction bullet | `server/src/ai/submitSuggestionTool.equipment.test.ts` 9/9, `AgentOrchestrator.equipmentInstruction.test.ts` 2/2 |
| Phase 6 (server half) | End-to-end with a scripted tool call for the exact failure prompt ("add the water baths to the deck") → `equipmentRequirements` with 55 °C/70 °C | `server/src/ai/AgentOrchestrator.equipmentE2E.test.ts` 1/1 |
| Phase 5 | `AssistDraftResult.equipmentRequirements` + `AiTabPanel` passes them into the preview and stores them on the preview metadata | typechecked; covered indirectly by the Phase 3 tests |

Also fixed along the way (O4 "absorb them"): the `LabwareFocus.equipment` failures are
gone — they were `EventEditorPlacement` missing `entityKind`/`equipmentId`, and
`EventEditorPreview.previewEquipments` being required (now optional, which alone
cleared 7 type errors in files this plan does not own).

### Still open

- **Task 1.5.8 / 1.5.6 — the settings snapshot and the relocation events.** The `set`
  verb and the `SET` semantics are now recorded as data (VERB-SET + the seat/
  acceptance model the snapshot rides on), and D5's model is unchanged: the
  **placement records what the equipment was set at while the item was on it**, as a
  snapshot, with a settings *change* being its own event. The event schemas
  (`plate-event*.yaml`) and `app/src/types/events.ts` are still untouched — that is
  the remaining work, and it overlaps the other session's in-flight tube work.
- **Seating** (DEF-1) — deliberate: `move_labware` + `{kind:'seated'}` placement was
  deferred by O6, so equipment emissions remain freestanding bench placements and the
  contract deliberately advertises no `seatOn`/`placedIn`.
- **Phase 7** (attribution into the focused step's sub-graph) and **Phase 8** (the AI
  authoring `EQC-`/`ECP-`/`EQP-` from a description + Exa evidence). Note
  `/equipment/exa-search` + `/equipment/from-exa` handlers already exist, so Phase 8
  is an extension of a live path rather than new plumbing; `createFromExa` writes a
  bare `EQP-` with no class/capability — that is what Phase 8 changes.
- **Client display of the fleet**: the pane reads capability records with the existing
  records API. A dedicated endpoint (or a registry listing for `CL:` kinds so the
  client can show settings keys for a generic kind) is DEF-worthy, not blocking.

### Verification gaps (be honest about these)

- The **server typecheck was not run** in this session (the command was gated); the
  server tests run through esbuild, which does not type-check. Run
  `npm run typecheck -w server` before landing.
- `server/src/schema/EventGraphEquipmentSchema.test.ts` (untracked, the other
  session's) is RED: it expects an `Equipment` `$def` in `schema/studies/event-graph.schema.yaml`
  and `kind:equipment` labwares entries. Not this plan's change; do not "fix" it by
  deleting the expectations.
- `app/src/event-editor/deck/LabwareGlyph.test.tsx` "square-well plate renders grid of
  rects" is RED — untouched by this work (another session's labware-glyph edits).
- Brad's cleanup: a stray `server/server/` directory (my path typo) is deleted; the
  real test lives at `server/src/schema/EquipmentCapabilityData.test.ts`.
