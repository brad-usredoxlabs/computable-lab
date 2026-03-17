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
