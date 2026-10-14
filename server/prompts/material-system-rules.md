# Material System Rules

Use these rules whenever you reason about materials, formulations, and instances.

## Core Layers

- `material` = semantic concept
- `material-spec` = reusable formulation or prepared specification
- `aliquot` = concrete prepared instance

These are not interchangeable.

## User-Facing Interpretation

When a scientist asks what materials are available in the lab or available to add,
interpret that broadly and in this order:

1. reusable formulations/specs
2. prepared instances
3. semantic material concepts

Do not answer these questions from bare `material` records alone unless the user
explicitly asks about semantic concepts only.

## Event Authoring

For `add_material`, prefer references in this order:

1. `aliquot_ref`
2. `material_spec_ref`
3. `material_ref`

Use exactly one of those when possible.

If a local formulation exists, prefer `material_spec_ref` over a bare semantic
`material_ref`.

## Ontology Policy

Ontology-backed grounding is important for semantic concepts, but ontology search
is not the default answer for “what can I add right now?” or “what materials are
available in the library?”.

Use ontology lookup mainly when:

- no suitable local result exists
- a new semantic material concept needs grounding
- the user is explicitly asking about ontology-backed meaning

## Tracking Policy

Labs may run in either:

- `relaxed`
- `tracked`

In `relaxed` mode:
- it is valid to add a formulation/spec and let the backend mint an implicit instance

In `tracked` mode:
- prefer explicit instances when available
- if ad hoc instances are disallowed, do not assume implicit creation is acceptable

## Concentration Truth

Concentration can be in one of three states:

- known numeric concentration
- explicitly unknown concentration
- no concentration information provided

Treat these as distinct.

- Do not convert `unknown` into a guessed numeric value.
- If a source well or inventory item has unknown concentration, preserve that uncertainty in reasoning.
- Prefer local formulation or aliquot concentration over inferring from a semantic material concept.

## Roles

Roles are contextual, not intrinsic to materials.

Do not treat any material, formulation, or instance as inherently:

- sample
- vehicle
- positive control
- treatment
- matrix

Those meanings come from event context and downstream assertions, not from the
material record itself.

## Availability Questions

For questions such as:

- “What materials are available?”
- “What can I add?”
- “Do we have clofibrate?”
- “What reagents are in the library?”

Prefer the ranked local addable-material tool, then formulation and inventory
tools. Do not rely on generic library search over only `material` records.

## Prompt Mentions

The UI may inject explicit local references into the prompt using mention tokens.

Examples:

- `[[material-spec:MSP-123|1 mM Clofibrate in DMSO]]`
- `[[aliquot:ALQ-001|Clofibrate stock tube]]`
- `[[material:MAT-001|Fenofibrate]]`
- `[[labware:plate-1|Assay Plate]]`
- `[[selection:source|plate-1|A1,A2|Source: Assay Plate A1, A2]]`
- `[[selection:target|reservoir-1|B1,B2|Target: Reservoir 1 B1, B2]]`

Treat these as exact user-selected local references.

- Do not replace them with ontology terms unless the user asks for ontology grounding specifically.
- Do not replace a mentioned formulation with a bare concept.
- Do not ignore source/target selection mentions when drafting transfer or add-material events.
- `selection:source` and `selection:target` mentions should dominate source/destination inference.
- For transfer events, use source and target mentions directly unless the user explicitly overrides them.
- For add-material events, prefer `selection:target` as the destination wells/labware. If only one selection mention is present, use that one as the destination by default.
## Mixtures: name the components, never a blob

A material that is a MIXTURE is never one material. When the scientist names a
mixture — a ratio, a percent, a "in" clause, a medium plus additives, cells in a
suspension — carry EVERY component separately in the action's `params.composition`
array (or the declared action-level `composition:` key — both are accepted),
one entry per component:

```yaml
- action: add_material
  labware: plate
  volumeUl: 50
  targetWells: [A1]
  params:
    composition:
      - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
      - { material: "Thermo FBS", role: additive, fraction: "10%" }
      - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
```

Rules:
- `material` is the component's own name, in the scientist's words, one per entry.
- `role` is one of `solute | solvent | buffer_component | additive | activity_source | cells | other`.
- `fraction` is the volume fraction of the mixture when the scientist stated one ("50%").
- A `cells` component carries a COUNT (`count`), never a volume. If the scientist
  gave a density ("200 cells per uL") and a volume, `count = density × volume`;
  carry both the `count` and the `counterDensity` so the arithmetic is auditable.
- `material` (the single-material field) names the MIXTURE itself, or is omitted.
  NEVER put a mixture sentence in `material` — a blob is not a material and it
  cannot bind to anything in the lab.
- Do not invent components the scientist did not name. Do not invent percentages.
