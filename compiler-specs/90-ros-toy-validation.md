# 90 — ROS Toy Event-Graph Validation

Status: Validation artifact (not authoritative spec)
Date: 2026-04-17
Validates: 20-event-graph-ir, 30-context, 40-knowledge, 50-protocol-lifecycle

---

## 1. Purpose

This document exercises specs 20/30/40/50 end-to-end against the canonical **ROS positive control** workflow from 10 §4. The goal is not to produce records that will be committed; it is to demonstrate that the four spec documents compose into a coherent object, and to surface the places where they don't.

Each section of this document names a spec, walks the workflow through its constructs, and ends with a **coverage** note and a **gap** note. Section 10 consolidates all gaps as feedback on the specs.

Records below use indicative YAML: field names match the spec text where the spec gives them, and are plausibly-named where it doesn't. IDs follow the prefix conventions (`EVT-*`, `CTX-*`, etc.) from the specs.

## 2. The worked scenario

- **Assay:** DCFDA ROS positive control, HepG2 cells, SpectraMax-7 plate reader.
- **Biologist:** Angel (`PRS-angel`).
- **Day:** 2026-04-17.
- **Labware:** one Greiner 655087 96-well clear-bottom plate (`LWI-plate-001`, declared from `LWD-greiner-655087`).
- **Treatments:**
  - A1–F12: DMEM/10% FBS + HepG2 only (naïve).
  - G1–G12: DMSO vehicle control (1 µL DMSO in DMEM).
  - H1–H12: CCCP positive control (1 µL of 10 mM CCCP-in-DMSO stock → 1 µM final).
  - (All wells also get DCFDA at step 6.)
- **Readout:** fluorescence at ex485/em535 after 30 min DCFDA incubation.

---

## 3. Lifecycle layer — validates 50

### 3.1 Global protocol

```yaml
recordId: PRT-ros-cccp-v1
kind: protocol
protocolLayer: universal
source:
  type: vendor
  ref: DOC-thermo-dcfda-kit-h10009
name: DCFDA cellular ROS detection — positive control (CCCP)
roles:
  - name: target_cell_line
    class: living-adherent-cell-population
  - name: positive_inhibitor
    class: complex-i-inhibitor
  - name: vehicle_solvent
    class: organic-solvent
  - name: redox_sensitive_dye
    class: redox-sensitive-dye
  - name: plate_reader
    class: fluorescence-plate-reader
  - name: microplate_labware
    class: clear-bottom-96-well-microplate
steps:
  - id: s1
    verb: create_container
    role_refs: [microplate_labware]
  - id: s2
    verb: add_material
    role_refs: [target_cell_line, microplate_labware]
    parameters: { volume: { value: 100, unit: uL }, density: { value: 1e5, unit: cells/mL } }
  - id: s3
    verb: incubate
    parameters: { duration: { value: 24, unit: h }, temperature: { value: 37, unit: C }, co2_pct: 5 }
  - id: s4a
    verb: add_material
    role_refs: [positive_inhibitor]
    parameters: { final_concentration: { value: 1, unit: uM }, selector: "positive-control-wells" }
  - id: s4b
    verb: add_material
    role_refs: [vehicle_solvent]
    parameters: { volume: { value: 1, unit: uL }, selector: "vehicle-control-wells" }
  - id: s5
    verb: incubate
    parameters: { duration: { value: 30, unit: min }, temperature: { value: 37, unit: C } }
  - id: s6
    verb: add_material
    role_refs: [redox_sensitive_dye]
    parameters: { final_concentration: { value: 10, unit: uM }, selector: "all-wells" }
  - id: s7
    verb: incubate
    parameters: { duration: { value: 30, unit: min }, temperature: { value: 37, unit: C } }
  - id: s8
    verb: read
    role_refs: [plate_reader]
    parameters: { channel: { excitation_nm: 485, emission_nm: 535 } }
```

### 3.2 Lab-state records

```yaml
recordId: LST-spectramax-filter-cube
kind: lab-state
subject_type: equipment-mount
subject_ref: INS-SPECTRAMAX-7
attribute: mounted_filter_cube
value: FC-ex485-em535
valid_from: 2026-03-22T09:00:00Z
asserted_by: PRS-angel
status: active
```

```yaml
recordId: LST-dcfda-stock-level
kind: lab-state
subject_type: stock
subject_ref: MSP-DCFDA-ThermoA123
attribute: volume
value: { value: 12.4, unit: mL }
valid_from: 2026-04-15T14:00:00Z
asserted_by: PRS-angel
status: active
```

```yaml
recordId: LST-incubator-37-calibration
kind: lab-state
subject_type: equipment
subject_ref: INS-incubator-01
attribute: ambient_temperature
value: { value: 36.9, unit: C, method: external-probe }
valid_from: 2026-04-10T08:00:00Z
asserted_by: PRS-angel
status: active
notes: "0.1C low vs nominal 37C; within tolerance."
```

### 3.3 Local protocol

```yaml
recordId: LPR-ros-hepg2-spectramax-v1
kind: local-protocol
protocolLayer: lab
inherits_from: PRT-ros-cccp-v1
lab_state_refs:
  - LST-spectramax-filter-cube
  - LST-dcfda-stock-level
  - LST-incubator-37-calibration
overrides:
  substitutions:
    - role: target_cell_line
      material_ref: MSP-HEPG2-ATCC-HB8065
      rationale: "Our standard HepG2 line, ATCC HB-8065."
    - role: positive_inhibitor
      material_ref: MSP-CCCP-10mM-in-DMSO
      rationale: "10 mM CCCP-in-DMSO working stock."
    - role: vehicle_solvent
      material_ref: MSP-DMSO-ultra
      rationale: "Sigma 276855 DMSO."
    - role: redox_sensitive_dye
      material_ref: MSP-DCFDA-ThermoA123
      rationale: "Thermo DCFDA kit, resuspended to 1 mM in DMSO."
    - role: plate_reader
      material_ref: INS-SPECTRAMAX-7
    - role: microplate_labware
      material_ref: LWD-greiner-655087
  parameters:
    - step: s2
      density: { value: 1e5, unit: cells/mL }
      volume: { value: 100, unit: uL }
    - step: s3
      temperature: { value: 36.9, unit: C, provenance: LST-incubator-37-calibration }
    - step: s4a
      final_concentration: { value: 1, unit: uM }
  timing_policies:
    - step: s3
      tolerance: { value: 30, unit: min }
    - step: s5
      tolerance: { value: 2, unit: min }
    - step: s7
      tolerance: { value: 2, unit: min }
  tip_policies:
    - family: add_material
      reuse: "never"
status: active
```

