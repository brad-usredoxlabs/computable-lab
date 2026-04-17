# 30 — Context

Status: Authoritative
Date: 2026-04-16
Depends on: 10-charter, 20-event-graph-ir

---

## 1. Purpose

A **context** is the derived state of a subject at a timepoint, computed from the event graph. Contexts are the second half of the compiler's core output: the graph says what happened, contexts say what is (or was, or will be).

This specification defines what a context is, how time is coordinated across contexts, how partial contexts and plate-contexts work, how contexts diff, how observed fields coexist with computed fields, and — centrally — how a context can be **promoted** into a named reusable canonical artifact.

Contexts are the compiler's primary analytical product. Everything in 40 (knowledge) is grounded in contexts. Promotion is how a bottom-up lab gesture produces a reusable top-down identity.

## 2. What a context is

A context is a record (virtual or materialized) of the form:

```
CTX-<id>
  subject_ref: <well-ref | tube-ref | plate-ref | animal-ref | cohort-ref | collection-ref>
  event_graph_ref: EG-<id>
  timepoint: <time-coordinate>       # see §5
  contents: [ <composition-entry>, ... ]
  total_volume?: { value, unit }
  properties: { ... }                # free-form open map
  derivation_versions: { <DM-id>: <version>, ... }   # see §10
  completeness: "complete" | "partial"  # see §6
  layer_provenance:                  # see §4
    event_derived: [ ... ]
    model_derived: [ ... ]
    observed: [ ... ]
```

The existing `schema/core/context.schema.yaml` is the starting shape. This specification extends it with `derivation_versions`, `completeness`, `layer_provenance`, and cleans up legacy `plate_ref` / `well_id` fields (subject_ref covers both). The existing `contents[]` already uses `composition-entry`, which is preserved unchanged so promotion to material-spec is a pure rewrite (see §12).

## 3. Subject types

A context's subject is any node that can have derived state:

- **well** — a well of a plate; the most common subject.
- **tube** — a free-standing container.
- **plate** — whole-plate state; first-class, not a union of well-contexts (§7).
- **animal** — an individual subject in an in-vivo study.
- **cohort** — a declared group of animals; context may carry group-level observed fields.
- **collection** — a named or ephemeral group of any of the above, used as the unit of promotion (§12).

Subject type determines which verbs in 20 can affect the subject and which model-derived fields apply.

## 4. Three layers of meaning

Every field on a context has a source. The context must record which source produced it; this is the `layer_provenance` block.

- **event-derived** — computed from events alone. Example: well volume after a transfer. Always deterministic; requires no models.
- **model-derived** — computed from events plus a named `derivation-model` record. Example: expected HepG2 count at T=24h under model `DM-hepg2-growth` version 3. Deterministic given the model version.
- **observed** — entered from an instrument or by expert judgment. Example: `confluence: 0.8` from a biologist's visual check; `fluorescence_485_535: 12450` from a plate reader. The compiler does not compute observed values; it ingests them.

When a field could be computed both ways (e.g., cell count is model-derived as 200,000 and observed as 183,500), **both values are kept**, both are labeled, and the divergence is accessible to downstream assertions (see 40 §5 on outcomes comparing model-derived to observed).

See 10 §2.7 for the rationale. The deprecated `biology-compiler.md` called this axis "deterministic vs biological"; that split was wrong.

## 5. Time coordinates

A context's timepoint can be expressed four ways, with a precedence rule when multiple are available.

### 5.1 Forms

| Form | Example | Use |
|---|---|---|
| ISO datetime | `2026-04-20T14:22:10Z` | executed events with wallclock |
| Event-sequence index | `event_index: 47` | ordering in planned or executed graphs without reliable wallclock |
| Named phase | `post-seed` / `post-CCCP-addition` / `pre-read` | biologist-authored semantic checkpoints |
| Duration offset | `T0 + 24h` | planned events relative to a named anchor |

All four may coexist on a single context. They are different answers to different questions.

### 5.2 Precedence for compile-time resolution

When the compiler must resolve to a single concrete timepoint (e.g., for model-derived recomputation over a time interval):

1. **ISO datetime** wins if present and non-ambiguous.
2. Else **event-sequence index** resolves to a concrete point in the graph's total order.
3. Else **named phase** resolves to the first event tagged with that phase label.
4. Else **duration offset** resolves against the named anchor.

If none resolve, the compiler emits a diagnostic. It does not guess.

### 5.3 Named phases

Named phases are short labels attached to events in the graph (`phase: post-seed`). The compiler reads these and makes them available as timepoint references. Conventional names (pre-*/post-*/during-*) are idiomatic but not enforced.

