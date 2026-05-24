# Knowledge Layer — Canonical Example

Status: Canonical reference
Date: 2026-05-24
Related: `schema/knowledge/`, `schema/core/context.schema.yaml`, `schema/lab/measurement-context.schema.yaml`, `schema/lab/well-group.schema.yaml`, `specifications/single-plate-ros-vertical-slice-plan.md`

## Why this document exists

The knowledge layer is the substance of computable-lab. A plate sets the **biological context** for a scientist's **assertions** about **globally reusable claims**; a plate read produces **evidence** that supports or refutes those assertions in that context.

The model has subtle pieces that conflate easily if you haven't seen them spelled out. This doc works one realistic experiment — PPARα agonism → ROS via β-oxidation–driven NADH reductive stress — all the way through the record graph, so contributors and AI assistants share one mental model.

If you only read one section, read [The model](#the-model) and skim the worked YAML.

## The model

Eight record kinds, three roles.

| Role | Record kinds | Reusable? |
|---|---|---|
| **Atomic facts and predictions** (source of truth) | `claim`, `context`, `context-role`, `measurement-context`, `well-group`, `assertion`, `evidence` | Most reusable; some per-experiment |
| **Structural wrapper** (lightweight graph over claims) | `mechanism-model` | Reusable across experiments |
| **Narrative** | `experiment-narrative` | One per experiment; references everything else |

### Atomic records

| Record | Schema | Purpose |
|---|---|---|
| **Claim** | `schema/knowledge/claim.schema.yaml` | RDF-like triple (`subject` / `predicate` / `object` refs) with a human-readable `statement`. Globally reusable, citation-bearable, retractable. **Never** points at other claims. *"PPARα activation causes increased β-oxidation."* |
| **Context** | `schema/core/context.schema.yaml` | Biological state of a `subject_ref` (well, well-group, sample). `contents[]` lists materials with vol/conc, derived from `add_material` events. `properties` is user-annotated. *"The CTX-clo wells contain HepG2 + growth medium + clofibrate + CellROX."* Context is the **meaning carrier** — rotenone doesn't produce ROS in a vacuum. |
| **Measurement-Context** | `schema/lab/measurement-context.schema.yaml` | How a channel measures: `source_ref` (plate), `instrument_ref`, `readout_def_refs`. One per channel per plate. |
| **Context-Role** | `schema/knowledge/context-role.schema.yaml` | Named, reusable role (e.g. `CR-ros-positive-control`). Optionally carries machine-checkable `prerequisites` (a DSL of predicates over `context.contents`). |
| **Well-Group** | `schema/lab/well-group.schema.yaml` | Labeled set of wells on a plate — convenience subject for `context.subject_ref`. |
| **Assertion** | `schema/knowledge/assertion.schema.yaml` | A scientist's claim, in a context, for one experiment. One `claim_ref` + N `context_refs` + `scope` (`single_context` \| `comparison` \| `series` \| `global`) + `roles[]` (binds each context to a context-role) + `outcome` (predicted `direction`, `measure`, `layer`) + `evidence_refs` (filled post-read). Assertions are **testable predictions** before the read; the same assertion carries the durable hypothesis once evidence arrives. |
| **Evidence** | `schema/knowledge/evidence.schema.yaml` | Post-read bundle. `supports[]` lists the assertions; `sources[]` of `type: result\|context\|event\|publication\|file\|event_graph` cites the raw materials. `quality{}` carries effect size, significance, qc. |

### Structural wrapper

| Record | Schema | Purpose |
|---|---|---|
| **Mechanism-Model** | `schema/knowledge/mechanism-model.schema.yaml` | Typed-node + claim-backed-edge graph + interventions. Assembles atomic claims into a testable causal chain. Lets agents answer "what blocks this mechanism?" / "which assays test the β-ox → NADH RS link?" |

Mechanism-model edges reference atomic claims by id; an assertion that tests a mechanism's edge does so **implicitly** by sharing the edge's `claim_ref`. No new field on assertion.

### Narrative

| Record | Schema | Purpose |
|---|---|---|
| **Experiment-Narrative** | `schema/studies/experiment-narrative.schema.yaml` | The *story*: ordering, rationale, prose. `primaryClaimIds` lists the claims under test. `entries[]` references the mechanism-model, the assertions, the planned read, and the resulting evidence. With mechanism-model carrying the structural chain, narrative is freed up for genuine prose (the *why*). |

### How they compose

```
                                Claim (global, atomic)
                                 ▲
                                 │ claim_ref
                                 │
                  ┌──────────────┼──────────────────────┐
                  │              │                      │
       Mechanism-Model       Assertion              ... (other experiments'
       edge.claim_ref       claim_ref:Y               assertions, literature
       implicit join                                   refs, etc.)
                                 │
                                 │ context_refs[]
                                 ▼
                            Context (per well-group)
                                 │
                                 │ subject_ref
                                 ▼
                            Well-Group → wells on a plate

                            Measurement-Context  (per channel; lives parallel,
                                 │                joined to assertions via
                                 │                role assignments / channel)
                                 ▼
                            Result (post-read measurement)
                                 │
                                 │ source in
                                 ▼
                            Evidence ──supports──▶ Assertion
```

## Worked example: PPARα → ROS via β-oxidation–driven NADH reductive stress

### The hypothesis

The scientist asks: **does PPARα agonism produce ROS, and is the mechanism mediated by β-oxidation–driven NADH reductive stress?**

96-well plate. HepG2 cells + growth medium + CellROX Deep Red in every well. Two reads on the same plate:
- **Channel 1:** CellROX Deep Red fluorescence, Ex/Em **644/665** nm — endpoint readout for ROS.
- **Channel 2:** NADH autofluorescence, Ex/Em **340/460** nm — intermediate readout for mitochondrial NADH redox state.

Experimental design — twelve well groups, three replicates each (36 wells, leaving room for additional replicates and edge wells):

| Group | Treatment (besides HepG2 + medium + CellROX) | Role in design |
|---|---|---|
| `WG-normal` | — | Vehicle baseline |
| `WG-clo` | clofibrate (PPARα agonist) | PPARα agonism test |
| `WG-eto` | etomoxir (CPT-1 inhibitor, blocks β-ox) | β-ox specificity ctrl |
| `WG-clo-eto` | clofibrate + etomoxir | Does blocking β-ox attenuate ROS? |
| `WG-rot` | rotenone (Complex I inhibitor) | ROS+ / NADH-RS+ channel positive control |
| `WG-fccp` | FCCP (uncoupler) | ROS− / NADH-OS channel negative control |
| `WG-bhb` | β-hydroxybutyrate (BHB) | NADH-RS+ biological mechanism control |
| `WG-acac` | acetoacetate (AcAc) | NADH-OS biological mechanism control |
| `WG-clo-bhb` | clofibrate + BHB | Potentiates ROS if mechanism runs via NADH-RS |
| `WG-clo-acac` | clofibrate + AcAc | Attenuates ROS if mechanism runs via NADH-RS |
| `WG-eto-bhb` | etomoxir + BHB | Rules out β-ox-independent BHB → ROS path |
| `WG-eto-acac` | etomoxir + AcAc | Specificity |

### Materials

Most are ontology-only refs (CHEBI for small molecules); HepG2 cells are a `material-instance`, growth medium is a `material-spec`, CellROX Deep Red is a vendor product or material concept.

### Well-groups (12)

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/well-group.schema.yaml"
kind: well-group
id: WG-clo
title: Clofibrate-treated wells
name: Clofibrate
source_ref:
  kind: record
  id: LBW-PLATE-001                # the 96-well plate
  type: labware
well_ids: [B1, B2, B3]             # three replicate wells
notes: PPARα agonism arm
tags: [ppar, agonist, experimental]
```

(Repeat for `WG-normal`, `WG-eto`, …, `WG-eto-acac`. Each picks 3+ wells on the same plate.)

### Contexts (12, one per well-group)

Computed by event-graph replay at the planned read timepoint. `contents[]` enumerates materials added via `add_material` events; the user annotates `properties` / `notes`.

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/context.schema.yaml"
id: CTX-clo
subject_ref:
  kind: record
  id: WG-clo
  type: well-group
event_graph_ref:
  kind: record
  id: EVG-PLATE-001
  type: event-graph
timepoint: "PT2H"                  # 2 h post-dose, when the read is planned

contents:
  - material_ref:
      kind: record
      id: MINST-HEPG2-P12
      type: material-instance
      label: HepG2 P12
    count: 25000                   # cells/well at seeding
  - material_ref:
      kind: record
      id: MSP-GROWTH-MEDIUM-DMEM10
      type: material-spec
      label: DMEM + 10% FBS
    volume: { value: 100, unit: uL }
  - material_ref:
      kind: ontology
      id: CHEBI:23034
      namespace: CHEBI
      label: clofibrate
    volume: { value: 1, unit: uL }        # 1 µL of 5 mM DMSO stock
    concentration: { value: 50, unit: uM } # final concentration in the well
  - material_ref:
      kind: ontology
      id: CHEBI:48107                     # CellROX Deep Red (illustrative CHEBI id)
      namespace: CHEBI
      label: CellROX Deep Red
    volume: { value: 0.2, unit: uL }      # 0.2 µL of 2.5 mM stock
    concentration: { value: 5, unit: uM }  # final concentration in the well

properties:
  exposure_duration_min: 120
  cell_passage: 12

layer_provenance:
  event_derived: [contents, total_volume]
  observed: [cell_passage]
```

The contexts for the other groups follow the same shape; `contents[]` differs by which CHEBI refs are present. `CTX-clo-eto` adds an etomoxir entry; `CTX-clo-bhb` adds BHB; `CTX-rot` swaps clofibrate for rotenone; and so on.

### Measurement-Contexts (one per channel)

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml"
kind: measurement-context
id: MCTX-cellrox
title: CellROX Deep Red read on plate LBW-PLATE-001
name: CellROX (Ex/Em 644/665) — plate LBW-PLATE-001
source_ref:
  kind: record
  id: LBW-PLATE-001
  type: labware
instrument_ref:
  kind: record
  id: INSTDEF-GENERIC-PLATE_READER
  type: instrument-definition
readout_def_refs:
  - kind: record
    id: RDEF-PLATE-FAR_RED-ROS     # existing seed (Ex 640 / Em 665)
    type: readout-definition
timepoint: "PT2H"
tags: [ros, cellrox, fluorescence]
```

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml"
kind: measurement-context
id: MCTX-nadh
title: NADH autofluorescence read on plate LBW-PLATE-001
name: NADH autofluorescence (Ex/Em 340/460) — plate LBW-PLATE-001
source_ref:
  kind: record
  id: LBW-PLATE-001
  type: labware
instrument_ref:
  kind: record
  id: INSTDEF-GENERIC-PLATE_READER
  type: instrument-definition
readout_def_refs:
  - kind: record
    id: RDEF-PLATE-NADH-AF
    type: readout-definition
timepoint: "PT2H"
tags: [nadh, autofluorescence, redox]
```

### Context-Roles (hybrid: seeded with prerequisites where known, ad-hoc where not)

`context-role.schema.yaml` allows empty `prerequisites` so well-known roles can be machine-checkable while ad-hoc experimental logic still ships.

**With prerequisites — machine-checkable:**

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/context-role.schema.yaml"
kind: context-role
id: CR-ros-positive-control
title: ROS positive control
name: ROS positive control
description: A context whose contents force ROS production, used to validate the ROS readout channel.
applicable_domains: [ros-assay]
prerequisites:
  - any:
      - has_material:
          ref: { kind: ontology, id: CHEBI:28201, namespace: CHEBI, label: rotenone }
      - has_material:
          ref: { kind: ontology, id: CHEBI:16240, namespace: CHEBI, label: hydrogen peroxide }
expected_outcome:
  direction: increased
  measure: ros_level
  relative_to: vehicle_control
```

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/context-role.schema.yaml"
kind: context-role
id: CR-nadh-rs-positive-control
name: NADH reductive stress positive control
applicable_domains: [redox-assay]
prerequisites:
  - any:
      - has_material:
          ref: { kind: ontology, id: CHEBI:20067, namespace: CHEBI, label: beta-hydroxybutyrate }
      - has_material:
          ref: { kind: ontology, id: CHEBI:28201, namespace: CHEBI, label: rotenone }
expected_outcome:
  direction: increased
  measure: nadh_autofluorescence
  relative_to: vehicle_control
```

**Without prerequisites — ad-hoc escape hatch:**

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/context-role.schema.yaml"
kind: context-role
id: CR-vehicle-baseline
name: Vehicle baseline
description: Ad-hoc baseline role; no machine-checkable prerequisites (any context can play this role).
prerequisites: []
expected_outcome:
  direction: no_change
```

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/context-role.schema.yaml"
kind: context-role
id: CR-test-perturbation
name: Test perturbation
description: Generic experimental arm. Direction depends on the claim under test.
prerequisites: []
```

Roles seeded for this canonical experiment: `CR-vehicle-baseline`, `CR-test-perturbation`, `CR-ros-positive-control`, `CR-ros-negative-control`, `CR-nadh-rs-positive-control`, `CR-nadh-rs-negative-control`.

The prerequisites DSL (`has_material`, `any`, `all`, `has_expected_effect`, …) is intentionally underspecified here. The schema lets prerequisites be free objects (`additionalProperties: true` on each clause), so roles can be authored before the DSL grammar is fully pinned down; verification engines can grow to handle new predicates.

### Claims (atomic, global, reusable)

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/claim.schema.yaml"
kind: claim
id: CLM-ppar-causes-bo
title: PPARα activation increases β-oxidation
statement: PPARα receptor activation increases mitochondrial β-oxidation flux.
subject:
  kind: ontology
  id: GO:0004879                   # ligand-activated transcription factor activity (PPARα-related; illustrative)
  namespace: GO
  label: PPARα activation
predicate:
  kind: ontology
  id: RO:0002411                   # causes (Relation Ontology)
  namespace: RO
  label: causes
object:
  kind: ontology
  id: GO:0006635
  namespace: GO
  label: fatty acid beta-oxidation
relatedIdentifiers:
  - "DOI:10.1234/example-pparalpha-betaoxidation"
status: active
keywords: [ppar, beta-oxidation, lipid-metabolism]
```

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/claim.schema.yaml"
kind: claim
id: CLM-nadh-rs-causes-ros
title: NADH reductive stress increases ROS
statement: Elevated mitochondrial NADH/NAD+ ratio (reductive stress) increases mitochondrial ROS production.
subject:
  kind: ontology
  id: CL:0000000                   # placeholder term; pick correct CHEBI/GO for NADH/NAD+ ratio
  namespace: CL
  label: mitochondrial NADH reductive stress
predicate:
  kind: ontology
  id: RO:0002411
  namespace: RO
  label: causes
object:
  kind: ontology
  id: GO:0006979
  namespace: GO
  label: response to oxidative stress
status: active
keywords: [redox, ros, nadh, mitochondria]
```

Atomic claims for this experiment: `CLM-ppar-causes-bo`, `CLM-bo-causes-nadh-rs`, `CLM-nadh-rs-causes-ros`, `CLM-bhb-causes-nadh-rs`, `CLM-acac-causes-nadh-os`, `CLM-rot-positive-for-ros`, `CLM-fccp-negative-for-ros`, plus optionally an endpoint claim `CLM-ppar-causes-ros` (compound, may be the assertion-level statement only).

**The compound claim "PPARα → ROS *via* β-ox-driven NADH RS" is NOT a single claim.** It is the conjunction of three atomic claims plus blockability inference. The conjunction lives in the mechanism-model record (structurally) and in the experiment-narrative (as prose).

### Mechanism-Model (the lightweight structural wrapper)

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml"
kind: mechanism-model
id: MECH-PPARA-ROS-001
title: PPARα agonism → ROS via β-oxidation–driven NADH reductive stress
description: >
  Working mechanism: PPARα activation upregulates β-oxidation; sustained β-oxidation drives
  the mitochondrial NADH/NAD+ ratio higher (reductive stress); reductive stress triggers
  electron leak from the ETC and produces ROS.

nodes:
  - id: ppara_agonism
    kind: perturbation
    label: PPARα activation
  - id: beta_oxidation
    kind: process
    label: Mitochondrial β-oxidation
  - id: nadh_rs
    kind: redox_state
    label: Mitochondrial NADH reductive stress
  - id: ros
    kind: feature
    label: Mitochondrial ROS

edges:
  - id: E-ppara-to-bo
    claim_ref: { kind: record, id: CLM-ppar-causes-bo, type: claim }
    subject: ppara_agonism
    object: beta_oxidation
  - id: E-bo-to-nadh-rs
    claim_ref: { kind: record, id: CLM-bo-causes-nadh-rs, type: claim }
    subject: beta_oxidation
    object: nadh_rs
  - id: E-nadh-rs-to-ros
    claim_ref: { kind: record, id: CLM-nadh-rs-causes-ros, type: claim }
    subject: nadh_rs
    object: ros

interventions:
  - material_ref:
      kind: ontology
      id: CHEBI:4914
      namespace: CHEBI
      label: etomoxir
    blocks_edge: E-ppara-to-bo     # CPT-1 inhibitor; blocks β-oxidation downstream of PPARα
    expected_effect:
      readout_def_ref: { kind: record, id: RDEF-PLATE-FAR_RED-ROS, type: readout-definition }
      direction: decreased
      relative_to: clofibrate_alone
  - material_ref:
      kind: ontology
      id: CHEBI:15344
      namespace: CHEBI
      label: acetoacetate
    modulates_node: nadh_rs
    expected_effect:
      readout_def_ref: { kind: record, id: RDEF-PLATE-NADH-AF, type: readout-definition }
      direction: decreased
  - material_ref:
      kind: ontology
      id: CHEBI:20067
      namespace: CHEBI
      label: beta-hydroxybutyrate
    modulates_node: nadh_rs
    expected_effect:
      readout_def_ref: { kind: record, id: RDEF-PLATE-NADH-AF, type: readout-definition }
      direction: increased

tags: [ppar, ros, redox, hypothesis]
```

This is what makes the model **machine-traversable**: an agent can answer "what blocks PPARα → ROS?" by looking at `interventions where blocks_edge != null`, and "which assays test the β-ox → NADH RS link?" by looking up `edge E-bo-to-nadh-rs.claim_ref` and finding assertions with the same `claim_ref`.

### Assertions (pre-read predictions; many per plate)

Each assertion is one claim, scoped to specific contexts, with predicted outcome on a specific readout. Pre-read, `outcome.layer = model_derived`; the same record receives `evidence_refs` after the read.

**Assay-validation:**

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/assertion.schema.yaml"
kind: assertion
id: ASN-rot-vs-fccp-cellrox
title: Rotenone increases CellROX vs FCCP (channel validation)
claim_ref: { kind: record, id: CLM-rot-positive-for-ros, type: claim }
statement: >
  On MCTX-cellrox, rotenone-treated wells show higher CellROX signal than FCCP-treated wells.
  This validates the ROS channel.
scope: comparison
context_refs:
  - { kind: record, id: CTX-rot, type: context }
  - { kind: record, id: CTX-fccp, type: context }
roles:
  - role_ref:    { kind: record, id: CR-ros-positive-control, type: context-role }
    context_ref: { kind: record, id: CTX-rot, type: context }
  - role_ref:    { kind: record, id: CR-ros-negative-control, type: context-role }
    context_ref: { kind: record, id: CTX-fccp, type: context }
outcome:
  measure: cellrox_intensity
  direction: increased
  layer: model_derived
confidence: 5
keywords: [channel-validation, ros, cellrox]
```

**Biological mechanism control:**

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/assertion.schema.yaml"
kind: assertion
id: ASN-bhb-vs-acac-nadh
title: BHB shifts NADH redox vs AcAc (biological mechanism control)
claim_ref: { kind: record, id: CLM-bhb-causes-nadh-rs, type: claim }
statement: >
  On MCTX-nadh, BHB-treated wells show higher NADH autofluorescence than AcAc-treated wells,
  consistent with β-HBDH coupling driving NADH reduction with BHB and oxidation with AcAc.
scope: comparison
context_refs:
  - { kind: record, id: CTX-bhb, type: context }
  - { kind: record, id: CTX-acac, type: context }
roles:
  - role_ref:    { kind: record, id: CR-nadh-rs-positive-control, type: context-role }
    context_ref: { kind: record, id: CTX-bhb, type: context }
  - role_ref:    { kind: record, id: CR-nadh-rs-negative-control, type: context-role }
    context_ref: { kind: record, id: CTX-acac, type: context }
outcome:
  measure: nadh_autofluorescence
  direction: increased
  layer: model_derived
confidence: 4
keywords: [mechanism-control, nadh, redox]
```

**Hypothesis tests (each implicitly tests a mechanism-model edge via shared `claim_ref`):**

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/assertion.schema.yaml"
kind: assertion
id: ASN-eto-blocks-clo-ros
title: Etomoxir blocks clofibrate-induced ROS
claim_ref: { kind: record, id: CLM-ppar-causes-bo, type: claim }
statement: >
  Blocking β-oxidation with etomoxir attenuates clofibrate-induced ROS production.
  Corresponds to mechanism intervention `etomoxir blocks_edge E-ppara-to-bo` in MECH-PPARA-ROS-001.
scope: comparison
context_refs:
  - { kind: record, id: CTX-clo, type: context }
  - { kind: record, id: CTX-clo-eto, type: context }
roles:
  - role_ref:    { kind: record, id: CR-test-perturbation, type: context-role }
    context_ref: { kind: record, id: CTX-clo, type: context }
  - role_ref:    { kind: record, id: CR-test-perturbation, type: context-role }
    context_ref: { kind: record, id: CTX-clo-eto, type: context }
outcome:
  measure: cellrox_intensity
  direction: decreased
  layer: model_derived
confidence: 3
keywords: [hypothesis-test, blockability, ppar, beta-oxidation]
```

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/assertion.schema.yaml"
kind: assertion
id: ASN-bhb-potentiates-clo-ros
title: BHB potentiates clofibrate-induced ROS
claim_ref: { kind: record, id: CLM-nadh-rs-causes-ros, type: claim }
statement: >
  Forcing NADH reductive stress with BHB on top of clofibrate increases CellROX signal
  beyond clofibrate alone. Supports NADH-RS as on-path mediator.
scope: comparison
context_refs:
  - { kind: record, id: CTX-clo, type: context }
  - { kind: record, id: CTX-clo-bhb, type: context }
roles:
  - role_ref:    { kind: record, id: CR-test-perturbation, type: context-role }
    context_ref: { kind: record, id: CTX-clo, type: context }
  - role_ref:    { kind: record, id: CR-test-perturbation, type: context-role }
    context_ref: { kind: record, id: CTX-clo-bhb, type: context }
outcome:
  measure: cellrox_intensity
  direction: increased
  layer: model_derived
confidence: 3
keywords: [hypothesis-test, ppar, ros, redox]
```

Counterfactual companion (AcAc should attenuate if mechanism runs via NADH-RS), plus etomoxir-arm specificity assertions on `CTX-eto-bhb`/`CTX-eto-acac` to rule out β-ox-independent BHB→ROS paths.

**One plate carries many assertions.** The rail UX must support N assertions per placement, organized by claim or by mechanism-edge — not a single "knowledge draft."

### Evidence (post-read, schematic)

After both reads complete, each assertion above receives an evidence bundle:

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/evidence.schema.yaml"
kind: evidence
id: EVD-eto-blocks-clo-ros
title: Evidence — etomoxir blocks clofibrate ROS (MCTX-cellrox)
supports:
  - { kind: record, id: ASN-eto-blocks-clo-ros, type: assertion }
sources:
  - type: result
    ref: { kind: record, id: RES-cellrox-clo, type: result }
  - type: result
    ref: { kind: record, id: RES-cellrox-clo-eto, type: result }
  - type: context
    ref: { kind: record, id: CTX-clo, type: context }
  - type: context
    ref: { kind: record, id: CTX-clo-eto, type: context }
  - type: context
    ref: { kind: record, id: MCTX-cellrox, type: measurement-context }
  - type: event_graph
    ref: { kind: record, id: EVG-PLATE-001, type: event-graph }
  - type: file
    ref: { kind: record, id: FIL-PLATE-001-CELLROX-CSV, type: file }
quality:
  effect_size:
    fold_change: 0.62
    mean_difference_rfu: -2400
    n_per_group: 3
  significance:
    p_value: 0.018
    method: welch_t_test
  qc:
    channel_pos_neg_control_zprime: 0.71
    passed_qc: true
```

The same shape applies to every assertion. Pos/neg control evidence bundles (`EVD-rot-vs-fccp-cellrox`) carry `quality.channel_pos_neg_control_zprime` and gate the rest of the plate.

### Experiment-narrative (the story)

```yaml
$schema: "https://computable-lab.com/schema/computable-lab/experiment-narrative.schema.yaml"
kind: experiment-narrative
recordId: EXPNAR-PPARA-ROS-001
experimentId: EXP-PPARA-ROS-001
title: Does PPARα cause ROS via β-ox-driven NADH reductive stress?
summary: >
  Testing whether PPARα agonism (clofibrate) produces ROS, and whether the mechanism runs
  through β-oxidation–driven mitochondrial NADH reductive stress. Plate combines β-ox blockade
  (etomoxir) with redox-state modulators (BHB, AcAc) on top of clofibrate to dissect the chain.
state: draft
primaryClaimIds:
  - CLM-ppar-causes-bo
  - CLM-bo-causes-nadh-rs
  - CLM-nadh-rs-causes-ros
tags: [ppar, ros, redox, mechanism]
entries:
  - at: "2026-05-24T09:00:00-04:00"
    ref: { kind: record, id: MECH-PPARA-ROS-001, type: mechanism-model }
    role: hypothesis
    note: Mechanism under test.
  - at: "2026-05-24T09:05:00-04:00"
    ref: { kind: record, id: LBW-PLATE-001, type: labware }
    role: plate_setup
  - at: "2026-05-24T09:10:00-04:00"
    ref: { kind: record, id: ASN-rot-vs-fccp-cellrox, type: assertion }
    role: channel_validation
    note: Required for CellROX channel to be trusted.
  - at: "2026-05-24T09:11:00-04:00"
    ref: { kind: record, id: ASN-bhb-vs-acac-nadh, type: assertion }
    role: mechanism_control
  - at: "2026-05-24T09:12:00-04:00"
    ref: { kind: record, id: ASN-eto-blocks-clo-ros, type: assertion }
    role: hypothesis_test
    causedBy: [MECH-PPARA-ROS-001]
  - at: "2026-05-24T09:13:00-04:00"
    ref: { kind: record, id: ASN-bhb-potentiates-clo-ros, type: assertion }
    role: hypothesis_test
    causedBy: [MECH-PPARA-ROS-001]
```

Entries grow as the experiment progresses — additional assertions, the planned read event, the resulting measurements, the evidence bundles.

## What queries become tractable

| Question | Path |
|---|---|
| What blocks this mechanism? | `MECH-PPARA-ROS-001.interventions where blocks_edge != null` → etomoxir |
| Which assays test the β-ox → NADH RS link? | `edge E-bo-to-nadh-rs.claim_ref` → `CLM-bo-causes-nadh-rs` → `assertions where claim_ref == CLM-bo-causes-nadh-rs`, then join to `measurement-context` via the assertion's contexts |
| Is the CellROX channel validated for this plate? | For `MCTX-cellrox`, find assertions with `CR-ros-positive-control` and `CR-ros-negative-control` roles; check `evidence.quality.channel_pos_neg_control_zprime` |
| What contexts contain rotenone? | `contexts where contents[].material_ref.id == CHEBI:28201` |
| Which assertions are pre-registered predictions vs evaluated? | Predictions: `outcome.layer == model_derived` and `evidence_refs is empty`. Evaluated: `evidence_refs is non-empty` |

## Authoring guidance

- **One claim = one triple.** Decompose mechanism chains into atomic claims; assemble in a `mechanism-model`. Never let a claim's subject or object reference another claim.
- **Pick predicate refs from the Relation Ontology** (RO:0002411 *causes*, RO:0002429 *positive regulation of*, etc.) where it covers; fall back to local CL predicates only where RO is missing.
- **One assertion = one claim, in one or more contexts.** For directional comparisons ("X increases Y"), use `scope: comparison` with both the baseline and the perturbation as `context_refs`. For "this context exemplifies role R" (assay validation), use `scope: single_context`.
- **Set `outcome.layer = model_derived` for predictions.** The same assertion stays put once evidence arrives — observed effect lives in `evidence.quality`, not in a re-derived assertion outcome.
- **Anchor the readout in the assertion's `outcome.measure`** (e.g. `cellrox_intensity`, `nadh_autofluorescence`), and let the join to the measurement-context happen via well/role bookkeeping. Multiple assertions can share a measurement-context; one assertion never has more than one readout.
- **Build a mechanism-model record before you author hypothesis-test assertions.** The rail can then pre-fill `claim_ref` from the chosen edge, and pre-read validation can flag missing blockability tests.
- **Context-roles with prerequisites are worth the up-front cost.** Once authored, every future plate that anchors `CR-ros-positive-control` gets free machine-verification that the role is plausibly satisfied by the wells' contents.

## Open questions tracked in the implementation plan

- Final shape of the prerequisites DSL (`has_material`, `any`, `all`, `has_expected_effect`, `has_material_role`, ...).
- Whether to surface "endpoint claims" (e.g. `CLM-ppar-causes-ros`) explicitly or treat them as derived from atomic edges + the mechanism-model's chain.
- Where `outcome.layer = observed` outcomes live once evidence arrives — on the assertion (mutating its `outcome`) or only on evidence (immutable assertion).

These are open in the model itself and worth revisiting as the knowledge layer evolves.