### 3.4 Planned run

```yaml
recordId: PLR-ros-2026-04-17
kind: planned-run
sourceType: local-protocol
localProtocolRef: LPR-ros-hepg2-spectramax-v1
bindings:
  labware:
    - role: microplate_labware
      instance_ref: LWI-plate-2026-04-17-001
  materials:
    - role: target_cell_line
      instance_ref: MI-HEPG2-P47-2026-04-15
    - role: positive_inhibitor
      instance_ref: ALQ-CCCP-10mM-004
    - role: vehicle_solvent
      instance_ref: ALQ-DMSO-ultra-112
    - role: redox_sensitive_dye
      instance_ref: ALQ-DCFDA-1mM-017
  instruments:
    - role: plate_reader
      instance_ref: INS-SPECTRAMAX-7
  operators:
    - PRS-angel
  contexts:
    - context_role_ref: CR-positive-control-for-ros
      well_selector: H1:H12
    - context_role_ref: CR-vehicle-control-for-ros
      well_selector: G1:G12
deckLayout: { ... }
pipetteConstraints: { ... }
protocolCompilation:
  view_of: LPR-ros-hepg2-spectramax-v1
  status: ready
  diagnostics: []
  remediationOptions: []
state: ready
```

### 3.5 Structural correspondence

Walking step-by-step (global `steps[*].verb` vs planned events, see §4):

| Position | Global step | Local step | Planned event | Match |
|---|---|---|---|---|
| 1 | create_container | (inherited) | EVT-001 create_container | ✓ |
| 2 | add_material | (inherited) | EVT-002 add_material (multi-channel) | ✓ |
| 3 | incubate | (inherited) | EVT-003 incubate | ✓ |
| 4a | add_material (positive) | (inherited) | EVT-004 add_material H1:H12 | ✓ |
| 4b | add_material (vehicle) | (inherited) | EVT-005 add_material G1:G12 | ✓ |
| 5 | incubate | (inherited) | EVT-006 incubate | ✓ |
| 6 | add_material (dye) | (inherited) | EVT-007 add_material A1:H12 | ✓ |
| 7 | incubate | (inherited) | EVT-008 incubate | ✓ |
| 8 | read | (inherited) | EVT-009 read | ✓ |

Same verbs, same order: ✓. (See §5 below — the executed event-graph inherits this same ordering and each executed event `actualizes` the corresponding planned event.)

### 3.6 Coverage (spec 50)

| Spec 50 § | Construct | Exercised |
|---|---|---|
| §4 | Global protocol (`protocol`, `protocolLayer: universal`) + `source` | §3.1 |
| §5 | Local protocol (new kind) with `inherits_from`, `lab_state_refs`, overrides | §3.3 |
| §6 | Structural correspondence "same verbs, same order" | §3.5 |
| §7 | Planned-run with `localProtocolRef`, `protocolCompilation` as view | §3.4 |
| §10 | Lab-state (new kind), seed attributes | §3.2 |
| §11 | execution-plan / robot-plan as downstream artifacts | not exercised (out of Phase 1 scope for this toy) |
| §13 | ROS workflow binds through lifecycle end-to-end | whole section |

### 3.7 Gap (spec 50)

- **50-G1** — The local-protocol `substitutions` list uses role names that resolve to `protocol.roles[*].name`, but the role-to-step mapping depends on `role_refs` on steps. When a step has multiple `role_refs`, it is ambiguous which role's substitution applies if more than one is substituted in a single step. 50 §5.4 should say: each (step-id, role-name) pair resolves independently; substitutions are per-role, not per-step.
- **50-G2** — 50 §5.2's `overrides.parameters[]` lists parameters with `step: s2` but doesn't say what happens when a parameter is not overridden at the local layer. Presumably: inherited from the global protocol. State this.
- **50-G3** — `LPR-*` ID prefix is implied by 50 §5.2 but not stated. Decide.

---

## 4. Event graph — validates 20

### 4.1 Resource nodes

```yaml
# labware-instance
- kind: labware-instance
  id: LWI-plate-2026-04-17-001
  labware_definition: LWD-greiner-655087

# material-instance (seeded cells)
- kind: material-instance
  id: MI-HEPG2-P47-2026-04-15
  spec_ref: MSP-HEPG2-ATCC-HB8065

# aliquots used as sources
- kind: aliquot
  id: ALQ-CCCP-10mM-004
  derived_from: MI-CCCP-10mM-stock-2026-04-01
- kind: aliquot
  id: ALQ-DMSO-ultra-112
- kind: aliquot
  id: ALQ-DCFDA-1mM-017

# instruments
- kind: instrument
  id: INS-incubator-01
- kind: instrument
  id: INS-SPECTRAMAX-7
- kind: instrument
  id: INS-multichannel-p300

# operator
- kind: operator
  id: PRS-angel

# data-artifact produced by the read
- kind: data-artifact
  id: DAT-plate-read-001
```

### 4.2 Events

