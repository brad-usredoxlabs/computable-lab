# 50 — Protocol & Run Lifecycle

Status: Authoritative
Date: 2026-04-17
Depends on: 10-charter, 20-event-graph-ir, 30-context, 40-knowledge

---

## 1. Purpose

Biology labs produce results by binding three things together: a **recipe** (what to do), a **setting** (where and with what), and an **execution** (what was actually done). This spec names the three biologist-facing lifecycle layers, maps each layer to the record kinds that implement it, and names the two new kinds and targeted extensions required to complete the picture.

Unlike 20–40, the lifecycle domain is **already heavily implemented**. This spec is mostly a statement of deltas against the existing schemas in `schema/workflow/` and the existing services in `server/src/compiler/protocol/`, `server/src/execution/`, and `server/src/capabilities/`. Where a concept already exists in a usable form, this spec preserves it and says so. Only genuine gaps are new design.

## 2. The biologist-facing three layers

```
┌────────────────────────────────────────────────────────────────────┐
│  GLOBAL  — platform-agnostic recipe                                │
│  e.g., Thermo DCFDA kit PDF protocol.                              │
│  "Spin at 15,000 × g for 5 min."                                   │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  LOCAL  — lab-specific realization of the global recipe            │
│  "We spin in the Eppendorf 5810R, which lives in the 4°C walk-in,  │
│   so our spins are cold whether or not the protocol specifies it." │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  ACTUAL  — this specific run, performed on a specific day          │
│  "Angel did it on 2026-04-17; centrifuge ran 08:34→08:39."         │
└────────────────────────────────────────────────────────────────────┘
```

The three layers are the user's mental model. The implementation maps each to one or more existing record kinds plus, in the case of **local**, one new kind.

## 3. Map: layers to record kinds

| Biologist-facing layer | Record kind(s) | Status |
|---|---|---|
| Global protocol | `protocol` (`protocolLayer: "universal"`) | Exists; add `source` field |
| Local protocol | `local-protocol` (`protocolLayer: "lab"`) | **New kind** |
| Planned run | `planned-run` | Exists; add `localProtocolRef`; `protocolCompilation` becomes a view onto the referenced local-protocol |
| Actual run — canonical truth | `event-graph` (materialized) | Exists (20) |
| Actual run — operational envelope | `execution-run` | Exists; preserve as-is |
| Actual run — study-session header | `studies/run` | Exists; preserve as-is |
| Deviations from plan | `execution-deviation` | Exists; add `severity`, `environmental` |
| Deviation evidence | `execution-observation` | Exists; preserve |
| Remediation approvals | `execution-remediation-decision` | Exists; preserve |
| Ops-critical alerting | `execution-incident` | Exists; preserve |
| Robot-workcell configuration | `execution-environment` | Exists; add `lab_state_refs` for equipment-mount facts |
| Lab-level time-varying facts | `lab-state` | **New kind** |
| Compile-time: event-graph + env → plan | `execution-plan` | Exists; preserve as compile artifact |
| Compile-time: per-platform lowered | `robot-plan` | Exists; preserve as compile artifact |

Everything in this spec elaborates one row in this table.

## 4. Global protocol

The existing `protocol` record kind (`schema/workflow/protocol.schema.yaml`, `protocolLayer: "universal"`) is the global layer unchanged. Its existing shape — ordered `steps[]`, abstract `roles` (labware / material / instrument / context / layoutTemplate / library), declarative `parameters`, `producedArtifacts`, `executionProfiles`, `reviewerRef` / `approverRef` — remains authoritative.

### 4.1 One addition: `source`

```
source:
  type: vendor | literature | internal | derived
  ref:  <publication-ref | document-ref | event-graph-ref>
```

`derived` is used for protocols produced by assay-definition promotion (30 §12.2), where `ref` points at the source event-graph.

### 4.2 Phase 1 scope

Global protocols enter the system primarily by AI-assisted ingestion of vendor PDFs and literature (80) — this path already exists via `server/src/protocol/ProtocolExtractionService.ts` and `server/src/protocol/ProtocolImportService.ts`. No rich WYSIWYG editor in Phase 1; curation is via focused form widgets and YAML review.

## 5. Local protocol (new kind)

`local-protocol` is a **new first-class record kind** that makes the lab layer of the existing universal→lab compilation a persistent, versionable, citable record.

### 5.1 Why it's a new kind, not more fields on `planned-run`

