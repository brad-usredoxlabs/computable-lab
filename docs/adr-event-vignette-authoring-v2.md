# ADR: Event Vignette Authoring V2

Status: Proposed
Date: 2026-03-21

## Context

The current event authoring model mixes three concerns in one compact control strip:

- semantic lab actions a biologist thinks in
- primitive liquid-handling operations
- execution-detail inputs that belong in an advanced layer

This shows up in the current editor as:

- a single type picker that exposes both primitives and macros
- mixed scopes in one flat menu (`transfer` is well-oriented, `incubate` is effectively plate-oriented)
- compact forms that now include low-signal or oddly placed fields such as transfer `Aliquot` / `Amt` and add-material `Count` / `Note`
- existing macro support that is useful, but only for a few named programs and not yet the dominant authoring model

The repository already has a partial foundation for vignette-style authoring:

- `macro_program` events in the editor
- macro compilation into primitive plate events for replay and validation
- transfer and add-material primitives that are already consumed by downstream state replay and execution planning

Relevant current implementation points:

- event taxonomy: `semantic-eln/src/types/events.ts`
- macro taxonomy: `semantic-eln/src/types/macroProgram.ts`
- macro expansion: `semantic-eln/src/lib/macroPrograms.ts`
- event ribbon authoring UI: `semantic-eln/src/components/events/ribbon/EventRibbon.tsx`
- well-state replay using expanded macros: `semantic-eln/src/lib/eventGraph.ts`

We want a model that stays intuitive for biologists, remains compact in the editor, supports saved reusable programs, preserves platform-agnostic event graphs, and remains legible to AI authoring tools and downstream robot compilers.

## Decision

Adopt a vignette-first authoring model.

The editor should present a small set of semantic actions by default, while compiling or expanding them into primitive execution steps only when needed for replay, validation, or robot planning.

Core decision points:

1. Keep a single "Create Event" entry point, but make the action chooser grouped and scope-aware instead of flat.
2. Treat low-level liquid-handling primitives as advanced authoring tools, not default user-facing choices.
3. Generalize the current macro path into a broader vignette/program path rather than adding another parallel mechanism.
4. Separate semantic parameters from execution hints so the event graph stays platform-agnostic.

## 1. Menu Taxonomy

### Default action chooser

The default menu should expose only the common semantic actions:

- `Add Material`
- `Transfer`
- `Serial Dilution`
- `Incubate`
- `Read`
- `Wash`
- `Harvest`

The menu should be grouped into:

- `Common`
- `Plate Actions`
- `Saved Programs`
- `Advanced`

Each action should show a scope badge:

- `Well`
- `Plate`
- `Program`

### Actions removed from default top level

The following should not appear in the default top-level menu:

- `Mix`
- `Aspirate`
- `Dispense`
- `Multi-Dispense` as a standalone action
- generic `Macro Program`

These remain available under `Advanced` or inside a vignette editor.

### Specific simplifications

- `Transfer` becomes the default top-level action for liquid movement.
- `Multi-Dispense` becomes a transfer mode inside `Transfer`.
- `Mix` becomes an optional substep inside transfer or add-material vignettes, plus an advanced standalone tool.
- `Incubate` and `Read` remain top-level, but default to `entire labware` scope with an optional override for selected wells.

### UX rationale

This avoids a second separate "plate-level menu" while still making scope explicit. Biologists keep one menu, but the menu no longer asks them to think in terms of primitive operations unless they opt into expert authoring.

## 2. Event and Template Schema Shape

### Authoring model

Introduce a first-class `operation-template` record and expand the existing `macro_program` concept into a generic vignette/program carrier.

Short-term compatibility decision:

- continue to store authored vignette events as `event_type: "macro_program"` to minimize disruption
- broaden `MacroProgramKind` so it becomes the storage format for all reusable programs, not only the current three macros

Longer-term naming option:

- rename `macro_program` to `operation_program` in a future schema revision
- keep `macro_program` as a backward-compatible alias during migration

### New record

Proposed new record:

- `operation-template`

Purpose:

- stores named, reusable vignettes/programs selectable from the event menu
- defines default semantic params plus optional execution hints
- can be lab-scoped and tool-scoped

