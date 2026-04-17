# 40 — Knowledge

Status: Authoritative
Date: 2026-04-16
Depends on: 10-charter, 30-context

---

## 1. Purpose

The knowledge layer is where the compiler steps from *what is* to *what we claim, assert, or expect*. Contexts (30) describe the world. Knowledge records make statements *about* the world, grounded in contexts, and carry biological meaning that the compiler could not derive on its own.

This specification names the four knowledge-layer record kinds — **claim**, **assertion**, **context-role**, **evidence** — and their relationships. It corrects two structural problems in the draft biology-compiler.md: the proposal to collapse claim and assertion (wrong — they are genuinely distinct), and the unstructured treatment of controls and roles (fixed by introducing `context-role` as a first-class kind).

The knowledge layer is what distinguishes this system from a plate editor. A plate editor knows contents. The biology compiler knows contents *and* what the biologist intends them to mean.

## 2. Overview of the four kinds

| Kind | Role | Where stored |
|---|---|---|
| `claim` | Literature-level ontology triple: `(subject, predicate, object)` with citation | `records/knowledge/claims/CLM-*.yaml` |
| `assertion` | Experimental statement grounded in one or more contexts | `records/knowledge/assertions/ASN-*.yaml` |
| `context-role` | Typed role template with predicate prerequisites ("positive-control-for-ROS") | `records/registry/context-roles/CR-*.yaml` |
| `evidence` | Bundle linking typed sources to supported assertions/claims | `records/knowledge/evidence/EVD-*.yaml` |

The existing schemas in `schema/knowledge/` are the starting point. This spec modifies:

- `assertion.schema.yaml`: `claim_ref` becomes optional; `scope` generalized; legacy `plate_ref`/`well_id` removed.
- `claim.schema.yaml`: preserved as-is.
- `evidence.schema.yaml`: preserved as-is.

And adds:

- `context-role.schema.yaml` (new) with a predicate-DSL prerequisite block.

## 3. Claims

A claim is a **literature-level ontology triple**: a statement drawn from (or authored toward) the world's body of published biological knowledge.

### 3.1 Shape

```
CLM-<id>
  subject: <ontology-ref>        # e.g., CHEBI:CCCP
  predicate: <predicate-ref>     # from predicates.registry.yaml
  object: <ontology-ref | literal>
  sources: [<publication-ref>, ...]
  status: active | retracted
```

### 3.2 Predicate registry

Predicates are drawn from the existing curated registry at `schema/registry/predicates.registry.yaml` (28 predicates across 6 families: Causality & Regulation, Mereology & Location, Lineage & Taxonomy, Functional & Molecular, Measurement & Assay, Association).

Claim predicates are **different** from context-role predicates (see §4.3). Claims use ontology predicates; context-roles use a structural predicate DSL. They share no vocabulary.

### 3.3 What claims are for

Claims exist so that assertions produced in the lab can optionally cite or contradict the world's knowledge graph. "CCCP induces mitochondrial depolarization" is a claim; "in our experiment, CCCP wells showed 4.2× baseline fluorescence vs vehicle" is an assertion that supports that claim.

Claims are the interface between lab-level experimental statements and the broader ontology-anchored knowledge graph. They enable cross-experiment aggregation and literature comparison.

## 4. Context-roles

### 4.1 What they are

A **context-role** is a typed role template for contexts. It names a biological role (`positive-control-for-ros`, `vehicle-control`, `loading-control-well`, `calibration-standard`) and declares what structural conditions a context must satisfy to play that role.

This is the correct home for the "positive control" concept that the draft spec was groping for. Controls are roles assigned by biologists to wells based on what those wells contain — and the compiler can check the role assignment against the context structurally.

### 4.2 Shape

```
CR-<id>
  name: positive-control-for-ros
  description: |
    Positive control for reactive oxygen species measurement:
    living cells + Complex-I inhibitor + redox-sensitive dye.
  applies_to_subject_types: [well, tube]
  prerequisites:
    all:
      - has_material_class: { class: "living-cell-population" }
      - any:
        - has_material_class: { class: "complex-i-inhibitor" }
        - context_contains: { chebi: "CHEBI:3380" }  # CCCP
      - has_material_class: { class: "redox-sensitive-dye" }
  conflicts_with: [vehicle-control]
```

Context-roles are **YAML records**, not registry entries. This follows the general principle from this session's Q&A: every time we assume a concept is simple enough to be a registry entry, we get burned when biologists need to version it, cite it, or retract it.

### 4.3 Extended predicate DSL

Prerequisites use the existing lint predicate DSL (`all`, `any`, `not`, `exists`, `regex`, `equals`) extended with context-inspection operators:

| Operator | Meaning |
|---|---|
| `context_contains` | composition entries include a component matching a pattern |
| `has_material_class` | some composition component belongs to the named class |
| `state_is` | a named property on the context equals a value |
| `lineage_includes` | the subject's `derived_from` chain includes a matching resource |
| `time_within` | the context's timepoint falls within a range |