Today, the universal→lab compilation lives inside `planned-run.protocolCompilation` as an embedded result of `ProtocolCompiler.compile()`. Every planned-run re-derives the same lab-specific decisions ("our fuge is in the cold room," "we substitute DCFDA-Thermo-A123 for the abstract redox dye role") from scratch.

Making local-protocol a standalone kind buys:

- **Amortized lab decisions.** Decide "our fuge spins are cold" once per lab+assay, reuse across every planned-run.
- **Lab-state anchoring.** A local-protocol can declare `lab_state_refs: [LST-fuge-location]`; when the fuge moves, the compiler knows which local-protocols just became stale.
- **Citable, versionable, supersedable** at the lab layer independently of any single run.
- **Diff-viewable** against the global protocol it realizes.

### 5.2 Shape

```
LPR-<id>
  kind: local-protocol
  protocolLayer: "lab"
  inherits_from: <protocol-ref>              # required; the global protocol
  lab_state_refs: [<LST-...>, ...]           # environmental assumptions (see §10)
  overrides:
    bindings: [ ... ]                         # which concrete stocks/equipment satisfy which global role
    parameters: [ ... ]                       # parameter values resolved at the lab layer
    substitutions: [ ... ]                    # material-class-level substitutions (§5.4)
    timing_policies: [ ... ]                  # how "incubate 30 min" maps to our incubator's ramp
    tip_policies: [ ... ]                     # tip reuse conventions per pipetting family
  supersedes?: <LPR-...>                      # append-only versioning
  status: draft | active | superseded | retracted
  notes?: string
```

### 5.3 Inheritance semantics

A local-protocol's `inherits_from` edge resolves to a specific version of a global protocol. If the global protocol is superseded, the local-protocol receives a cascade diagnostic (same mechanism as 40 §7.2) but is **not** automatically updated. Biologist reviews the diff, authors a new local-protocol version pointing at the new global version.

### 5.4 Substitutions

A substitution says: "wherever this global protocol calls for a member of material-class X, we use this specific stock/spec."

```
substitutions:
  - role: redox_sensitive_dye
    material_ref: MSP-DCFDA-Thermo-A123
    rationale: "Standard DCFDA stock; prepared in-house from the Thermo kit."
```

Structural validity is checked using the context-role predicate DSL (40 §4.3): the substituted material must satisfy the class the global protocol declared. Invalid substitutions are **errors**, not warnings.

### 5.5 Structured overrides, not structural rewrites

`overrides` is strictly additive with respect to the global protocol's shape. A local-protocol cannot add, remove, reorder, or retype steps. Same-verbs-same-order is enforced here — see §6.

### 5.6 Implementation: refactor the existing ProtocolCompiler

`server/src/compiler/protocol/ProtocolCompiler.ts` today emits a `ProtocolCompilerResult` with `sourceLayer: 'universal', targetLayer: 'lab'` that gets embedded in `planned-run.protocolCompilation`. The refactor:

1. The compiler emits a **`local-protocol` record** as its persistent artifact.
2. `planned-run.protocolCompilation` becomes a materialized view onto the referenced `local-protocol`, not an embedded re-computation.
3. The existing compiler's diagnostic set (`ProtocolCompilerDiagnostic`, `ProtocolCompilerRemediation`) is preserved.
4. `planned-run` gains a `localProtocolRef` field; `sourceType` enum gains `local-protocol`.

This is a migration, scoped as part of Phase 1 for the ROS workflow.

## 6. Structural correspondence: "same verbs, same order"

The load-bearing invariant of the lifecycle:

> **For every global → local → planned-run → executed event-graph chain, the ordered sequence of event verbs must match exactly at every level, with the sole permitted structural elaboration being multi-channel fan-out (20 §7) and the compile-time expansion of macro steps into their primitive events.**

This is the resolution of C17 from the planning session.

### 6.1 What it enables

- **Deviation computation is positional.** The Nth executed event `actualizes` the Nth planned event; verb mismatch is a deviation, not a semantic puzzle.
- **Re-compilation is mechanical.** When a global or local-protocol version changes, the compiler can align downstream planned-runs by position.
- **Bindings are positional.** A planned-run's Nth event binds the Nth step of the local-protocol, which in turn maps to the Nth step of the global protocol.
- **Promotion is well-defined** (30 §12). An assay-definition promoted from an executed event-graph is a global protocol whose step shape is the run's event shape minus concrete bindings.

### 6.2 How it's checked

A **structural-correspondence pass** runs at local-protocol-compile and at run-plan-compile:

