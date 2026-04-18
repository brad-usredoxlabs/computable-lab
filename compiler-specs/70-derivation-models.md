# 70 — Derivation Models

Status: Authoritative
Date: 2026-04-18
Depends on: 10-charter, 30-context

---

## 1. Purpose

Contexts (30) declare that every field in a context lives in one of three layers: **event-derived**, **model-derived**, or **observed**. This spec owns the machinery for the middle layer: the YAML multi-step worksheet engine that computes model-derived fields from event-derived inputs, plus observed inputs when a model requires them.

A derivation model is a **reusable, typed, versioned, declarative worksheet**. Given named inputs with declared types and units, it evaluates an ordered sequence of named steps and returns one of those step values as its output. Contexts that use a model pin the model's version at compute time so later changes to the model do not silently mutate historical results.

The engine is domain-agnostic. "Biological" is not a kind of model; it is a label on specific models. Dilution arithmetic, ideal mixing, pH equilibration, expected cell count — all are models under the same mechanism.

## 2. The `derivation-model` record kind

Already introduced by 00 §4.4. Authoritative schema: `schema/knowledge/derivation-model.schema.yaml`. Key structural commitments are preserved from the existing schema:

- `kind: derivation-model`, id pattern `DM-[A-Za-z0-9_-]+`.
- `version: integer ≥ 1` (pinned by consumers; see §4).
- `inputs[]` — named, typed declared inputs.
- `steps[]` — ordered named operations.
- `output` — named typed declaration; its value is one step's value.
- `assumptions[]` — human-readable assumptions, surfaced with results.
- FAIRCommon envelope (`$ref: ../core/common.schema.yaml#/$defs/FAIRCommon`) — standard citations, owners, lineage.

This spec does not replace the schema; it names the engine semantics, the expression allowlist, the unit-checker, the authoring path, and the consuming contract with contexts.

### 2.1 Why a separate kind

Putting derivation in a record kind rather than in code buys four things:

- **Auditability**: "what model computed this expected-cell-count?" answered by a record id + version.
- **Reproducibility**: old results re-derive against the pinned version, not against today's model.
- **Authorability**: bench biologists can propose and land new models without TypeScript (§8).
- **Diffability**: model changes show up in Git diffs human-readable.

Code-embedded math fails all four.

## 3. Engine semantics

### 3.1 Execution

A derivation run is:

1. Caller supplies a `{modelId, version}` plus a concrete-input object `{input_name: value}` for each declared input.
2. Engine looks up the pinned model version.
3. Engine type-checks and unit-checks each supplied input against the model's declared input types.
4. Engine evaluates `steps[]` in order. Each step produces a new named value in scope.
5. Engine returns the value of the step declared as the model's `output`, plus the engine-computed unit for that value, plus a `provenance` note recording `{modelId, version, inputs_used, assumptions}`.

### 3.2 Steps

Each step is:

```
- name: <identifier>
  op: <operation keyword>
  expression?: <math.js-style expression in declared scope>
  unit?: <declared unit; engine checks>
  description?: <string>
```

The schema does not validate the `op` keyword — the engine does. The authoritative op registry lives in code in `server/src/derivation/operators/`. Adding a new op is a small TypeScript delta + a test; authors cannot invent ops in YAML.

### 3.3 Seed operators (Phase 1)

| Operator | Meaning | Example |
|---|---|---|
| `assign` | Bind a name to an expression | `expression: "input_volume * 2"` |
| `sum` | Sum a list of step values or inputs | `inputs: [v1, v2, v3]` |
| `weighted_average` | Σ(wᵢ·xᵢ) / Σwᵢ | `values: [x1, x2]`, `weights: [w1, w2]` |
| `divide` | Scalar division with unit cancellation | `numerator`, `denominator` |
| `multiply` | Scalar product with unit combination | `factors: [...]` |
| `clamp` | `min(max(x, lo), hi)` | `x`, `lo`, `hi` |
| `lookup_constant` | Look up a named lab-state-backed constant (e.g., default plating density for HepG2) | `constant_ref` |

Biology primitives added as separate ops as they are needed (e.g., `monod_growth`, `beer_lambert_concentration`). No op is added without a unit-check definition.

### 3.4 Expressions

Expressions inside a step's `expression` field use a subset of math.js:

- Operators: `+`, `-`, `*`, `/`, `**`, unary `-`.
- Functions: `log`, `exp`, `sqrt`, `min`, `max`, `abs`, `clamp`.
- Identifiers: names of prior steps and inputs, accessed directly.
- No function definitions, no lambdas, no property access, no string methods, no IO.

