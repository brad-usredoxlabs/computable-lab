# Computable Lab — Data Model

> Canonical entities, relationships, and lifecycle states.  
> Schemas: `schema/` (141 `.schema.yaml` files).  
> Verified against commit: `af32af9`

---

## Schema Files by Domain

| Domain | Count | Files |
|--------|-------|-------|
| **workflow/** | 65 | `protocol`, `local-protocol`, `planned-run`, `event-graph`, `plate-event*`, `execution-*`, `graph-component*`, `labware-definition`, `plate-layout-template`, `procurement-manifest`, etc. |
| **lab/** | 31 | `material`, `material-spec`, `material-instance`, `aliquot`, `labware`, `labware-instance`, `measurement`, `measurement-context`, `well-group`, `well-role-assignment`, `recipe`, `calibration-record`, `instrument`, etc. |
| **core/** | 18 | `record` (union), `common` (FAIRCommon mixin), `lifecycle.meta`, `datatypes/ref`, `datatypes/plate-event`, `context`, `collection`, `context-snapshot`, `lab-state`, etc. |
| **knowledge/** | 7 | `claim`, `assertion`, `evidence`, `context-role`, `mechanism-model`, `conversation`, `derivation-model` |
| **studies/** | 6 | `study`, `experiment`, `run`, `run-timeline`, `artifact`, `experiment-narrative` |
| **ingestion/** | 6 | `ingestion-job`, `ingestion-candidate`, `extraction-spec`, etc. |
| **identity/** | 3 | `user`, `group`, `access-policy` |
| **bio/** | 2 | `sequence`, `sequence-interval` |
| **registry/**, **ui/**, **lint/** | 4 | compile-pipeline, derivation, ui-v1, lint-v1 |

---

## Core Entity Table

| Entity | Schema | Key Fields | Relationships |
|--------|--------|------------|---------------|
| **Study** | `studies/study.schema.yaml` | `recordId`, `title`, `shortSlug`, `state` | ← Experiment.studyId, Artifact.studyId |
| **Experiment** | `studies/experiment.schema.yaml` | `recordId`, `studyId`, `title`, `state` | → Run.experimentId |
| **Run** | `studies/run.schema.yaml` | `recordId`, `experimentId`, `studyId`, `status` | → EventGraph.runId, Evidence sources |
| **Artifact** | `studies/artifact.schema.yaml` | `recordId`, `studyId`, `experimentId`, `artifactKind` | Scoped to Study/Experiment |
| **Material** | `lab/material.schema.yaml` | `id`, `name`, `domain`, `status`, `lifecycleId` | → MaterialSpec.material_ref |
| **MaterialSpec** | `lab/material-spec.schema.yaml` | `id`, `material_ref`, `formulation_kind`, `status` | → MaterialInstance, Aliquot |
| **MaterialInstance** | `lab/material-instance.schema.yaml` | `id`, `material_ref`, `material_spec_ref`, `vendor_product_ref` | → Aliquot.parent_material_instance_ref |
| **Aliquot** | `lab/aliquot.schema.yaml` | `id`, `material_spec_ref`, `parent_aliquot_ref`, `source_lot_ref` | Execution-bound; consumed by PlateEvents |
| **Protocol** | `workflow/protocol.schema.yaml` | `recordId`, `protocolLayer: "universal"`, `steps` | → LocalProtocol.inherits_from |
| **LocalProtocol** | `workflow/local-protocol.schema.yaml` | `recordId`, `protocolLayer: "lab"`, `inherits_from`, `status` | → PlannedRun.protocolRef |
| **PlannedRun** | `workflow/planned-run.schema.yaml` | `recordId`, `protocolLayer: "lab"`, `sourceType`, `sourceRef`, `state` | Binds protocol roles → labware/materials |
| **EventGraph** | `workflow/event-graph.schema.yaml` | `recordId`, `id`, `runId`, `protocolId`, `events[]`, `labwares[]` | → Context.event_graph_ref |
| **PlateEvent** | `workflow/events/plate-event.schema.yaml` | `eventId`, `event_type`, `details`, `at`, `t_offset` | 15 verb types: add_material, transfer, mix, read, etc. |
| **Claim** | `knowledge/claim.schema.yaml` | `id`, `statement`, `subject`, `predicate`, `object` | → Assertion.claim_ref, MechanismModel edges |
|
| **Assertion** | `knowledge/assertion.schema.yaml` | `id`, `claim_ref`, `scope`, `context_refs[]`, `roles[]` | → Evidence.supports |
| **Evidence** | `knowledge/evidence.schema.yaml` | `id`, `supports[]`, `sources[]`, `status` | Links back to Assertion/Claim |
| **Context** | `core/context.schema.yaml` | `id`, `subject_ref`, `event_graph_ref`, `contents[]` | Derived from EventGraph replay |
| **ContextRole** | `knowledge/context-role.schema.yaml` | `id`, `name`, `applicable_domains`, `prerequisites[]` | Referenced by Assertion.roles |
| **MechanismModel** | `knowledge/mechanism-model.schema.yaml` | `id`, `title`, `nodes[]`, `edges[]` | Nodes → typed concepts; Edges → claim_refs |
| **Labware** | `lab/labware.schema.yaml` | `recordId`, `name`, `labwareType`, `format` | → LabwareInstance |
| **LabwareInstance** | `lab/labware-instance.schema.yaml` | `recordId`, `labware_ref` | Used in PlannedRun / EventGraph |

---

## Relationship Chains

```
Study ──contains──> Experiment ──contains──> Run ──generates──> EventGraph ──replays──> Context
    │                        │                           │
    └── Artifact (PDF, protocol-draft, writeup)          └── PlateEvents (add_material, read, etc.)

Protocol (universal) ──implements──> LocalProtocol (lab) ──compiles──> PlannedRun
                                                        │
                                                        └──> EventGraph ──> Execution

Material (concept) ──specified as──> MaterialSpec ──instantiated──> MaterialInstance
                                                                        └──> Aliquot (execution-bound)

Claim ──asserted in──> Assertion ──tested by──> Evidence
   (reusable)           (scoped to Context)        (links to Run/EventGraph results)

MechanismModel ──chains──> Claims ──linked──> Evidence
   (typed nodes + edges)      (atomic triples)    (lab/literature support)
```

---

## Material Hierarchy (with lifecycle)

```
Material (concept)
  status: proposed → in_review → active → rejected | deprecated
  lifecycleId: "lab-vocabulary-control"
  ↓ material_ref
MaterialSpec (formulation: single_active | defined_composition | complex_composition | biological_preparation)
  status: proposed → in_review → active → rejected | deprecated
  ↓ material_spec_ref
MaterialInstance (concrete: bottle, flask, stock)
  vendor_product_ref, parent_material_instance_ref
  ↓ parent_material_instance_ref
Aliquot (execution-bound physical unit)
  source_lot_ref, parent_aliquot_ref
```

---

## Protocol Lifecycle

```
Protocol (protocolLayer: "universal")
  — reusable, declarative recipe
  — no concrete labware, no timestamps
  ↓ inherits_from
LocalProtocol (protocolLayer: "lab")
  — lab-specific: equipment bindings, parameter refinements, material substitutions
  — status: draft → review → approved → superseded
  ↓ protocolRef
PlannedRun (protocolLayer: "lab")
  — binds abstract roles → concrete labware instances, materials, instruments
  — state: planned → started → in_progress → complete | failed
  ↓ runId
EventGraph
  — events[] (PlateEvents: add_material, transfer, mix, incubate, read, harvest…)
  — labwares[] (Labware instances with deck_layout / plate_layout_template)
  ↓ replay
Context (derived state from event graph)
```

---

## Knowledge Layer

```
Claim (atomic triple: subject — predicate — object)
  status: active | retracted
  ↓ claim_ref
Assertion (claim evaluated in scope)
  scope: single_context | comparison | series | global
  context_refs[] → Context records
  roles[] → ContextRole bindings
  ↓ supports[]
Evidence (bundle: sources → assertion)
  sources: event_refs, measurement_refs, publication_refs
  status: active | retracted
  quality: { qc notes }

ContextRole (reusable role definition)
  prerequisites[] (predicate-DSL machine-checkable clauses)
  expected_outcome

MechanismModel (typed-node graph)
  nodes[]: { id, kind: perturbation|process|state|redox_state|feature|endpoint }
  edges[]: { from, to, claim_ref, type: activates|inhibits|produces|consumes }
```

---

## Lifecycle Fields (cross-cutting)

All records mix in `FAIRCommon` (`core/common.schema.yaml`): `id`, `title`, `description`, `license`, `relatedIdentifiers`, `keywords`, `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`.

Lifecycle state machines (`core/lifecycle.meta.schema.yaml`): declarative transitions with `states[]` (initial/terminal flags) and `transitions[]` (from/to/role). Records carry `lifecycleId` pointing to a lifecycle definition and `state`/`status` fields as phase-dependent.