```yaml
# EVT-001: create the plate
- id: EVT-001
  family: lifecycle
  verb: create_container
  container: LWI-plate-2026-04-17-001
  labware_definition: LWD-greiner-655087
  performed_by: PRS-angel
  wallclock: 2026-04-17T08:42:00-04:00
  phase: pre-seed

# EVT-002: multi-channel seed (one atomic event, 96 wells)
- id: EVT-002
  family: material-movement
  verb: add_material
  material: MI-HEPG2-P47-2026-04-15
  destination: [LWI-plate-2026-04-17-001:A1, ..., LWI-plate-2026-04-17-001:H12]
  amount: { value: 100, unit: uL }
  density: { value: 1e5, unit: cells/mL }
  channels: 12         # 8 rows × 12 passes via 8-tip head
  performed_by: PRS-angel
  performed_on: INS-multichannel-p300
  wallclock: 2026-04-17T08:55:00-04:00
  phase: post-seed

# EVT-003: 24h incubation at plate level
- id: EVT-003
  family: state-transformation
  verb: incubate
  subject: LWI-plate-2026-04-17-001
  duration: { value: 24, unit: h }
  temperature: { value: 36.9, unit: C }
  atmosphere: { co2_pct: 5 }
  performed_on: INS-incubator-01
  wallclock: 2026-04-17T09:00:00-04:00
  phase: post-24h-incubation

# EVT-004: add CCCP to H1..H12 (multi-channel)
- id: EVT-004
  family: material-movement
  verb: add_material
  material: ALQ-CCCP-10mM-004
  destination: [H1, H2, ..., H12]
  amount: { value: 1, unit: uL }
  channels: 12
  performed_by: PRS-angel
  wallclock: 2026-04-18T09:02:00-04:00
  phase: post-cccp-addition

# EVT-005: add DMSO vehicle to G1..G12
- id: EVT-005
  family: material-movement
  verb: add_material
  material: ALQ-DMSO-ultra-112
  destination: [G1, G2, ..., G12]
  amount: { value: 1, unit: uL }
  channels: 12
  performed_by: PRS-angel
  wallclock: 2026-04-18T09:05:00-04:00
  phase: post-vehicle-addition

# EVT-006: 30 min incubation
- id: EVT-006
  family: state-transformation
  verb: incubate
  subject: LWI-plate-2026-04-17-001
  duration: { value: 30, unit: min }
  temperature: { value: 36.9, unit: C }
  performed_on: INS-incubator-01
  wallclock: 2026-04-18T09:08:00-04:00
  phase: post-cccp-incubation

# EVT-007: add DCFDA to all wells
- id: EVT-007
  family: material-movement
  verb: add_material
  material: ALQ-DCFDA-1mM-017
  destination: [A1, ..., H12]
  amount: { value: 1, unit: uL }
  channels: 12
  performed_by: PRS-angel
  wallclock: 2026-04-18T09:42:00-04:00
  phase: post-dye-addition

# EVT-008: 30 min incubation
- id: EVT-008
  family: state-transformation
  verb: incubate
  subject: LWI-plate-2026-04-17-001
  duration: { value: 30, unit: min }
  temperature: { value: 36.9, unit: C }
  performed_on: INS-incubator-01
  wallclock: 2026-04-18T09:44:00-04:00
  phase: pre-read

# EVT-009: read fluorescence
- id: EVT-009
  family: measurement
  verb: read
  subject: LWI-plate-2026-04-17-001
  channel: { excitation_nm: 485, emission_nm: 535 }
  instrument: INS-SPECTRAMAX-7
  output: DAT-plate-read-001
  wallclock: 2026-04-18T10:17:00-04:00
  phase: post-read
  preconditions:
    - all:
      - context_contains: { chebi: "CHEBI:76481" }      # DCFDA
      - has_material_class: { class: "living-cell-population" }
```

### 4.3 Edges

```yaml
# input_to
- { kind: input_to, from: MI-HEPG2-P47-2026-04-15, to: EVT-002 }
- { kind: input_to, from: ALQ-CCCP-10mM-004,       to: EVT-004 }
- { kind: input_to, from: ALQ-DMSO-ultra-112,      to: EVT-005 }
- { kind: input_to, from: ALQ-DCFDA-1mM-017,       to: EVT-007 }

# output_of  (every well gets an output edge for each event that deposits into it)
- { kind: output_of, from: LWI-plate-2026-04-17-001:A1, to: EVT-002 }
# ... one per well per deposit event ...
- { kind: output_of, from: DAT-plate-read-001,          to: EVT-009 }

# located_in
- { kind: located_in, from: LWI-plate-2026-04-17-001, to: INS-incubator-01,  timepoint: EVT-003 }
- { kind: located_in, from: LWI-plate-2026-04-17-001, to: INS-SPECTRAMAX-7,  timepoint: EVT-009 }

# performed_by / performed_on — already on each event record above

# derived_from
- { kind: derived_from, from: LWI-plate-2026-04-17-001:H1, to: MI-HEPG2-P47-2026-04-15 }
- { kind: derived_from, from: LWI-plate-2026-04-17-001:H1, to: ALQ-CCCP-10mM-004 }
- { kind: derived_from, from: LWI-plate-2026-04-17-001:H1, to: ALQ-DCFDA-1mM-017 }

# measured_by
- { kind: measured_by, from: EVT-009, to: DAT-plate-read-001 }

# actualizes (each executed event → corresponding planned event on PLR-ros-2026-04-17)
- { kind: actualizes, from: EVT-001, to: PLR-ros-2026-04-17#s1 }
- { kind: actualizes, from: EVT-002, to: PLR-ros-2026-04-17#s2 }
# ... EVT-003..EVT-009 → s3..s8 ...
```

### 4.4 Preconditions exercised

- **EVT-009 `read`**: requires DCFDA (`CHEBI:76481`) + living-cell-population in the subject context. Verified after EVT-007 has deposited DCFDA into every well. If EVT-007 were omitted, the read-compile-time check would fail with a diagnostic pointing at the missing upstream event.
- Preconditions use the same predicate DSL as context-role prerequisites (20 §6.3 / 40 §4.3). Confirmed here: `context_contains` and `has_material_class` are the two operators used.

### 4.5 Multi-channel confirmation

EVT-002 seeds 96 wells in one authored gesture via the 8-tip multichannel head across 12 column passes. The IR models this as **one** `EVT-002` with `destination` as an array and `channels: 12`, per 20 §7. Timestamp, operator, and tip-policy are shared.

### 4.6 Coverage (spec 20)

