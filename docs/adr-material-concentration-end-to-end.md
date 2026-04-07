# ADR: End-to-End Material Concentration Tracking

Status: Proposed
Date: 2026-03-21

## Context

The current material stack has partial support for concentration:

- `material-spec.formulation.concentration` and `solvent_ref` exist.
- `material-instance.concentration` exists.
- `plate-event.add-material.concentration` exists.
- Well state can display a copied concentration value when present.

This is not sufficient for end-to-end scientific concentration tracking.

Current gaps:

1. `material` lacks optional intrinsic chemistry metadata such as molecular weight.
2. Concentration is modeled as a generic `{ value, unit }` amount rather than a typed concentration with clear basis.
3. `material-spec` is good for single-solute stocks but too weak for structured multi-component formulations such as RPMI 1640.
4. `vendor-product` stores formulation as free text, which is useful for search but not for computation.
5. Well state is still largely an event ledger with copied material labels rather than a computed component ledger.
6. AI and MCP tools can search materials and formulations, but they cannot yet reason over structured composition or computed well concentrations.
7. The UI exposes concentration mostly as optional metadata or free entry rather than prefilled scientific state.

The product goal is:

- scientifically honest concentration tracking from schema to well state
- ergonomic defaults for routine biology workflows
- structured enrichment for vendor formulations when available
- explicit uncertainty when concentration truth is unknown or only partially known

## Decision

We will treat concentration tracking as a layered concern with distinct truth domains:

1. `material` stores optional intrinsic physical properties.
2. `material-spec` stores declared reusable formulation truth.
3. `vendor-product` stores vendor-declared formulation truth with provenance.
4. `material-instance` and `aliquot` store batch-level actual or measured truth.
5. well state stores computed effective component concentrations after experiment events.

### 1. Material-Level Intrinsic Properties

`material` remains the semantic concept, but may optionally carry intrinsic physical properties needed for conversion.

Initial addition:

- `molecular_weight` in `g/mol`

This field is optional and should be used only for relevant chemical-like materials.

Rule:

- If molecular weight is absent, molar-to-mass conversions must not be inferred.

### 2. Typed Concentration Model

We will introduce a dedicated concentration datatype rather than continuing to overload the generic amount datatype.

The concentration datatype will include:

- `value`
- `unit`
- `basis`

Allowed bases:

- `molar`
- `mass_per_volume`
- `activity_per_volume`
- `count_per_volume`
- `volume_fraction`
- `mass_fraction`

Initial supported units:

- `M`, `mM`, `uM`, `nM`, `pM`, `fM`
- `g/L`, `mg/mL`, `ug/mL`, `ng/mL`
- `U/mL`, `U/uL`
- `cells/mL`, `cells/uL`
- `% v/v`, `% w/v`

The generic amount datatype remains for non-concentration quantities such as transfer volume or recipe ingredient quantity.

### 3. Material Spec as Declared Reusable Formulation

`material-spec` remains the primary reusable addable formulation.

For simple stocks, it should continue to support:

- represented `material_ref`
- target `concentration`
- `solvent_ref`

For richer formulations, it will gain optional structured composition:

- `composition[]`

Each composition entry should include:

- `component_ref`
- `role`
- `concentration`
- optional `source`

Allowed composition roles:

- `solute`
- `solvent`
- `buffer_component`
- `additive`
- `activity_source`
- `cells`
- `other`

This allows both:

- simple authoring for `1 mM clofibrate in DMSO`
- structured composition for media and buffers

### 4. Vendor Product as Vendor-Declared Truth

`vendor-product` will keep the current free-text `formulation` field for search and fallback UX.

It will also gain optional structured fields:

- `declared_composition[]`
- `source_documents[]`
- `extraction_provenance`

This enables imported products such as RPMI 1640 to carry structured concentrations when extracted from trusted sources.

Rule:

- Free-text vendor formulation is searchable metadata.
- Structured vendor composition is computational metadata.
- OCR- or PDF-derived composition must retain provenance and confidence markers until curated.

### 5. Material Instance and Aliquot as Batch Truth

`material-instance` and `aliquot` remain the concrete batch layer.

They may inherit composition from:

- a source `material-spec`
- a source `vendor-product`
- an explicit derivation workflow

They may also carry batch-specific overrides:

- `measured_concentration`
- `measured_composition[]`
- `measurement_method`
- `measurement_date`

Rule:

- `material-spec` expresses intended reusable truth.
- `material-instance` expresses actual prepared or measured truth.

### 6. Computed Well State as Component Ledger

Well state will be refactored from a label-based event view into a component ledger.

Each well will track:

- total volume
- canonical component entries
- amount in canonical computational units
- computed effective display concentration per component
- provenance back to source spec, instance, or event

Canonical computational units:

- volume in `L`
- molar amount in `mol`
- mass in `g`
- activity in `U`
- count in native counts

Display concentrations are derived from those canonical quantities and current well volume.

### 7. Event Semantics

Event handling will follow these rules:

- `add_material`: derive delivered component quantities from the referenced spec, instance, or vendor product plus added volume
- `transfer`: move component quantities proportionally
- `mix`: preserve quantities, update homogenization assumptions only
- `wash`: preserve explicitly retained components only
- `dilution`: recompute all effective concentrations from new total volume
- `harvest`: preserve provenance and expose post-harvest state honestly

Rule:

- unknown input concentration must remain unknown
- conversions must not be invented when required physical properties are absent

### 8. UI Behavior

The common biologist workflow should remain simple.

Default path:

1. Select a saved stock or formulation.
2. Concentration autofills from the referenced `material-spec` or instance.
3. User mainly supplies destination and amount.

Advanced fields should remain available but not mandatory:

- override concentration
- inspect structured composition
- inspect measurement provenance
- inspect molecular weight and conversions

Tooltip and well context panels should show:

- total well volume
- effective concentration of each component
- solvent fraction where scientifically important
- counts or activity units when relevant

The UI should prefer explicit uncertainty over false precision.

### 9. AI and MCP Responsibilities

AI should not infer composition from vague text when structured concentration truth is absent.

MCP and AI planning layers will gain read tools for:

- material intrinsic properties
- material-spec composition
- vendor-product composition
- well-state snapshot by well or selection
- document-derived composition with provenance

Vendor document extraction will be a separate enrichment workflow:

- fetch source documents
- extract text
- OCR tables if needed
- draft structured composition
- require human review before canonicalization

## Consequences

Positive:

- Saved formulations become genuinely reusable scientific objects.
- Add Material can prefill concentration from formulation truth instead of free entry.
- Transfers and dilutions produce computed well concentrations rather than event-only history.
- Multi-component media and vendor formulations become representable without losing provenance.
- AI planning can reason over actual concentrations and source wells.

Tradeoffs:

- Additional schema complexity for concentration and composition.
- Need to maintain unit conversion rules and validation.
- Need to preserve uncertainty rather than always providing a numeric answer.
- Vendor formulation enrichment requires curation, OCR, and provenance tooling.

## Rejected Alternatives

### Keep concentration as free text in the UI

Rejected because it prevents scientific propagation through transfer and dilution and makes AI planning brittle.

### Store all concentration semantics only on `material`

Rejected because concentration is usually formulation- or batch-dependent, not an intrinsic property of the semantic concept.

### Make structured composition mandatory for all vendor products and formulations

Rejected because this would overburden routine workflows and slow library growth. Structured composition should be optional but first-class.

## Rollout

### Phase 1: Single-Analyte Truth

- add `molecular_weight` to `material`
- add typed concentration schema
- prefill concentration from `material-spec` in Add Material
- preserve concentration through simple add/transfer/dilution for single-component stocks

### Phase 2: Scientific Well State

- move well state to component-ledger computation
- show computed concentrations in tooltip and context panels
- support mass-, molar-, activity-, and count-based display units

### Phase 3: Vendor and Multi-Component Enrichment

- add structured vendor composition
- add document provenance and OCR-assisted extraction
- support media, buffers, and richer composition-aware AI planning

## Decision Rule for Product Simplicity

The system must never require the end-user to manually perform concentration conversions for common workflows.

The system may ask for scientific metadata only when:

1. it is required for a claimed conversion
2. it is not already available from material, formulation, or vendor records
3. the UI can explain clearly why it matters