Proposed shape:

```yaml
kind: operation-template
id: OPT-transfer-media-with-mix
name: Transfer Media With Mix
category: transfer
scope: well
description: Transfer liquid with default post-dispense mix.
semantic_defaults:
  transfer_mode: one_to_one
  volume:
    unit: uL
  post_mix:
    enabled: true
    cycles: 3
execution_defaults:
  tip_policy: new_tip_each_transfer
  aspirate_height_mm: 1.5
  dispense_height_mm: 2.0
  touch_tip_after_dispense: false
  blowout: false
compatibility:
  tool_types: [single_channel_pipette, multichannel_pipette, integra_assist]
  platforms: [manual, opentrons_ot2, opentrons_flex, integra_assist]
visibility: team
```

### Event shape

Continue to allow primitive events:

- `add_material`
- `transfer`
- `mix`
- `wash`
- `incubate`
- `read`
- `harvest`
- `other`

Add generalized authored-vignette payload under the existing macro carrier:

```yaml
event_type: macro_program
details:
  program:
    kind: transfer_vignette
    template_ref:
      kind: record
      id: OPT-transfer-media-with-mix
      type: operation-template
    params:
      sourceLabwareId: LWI-PLATE1
      targetLabwareId: LWI-PLATE2
      sourceWells: [A1, A2]
      targetWells: [B1, B2]
      volume_uL: 20
    execution_hints:
      post_mix:
        enabled: true
        cycles: 5
        volume_uL: 15
      aspirate_height_mm: 1.0
      dispense_height_mm: 2.0
```

### Program kinds

Recommended initial generalized kinds:

- `transfer_vignette`
- `serial_dilution`
- `add_material_vignette`
- `plate_incubation`
- `read_vignette`
- `wash_vignette`
- `custom_sequence`

### Parameter layering

Every vignette/program should separate:

- `params`: semantic inputs
- `execution_hints`: optional execution behavior

Semantic inputs are what happened:

- source/target wells
- material or vendor product
- volume
- incubation duration
- readout type
- dilution factor

Execution hints are how it should be executed if a platform can honor them:

- tip policy
- post-dispense mix
- touch tip
- blowout
- aspirate/dispense heights
- air gap
- delays
- spacing mode

### Compiler rule

Replay, validation, and robot planning should operate on an expanded primitive view.

That means:

- authoring stores vignette events
- editor replay compiles vignette events to primitive events
- validators validate both the vignette envelope and its primitive expansion
- robot compilers consume the expanded primitive form plus preserved hints

This is already structurally consistent with the current `macro_program` expansion path.

## 3. Compact Editor and Advanced Drawer Model

### Basic authoring surface

The ribbon should stay compact by showing only the minimum semantic inputs for the chosen action.

`Add Material` basic fields:

- target wells or target scope
- material picker
- volume

`Transfer` basic fields:

- source wells
- target wells
- volume
- transfer mode

`Serial Dilution` basic fields:

- path
- transfer volume or final volume
- dilution factor

`Incubate` basic fields:

- scope selector: `selected wells` or `entire labware`
- duration
- temperature

`Read` basic fields:

- scope selector
- read type
- wavelength or assay preset

### Advanced drawer

Every action gets an expandable `Details` drawer with grouped controls.

Drawer groups:

- `Material Provenance`
- `Liquid Handling`
- `Tip Handling`
- `Post-Step Behavior`
- `Timing`
- `Metadata`

Examples:

`Transfer` advanced:

- source context / aliquot lineage
- extra aspirated volume
- post-dispense mix on/off
- mix cycles and volume
- aspirate height
- dispense height
- touch tip
- blowout
- discard to waste
- tip policy

`Add Material` advanced:

- concentration override
- lot / vendor / catalog / provenance
- dispense height
- post-addition mix
- note

`Incubate` advanced:

- shaking
- gas / hypoxia conditions
- humidity
- lid / seal requirements
- notes

### Fields to remove from the compact default surface

Move out of the default row:

- transfer `Aliquot`
- transfer `Amt`
- add-material `Count`
- add-material `Note`