## 6. Partial contexts

A context is **partial** when inputs to its computation are incomplete — a referenced material-instance has no known composition, a required model version is missing, an expected upstream event is missing, an observed field is promised but not yet ingested.

### 6.1 Behavior

- The compiler produces the context anyway, with `completeness: partial` and a list of gaps (`missing: [ ... ]`).
- Downstream assertions grounded in a partial context inherit a `supported-by-partial-context` warning.
- Partial contexts do **not** block event compilation; they block only operations that require completeness (e.g., promotion to a material-spec — see §12.4).

### 6.2 Rationale

Biology workflows are authored incomplete and fill in over time. A vendor product's composition may be unknown until the CoA arrives. A planned run may reference material-instances that don't yet exist. The compiler must function through this; the diagnostic flow (see 60) flags what's missing without stopping work.

## 7. Plate-context as first-class

A plate-context is the state of a whole plate at a timepoint — not the union of its 96 well-contexts. Plate-context carries plate-level state:

- Seal status (sealed/unsealed), foil type
- Orientation (right-side-up, inverted for transport)
- Temperature and atmosphere while the plate is contiguous
- Current labware-instance identity and location
- Lid presence

Plate-context and well-contexts coexist. A transfer event updates relevant well-contexts; a `seal` event updates plate-context. Assertions can be scoped to either.

Plate-context is a distinct context record with `subject_ref: <plate-ref>`. It is not reducible to the wells.

## 8. Context diff

Context diff is a first-class compiler operation: given two contexts, produce a structured description of what differs.

### 8.1 Three diff axes

- **Across time** — same subject, two timepoints. "What did incubation change?"
- **Across subjects** — different subjects, comparable timepoints. "How do CCCP wells differ from vehicle wells?"
- **Across layers** — same subject, same timepoint, model-derived vs observed. "Did the growth model predict correctly?"

### 8.2 Shape

A diff result is a typed object with added, removed, and changed fields, per layer, with magnitudes and units preserved.

### 8.3 Use in the knowledge layer

Assertions with `scope: comparison` are defined by a context diff. The compiler computes the diff and populates the assertion's outcome (direction, effect_size). See 40 §5.

### 8.4 Caching

Diffs are memoized by the content hash of the two input contexts. Invalidated automatically when inputs change.

## 9. Context cache

- In-memory only (no disk cache in v1; see 10 §3).
- Keyed by content hash of (event-graph slice + subject-ref + timepoint + pinned-model-versions).
- Auto-invalidates when any input changes.
- LRU eviction.

This is a performance optimization, not part of the semantic model. A cold compiler re-derives everything.

## 10. Model version pinning

When a context's model-derived fields are computed, the compiler records which `derivation-model` record and which version produced each field:

```
derivation_versions:
  DM-ideal-mixing: 1
  DM-hepg2-growth: 3
  DM-ph-equilibration: 2
```

### 10.1 Pinning semantics

- Re-computation of a context **re-uses pinned versions** by default.
- A user can explicitly request re-compute-with-latest, which produces a new context with updated versions; old context is retained (append-only).
- When a model gains a new version (see 70), old contexts stay pinned and their downstream assertions remain valid under the old assumption.
- Source-drift diagnostics (§12.7) extend to model drift: if an assertion depends on an old model version, the compiler can flag it for review but does not invalidate it.

### 10.2 Rationale

Biology-model coefficients change. A published study's conclusions were drawn under a specific set of assumptions. Those assumptions must remain queryable forever. Pinning is how.

## 11. Observed-field ingestion and dual representation

Observed fields enter contexts through ingestion passes (instrument output files, user input). Two representation forms:

### 11.1 Plain value

```
observed:
  fluorescence_485_535: 12450
```

Used when the value stands on its own — it's raw instrument output with no interpretive layer.

### 11.2 Value-with-assertion

```
observed:
  confluence:
    value: 0.8
    assertion_ref: ASN-0042
```

Used when the value is an expert call that someone might want to contest, cite, or supersede later. The assertion carries the interpretive weight; the context holds the number for downstream computation.

Consumers read `observed.confluence.value` when they need the number. Systems auditing judgments read the assertion.

## 12. Context promotion

**This is the centerpiece of the biology compiler.**

A context can be **promoted** into a named reusable canonical artifact with the producing event graph as preparation provenance. This is how a lab gesture — "I dissolved 10 µL of 10× clofibrate into a DMSO tube" — crystallizes into a first-class material-spec named "1 mM clofibrate in DMSO" whose preparation is the event subgraph that made it.

### 12.1 What promotion does

Given a (context-ref, target-kind, name/parameters), promotion produces:

1. A **candidate record** of the target kind, populated from the context.
2. A `prepared_from` field on the candidate pointing to the source event subgraph.
3. A `promoted_from` field pointing to the source context (id + content hash, locked).
4. A diagnostics report (constraints checked, gaps noted).

The candidate is reviewed by the user and committed (or not). Once committed, it is a canonical record referenceable anywhere.

### 12.2 Target kinds (six)

| Target | Input shape | Use |
|---|---|---|
| `material-spec` | single context, homogeneous contents | declare a new formulation bottom-up |
| `material-instance` | single subject context | declare a concrete instance of a spec, as produced |
| `aliquot` | single subject context | declare a specific aliquot identity post-hoc |
| `plate-layout-template` | plate-context | reuse this plate map as a template |
| `assay-definition` | event subgraph + context(s) | promote a worked assay into a reusable definition |
| `context-snapshot` | any context | freeze the current context state for later reference |

### 12.3 Selection shape

Promotion takes an **arbitrary selection** — single subject, multi-subject slice, pattern-matched set. Per-target-kind constraints narrow what selections are valid:

- `material-spec` requires a homogeneous composition across the selection (diagnostic if heterogeneous).
- `material-instance` requires a single subject.
- `plate-layout-template` requires a plate subject.
- `assay-definition` requires an event subgraph plus one or more result contexts.

Selections are represented as (possibly ephemeral) `collection` references, so the machinery is uniform.

### 12.4 Completeness requirement

Promotion to a durable target kind (material-spec, material-instance, aliquot, plate-layout-template, assay-definition) **requires `completeness: complete`** on the source context. Promotion to `context-snapshot` does not — snapshots are literally partial-context captures.

### 12.5 Versioning: append-only with `supersedes`

Every promoted record is **append-only**. Updating a promoted material-spec means authoring a new record with:

```
supersedes: MSP-0042-v1
version: 2
```

Old records are never mutated. The supersedes chain is queryable. This preserves the ability to reason about assertions that were grounded in the old identity.

### 12.6 Locked snapshot

At promotion time, the source context is **locked**: its content hash is recorded, and the promoted record carries that hash. If the source context later re-computes (because underlying events changed, model versions upgraded, etc.), the promoted record is **not** retroactively updated.

### 12.7 Source-drift diagnostics

When the source context's current re-computation differs from the locked snapshot, the compiler emits a source-drift diagnostic on the promoted record. The record is not invalidated; the user decides whether to author a superseding version or ignore the drift.

### 12.8 Invalidation cascade

When an input to a promoted record is **retracted** (see 40 §7), the promoted record receives a diagnostic. Downstream assertions grounded in the promoted record receive further diagnostics. The cascade is a Phase 2 deliverable; Phase 1 provides only the direct flag.

### 12.9 Promotion is naming, not pooling

Promoting multiple subject contexts into a single material-spec does **not** physically pool them. It declares "these contexts all exemplify the same formulation." If the user wants to pool, they author a pooling event (a transfer from each source into a new container) and then promote the resulting context.

### 12.10 Composition-entry reuse

Context `contents[]` and material-spec `formulation.composition[]` both use the existing `composition-entry` datatype. Promotion from context to material-spec is a pure rewrite with no format translation. This is intentional and must be preserved in any schema evolution.

## 13. The ROS workflow in contexts

For the workflow in 10 §4:

- After EVT-002 (seed), each well has a well-context: 100 µL, HepG2 cells at 1e5/mL nominal, event-derived; no model-derived yet; nothing observed.
- After EVT-003 (incubate 24h), each well-context has model-derived expected cell count under `DM-hepg2-growth` v1, pinned.
- After EVT-004 (CCCP add), CCCP wells carry CCCP in composition; vehicle wells do not. Plate-context unchanged except for timing.
- After EVT-006 (DCFDA add), every well has DCFDA in composition. This is the structural prerequisite for the read precondition in 20 §6.
- After EVT-008 (read), each well-context has `observed.fluorescence_485_535` populated from the ingested data-artifact.
- Context diffs between CCCP wells and vehicle wells power the ROS-elevation assertions in 40.

A biologist who runs this workflow and wants to save "1 µM CCCP in DMEM/10% FBS" as a reusable working stock can **promote** the CCCP-well context (at T=post-CCCP-addition, pre-DCFDA) to a `material-spec`. The event subgraph (EVT-002 through EVT-004 for that well) becomes the preparation provenance. The material-spec is then usable in future planned runs as if it had been authored top-down.

This is how bottom-up preparations become top-down reusable identities. Every promoted artifact's SOP is its event subgraph. There is no separate SOP to write.