The grammar is narrow enough to audit and to unit-check. Any expression outside this grammar is a model-authoring error caught at model validation time, not at derivation time.

### 3.5 Allowlist is hard

If a model needs a primitive outside the allowlist, the primitive is added to the op registry (§3.3) with a unit-check definition. Authors do not escape into freeform expressions.

## 4. Unit checking

Unit checking is a first-class responsibility of the engine.

### 4.1 Unit algebra

Units are tracked as a multiset of base-unit powers (SI-plus-lab: `m`, `kg`, `s`, `mol`, `K`, `cell`, `dimensionless`, plus common derived units `L`, `g`, `M`, `cells_per_mL`). Multiplication adds exponents; division subtracts; `**` scales; `log`/`exp` require dimensionless arguments.

### 4.2 Declared units

Each `input` declares its unit. Each `step` may declare its expected unit; if declared, the engine verifies. If not declared, the engine infers.

### 4.3 Unit errors are model-authoring errors

A unit mismatch is a compile-time error on the *model*, raised when the model is first validated (or re-validated after edit). A model that does not pass unit checking is refused by the model store; it never runs.

### 4.4 Unit conversion

Authors declare values in whatever unit is natural. The engine converts at step boundaries as needed (e.g., `µL → L`, `mM → M`, `cells_per_mL → cells_per_L`) using a fixed conversion table in `server/src/derivation/units.ts`. Conversion is lossless for the units in the table; unlisted units are rejected.

### 4.5 Dimensionless quantities

Many biological quantities are ratios or normalized counts. Dimensionless is a valid unit. Operations that require dimensionless inputs (`log`, `exp`) enforce it.

## 5. Consumption by contexts

Per 30 §10, a context records:

```
derivation_versions:
  DM-ideal-mixing: 3
  DM-hepg2-growth-default: 2
```

For each model-derived field in the context, the map tells the compiler which model version was used. On re-compute:

- **Default**: re-use the pinned versions. The result is byte-stable against the historical compute if inputs are unchanged.
- **Explicit upgrade**: a biologist or a pipeline pass asks for a model upgrade. The pass either recomputes with the newest version or emits a `needs-confirmation` diagnostic offering the upgrade.

A context with a pinned model version never silently upgrades.

### 5.1 Provenance threading

The compiler provenance envelope (60 §12) records, in its `notes[]`, which model version produced each model-derived field. The result is that every model-derived field in the final artifact carries a breadcrumb back to a specific `DM-*` version — the basis for audit and for the reproducibility contract.

### 5.2 Partial input handling

A model invocation with a missing required input does not abort silently: it emits a `needs-missing-fact` diagnostic naming the absent input and the consuming field, and the context records the field as unresolved. Downstream assertions that depend on that field inherit the partial-context tag (30 §6). This is the same partial-context mechanism the compiler uses elsewhere (60 §6.3).

## 6. Versioning

### 6.1 Append-only

A `derivation-model` record is immutable after publication. Edits produce a new record with the next `version: N+1` and `supersedes: DM-foo-vN` (the existing FAIRCommon `supersedes` edge).

### 6.2 Model ids are stable across versions

`DM-ideal-mixing` is the logical id. Versions `1, 2, 3, ...` chain via `supersedes`. Contexts pin the `(id, version)` pair.

### 6.3 Retraction

A superseded version stays available for historical re-compute. A model **retracted** (e.g., determined to be scientifically wrong) gets `status: retracted` and a retraction note. Retracted versions still compute on demand (reproducibility), but any new context that pins a retracted version gets a `needs-confirmation` diagnostic — "this model was retracted on `<date>` for `<reason>`; switch to version `<N>` or acknowledge."

Retraction at the model level follows the same cascade mechanism as 40 §7.2 and 50 §10.5.

### 6.4 No in-place edits

"Typo-fix" edits that do not change mathematical meaning are still a new version. The engine does not judge what's mathematically meaningful; the version bump is the audit trail.

## 7. Phase 1 seed library

The software team seeds a starter library. The initial set targets the ROS workflow and the general-purpose math every lab needs.

| Model | Purpose |
|---|---|
| `DM-ideal-mixing` | Linear combination of composition entries with volume additivity. Used everywhere a transfer or formulation derives a new composition (20 §5). |
| `DM-dilution-serial` | Two-fold and ten-fold serial dilution arithmetic; output is a post-dilution concentration. |
| `DM-beer-lambert-concentration` | `A = ε · c · l`, solve for `c` given `A`, `ε`, `l`. |
| `DM-hepg2-growth-default` | Expected cell count at time `t` given seed density, plate area, doubling time. Phase-1 concretion of the "expected cell count" example. |
| `DM-ambient-temperature-stock-decay` | Stock-concentration decay as a function of ambient exposure time; seeds lab-state-driven diagnostics. |
| `DM-fluorescence-background-subtraction` | Corrects raw fluorescence for background and vehicle fluorescence. |

