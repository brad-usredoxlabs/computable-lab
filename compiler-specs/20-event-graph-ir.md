# 20 — Event Graph IR

Status: Authoritative
Date: 2026-04-16
Depends on: 10-charter

---

## 1. Purpose

The event graph is the semantic backbone of the biology compiler. Everything downstream — contexts, assertions, protocols, runs, promotions — is either directly on the graph or derived from it. This specification names the node kinds, edge kinds, event families, and the Phase 1 verb catalog, plus the semantics of the two verbs that carry the most load (transfer and aliquot).

Nothing outside this spec may introduce a new event-type or edge-kind without coming back here first. Drift in the IR silently breaks everything that reads it.

## 2. What the event graph is

A directed, append-only graph in which:

- **Event nodes** represent things that happened (or are planned to happen) in the lab: a transfer, an incubate, a read.
- **Resource nodes** represent participants: material-instances, aliquots, labware-instances, instruments, operators, data artifacts.
- **Edges** connect events to their inputs, outputs, locations, and actualizations.

Node and edge types are closed sets defined in this document. The graph lives in YAML records; there is no database representation.

### 2.1 Node kinds

| Kind | Source of identity |
|---|---|
| `event` | `EVT-*` id; embedded in `event-graph` records |
| `material-instance` | `MI-*` |
| `aliquot` | `ALQ-*` |
| `labware-instance` | `LWI-*` |
| `instrument` | `INS-*` |
| `operator` | `PRS-*` (person) |
| `data-artifact` | `DAT-*` (instrument output file, image, measurement row) |
| `context` | computed, not stored; referenced by `CTX-*` when materialized via promotion (see 30) |

Material-specs, formulations, labware-definitions, vendor-products, and concepts are **not** graph nodes. They are referenced by graph nodes but live in the noun hierarchy. The graph is about what happened to specific instances, not about types.

### 2.2 Edge kinds

Closed set, v1:

| Edge | From → To | Meaning |
|---|---|---|
| `input_to` | resource → event | resource participates as input |
| `output_of` | resource → event | resource is produced or altered by the event |
| `located_in` | resource → labware-instance | physical containment at event time |
| `performed_by` | event → operator | who executed the event |
| `performed_on` | event → instrument | which instrument (if any) |
| `derived_from` | resource → resource | lineage of material-instances / aliquots |
| `measured_by` | event → data-artifact | what the event produced as data |
| `actualizes` | event → event | executed-event realizes planned-event (see 50) |
| `preceded_by` | event → event | explicit ordering when wallclock is ambiguous |

All other relationships belong in records, not on the graph.

### 2.3 Append-only, with retraction

Edges and events are never mutated. Correction is modeled as retraction (a `status: retracted` flag on the record; see 40 §7) plus a new event. This preserves full history and keeps context re-computation deterministic.

## 3. The five event families

Every event type belongs to exactly one family. Family membership determines compiler semantics (what contexts are affected, what preconditions are checked, what provenance edges are required).

### 3.1 Material movement

Material leaves one container and enters another (or leaves a source and enters a newly created container). Compiler semantics: subtract from source context, add to destination context, update lineage.

Phase 1 verbs: `transfer`, `add_material`, `aliquot`, `harvest`, `sample`.

### 3.2 State transformation in place

Container contents are modified but no material crosses containers. Compiler semantics: mutate subject context in place; may trigger model-derived field recomputation.

Phase 1 verbs: `mix`, `incubate`, `centrifuge`, `wash`, `heat`, `cool`.

### 3.3 Lifecycle

Resources come into being or change status. Compiler semantics: create/retire resource nodes; establish or close containment.

Phase 1 verbs: `create_container`, `seal`, `unseal`, `assign_source`, `assign_destination`, `discard`.

### 3.4 Measurement

A reading or image is produced from a subject. Compiler semantics: create `data-artifact` nodes; do not mutate contents; observed fields on contexts update via measurement ingestion (see 30 §11).

Phase 1 verbs: `read`, `measure`, `image`, `sample_operation`.

### 3.5 Composition

A new formulation or material-spec is declared (not by promotion but by explicit event). Compiler semantics: emit candidate records for review; lineage back to input contexts.

Phase 1 verbs: `derive_formulation`, `prepare`.

Composition events are rare in most workflows. Most new material identities arise through promotion of a context (see 30 §12), which is a separate mechanism. Composition events exist for cases where a user wants to mark "this is now a thing" mid-protocol without going through promotion.

## 4. Phase 1 verb catalog

Phase 1 must support the ROS positive control workflow end-to-end. That workflow requires: `create_container`, `add_material`, `incubate`, `mix` (optional), `aliquot` (optional), `measure`/`read`, and `transfer` (for setup). The catalog below is the v1 commitment; other verbs listed in §3 are reserved and will be specified later.