1. Walk the global protocol's `steps[]` in order.
2. Walk the local-protocol's steps (or the planned-run's planned events) in order.
3. At each position, require verb equality. Macros in the global protocol must expand into an exact primitive sequence per the macro definition.
4. For multi-channel expansions, require the multi-channel event's wells to align with the global step's well-selector.
5. On mismatch, emit a structural **error** (not a warning). No graceful partial correspondence.

### 6.3 What is *not* constrained

- **Parameters** (volume, duration, temperature) may change across layers subject to declared constraints.
- **Bindings** to concrete instances may change.
- **Substitutions** of material-class members may change subject to §5.4.
- **Tip and timing policies** may change.

Verb and order are the minimal invariant; everything else is a refinement knob.

### 6.4 If a lab needs a different structure

It is authoring a **sibling global protocol**, not a variant local-protocol. The "we do it differently" case is a branch at the global layer, not a rewrite at the local layer.

## 7. Planned run

The existing `planned-run.schema.yaml` is preserved. Its role is unchanged: instance-level binding of a local-protocol to concrete material-instances, labware-instances, operators, and instruments, with compiler-emitted diagnostics and remediation.

### 7.1 Changes

- **Required**: `localProtocolRef` (new). A planned-run must reference a local-protocol; it cannot directly point at a global protocol.
- **`sourceType`** enum gains `local-protocol` (today: `protocol | event-graph`).
- **`protocolCompilation`** block becomes a **materialized view** onto the referenced local-protocol, not an independent computation.

### 7.2 What stays

- `bindings: { labware, materials, contexts, layoutTemplates, libraries, instruments, parameters }` — unchanged.
- `deckLayout`, `pipetteConstraints`, `executionPlan` — unchanged.
- `protocolCompilation.diagnostics` / `remediationOptions` shape — unchanged (the existing shape is already the right carrier for chatbox/quick-fix UX; see §12).
- State enum (`draft | ready | executing | completed | failed`) — unchanged.

### 7.3 Capability matching — already exists

The "can this rotor spin at 15,000 × g with this labware?" check is `server/src/capabilities/EquipmentCapabilityService.ts` consuming `equipment-capability` records. No new commitment. This spec confirms that path is authoritative for capability matching and that Phase 1 exercises it via the ROS workflow.

### 7.4 AI-proposed plans — already exists

`server/src/execution/planning/` and `server/src/mcp/tools/aiPlanningTools.ts` already propose candidate planned-runs. The load-bearing principle: **ranking is advisory; correctness is authoritative.** The compiler refuses invalid plans; it does not pick among valid ones. Ranking lives above the compiler boundary.

## 8. Actual run: what happened

The actual-run layer is **not a new record kind**. It is a composite of three existing records, each with a distinct role.

| Record kind | Role |
|---|---|
| `event-graph` | The canonical truth of what occurred. Ordered events, resource nodes, edges (20). |
| `execution-run` | Operational envelope. Attempt counters, lease ownership, external runtime IDs, status transitions, failure classification. Points at the materialized event-graph via `materializedEventGraphId`. |
| `studies/run` | Study-session header. Registers this execution within an experiment/study context. Points at the active event-graph via `methodEventGraphId`. |

The ordering is:

```
planned-run ──execute──▶ execution-run ──materialize──▶ event-graph
                              │                              │
                              └─ optionally registered by ───┴─▶ studies/run
```

### 8.1 What this spec does with these kinds

**Nothing by way of schema changes.** Their existing shapes are preserved. This spec's contribution is to name their respective roles so downstream consumers stop looking for a single "executed-run" kind that doesn't need to exist.

### 8.2 The `actualizes` edge

Every event in the materialized event-graph carries an `actualizes` edge (20 §2.2) to the corresponding planned event. Structural-correspondence (§6) makes this mapping positional. Mismatches are deviations (§9).

### 8.3 Authoring paths in Phase 1

1. **Robot/instrument ingestion** — `ExecutionMaterializer` / `ExecutionPoller` stack already consumes run logs and materializes event-graphs.
2. **Post-hoc authoring** — biologist records events in YAML or the UI after the fact, binding to the planned-run.
3. **Bench-side real-time logging** — record shape supports it; UI deferred.

## 9. Deviations: keep the existing four-record stack

The existing operational stack is coherent. **No unification.** Four records, four roles:

| Record | Role |
|---|---|
| `execution-deviation` | Authoritative "this differed from plan." |
| `execution-observation` | Append-only evidence (step-outcome / runtime-note / measurement); may link to a deviation. |
| `execution-remediation-decision` | Accept/reject approval workflow for a proposed remediation. |
| `execution-incident` | Ops-critical alerting (adapter_health / retry_exhausted / runtime_failure). Fires alerts, not analytics. |