These are valid fields, but they are not primary authoring inputs for most users.

### Vignette editor modal

Add a dedicated vignette editor modal for creating and saving reusable programs.

Required capabilities:

- name and categorize a program
- choose a base action type
- configure default substeps
- toggle optional substeps on/off
- define default execution hints
- save as a lab/team template

Example transfer vignette substeps:

- pickup tips
- aspirate
- optional pre-wet
- optional air gap
- dispense
- optional touch tip
- optional blowout
- optional post-dispense mix
- eject tips

The user should not see these by default on every event. They should see them while creating or editing a reusable program.

## 4. Migration Path

### Phase 0: UI cleanup without schema change

Ship immediate simplifications using the existing event model:

- group the action chooser
- hide `mix`, `aspirate`, `dispense`, and raw `macro_program` from the default menu
- merge `multi_dispense` into transfer advanced options
- add scope badges to action cards
- move low-signal fields into an advanced drawer

This phase changes authoring UX only and is low risk.

### Phase 1: Generalize current macro path

Extend:

- `MacroProgramKind`
- `macroPrograms.ts`
- event ribbon program authoring

to support the new vignette categories while still using `event_type: "macro_program"` under the hood.

This phase should not break:

- event replay
- tip tracking
- event validation
- event focus/highlighting

Required updates:

- `semantic-eln/src/types/macroProgram.ts`
- `semantic-eln/src/lib/macroPrograms.ts`
- `semantic-eln/src/lib/eventGraph.ts`
- `semantic-eln/src/lib/eventValidation.ts`
- `semantic-eln/src/lib/eventFocus.ts`

### Phase 2: Add `operation-template` records

Introduce CRUD and picker support for saved programs.

Requirements:

- backend schema and API routes
- frontend library picker in the event menu
- versioned templates
- stable template refs in event details

AI and user flows should both query the same template library.

### Phase 3: Planner and compiler integration

Robot planners and emitters should resolve:

- vignette semantic params
- tool compatibility
- execution hints

into platform-specific execution plans.

Rules:

- unsupported hints should degrade gracefully with warnings
- semantic intent must remain executable even when hints are ignored
- emitted robot plans should record which hints were honored vs dropped

### Phase 4: Optional schema rename

If desired after adoption:

- introduce `operation_program` as the preferred schema term
- retain `macro_program` read support for backward compatibility
- provide migration tooling to rewrite legacy event graphs

This phase is optional and should not happen until the authoring model has stabilized.

## Consequences

### Positive

- The editor becomes simpler for biologists.
- Saved programs become the normal path, not an edge feature.
- AI and human authoring can use the same action catalog.
- Downstream robot compilers get cleaner semantic inputs plus explicit execution hints.
- Platform-specific behavior moves out of the visible semantic layer.

### Tradeoffs

- There will be a temporary mismatch between user language ("program", "vignette", "action") and stored wire format (`macro_program`).
- Validation and replay will need to support a broader expansion catalog.
- Template management adds a new record type and lifecycle.

### Architectural guardrails

- Do not let the event graph devolve into robot micro-ops.
- Do not encode platform-specific defaults directly into semantic events.
- Do not force users to choose between separate well-level and plate-level editors.
- Do not expose every implementation detail in the default compact strip.

## AI and Execution Implications

### AI assistant

The AI should author against the same vignette catalog as the UI.

It should:

- prefer top-level semantic actions
- prefer saved templates when available
- emit execution hints only when the user asks or when a template requires them
- preview the primitive expansion for transparency

It should avoid defaulting to raw primitive event authoring except in expert or repair workflows.

### Robot implementations

Compilers for Opentrons, Integra, and manual execution should consume:

- semantic params
- optional execution hints
- template defaults

and then produce platform-specific plans.

This lets the event graph stay stable while robot implementations evolve independently.

## Rollout Recommendation

Recommended order:

1. Phase 0 UI cleanup
2. Phase 1 generalized vignette expansion
3. Phase 2 template library
4. Phase 3 planner/compiler support
5. optional Phase 4 rename

This gives immediate UX improvement without forcing a schema migration before the model is proven.