The same operators are used for event preconditions (see 20 §6). One mechanism; two surfaces.

### 4.4 Applying a role to a context

A role can be applied to a context by assertion scope, by annotation on an assertion, or by direct declaration in a planned run ("well A1 has role: positive-control-for-ros"). The compiler checks prerequisites and produces one of three outcomes:

- **verified** — prerequisites hold; role is valid.
- **unsupported** — prerequisites fail; diagnostic emitted.
- **ambiguous** — partial context; cannot determine; diagnostic with missing-info list.

### 4.5 Why this is a separate kind

The draft spec tried to handle controls via a property on assertions. That fails because:

- Controls need to be defined once and referenced many times.
- Controls carry their own citations (e.g., "the standard positive control for ROS is CCCP per Smith et al. 2014").
- Controls have lifecycle (new classes of inhibitors emerge; legacy controls get deprecated).
- The prerequisite check is the same mechanism needed for event preconditions; it belongs in a shared vocabulary.

Context-roles are the shared vocabulary.

## 5. Assertions

An assertion is an **experimental statement grounded in one or more contexts**. It is the most common knowledge-layer record and carries most of the weight of a study's conclusions.

### 5.1 Shape

```
ASN-<id>
  scope: single_context | comparison | series | global
  context_refs: [CTX-...]                # structure varies by scope
  roles: [{ role_ref: CR-..., context_ref: CTX-... }, ...]    # optional
  claim_ref: CLM-...                     # optional (see §5.3)
  outcome:
    measure: <field-name>                # e.g. fluorescence_485_535
    layer: event_derived | model_derived | observed
    direction: increase | decrease | unchanged | qualitative
    effect_size?: { value, unit }
    significance?: { p_value?, ci?, method? }
  evidence_refs: [EVD-...]
  confidence: 1..5
  status: active | retracted
  authored_by: <operator-ref>
  notes?: string
```

### 5.2 Generalized scope

The current schema's `scope: { control_context, treated_context }` hardcodes two-arm comparative experiments. The generalized scope supports four shapes:

- **`single_context`** — a statement about one context alone. Example: "well A1 showed no fluorescence above background."
- **`comparison`** — N arms compared. A two-arm CCCP-vs-vehicle assertion is a `comparison` with two context-refs. N-way dose responses collapse cleanly into this shape.
- **`series`** — ordered context-refs (time series, dose series). Outcome describes the trajectory.
- **`global`** — no experimental scope; the assertion is a world statement and must carry a `claim_ref`. Used when lab work confirms or contradicts a published claim without needing a specific context comparison.

`context_refs` shape is determined by scope. The schema validates each scope's structure.

### 5.3 Optional `claim_ref`: the inverted dependency

In the current schema, `claim_ref` is required: every assertion is grounded in a pre-existing claim. This is backwards for bench work. A biologist running an assay writes down what they found; they do not stop to author an ontology triple first.

The change: **`claim_ref` is optional**. Assertions stand alone. When an assertion happens to correspond to a world claim (supports it, refutes it, extends it), the biologist adds the `claim_ref`. When it's a lab-local observation with no world-graph analog, no claim is needed.

This inversion is load-bearing for a bench-first system. Claim-first reasoning belongs in literature curation workflows; assertion-first reasoning belongs in the lab.

### 5.4 Outcomes from context diffs

For `scope: comparison` and `scope: series`, the compiler populates the outcome by computing a **context diff** (see 30 §8) across the referenced contexts on the specified measure. The biologist authors the structural shape (which contexts, which measure); the compiler fills in direction and effect_size.

For `scope: single_context`, the outcome is either read directly from an observed field or computed against a threshold/baseline declared in the assertion.

Assertions thereby become **computable**: change a pinned model version, replay the graph, re-derive the contexts, and the outcome updates. Or re-runs of the assay produce new assertions whose outcomes can be meta-analyzed.

### 5.5 Confidence

The existing 1–5 scale is preserved. It is a biologist's subjective weighting, not a statistical measure (that's what `significance` is for).

### 5.6 Legacy fields removed

The current `assertion.schema.yaml` carries `plate_ref` and `well_id` fields from an earlier design. These are removed. `context_refs` covers both — every well has a context, and contexts reference their subjects.

## 6. Evidence

Evidence is preserved from the existing schema. Its shape:

```
EVD-<id>
  supports: [ASN-... | CLM-...]         # many-to-many
  sources: [
    { type: result | context | event | publication | file | event_graph,
      ref: ... },
    ...
  ]
  quality: { ... }                       # free-form open
```

### 6.1 Typed sources

The existing typed-source union (result, context, event, publication, file, event_graph) is the authoritative set. This covers citation evidence (publication), computed evidence (context, event, event_graph), observational evidence (result — usually a measurement record), and raw evidence (file).

### 6.2 Multi-assertion bundling

A single evidence bundle can support multiple assertions and/or claims via the `supports[]` array. This is already in the existing schema and is preserved — it matters because one figure or one run often underwrites many statements.