### 9.1 Two targeted changes to `execution-deviation`

1. **Add required `severity`**: `minor | significant | major` — the **biologist-relevance axis**, distinct from `execution-incident.severity` (ops urgency).
   - `minor`: within declared tolerance; no expected material change to downstream results. (Example: incubation ran 29 min instead of 30.)
   - `significant`: outside tolerance but run remains analyzable. (Example: different DCFDA lot than planned.)
   - `major`: invalidates the run or flags downstream assertions as unreliable. (Example: wrong centrifuge speed by 5×.)
2. **Add `environmental`** to the `deviationType` enum (today: `remediation | operator | runtime`). Used when lab-state changed during execution in a way that affected the run.

### 9.2 Why biologist-severity is distinct from incident-severity

`execution-incident.severity` (`info | warning | critical`) is ops alerting — "is this firing a page." `execution-deviation.severity` (`minor | significant | major`) is biological consequence — "does this change what the data means." The same run can have a `critical` incident (the adapter dropped connection) and a `minor` deviation (the connection drop caused a 30-second pause). They answer different questions.

## 10. Lab-state (new kind)

`lab-state` is a **new first-class record kind**: time-varying declarative records capturing facts about the lab that protocols depend on.

### 10.1 Why it's a new kind

Labs have facts that are neither a global-protocol concern nor a per-run concern:

- The Eppendorf 5810R lives in the 4°C walk-in this month.
- The SpectraMax-7 has the fluorescence filter cube installed today.
- We have 47 mL of DCFDA-Thermo-A123 stock on hand.
- The 37°C incubator has been running at 36.9°C since last Monday (verified by external probe).

These condition what protocols are runnable, what capabilities are available, and what diagnostics mean. Without a home, they live in someone's head.

### 10.2 Lab-state vs execution-environment

`execution-environment` is robot-workcell-specific configuration for robot-plan compilation (deck slots, tools, labware_registry, constraints). It answers: "how is this robot assembled right now?"

`lab-state` is lab-level facts affecting the whole lab, not just robots. It answers: "what's true about our lab right now that a protocol might depend on?" This includes manual-bench equipment (the fuge in the fridge), facility-level conditions (walk-in temperature), and stock levels — none of which belong in an execution-environment.

Where they overlap — equipment mounts, tool configuration — `execution-environment` **references** relevant `lab-state` records (new field: `lab_state_refs[]`) rather than duplicating the fact. Lab-state is the single source of truth for time-varying hardware reality; execution-environment assembles those facts for robot compilation.

### 10.3 Shape

```
LST-<id>
  kind: lab-state
  subject_type: equipment | equipment-mount | facility-zone | stock | ambient | operator-state
  subject_ref: <ref>
  attribute: string                  # e.g., "location", "mounted_rotor", "stock_volume", "ambient_temperature"
  value: <attribute-specific>
  valid_from: <iso-datetime>
  valid_until?: <iso-datetime>
  supersedes?: <LST-...>             # append-only chain
  asserted_by: <operator-ref>
  evidence_ref?: <EVD-...>
  status: active | superseded | retracted
  notes?: string
```

The set of valid `(subject_type, attribute)` pairs is declarative, lives in a registry at `schema/registry/lab-state-attributes/`, and is versioned — adding a new lab-state flavor is YAML authoring, not TypeScript.

### 10.4 Phase 1 seed attributes

| subject_type | attribute | value shape |
|---|---|---|
| equipment | location | `{ zone_ref, position?, notes? }` |
| equipment-mount | mounted_rotor | `<rotor-ref>` |
| equipment-mount | mounted_pipette | `<pipette-ref>` |
| stock | volume | `{ value, unit }` |
| ambient | temperature | `{ value, unit }` |
| facility-zone | temperature | `{ value, unit }` |

### 10.5 The cascade

When a lab-state record is superseded, the compiler:

1. Walks `active` records with a `lab_state_ref` to the superseded record.
2. Emits a cascade diagnostic on each dependent local-protocol: "one of your lab-state assumptions just changed; re-compile or re-author before using this again."
3. Emits a further cascade diagnostic on any `draft`/`ready` planned-run that points at an affected local-protocol.
4. Does **not** mutate any of these records. The biologist authors new versions.

This reuses the retraction-cascade walker from 40 §7.2. Phase 1 delivers lab-state cascade as the prototype of the general cascade mechanism.