For each verb, the shape is declared in `schema/workflow/events/<family>.<verb>.schema.yaml` (extending the existing `plate-event.*.schema.yaml` pattern). The shape below is the semantic core; exact field names align with the existing `plate-event.*` schemas where they already exist.

### 4.1 `transfer` (material-movement)

```
type: transfer
source: <material-instance-ref | aliquot-ref | well-ref>
destination: <well-ref | tube-ref>
volume: { value, unit }
tip_policy?: <tip-policy-ref>        # reserved, not used in v1 semantics
carryover_policy?: "ignored"         # reserved; default ignored
performed_by?: <operator-ref>
performed_on?: <instrument-ref>      # e.g. pipette, robot
```

Semantics (v1):

- Subtract `volume` from source context contents using proportional withdrawal over all composition entries.
- Add withdrawn contents to destination via the `ideal-mixing` derivation model (see 70): linear combination of component amounts, additive volumes.
- No carryover or contamination modeling. The `carryover_policy` field is reserved with default `"ignored"` so v2 can extend without schema breakage.
- Lineage: destination's resulting composition edges `derived_from` source for each component that was present.

### 4.2 `add_material` (material-movement)

```
type: add_material
material: <material-instance-ref | aliquot-ref>
destination: <well-ref | tube-ref>
amount: { value, unit }               # volume or mass or count
```

Semantic shorthand for a transfer whose source is identified by material-instance / aliquot rather than a well. Same mixing math as `transfer`. The distinction exists because biologists think differently about "pipette 10 µL from well A1 to well A2" vs "add 100 µL of DMEM to well A1"; the compiler treats them with the same math but preserves the authored gesture.

### 4.3 `aliquot` (material-movement, declared gesture)

```
type: aliquot
source: <material-instance-ref>
output_count: int
volume_per_aliquot: { value, unit }
storage?: <storage-condition-ref>
label_pattern?: string
```

`aliquot` is **not** equivalent to `N × transfer`. It is the deliberate gesture of splitting a master preparation into long-term stock units. Compiler semantics:

- Create `output_count` new `aliquot` resource nodes, each `derived_from` the source material-instance.
- Each aliquot inherits the source's composition exactly (no dilution, no mixing).
- Aliquots have their own identity (`ALQ-*`) and lifecycle.

If a biologist writes "aliquot" but the action is really "make N working dilutions," the compiler emits a diagnostic suggesting a sequence of `transfer` events instead. The gesture matters.

### 4.4 `mix` (state-transformation)

```
type: mix
subject: <well-ref | tube-ref>
method: "pipette" | "vortex" | "inversion" | ...
cycles?: int
```

No contents change. Diagnostic is emitted if a downstream measurement depends on homogeneity and no `mix` precedes it where an obvious inhomogeneity exists (e.g., recent `add_material` without subsequent mixing before a `read`).

### 4.5 `incubate` (state-transformation)

```
type: incubate
subject: <well-ref | plate-ref | tube-ref>
duration: { value, unit }
temperature?: { value, unit }
atmosphere?: { co2_pct?, o2_pct? }
```

Advances the subject context's time coordinate. Model-derived fields recompute (cell count under growth model, pH under equilibration model) using the pinned model versions in the context.

### 4.6 `measure` / `read` (measurement)

```
type: read
subject: <well-ref | plate-ref>
channel: { excitation_nm?, emission_nm?, absorbance_nm?, ... }
instrument: <instrument-ref>
output: <data-artifact-ref>
```

Produces a `data-artifact`. Does not mutate contents. Channel-and-dye preconditions are checked (see §6).

### 4.7 `create_container` (lifecycle)

```
type: create_container
container: <labware-instance-ref | tube-ref>
labware_definition: <labware-def-ref>
```

Brings a labware-instance into existence. All subsequent events referencing the container presuppose its creation.

## 5. Transfer semantics in detail

Transfer carries the most compiler load because every material-movement event reduces to it and because context correctness depends on it being done right.

### 5.1 The ideal-mixing model

`transfer` composition math is implemented as a derivation-model record, `DM-ideal-mixing` (see 70 for the worksheet format). This is deliberate: making mixing a declared model means it has a version, can be pinned, can be replaced in edge cases (e.g., a model that accounts for volume non-additivity in ethanol/water mixtures), and sits uniformly with other derivations.

Inputs: source composition entries, destination composition entries, transfer volume.
Output: new destination composition entries, with:
- Each component's amount = destination_prior + (source_concentration × transfer_volume)
- Destination volume = destination_prior_volume + transfer_volume
- Source composition scaled by (source_prior_volume - transfer_volume) / source_prior_volume

Units are checked step by step.

### 5.2 Proportional withdrawal

When the source is a mixture (e.g., a well with 100 µL of DMEM + 10 µL of CCCP stock), withdrawing 10 µL removes each component proportionally. No preferential withdrawal, no stratification.