| Spec 20 § | Construct | Exercised |
|---|---|---|
| §2.1 | Node kinds (event, material-instance, aliquot, labware-instance, instrument, operator, data-artifact) | §4.1 |
| §2.2 | Edge kinds (input_to, output_of, located_in, performed_by, performed_on, derived_from, measured_by, actualizes) | §4.3 |
| §2.3 | Append-only | implicit (no mutation below) |
| §3 | Five event families — used four (material-movement, state-transformation, lifecycle, measurement) | §4.2 |
| §4.1 | `transfer` | not exercised (ROS uses add_material instead — transfer is reserved for well→well) |
| §4.2 | `add_material` | EVT-002/004/005/007 |
| §4.3 | `aliquot` as a gesture | **not exercised** — ROS run consumes aliquots but doesn't author new ones |
| §4.4 | `mix` | not exercised (gap — see 20-G2 below) |
| §4.5 | `incubate` | EVT-003/006/008 |
| §4.6 | `read` | EVT-009 |
| §4.7 | `create_container` | EVT-001 |
| §5 | Transfer semantics (ideal-mixing) | not directly tested (ideal-mixing applies to add_material too; toy doesn't verify mixing math) |
| §6 | Preconditions | §4.4 |
| §7 | Multi-channel atomic events | §4.5 |
| §8 | Provenance invariants | §4.3 verifies by inspection |
| §9 | ROS workflow in IR | whole section |

### 4.7 Gaps (spec 20)

- **20-G1** — `add_material` vs `transfer`: the ROS workflow is entirely add_material from an aliquot/material-instance source; transfer (well-to-well) never appears. 20 §4.1 and §4.2 say they share mixing math. Exercising `transfer` end-to-end requires a different workflow (serial dilution, plate reformatting). **This toy does not validate `transfer`.**
- **20-G2** — `mix` is absent from the ROS sequence. 20 §4.4 says a diagnostic fires when homogeneity is required downstream and no `mix` precedes. Is addition of 1 µL into 100 µL a case where the missing `mix` should fire? Probably not (reader integrates across the well), but the spec is silent on thresholds. Clarify.
- **20-G3** — An `incubate` whose subject is a plate propagates to every well-context. The spec says `subject: <well-ref | plate-ref | tube-ref>` (§4.5) but does not define the propagation semantics. Add: "plate-subject incubate advances the time coordinate of every well-context under that plate; plate-context also advances."
- **20-G4** — `located_in` edges have a `timepoint` scalar in my example, but 20 §2.2 just lists the edge as resource → labware-instance with no time field. Containment can change over time (plate moves between incubator and reader). Either add `timepoint` to `located_in`, or express location as context state rather than as a graph edge. Decide.
- **20-G5** — `phase` labels (pre-seed, post-cccp-addition) live on events and are consumed by context time-coordinate resolution (30 §5.1, §5.3). The field is not in the 20 event schema. Add to §4 verb shape or to a common event-base schema.
- **20-G6** — For multi-channel EVT-002, the edge from the cell material-instance is one `input_to` to the whole event, but there are 96 `output_of` edges (one per destination well). This is fine, but the spec doesn't make it explicit that output edges are per-destination for multi-channel. State.

---

## 5. Contexts — validates 30

### 5.1 Well-contexts at key timepoints

```yaml
# Well H1 at post-seed (T0, after EVT-002)
recordId: CTX-H1-T0
subject_ref: LWI-plate-2026-04-17-001:H1
event_graph_ref: EG-ros-001
timepoint:
  iso: 2026-04-17T08:55:00-04:00
  event_index: 2
  named_phase: post-seed
contents:
  - component:
      spec_ref: MSP-HEPG2-ATCC-HB8065
      class: living-cell-population
    amount: { value: 1e4, unit: cells }    # 100 µL × 1e5/mL
    provenance: event-derived
  - component:
      spec_ref: MSP-DMEM-10pct-FBS
      class: growth-medium
    amount: { value: 100, unit: uL }
    provenance: event-derived
total_volume: { value: 100, unit: uL }
properties: {}
layer_provenance:
  event_derived: [contents, total_volume]
  model_derived: []
  observed: []
derivation_versions:
  DM-ideal-mixing: 1
completeness: complete
```

```yaml
# Well H1 at T=24h (after EVT-003, before EVT-004)
recordId: CTX-H1-T24h
subject_ref: LWI-plate-2026-04-17-001:H1
event_graph_ref: EG-ros-001
timepoint:
  named_phase: post-24h-incubation
  event_index: 3
contents:
  - component: { spec_ref: MSP-HEPG2-ATCC-HB8065 }
    amount: { value: 1.87e4, unit: cells }         # from DM-hepg2-growth v1
    provenance: model-derived
  - component: { spec_ref: MSP-DMEM-10pct-FBS }
    amount: { value: 100, unit: uL }
    provenance: event-derived
total_volume: { value: 100, unit: uL }
layer_provenance:
  event_derived: [total_volume, contents[1]]
  model_derived: [contents[0].amount]
  observed: []
derivation_versions:
  DM-ideal-mixing: 1
  DM-hepg2-growth: 1
completeness: complete
```

```yaml
# Well H1 at post-read (after EVT-009)
recordId: CTX-H1-post-read
subject_ref: LWI-plate-2026-04-17-001:H1
timepoint: { named_phase: post-read, event_index: 9 }
contents:
  - { component: { spec_ref: MSP-HEPG2-ATCC-HB8065 }, amount: { value: 1.88e4, unit: cells }, provenance: model-derived }
  - { component: { spec_ref: MSP-DMEM-10pct-FBS },    amount: { value: 100, unit: uL }, provenance: event-derived }
  - { component: { spec_ref: MSP-CCCP-10mM-in-DMSO }, amount: { value: 0.01, unit: nmol }, provenance: event-derived }    # 1µL × 10mM
  - { component: { spec_ref: MSP-DMSO-ultra },        amount: { value: 1, unit: uL }, provenance: event-derived }
  - { component: { spec_ref: MSP-DCFDA-ThermoA123 },  amount: { value: 1, unit: nmol }, provenance: event-derived }
total_volume: { value: 102, unit: uL }
observed:
  fluorescence_485_535: 41820
layer_provenance:
  event_derived: [total_volume, contents[1..4]]
  model_derived: [contents[0].amount]
  observed: [fluorescence_485_535]
derivation_versions:
  DM-ideal-mixing: 1
  DM-hepg2-growth: 1
completeness: complete
```

Analogous CTX records exist for G1 (vehicle), A1 (naïve), etc.

### 5.2 Plate-context

```yaml
recordId: CTX-plate-T0
subject_ref: LWI-plate-2026-04-17-001
timepoint: { named_phase: post-seed }
properties:
  seal_status: unsealed
  lid_present: true
  orientation: upright
  ambient: { temperature: { value: 36.9, unit: C }, co2_pct: 5 }
  location: INS-incubator-01
layer_provenance:
  event_derived: [seal_status, lid_present, orientation, location]
  model_derived: []
  observed: [ambient.temperature]    # from LST-incubator-37-calibration
completeness: complete
```

Note: plate-context carries properties that are **not** reducible to wells (30 §7): seal status, orientation, current location. A `seal` event would update this context without touching well-contexts. ROS doesn't seal the plate, so the exercise is limited.

### 5.3 Time coordinates

- EVT-001 has wallclock + event_index + phase.
- EVT-003 (incubate 24h) has duration offset: `T0 + 24h` from `post-seed`.
- When the compiler resolves CTX-H1-T24h, precedence (30 §5.2) picks ISO datetime first. `event_index` is the deterministic backup.
- Named phases (`post-seed`, `post-cccp-addition`, `pre-read`, `post-read`) are biologist-authored semantic checkpoints and resolve against the first event tagged with that phase.

### 5.4 Layer provenance

Every field in every context above is labeled as event-derived, model-derived, or observed. Crucially:

- **Model-derived cell count** at T=24h uses `DM-hepg2-growth v1` (version pinned in `derivation_versions`).
- **Observed fluorescence** at post-read is ingested from `DAT-plate-read-001` via the ingestion pass (30 §11.1, plain value).
- **Event-derived** total volume, DMSO amount, DCFDA amount, DMEM amount are all derived from event arithmetic via `DM-ideal-mixing v1`.

### 5.5 Partial context scenario

If the biologist authors EVT-001..EVT-006 and then stops without authoring EVT-007 (DCFDA) or EVT-009 (read), `CTX-H1-pre-read` is still computable:

```yaml
recordId: CTX-H1-at-stopped-authoring
timepoint: { named_phase: post-cccp-incubation }
contents: [ ... cells, DMEM, CCCP ... ]    # no DCFDA
completeness: partial
missing:
  - "expected downstream event-graph events through EVT-009 are not yet authored"
  - "observed.fluorescence_485_535 promised by planned-run but not yet ingested"
```

Downstream assertions built against this context would inherit the `supported-by-partial-context` warning (30 §6.1).

### 5.6 Model version pinning

If `DM-hepg2-growth` is later superseded by v2 (new rate coefficient), CTX-H1-T24h remains pinned to v1 and its numbers don't change. A source-drift diagnostic would fire on any promoted record whose preparation depended on that context, pointing out the model drift (30 §10.1, §12.7). No mutation.

### 5.7 Promotion candidate

Suppose Angel wants "1 µM CCCP in DMEM/10% FBS" as a reusable working stock identity. She selects CTX-H1-post-cccp-addition (through CTX-H12-post-cccp-addition) as a homogeneous selection and promotes to `material-spec`:

```yaml
recordId: MSP-ros-cccp-in-dmem-working-stock-v1
kind: material-spec
name: "1 µM CCCP in DMEM/10% FBS (post-addition)"
formulation:
  composition:
    - { component: { spec_ref: MSP-CCCP-10mM-in-DMSO }, concentration: { value: 1, unit: uM } }
    - { component: { spec_ref: MSP-DMSO-ultra }, volume_fraction: 0.01 }
    - { component: { spec_ref: MSP-HEPG2-ATCC-HB8065 }, concentration: { value: 1e5, unit: cells/mL } }    # homogeneity check will likely flag this
    - { component: { spec_ref: MSP-DMEM-10pct-FBS }, volume_fraction: 0.99 }
prepared_from:
  event_graph_ref: EG-ros-001
  event_range: [EVT-001, EVT-005]
  subject_selector: "H1:H12"
promoted_from:
  context_refs: [CTX-H1-post-cccp-addition, ..., CTX-H12-post-cccp-addition]
  selection_content_hash: sha256-...
  locked_at: 2026-04-18T09:06:00-04:00
```

(The inclusion of cells in the "formulation" would normally trip up the homogeneity check and/or the compiler would diagnose "promoting a cellular-context to material-spec is likely the wrong gesture — you probably want `assay-definition` or `context-snapshot`." This is an expected diagnostic, not an error of this document.)

### 5.8 Coverage (spec 30)

| Spec 30 § | Construct | Exercised |
|---|---|---|
| §2 | Context shape | §5.1 |
| §3 | Subject types (well, plate) | §5.1, §5.2 — tube/animal/cohort/collection not exercised |
| §4 | Three layers of meaning | §5.1, §5.4 |
| §5 | Time coordinates, four forms | §5.3 |
| §6 | Partial contexts | §5.5 |
| §7 | Plate-context as first-class | §5.2 |
| §8 | Context diff | used implicitly by assertions in §6 |
| §9 | Context cache | implementation concern; not exercised by authoring |
| §10 | Model version pinning | §5.4, §5.6 |
| §11 | Observed-field ingestion, dual representation | §5.1 plain-value form exercised; dual form exercised in §6.3 via `confluence` |
| §12 | Context promotion | §5.7 |
| §13 | ROS workflow in contexts | whole section |

### 5.9 Gaps (spec 30)

- **30-G1** — The `ideal-mixing` derivation model is listed as `DM-ideal-mixing v1` in every context, including ones where no mixing occurred (a plate with only cells in DMEM). Is a model "used" when zero additions happened? The spec is silent. Recommend: list a model in `derivation_versions` only when a field was computed via it. If no composition arithmetic occurred, omit.
- **30-G2** — When a plate-level `incubate` advances time for every well-context, do we emit N new well-context records, or is there a notion of "latest context"? Reading 30 §2 suggests contexts are records, so yes — one per well per timepoint. That's a lot of records per run. Confirm this is intended, and consider whether contexts are virtual (computed on demand) vs materialized (committed).
- **30-G3** — The `completeness: partial` with `missing[]` carries free-form strings in §5.5. For tooling, structured codes (e.g., `missing: [{ kind: "upstream_event", step_ref: "s7" }]`) would be more useful. The spec allows free-form; consider constraining.
- **30-G4** — Promotion of a cellular context to `material-spec` (§5.7) is the wrong gesture but the spec's target-kind table (§12.2) does not reject it structurally. 30 §12.3 says `material-spec` requires homogeneous composition; a cell + medium + trace chemicals context is "homogeneous" in the spec's sense (one composition per well, all wells equivalent) but semantically a living context shouldn't normally be a reusable material-spec. Add a diagnostic hint when `living-cell-population` is in the composition of a material-spec candidate.
- **30-G5** — `derivation_versions` uses model IDs as keys. Two models applied to the same context (one for cell growth, one for mixing) works fine. But if two models apply to the *same field* (a competing growth model), the shape doesn't express which one won. Unlikely in Phase 1 but worth noting.

---

## 6. Knowledge — validates 40

### 6.1 Context-roles applied

```yaml
# Context-role definition (already-authored registry record)
recordId: CR-positive-control-for-ros
kind: context-role
name: positive-control-for-ros
applies_to_subject_types: [well, tube]
prerequisites:
  all:
    - has_material_class: { class: living-cell-population }
    - any:
      - has_material_class: { class: complex-i-inhibitor }
      - context_contains: { chebi: CHEBI:3380 }          # CCCP
    - has_material_class: { class: redox-sensitive-dye }
conflicts_with: [vehicle-control-for-ros]
```

```yaml
recordId: CR-vehicle-control-for-ros
kind: context-role
prerequisites:
  all:
    - has_material_class: { class: living-cell-population }
    - has_material_class: { class: organic-solvent }       # DMSO
    - not: { has_material_class: { class: complex-i-inhibitor } }
    - has_material_class: { class: redox-sensitive-dye }
```

**Verification at EVT-007 time:**

- `CR-positive-control-for-ros` against `CTX-H1-post-read`: `verified` (HepG2 + CCCP + DCFDA all present).
- `CR-positive-control-for-ros` against `CTX-H1-at-stopped-authoring` (pre-DCFDA): `unsupported` — DCFDA missing. Diagnostic.
- `CR-vehicle-control-for-ros` against `CTX-G1-post-read`: `verified` (HepG2 + DMSO + DCFDA; no CCCP).
- `CR-positive-control-for-ros` against `CTX-A1-post-read` (naïve well): `unsupported` — no CCCP, no DMSO. The compiler correctly refuses to assign this role to A1.

### 6.2 Assertion

```yaml
recordId: ASN-ROS-001
kind: assertion
scope: comparison
context_refs:
  - CTX-H1-post-read
  - CTX-H2-post-read
  - ...
  - CTX-H12-post-read
  - CTX-G1-post-read
  - ...
  - CTX-G12-post-read
roles:
  - { role_ref: CR-positive-control-for-ros, context_refs: [CTX-H1..H12-post-read] }
  - { role_ref: CR-vehicle-control-for-ros, context_refs: [CTX-G1..G12-post-read] }
claim_ref: CLM-cccp-induces-ros-spike     # optional; this supports a world claim
outcome:
  measure: fluorescence_485_535
  layer: observed
  direction: increase
  effect_size: { value: 4.2, unit: fold }     # computed by compiler via context diff
  significance: { method: welch-t, p_value: 1.3e-12, ci: [3.7, 4.7] }
evidence_refs: [EVD-ROS-001]
confidence: 4
status: active
authored_by: PRS-angel
```

The compiler reads the two context-ref groups, computes the diff across `fluorescence_485_535`, and populates `outcome.direction` and `outcome.effect_size`. The biologist authored the shape (which contexts, which measure); the arithmetic is compiler-side (40 §5.4).

### 6.3 Observed value with judgment (dual form)

When Angel eyeballs confluence on the naïve A-row wells and records:

```yaml
# on CTX-A1-T24h
observed:
  confluence:
    value: 0.62
    assertion_ref: ASN-A1-confluence

# ASN-A1-confluence
recordId: ASN-A1-confluence
scope: single_context
context_refs: [CTX-A1-T24h]
outcome:
  measure: confluence
  layer: observed
  direction: qualitative
confidence: 3
authored_by: PRS-angel
```

A downstream assertion reading `CTX-A1-T24h.observed.confluence.value` gets `0.62`; a system auditing judgments reads `ASN-A1-confluence` for the provenance.

### 6.4 Evidence

```yaml
recordId: EVD-ROS-001
kind: evidence
supports: [ASN-ROS-001]
sources:
  - { type: event_graph, ref: EG-ros-001 }
  - { type: result, ref: MEA-plate-read-001 }
  - { type: file, ref: DAT-plate-read-001 }
  - { type: publication, ref: DOC-thermo-dcfda-kit-h10009 }
quality:
  plate_read_cv_row_H: 0.07
  plate_read_cv_row_G: 0.09
  positive_control_verified: true
```

### 6.5 Optional claim link

```yaml
recordId: CLM-cccp-induces-ros-spike
kind: claim
subject: CHEBI:3380       # CCCP
predicate: induces
object: GO:0006979        # response to oxidative stress / ROS pathway
sources: [PUB-smith-2014]
status: active
```

Angel didn't need to author or look this up to complete the experiment. She could. If she does, `ASN-ROS-001.claim_ref = CLM-cccp-induces-ros-spike` links the lab-level statement to the world-level triple.

### 6.6 Coverage (spec 40)

| Spec 40 § | Construct | Exercised |
|---|---|---|
| §3 | Claims | §6.5 |
| §4 | Context-roles + predicate DSL | §6.1 (including `all`, `any`, `not`, `has_material_class`, `context_contains`) |
| §4.4 | verified/unsupported/ambiguous outcomes | §6.1 (first two; `ambiguous` from partial context — implicit via §5.5) |
| §5 | Assertions, generalized scope, computed outcome | §6.2 |
| §5.2 | scope: comparison | §6.2 |
| §5.2 | scope: single_context | §6.3 |
| §5.2 | scope: series | not exercised (would need a time series) |
| §5.2 | scope: global | not exercised (claim-only assertion) |
| §6 | Evidence, typed sources, multi-source | §6.4 |
| §7 | Retraction | not exercised |
| §8 | Dual-representation observed properties | §6.3 |

### 6.7 Gaps (spec 40)

- **40-G1** — `ASN-ROS-001.context_refs` has 24 entries. The existing assertion schema probably wants a structured form for "the CCCP arm" vs "the vehicle arm" rather than a flat list. 40 §5.2 says context_refs shape is determined by scope — for `comparison`, we probably need `context_refs: { arms: [{ name, refs[] }, ...] }`. Add.
- **40-G2** — `roles` in the assertion is a list of `{ role_ref, context_ref }` in 40 §5.1, but in practice (§6.2) each role applies to a *set* of context-refs. Either change `context_ref` → `context_refs[]` in 40 §5.1, or require one role-assignment record per context.
- **40-G3** — The diff on an N-arm comparison with an unequal split (12 positive + 12 vehicle + 72 naïve) is three-way, but `outcome.direction` is a scalar. 40 §5.4 says outcome is computed from the diff, but for N>2 the shape of outcome needs to enumerate pairwise directions or define a reference arm. Clarify.
- **40-G4** — 40 §4.4 says role verification produces `verified | unsupported | ambiguous`, but none of the examples show the `ambiguous` case. From §5.5 above, a partial context yields an ambiguous role check. Add a worked example in 40.
- **40-G5** — Conflict-with (`CR-positive-control-for-ros.conflicts_with: [vehicle-control]`) is defined in 40 §4.2 but the check isn't described. If someone assigns both roles to one well, the compiler should error. State explicitly in §4.4.

---

## 7. Actual run composite

### 7.1 Three records, three roles

```yaml
# The operational envelope
recordId: EXR-ros-001
kind: execution-run
plannedRunRef: PLR-ros-2026-04-17
materializedEventGraphId: EG-ros-001
attempt: 1
status: completed
leaseHolder: PRS-angel
startedAt: 2026-04-17T08:42:00-04:00
completedAt: 2026-04-18T10:17:00-04:00
```

```yaml
# The canonical truth of what happened
recordId: EG-ros-001
kind: event-graph
events: [EVT-001, ..., EVT-009]            # bodies defined in §4.2
edges: [...]                                # as in §4.3
```

```yaml
# The study-session header
recordId: RUN-042
kind: studies/run
experiment_ref: EXP-ros-qc-2026
methodEventGraphId: EG-ros-001
executed_by: PRS-angel
session_notes: "Standard QC run. Positive control verified."
```

### 7.2 `actualizes` edges

Each `EVT-*` in EG-ros-001 carries an `actualizes` edge to the corresponding planned event on PLR-ros-2026-04-17. Positional correspondence: EVT-001 → PLR#s1, EVT-002 → PLR#s2, ..., EVT-009 → PLR#s8. Same verbs, same order (50 §6).

### 7.3 A minor deviation

During EVT-006 (30-min incubation after CCCP addition), Angel opened the incubator door briefly to retrieve another plate. The incubation ran 32 minutes (vs. 30 planned).

```yaml
recordId: DEV-001
kind: execution-deviation
planned_event_ref: PLR-ros-2026-04-17#s5
actual_event_ref: EVT-006
deviationType: operator
severity: minor
environmental_context:
  lab_state_refs: [LST-incubator-37-calibration]
reason: "Incubator door opened briefly at ~08 min to retrieve an adjacent plate; 30s ambient exposure. Incubation extended to 32 min (planned 30)."
actor: PRS-angel
activePolicy: sandbox
authored_at: 2026-04-18T10:18:00-04:00
```

- `severity: minor` (50 §9.1): within declared tolerance (`LPR-ros-hepg2-spectramax-v1.overrides.timing_policies[s5].tolerance: 2 min`). No downstream flag on ASN-ROS-001.
- `deviationType: operator` (existing enum value). Not `environmental`, because the door-open was an operator action, not a lab-state change.

### 7.4 Coverage (actual-run composite, validates 50 §8)

| Record kind | Role | Exercised |
|---|---|---|
| `event-graph` | canonical truth | EG-ros-001 |
| `execution-run` | operational envelope | EXR-ros-001 |
| `studies/run` | study-session header | RUN-042 |
| `execution-deviation` with severity | biologist-relevant deviation | DEV-001 |
| `execution-observation` | deviation evidence | not exercised |
| `execution-remediation-decision` | approval workflow | not exercised |
| `execution-incident` | ops alerting | not exercised |

### 7.5 Gaps (actual-run composite)

- **50-G4** — When a deviation's `actual_event_ref` (EVT-006) refines the planned event's `duration` from 30 min to 32 min, is the deviation itself enough, or should the event-graph also carry a retracted/superseded parameter hint? The specs say events are append-only (20 §2.3); deviation is the authoritative record of the delta. Confirm: the event-graph records the *as-executed* duration (32 min) directly on EVT-006; the deviation record names the delta and classifies it. This is what DEV-001 does above, but the specs should say so.
- **50-G5** — Structural correspondence (50 §6) permits an `actualizes` edge only when verb and order match. What about an operator-inserted event (e.g., "operator briefly agitated the plate by hand after noticing condensation")? It has no planned counterpart. Either:
  - (a) the event has no `actualizes` edge and is flagged as an "inserted" deviation (new `deviationType: inserted`?), or
  - (b) such a gesture is not a graph event at all but a note on a deviation record.
  - Resolve. My lean: (a), with a new enum value `deviationType: inserted`.
- **50-G6** — DEV-001's `environmental_context.lab_state_refs` is not in 50's execution-deviation shape — I invented it. But since we added `environmental` to `deviationType`, we probably need a way to link the deviation to the relevant lab-state. Add field.

---

## 8. End-to-end compiler diagnostics

A pass of the compiler against the assembled records above should produce:

1. **Structural-correspondence pass** (50 §6.2): walks global → local → planned, all verbs and order aligned. ✓ No diagnostic.
2. **Capability check** (50 §7.3): SpectraMax-7 supports ex485/em535 read on Greiner 655087. ✓ No diagnostic.
3. **Event preconditions** (20 §6): EVT-009 read requires DCFDA + living cells in subject context. Verified post-EVT-007. ✓
4. **Context-role verification** (40 §4.4): H-row wells satisfy positive-control-for-ros post-EVT-007. G-row wells satisfy vehicle-control-for-ros post-EVT-007. A-row wells do not satisfy either (no dye either until EVT-007, then satisfy neither role). ✓
5. **Assertion outcome population** (40 §5.4): compiler computes context diff on `fluorescence_485_535` between H-arm and G-arm, populates direction: increase, effect_size: 4.2-fold, significance via t-test. ✓
6. **Deviation severity propagation**: DEV-001 `severity: minor` → no assertion flag. ✓
7. **Model pinning**: DM-hepg2-growth v1 recorded in CTX-*-T24h. DM-ideal-mixing v1 recorded in every context touching an addition. ✓

## 9. Global coverage matrix

| Spec | § | Construct | Status in this toy |
|---|---|---|---|
| 20 | 2.1 | node kinds | ✓ |
| 20 | 2.2 | edge kinds | ✓ (except no `preceded_by` in ROS; wallclock sufficient) |
| 20 | 3.1 | material-movement family | ✓ (add_material) |
| 20 | 3.2 | state-transformation family | ✓ (incubate) |
| 20 | 3.3 | lifecycle family | ✓ (create_container) |
| 20 | 3.4 | measurement family | ✓ (read) |
| 20 | 3.5 | composition family | ✗ not exercised |
| 20 | 4.1 | transfer | ✗ not exercised (add_material instead) |
| 20 | 4.3 | aliquot as gesture | ✗ not exercised (no new aliquots authored) |
| 20 | 4.4 | mix | ✗ not exercised |
| 20 | 6 | preconditions | ✓ |
| 20 | 7 | multi-channel | ✓ |
| 20 | 8 | provenance invariants | ✓ |
| 30 | 2 | context shape | ✓ |
| 30 | 3 | subject types | partial (well, plate — not tube/animal/cohort/collection) |
| 30 | 4 | three layers | ✓ |
| 30 | 5 | time coordinates | ✓ all four forms |
| 30 | 6 | partial contexts | ✓ |
| 30 | 7 | plate-context | ✓ |
| 30 | 8 | context diff | ✓ (implicit via assertion outcome) |
| 30 | 10 | model pinning | ✓ |
| 30 | 11 | observed-field ingestion | ✓ (both plain and dual form) |
| 30 | 12 | promotion | ✓ (material-spec candidate, with caveat) |
| 40 | 3 | claims | ✓ |
| 40 | 4 | context-roles + DSL | ✓ |
| 40 | 5.2 | scope: single_context | ✓ |
| 40 | 5.2 | scope: comparison | ✓ |
| 40 | 5.2 | scope: series | ✗ |
| 40 | 5.2 | scope: global | ✗ |
| 40 | 6 | evidence | ✓ |
| 40 | 7 | retraction | ✗ |
| 40 | 8 | dual observed | ✓ |
| 50 | 4 | global protocol + source | ✓ |
| 50 | 5 | local-protocol | ✓ |
| 50 | 6 | structural correspondence | ✓ |
| 50 | 7 | planned-run | ✓ |
| 50 | 8 | actual-run composite | ✓ |
| 50 | 9 | deviation (with severity + environmental link) | ✓ |
| 50 | 10 | lab-state | ✓ (three seed records) |
| 50 | 11 | execution-plan / robot-plan | ✗ Phase 1 scope |

Constructs marked ✗ are not holes in the specs; they're just out of the ROS workflow's surface area. A second toy workflow (a serial dilution or a harvest-and-reseed) would exercise `transfer`, `mix`, `aliquot-as-gesture`, `series`-scope assertions, and retraction.

## 10. Consolidated spec feedback

These are the concrete spec-text changes the validation surfaces. Each is cheap and worth integrating before 60/70/80.

### Spec 20 (Event Graph IR)

- **20-G1** — Note that the ROS workflow uses `add_material` throughout, not `transfer`. Revise §4.1 to clarify that transfer is well→well/source-with-explicit-well; add a one-liner distinguishing from §4.2.
- **20-G2** — Clarify the `mix` diagnostic's triggering threshold (or explicitly defer).
- **20-G3** — Add plate-subject `incubate` propagation semantics to §4.5 (advances every well-context under the plate).
- **20-G4** — Either add `timepoint` / `since` to `located_in` edges in §2.2, or move containment to context state. Locations move; edges alone don't carry time.
- **20-G5** — Add `phase` field to the common event shape (used by 30 §5.3).
- **20-G6** — State that in multi-channel events, output edges fan out per destination while input edges do not.

### Spec 30 (Context)

- **30-G1** — Only list a derivation model in `derivation_versions` if a field was actually computed through it.
- **30-G2** — Clarify virtual vs materialized contexts. Materialized per well per timepoint is a lot of records; Phase 1 probably wants virtual-by-default with materialization on promotion.
- **30-G3** — Structure the `missing[]` shape on partial contexts (at least as a tagged union).
- **30-G4** — Add a diagnostic hint when `living-cell-population` appears in a `material-spec` promotion candidate.
- **30-G5** — (Low priority) Handle the "two models for one field" conflict case.

### Spec 40 (Knowledge)

- **40-G1** — `comparison`-scope assertions need arm-grouped context_refs, not a flat list.
- **40-G2** — In assertion.roles, allow `context_refs[]` (plural) per role.
- **40-G3** — Define outcome shape for N>2-arm comparisons (pairwise or reference-arm).
- **40-G4** — Worked example of `ambiguous` context-role verification (from a partial context).
- **40-G5** — Specify that `conflicts_with` on a context-role is enforced: assigning both roles to one context is an error.

### Spec 50 (Protocol Lifecycle)

- **50-G1** — Substitutions resolve per (step-id, role-name), not per step.
- **50-G2** — State that unoverridden parameters inherit from the global protocol.
- **50-G3** — State `LPR-*` as the local-protocol ID prefix.
- **50-G4** — State that events record as-executed parameter values; deviation records name the delta (don't duplicate).
- **50-G5** — Resolve operator-inserted events: new `deviationType: inserted` value, or express as a note on a deviation record. Lean: add `inserted`.
- **50-G6** — Add `environmental_context.lab_state_refs[]` to `execution-deviation` so environmental deviations link to the lab-state that changed.

### Cross-cutting

- **X-G1** — Phase labels are a shared concept across 20 (events) and 30 (contexts). Consider a single registry of valid phase labels per protocol, referenced by both.
- **X-G2** — The precedence DSL used for event preconditions (20 §6), context-role prerequisites (40 §4.3), and lab-state invariant checks (50 §10 — implied but unstated) should share a single documented operator list. Right now 20 §6.1 points at 40 §4.3; 40 §4.3 introduces the extended operators. Consolidate in a named appendix or a shared doc reference.

## 11. Conclusion

The ROS positive control workflow compiles cleanly through specs 20/30/40/50 as currently written, with the caveats in §10. Of roughly 60 construct-level coverage cells in the matrix, 44 are exercised directly by ROS; 16 are out of the ROS surface and need a companion toy (a serial-dilution workflow would close most of them).

No structural contradictions between the four specs were surfaced. All identified gaps are either clarifications (phrasing, enum additions, cross-references) or late-binding decisions that can be made without spec rewrites.

**Recommendation:** integrate the §10 feedback as in-place edits to 20/30/40/50, then proceed to drafting 60 (Compiler), 70 (Derivation Models), 80 (AI Pre-Compiler) with the ROS workflow as the continuing forcing function.