All live at `schema/registry/derivation-models/` as YAML records; the directory exists, initial content is Phase-1 delta.

## 8. Authoring path

Three tiers of authors, per the planning decision:

1. **Software team** — seeds the starter library, defines new operators when they are needed.
2. **Bench biologists** — propose new models via PR. Model YAML lives in-repo; review gates are schema validation, unit check, and at least one test case in `server/src/derivation/models/DM-*.test.ts` (pattern set by the existing kernel tests).
3. **Domain specialists** — author complex models when a general biologist can't. Same PR path; no special privileges.

### 8.1 Model readability is load-bearing

A model is a document as much as a computation. Authors must be able to read a `DM-*.yaml` diff in Git and immediately understand what changed and whether it matters. This constraint shapes step granularity (prefer small named steps over big expressions), naming (biologist vocabulary, not variable names), and assumption declarations (every non-obvious assumption in `assumptions[]`).

### 8.2 Testing convention

Each model ships with a test file that:

- Exercises the happy path with realistic inputs.
- Exercises at least one edge case (e.g., zero volume, saturated absorbance).
- Pins the output byte-for-byte.
- Re-runs against the prior version (if one exists) on a fixed input set; the test must declare whether the output drift is expected.

## 9. Engine implementation

### 9.1 Module layout

```
server/src/derivation/
  DerivationEngine.ts        # core evaluator
  operators/
    index.ts
    arithmetic.ts            # assign, sum, divide, multiply, clamp
    statistical.ts           # weighted_average, ...
    biological.ts            # monod_growth, ... (added per need)
  units.ts                   # unit algebra + conversion table
  models/                    # canonical tests for seed models
    DM-ideal-mixing.test.ts
    DM-hepg2-growth-default.test.ts
    ...
```

### 9.2 Engine is pure

`DerivationEngine.run(model, inputs, store) → {output, unit, provenance, diagnostics}` is a pure function. No IO, no clock. `store` is a read-only handle used only when a step calls `lookup_constant` or reads a referenced record.

### 9.3 Wiring into the compiler

The `derive_context` pass family (60 §4.2) calls the engine whenever a model-derived field is computed. The result's provenance note lists `{modelId, version}`. The cache key (60 §7) includes pinned model versions, so a model-version bump invalidates cache entries that used that model.

### 9.4 Derivation runs *only* in `derive_context`

All `DerivationEngine.run` invocations happen in the `derive_context` pass family. No other family — `parse`, `normalize`, `disambiguate`, `validate`, `expand`, `project` — invokes the engine. Pass families other than `derive_context` may *read* model-derived context fields but never compute them.

This rule is load-bearing for three reasons:

1. **Cache integrity**: the compile cache key (60 §7) includes pinned model versions sourced only from `derive_context`. A model invocation elsewhere would silently bypass cache invalidation.
2. **Pinning integrity**: the consuming context's `derivation_versions` map is populated only by `derive_context` passes. A model invocation elsewhere would produce results without a pin.
3. **Provenance integrity**: every model-derived field in a context traces through `derive_context` provenance notes. A model invocation elsewhere would break the audit trail.

Corollary: if a computation that *looks* like it belongs in projection (e.g., "the corrected plate-reader reading") is a model output, then the corrected value is a **model-derived context field** attached to the subject's context at the read timepoint. Projection reads it from the context; it does not compute it.

### 9.5 No side channels

Models are the *only* source of model-derived context fields. Passes do not quietly derive expected values outside a `derivation-model`. If a computation is useful enough to embed in a pass, it is useful enough to be a model.

## 10. The ROS workflow

For the canonical ROS positive-control workflow:

Every derivation below runs in the `derive_context` pass family (§9.4). Projection reads the resulting model-derived fields from the well/plate context; it does not invoke any model.