### 5.3 Carryover is ignored in v1

`carryover_policy` is accepted on event records with default `"ignored"`. v2 will introduce other policies (`residual_fraction`, `per_tip_model`). The field is reserved so v1 records validate forward.

## 6. Event preconditions

An event may declare preconditions on its subject context: structural predicates that must hold for the event to be semantically valid. Example: `read(channel: 485ex/535em)` requires the subject context to contain a material tagged as a compatible redox-sensitive dye.

### 6.1 Declaration

Preconditions are authored in the event-type schema as a `preconditions` block using the same predicate DSL that lint rules use (extended with context-inspection operators — see 40 §4.3):

```yaml
preconditions:
  - all:
    - context_contains: { class: "redox-sensitive-dye" }
    - has_material_class: { class: "living-cell-population" }
```

### 6.2 Checking

Preconditions are checked at **plan-compile time** (before execution), not at authoring time. A biologist authoring an event in the editor should not be blocked; a biologist compiling a run-plan should see a diagnostic if preconditions are unmet.

### 6.3 Unity with context-roles

The predicate language used for event preconditions is the same language used for context-role prerequisites (see 40 §4.3). This is deliberate: "this event requires this structure in the subject context" and "this role requires this structure in the context" are the same question. One mechanism covers both.

## 7. Multi-channel pipettes

Biology labs operate serially. The single exception is the multi-channel pipette, which performs one gesture affecting multiple wells simultaneously.

A multi-channel transfer is modeled as **one atomic event** whose `source` and `destination` are arrays of well-refs (aligned by channel), not as N parallel events. This is because:

- Timestamp, operator, tip-policy, and failure mode are all shared.
- The biologist authored one gesture; the graph should reflect that.
- Downstream diff and diagnostic machinery treats it as one action.

```
type: transfer
source: [<well-A1>, <well-A2>, ..., <well-A12>]
destination: [<well-B1>, <well-B2>, ..., <well-B12>]
volume: { value: 100, unit: uL }
channels: 12
```

Compiler semantics: apply the same single-channel transfer math to each aligned pair, but treat provenance as one event (one `EVT-*` id, one set of `input_to`/`output_of` edges, one timestamp).

## 8. Provenance invariants

The compiler enforces:

- Every output resource has at least one `output_of` edge.
- Every event has at least one `input_to` edge (except `create_container` and some lifecycle verbs).
- `derived_from` lineage is a DAG — no cycles, ever.
- An `actualizes` edge implies verb-and-order equivalence between the actualized event and the planned event (structural correspondence; see 50 §4).
- Containment (`located_in`) is single-valued at any given time index for any resource.

Violations are **errors**, not warnings. A graph that violates invariants is rejected; it cannot produce contexts.

## 9. The ROS workflow in the IR

The ROS positive control workflow, expressed as events on the graph:

```
EVT-001  create_container  → plate PLT-001 (96-well clear-bottom)
EVT-002  add_material      → A1..H12, 100µL DMEM/10% FBS + 1e5 HepG2 cells/mL
EVT-003  incubate          → PLT-001, 24h, 37°C, 5% CO2
EVT-004  add_material      → CCCP wells (e.g. G1-H12), 1µL CCCP in DMSO
EVT-005  add_material      → vehicle wells (e.g. G1-G6 DMSO? or a different block)
                              in practice: authored as distinct events per block
EVT-006  add_material      → all wells, 1µL 1mM DCFDA in DMSO
EVT-007  incubate          → PLT-001, 30min, 37°C
EVT-008  read              → PLT-001, ex485/em535, instrument INS-PR-01 → DAT-001
```

Every event produces context updates per the families in §3. Preconditions on EVT-008 require a redox dye and living cells in each read well — these are checked at compile time, producing a diagnostic if EVT-006 were omitted.

## 10. Relationship to the existing `plate-event.*` schemas

The existing schemas under `schema/workflow/events/plate-event.*.schema.yaml` are the starting point. Phase 1 work on the IR:

- Preserve the existing event-type set as the v1 verb catalog seed (transfer, add-material, mix, incubate, read, harvest, wash, other, macro-program).
- Extend each schema with the family tag, the `preconditions` block, and the `carryover_policy` field where applicable.
- Formalize multi-channel `transfer` by allowing `source` and `destination` to be arrays (already partially supported in `plate-event.transfer.schema.yaml`).
- Introduce `create_container`, `aliquot` (lab.aliquot already exists as a record kind; here it becomes an event), `seal`, `unseal` as schemas to round out the Phase 1 verb set.

The `event-graph.schema.yaml` record kind is preserved as the top-level container; its contents are the set of `EVT-*` events and their typed edges.

No existing schema is deleted in Phase 1. Some are augmented.