### 6.3 Evidence is not a claim

Evidence does not itself make a claim; it underwrites one. A PDF of a paper is evidence (source); the triple extracted from that paper is the claim; the assertion that replicates the triple is the assertion. Keeping these distinct is how the compiler reasons about provenance of belief.

## 7. Retraction

A knowledge-layer record is retracted by setting `status: retracted` with a mandatory `retraction`:

```
status: retracted
retraction:
  reason: <string>
  authored_by: <operator-ref>
  date: <iso-date>
  supersedes_with?: <new-record-ref>     # if replaced
```

### 7.1 Phase 1 behavior

- Retracted records remain in the repo and in history. They are never deleted.
- Queries default to `status: active`; retracted records are returned only on explicit request.
- Cross-references to retracted records are flagged in the UI (strikethrough, warning badge).

### 7.2 Phase 2: cascade diagnostics

When a record is retracted, records that depend on it (assertions grounded in retracted contexts; contexts computed from retracted material-instances; promoted material-specs whose preparation includes retracted events) receive cascade diagnostics. The cascade walks the provenance edges and annotates dependents without mutating them — the user decides whether to retract dependents too.

Cascade is Phase 2 because the walker and the UX for reviewing cascaded diagnostics are non-trivial. Phase 1 provides status-only retraction with explicit-cross-reference flagging.

### 7.3 Retraction vs. supersession

Retraction says "this was wrong." Supersession says "this was right at the time but is replaced." Both use status fields but mean different things to downstream consumers. Promoted material-specs use `supersedes` (see 30 §12.5); retractions use `status: retracted`.

## 8. Dual-representation observed properties

Observed properties on contexts (30 §11) may be stored either as plain values or as `{value, assertion_ref}` tuples. When the assertion-ref form is used, the assertion in question is a `single_context` assertion carrying the biologist's judgment:

```
# on the context
observed:
  confluence:
    value: 0.8
    assertion_ref: ASN-0042

# on the assertion
ASN-0042:
  scope: single_context
  context_refs: [CTX-0007]
  outcome:
    measure: confluence
    layer: observed
    direction: qualitative
  confidence: 3
  authored_by: PRS-0001
```

This means: the number is the biologist's expert call; disputing it would require superseding or retracting ASN-0042. The compiler reads the value for downstream computation but flags any assertion that builds on it with an "observed-via-judgment" note.

This dual form is the mechanism by which the knowledge layer and the context layer cross-reference without either dominating the other.

## 9. The ROS workflow in the knowledge layer

For the workflow in 10 §4:

**Context-roles applied:**
- CCCP wells get role `CR-positive-control-for-ros`. The compiler checks prerequisites (living HepG2, CCCP, DCFDA) and verifies — after EVT-006. Prior to EVT-006, the check is `unsupported` because DCFDA is absent; the compiler emits this as an expected intermediate state, not an error.
- Vehicle wells get role `CR-vehicle-control-for-ros`, whose prerequisites require DMSO but not an inhibitor.

**Assertions produced:**

```
ASN-ROS-001
  scope: comparison
  context_refs: [CTX-CCCP-wells-post-read, CTX-vehicle-wells-post-read]
  roles:
    - { role_ref: CR-positive-control-for-ros, context_ref: CTX-CCCP-... }
    - { role_ref: CR-vehicle-control-for-ros, context_ref: CTX-vehicle-... }
  claim_ref: CLM-cccp-induces-ros         # optional — references CCCP-ROS literature
  outcome:
    measure: fluorescence_485_535
    layer: observed
    direction: increase
    effect_size: { value: 4.2, unit: fold }
  evidence_refs: [EVD-ROS-RUN-001]
  confidence: 4
```

**Evidence:**

```
EVD-ROS-RUN-001
  supports: [ASN-ROS-001]
  sources:
    - { type: event_graph, ref: EG-ROS-RUN-001 }
    - { type: result, ref: MEA-plate-read-001 }
    - { type: file, ref: DAT-001 }          # raw plate reader output
  quality:
    plate_read_cv: 0.08
    positive_control_verified: true
```

**Outcome computation:** the compiler reads `context_refs`, computes the context diff on `fluorescence_485_535` (observed layer), and populates `outcome.direction` and `outcome.effect_size` automatically. The biologist authored only the shape.

**Validation at compile time:**
- If EVT-006 (DCFDA addition) had been omitted, the `CR-positive-control-for-ros` check would be `unsupported` and the assertion would fail compilation.
- If the plate reader's CV exceeded a declared threshold, the compiler would emit a quality warning.
- If the effect size were below a configurable floor (e.g., <1.5×), the compiler would warn that the positive control may not be working — reader calibration? stale CCCP stock? This is a biologist-actionable diagnostic.

The knowledge layer closes the loop: contexts are derived, roles are checked, comparisons are computed, confidence is asserted, evidence is bundled, and the biology compiler now knows not just what happened but what it means.