- `DM-ideal-mixing` runs during each `transfer` event's context derivation: CCCP dilution from stock → well, DCFDA dilution from stock → well, vehicle-control well composition. Output: a model-derived `composition` field on the destination well context.
- `DM-dilution-serial` runs during context derivation for the prepared CCCP working stock. Output: a model-derived `concentration` on the resulting aliquot's context.
- `DM-hepg2-growth-default` runs during context derivation at the 24h seed-to-treatment timepoint. Output: a model-derived `expected_cells_per_well` on the well context.
- `DM-fluorescence-background-subtraction` runs during context derivation *at the read timepoint*: for each well context, the model takes raw fluorescence (observed) plus vehicle-well observed fluorescence and produces a model-derived `corrected_fluorescence` field on the well context. The `read` event's projection then reads this field — it does not compute it.
- Every resulting context carries a `derivation_versions` map pinning the exact version of each model used.
- The ROS assertion ("CCCP wells show elevated corrected fluorescence vs. vehicle wells at the 95% CI level") reads the model-derived `corrected_fluorescence` field from each well context and is tagged with the same pinned model versions, closing the reproducibility loop.

## 11. Phase 1 scope and deltas

### 11.1 Existing and preserved

1. **`derivation-model` schema** (`schema/knowledge/derivation-model.schema.yaml`) — preserved.
2. **`derivation_versions` field on contexts** (30 §10) — preserved.

### 11.2 New in Phase 1

1. **`server/src/derivation/DerivationEngine.ts`** — the evaluator.
2. **`server/src/derivation/operators/`** — operator registry (arithmetic + statistical + initial biological primitives).
3. **`server/src/derivation/units.ts`** — unit algebra + conversion table.
4. **Seed model library** in `schema/registry/derivation-models/` — the six models in §7.
5. **Canonical tests** in `server/src/derivation/models/DM-*.test.ts` per §8.2.
6. **Wiring into the `derive_context` pass family** (60 §4.2) — the pass calls `DerivationEngine.run` and threads `{modelId, version}` into the context's `derivation_versions` map.
7. **Provenance-note plumbing** — derivation-model invocations emit `CompilerProvenanceNote`s that cite the model id+version (60 §12).

### 11.3 Out of scope in Phase 1

- **User-authored ops** (authors cannot define ops in YAML; only seed operators + PR-added ones).
- **Lab-state-dependent models** beyond `DM-ambient-temperature-stock-decay` (the mechanism is validated here; broader library is Phase 2).
- **GUI model authoring** — Phase 1 authoring is YAML in PR.
- **Automatic upgrade of pinned versions** — requires explicit opt-in (§5).
- **Probabilistic models / distributions** — deterministic scalar/vector outputs only in Phase 1.

### 11.4 Migration

No committed `derivation-model` records depend on this spec's engine today. The engine is introduced additively; once live, contexts computed by the `derive_context` pass begin populating `derivation_versions`. Contexts written before the engine existed are not backfilled; they simply have no `derivation_versions` entries.

## 12. Summary of deltas

| Action | Target | What |
|---|---|---|
| Preserve | `schema/knowledge/derivation-model.schema.yaml` | Existing schema authoritative |
| Preserve | `context.schema.yaml` derivation_versions field | Existing pin mechanism (30 §10) |
| **Add** | `server/src/derivation/DerivationEngine.ts` | Pure evaluator (§9) |
| **Add** | `server/src/derivation/operators/*.ts` | Op registry with seed operators (§3.3) |
| **Add** | `server/src/derivation/units.ts` | Unit algebra + conversion (§4) |
| **Add** | `schema/registry/derivation-models/DM-ideal-mixing.yaml` and five other seed models | Phase 1 seed library (§7) |
| **Add** | `server/src/derivation/models/DM-*.test.ts` | Canonical per-model tests (§8.2) |
| **Wire** | `derive_context` pass family (60 §4.2) | Invoke engine, populate `derivation_versions`, emit provenance notes |

Engine + op registry + units + six seed models + their tests + wiring into one pass family. Nothing else.

---

## Appendix A. What this spec does *not* decide

- **How contexts are structured or diffed** — 30.
- **How derivation results surface as diagnostics** — 60.
- **How models are proposed by AI from literature** — 80 (AI may draft a model; canonical form still lands as a YAML record through human review).
- **Biological ground truth for any specific model's coefficients** — that's the model author's responsibility, tracked per-model via citations in FAIRCommon.

## Appendix B. Terminology

- **Model** — a `derivation-model` record; immutable; identified by `(id, version)`.
- **Engine** — the code that evaluates a model against concrete inputs (`DerivationEngine`).
- **Operator** / **Op** — a named step operation (e.g., `weighted_average`); implemented in code, referenced by YAML.
- **Pinned version** — the `derivation_versions[id]` entry on a context; the authoritative "which model did this."
- **Seed library** — the starter set of models the Phase 1 system ships with.