### 10.6 Mid-run lab-state changes

If during execution lab-state differs from what the local-protocol assumed (e.g., the fuge was moved and nobody updated the record), the result is an `environmental` deviation on the run, a new lab-state record with `supersedes` recording the correction, and cascade diagnostics on other affected protocols.

### 10.7 What lab-state is not

- Not scheduling. "Is Alice using the fuge at 2pm?" is out of scope (10 §3).
- Not a context. Contexts (30) describe subject state derived from events. Lab-state is the lab's own state, not derived from events.

## 11. Compile-time derived artifacts

`execution-plan` and `robot-plan` are **not biologist-facing lifecycle stages**. They are compile-time artifacts generated downstream of `planned-run` to target a specific execution backend.

| Artifact | Generated from | Role |
|---|---|---|
| `execution-plan` (`protocolLayer: "execution-ready"`) | planned-run's `event-graph` + a specific `execution-environment` | Physical placements, tool-bindings, tip/channelization/batching strategy. Platform-family-generic. |
| `robot-plan` | `execution-plan` | Per-platform lowered artifact (deckSlots, pipettes, executionSteps). Platform-specific (Opentrons, Integra, pylabrobot). Non-FAIR, may be cached. |

Analogy: a C compiler produces `.o` then `.exe`. The biologist authors C; doesn't author `.o`. Same here. Preserve both kinds as-is.

Both are generated by existing services (`server/src/execution/compilers/`, `server/src/execution/adapters/`). No schema changes.

## 12. Planning and ambiguity UX

Ambiguity resolution at lifecycle compile points (role-binding, material-substitution, lab-state-cascade) follows the general UX commitment in 10 §2.5:

- **Chatbox primary** for open-ended or biology-judgment resolutions.
- **Clickable quick-fix** for enumerable single-select cases.

The data carrier is the existing `protocolCompilation.remediationOptions[]` on planned-run. No schema work needed for the compiler output. UI delivery of chatbox is Phase 2; quick-fixes are Phase 1.

## 13. The ROS workflow in the lifecycle

For the canonical ROS positive control workflow (10 §4):

**Global protocol** — `PRT-ros-positive-control-cccp-v1` (`protocolLayer: "universal"`), extracted from the Thermo DCFDA kit PDF via existing ingestion (80). Declares abstract roles: `target_cell_line`, `positive_inhibitor`, `vehicle_solvent`, `redox_sensitive_dye`, `plate_reader`, `microplate_labware`. Steps: create → seed → incubate → add-inhibitor → add-vehicle → incubate → add-dye → incubate → read. `source.type: vendor`, `source.ref: DOC-thermo-dcfda-kit`.

**Local protocol** — `LPR-ros-hepg2-spectramax-v1`:
- `inherits_from: PRT-ros-positive-control-cccp-v1`.
- `lab_state_refs`: `LST-spectramax-filter-cube`, `LST-dcfda-stock-location`.
- `overrides.substitutions`: `target_cell_line` → `MI-HEPG2-P47`; `vehicle_solvent` → `MSP-DMSO-Ultra`; `redox_sensitive_dye` → `MSP-DCFDA-ThermoA123`; `plate_reader` → `INS-SPECTRAMAX-7`; `microplate_labware` → `LWD-greiner-655087`.
- `overrides.parameters`: seed 1×10⁵ cells/mL, incubations 24h + 30min + 30min, CCCP 1 µM, DCFDA 10 µM, read ex485/em535.
- Structural-correspondence pass against global protocol: ✓.

**Planned run** — `PLR-ros-run-2026-04-17`:
- `localProtocolRef: LPR-ros-hepg2-spectramax-v1`.
- `sourceType: local-protocol`.
- Bindings: plate `LWI-plate-2026-04-17-001`, operator `PRS-angel`, CCCP aliquot `ALQ-CCCP-10mM-004`, DCFDA aliquot `ALQ-DCFDA-1mM-017`.
- Context-role bindings: CCCP wells → `CR-positive-control-for-ros`, vehicle wells → `CR-vehicle-control-for-ros`.
- Existing `ExecutionCapabilitiesService` confirms SpectraMax-7 supports `read` on greiner-655087 at ex485/em535: `protocolCompilation.status = ready`.

**Execution** — operator executes:
- `execution-run` `EXR-001` tracks the operational envelope; points at `EG-001` (the materialized event-graph) via `materializedEventGraphId`.
- Event-graph EG-001 holds EVT-001…EVT-008 per 20 §9; each event carries `actualizes` edge to the corresponding planned event.
- `studies/run` `RUN-042` (under experiment `EXP-ros`) carries `methodEventGraphId: EG-001`, registering this as a study-session of the ROS assay.

**Angel's real run** — centrifuge step ran 08:34→08:39 on 2026-04-17 (hypothetically, given Angel's usual schedule). The second incubation ran 32 minutes instead of 30 because the incubator door was briefly opened. `execution-deviation` `DEV-001` recorded: `deviationType: operator, severity: minor, reason: "incubator door opened briefly; ambient exposure ~30s"`. Assertions from 40 §9 use the observed context diffs; deviation severity `minor` means no downstream flag.

Every kind in this spec is exercised end-to-end in this workflow.

## 14. Phase 1 scope and migration

### 14.1 In-scope deltas

1. **New kind `local-protocol`**: schema, lint, ui (`schema/workflow/local-protocol.{schema,lint,ui}.yaml`).
2. **New kind `lab-state`**: schema, lint, ui (`schema/core/lab-state.{schema,lint,ui}.yaml` — placed in `core/` because it is cross-cutting), plus registry directory `schema/registry/lab-state-attributes/`.
3. **`protocol` extension**: add `source` field.
4. **`planned-run` extensions**: add `localProtocolRef`; extend `sourceType` enum with `local-protocol`; `protocolCompilation` becomes view onto local-protocol.
5. **`execution-deviation` extensions**: add required `severity`; extend `deviationType` enum with `environmental`.
6. **`execution-environment` extension**: add `lab_state_refs[]`.
7. **ProtocolCompiler refactor**: emit persistable `local-protocol` records; `planned-run.protocolCompilation` becomes a view.
8. **Structural-correspondence pass** in the compiler, run at local-protocol-compile and at run-plan-compile.
9. **Lab-state cascade walker**: reuse retraction-cascade mechanism from 40 §7.2.

### 14.2 Out of scope in Phase 1

- Rich WYSIWYG global-protocol editor.
- Local-protocol ↔ global-protocol diff UI (record shape supports it; UI later).
- Bench-side real-time event-logging app.
- Chatbox UX (compiler output supports it; UI later).
- Lab-state inventory UI.
- General retraction cascade (lab-state cascade is the Phase 1 prototype).
- Carryover/contamination in transfers (10 §3 non-goal).

### 14.3 Migration of existing planned-runs

No committed planned-run records exist today. The migration is code-and-schema only: ship the new local-protocol kind, refactor the compiler, update the planned-run schema. No data migration required.

## 15. Summary of deltas

| Action | Target | What |
|---|---|---|
| Preserve | `protocol.schema.yaml` | Existing shape authoritative for global layer |
| Extend | `protocol.schema.yaml` | `source: {type, ref}` field |
| **Add** | `local-protocol.schema.yaml` | New kind for lab layer (§5) |
| Preserve | `planned-run.schema.yaml` | Existing bindings / capability / state / compilation shape |
| Extend | `planned-run.schema.yaml` | `localProtocolRef` required; `sourceType` enum `+local-protocol`; `protocolCompilation` becomes view |
| Preserve | `execution-run.schema.yaml` | Operational envelope role |
| Preserve | `event-graph.schema.yaml` | Canonical truth of what happened |
| Preserve | `studies/run.schema.yaml` | Study-session header |
| Preserve | `execution-deviation.schema.yaml` | Existing shape |
| Extend | `execution-deviation.schema.yaml` | `severity` required; `environmental` in enum |
| Preserve | `execution-observation.schema.yaml`, `execution-remediation-decision.schema.yaml`, `execution-incident.schema.yaml` | Existing roles |
| **Add** | `lab-state.schema.yaml` | New kind (§10) |
| Extend | `execution-environment.schema.yaml` | `lab_state_refs[]` |
| Preserve | `execution-plan.schema.yaml`, `robot-plan.schema.yaml` | Compile-time artifacts |
| Refactor | `server/src/compiler/protocol/ProtocolCompiler.ts` | Emit local-protocol records; structural-correspondence pass |

Five rows do real new work. The rest is confirmation that what exists is correct.

---

## Appendix. What this spec does *not* decide

- **How compile pipelines are declared as YAML** — 60.
- **How AI proposes candidate records at any layer** — 80.
- **How derivation models feed context re-computation** — 70.
- **How context-roles are verified against planned-run bindings** — 40 §4.4.
- **The Schema Triplet mechanics for the new kinds** — follows existing project convention.
