# 60 — Compiler

Status: Authoritative
Date: 2026-04-18
Depends on: 10-charter, 20-event-graph-ir, 30-context, 40-knowledge, 50-protocol-lifecycle

---

## 1. Purpose

The compiler is the single deterministic engine that turns declarative biologist-authored records — event graphs, contexts, protocols, extractions — into validated, context-bound artifacts with biologist-readable diagnostics. Every transformation in the system that is not a database read or a Git write passes through it.

This spec names its architecture: the kernel that already exists and is kept, the per-input-type entrypoints that wrap it, the data-driven YAML pipelines that orchestrate the passes each entrypoint runs, and the shared diagnostic / caching / testing / policy surface. It does **not** introduce new record kinds; it names the machinery that consumes and emits the kinds owned by 20/30/40/50.

Like 50, the compiler is already heavily implemented. This spec is mostly a statement of deltas against the existing services in `server/src/compiler/`. Where a component exists and works, this spec preserves it and says so. Only genuine gaps are new design.

## 2. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│  Entrypoints (one per input type)                                │
│  protocol-compile · local-protocol-compile · run-plan-compile    │
│  promotion-compile · extraction-compile · ingestion-compile      │
│    │                                                              │
│    ▼  specialized input normalizer                                │
├──────────────────────────────────────────────────────────────────┤
│  Pipeline dispatcher                                              │
│   reads schema/registry/compile-pipelines/<entry>.yaml           │
│   runs ordered passes, honors depends_on + when                  │
│    │                                                              │
│    ▼  pass family dispatch                                        │
├──────────────────────────────────────────────────────────────────┤
│  CompilerKernel  (server/src/compiler/CompilerKernel.ts)          │
│   domain-agnostic: bindings, diagnostics, policy, provenance      │
│   produces CompilationResult<TPayload>                            │
│    │                                                              │
│    ▼  specialized output projector                                │
├──────────────────────────────────────────────────────────────────┤
│  CompileResult (unified envelope)                                 │
│   outcome · diagnostics · provenance · payload · cache key       │
└──────────────────────────────────────────────────────────────────┘
```

The kernel is the stable core. Everything above and below is per-entrypoint specialization. Pipelines are data-driven; kernel and dispatcher are code.

## 3. The CompilerKernel is extended, not replaced

`server/src/compiler/CompilerKernel.ts` is authoritative for the domain-agnostic compile surface. Its existing machinery is preserved:

| Preserved | What it does |
|---|---|
| `CompilerDiagnosticOutcome` enum | `auto-resolved` / `needs-confirmation` / `needs-missing-fact` / `policy-blocked` / `execution-blocked` — the vocabulary biologists and the UI both consume |
| `CompilerDiagnostic` | Structured message + stage + severity + outcome + optional remediation + provenance |
| `CandidateBinding<T>` | Slot → candidate with `resolution: exact | substitution | placeholder | new-record` |
| `CompilerProvenanceEnvelope` | `sources[]` + `notes[]`, plumbed through every result |
| `PolicyEvaluation` integration | Kernel asks `PolicyProfileService` for disposition on each action request |
| `NormalizedIntent<TPayload>` | Per-domain payload in a standard envelope with `requiredFacts[]` / `optionalFacts[]` |
| `CompilationResult<TPayload>` | The unified envelope every entrypoint returns |

### 3.1 What this spec does not change in the kernel

- Diagnostic codes, severity, stage enum.
- Binding resolution kinds.
- Policy integration contract (`PolicyProfileService.evaluate(...)`).
- Provenance shape.

### 3.2 What this spec adds around the kernel

- **Pipeline dispatcher** that reads a YAML pipeline definition and drives the kernel through ordered passes (§4).
- **Per-entrypoint adapter layer** that takes typed input records, normalizes them into `NormalizedIntent`, routes through the kernel, and projects the kernel result into a typed per-entrypoint output (§5).
- **Compile cache** keyed by content hash (§7).
- **Policy-profile strictness overlays** (§8).

## 4. Data-driven pipelines (YAML)

Pipeline orchestration lives in `schema/registry/compile-pipelines/` and is schema-validated by `compile-pipeline.schema.yaml`. Each entrypoint has one pipeline YAML.

### 4.1 Today's state

The pipeline YAMLs exist and are schema-validated:

- `schema/registry/compile-pipelines/compile-pipeline.schema.yaml` — the pipeline schema.
- `schema/registry/compile-pipelines/protocol-compile.yaml`
- `schema/registry/compile-pipelines/run-plan-compile.yaml`
- `schema/registry/compile-pipelines/extraction-compile.yaml`

Each file declares `pipelineId`, `entrypoint`, and an ordered `passes[]`. Each pass has an `id`, a `family`, an optional `depends_on[]`, and an optional `when` guard. They document the intended pass sequence and are not yet dispatched; the dispatcher is a Phase-1 code delta.

### 4.2 The seven pass families

| Family | What passes in this family do |
|---|---|
| `parse` | Load the input, unpack the envelope, extract structured sub-records |
| `normalize` | Resolve refs, align units, apply defaults, resolve active policy profile |
| `disambiguate` | Bind abstract roles to concrete candidates (materials, labware, equipment, mentions) |
| `validate` | Schema + capability + structural-correspondence + lint checks |
| `derive_context` | Walk the event graph, compute contexts, apply derivation models (70) |
| `expand` | Macro expansion, multi-channel fan-out, projection to lower-layer artifacts |
| `project` | Assemble the final typed output for the entrypoint |

Every pass belongs to exactly one family. Families establish a canonical ordering: `parse < normalize < disambiguate < validate < derive_context < expand < project`. Passes within a family may run in any order consistent with their declared `depends_on[]`.

### 4.3 Pass contract

A pass is a pure function: `(PipelineState, PassConfig) → PipelineState ⊕ Diagnostic[]`. It reads typed artifacts from the prior state, emits a typed artifact (or diagnostics), and does no IO beyond record-store reads via the injected store interface. Passes that need to emit diagnostics use the kernel's `CompilerDiagnostic` shape directly.

### 4.4 Conditional passes

A pass may declare `when: "<expression>"`. The expression is a restricted evaluator over `config` and `state`:

- `config.ai_ranking_enabled` — boolean in the pipeline's config block.
- `state.hasArtifact('<artifact-id>')` — whether an earlier pass produced a named artifact.
- `state.input.kind === 'event-graph'` — discriminator on the input envelope.

No function calls beyond what the evaluator declares. No user-provided expressions in production; only YAML-authored expressions reviewed in Git.

### 4.5 Why YAML, not code

Pipelines change more often than the kernel. Adding a new pass, reordering two disambiguate passes, or gating a pass behind a flag must not require a TypeScript PR. The YAML is biologist-and-engineer readable, diff-viewable, and validated by JSON Schema. Adding a new **pass family** is a code change; reordering passes within a family is YAML.

## 5. Per-input-type entrypoints

Each entrypoint owns an input normalizer and an output projector. The middle (pipeline + kernel) is shared.

| Entrypoint | Input | Output | Pipeline |
|---|---|---|---|
| `protocol-compile` | `protocol` record | validated protocol + lint diagnostics | `protocol-compile.yaml` |
| `local-protocol-compile` | `local-protocol` record | validated local-protocol + structural-correspondence diagnostics | `local-protocol-compile.yaml` (to add) |
| `run-plan-compile` | `planned-run` record | bound, capability-checked execution plan | `run-plan-compile.yaml` |
| `promotion-compile` | promotion request (see §5.4 — two input shapes) | canonical record + audit record (`context-promotion` *or* `extraction-promotion`) | `promotion-compile.yaml` (to add) |
| `extraction-compile` | unstructured artifact | `extraction-draft` record | `extraction-compile.yaml` |
| `ingestion-compile` | ingestion job (external system) | emitted records + diagnostics | `ingestion-compile.yaml` (to add) |

### 5.1 Entrypoint boundaries

- **Input normalizer** (per entrypoint): takes the typed input record, resolves ref fields against `RecordStore`, expands envelopes, produces the `NormalizedIntent<TPayload>` the kernel expects. Existing examples: `server/src/compiler/protocol/ProtocolCompiler.ts` (for protocol/local-protocol) and `server/src/compiler/material/MaterialCompiler.ts`.
- **Output projector** (per entrypoint): takes `CompilationResult<TPayload>` and assembles the entrypoint's declared output shape. Existing examples: same files as above.
- **Shared middle**: the kernel + pipeline dispatcher.

### 5.2 Entrypoints are not record kinds

An entrypoint is a function: `(typed input, store, config) → typed CompileResult`. Invocations are not persisted as records by default. Audit trails for specific compilations are persisted only where the workflow demands it — today that's `context-promotion` (30 §7) and `extraction-promotion` (80 §7) records emitted by `promotion-compile` (§5.4) — but the compile call itself is not a record.

### 5.3 Entrypoint selection

The dispatcher selects an entrypoint from the input envelope:

- `kind: 'protocol'` → `protocol-compile`.
- `kind: 'local-protocol'` → `local-protocol-compile`.
- `kind: 'planned-run'` → `run-plan-compile`.
- `{selection, target_kind}` OR `{extraction_draft_ref, candidate_path, target_kind}` → `promotion-compile` (§5.4).
- `{source_artifact}` extraction request → `extraction-compile`.
- External ingestion job → `ingestion-compile`.

Ambiguous inputs (e.g., a record of an unknown kind) are a compiler error — not silently routed.

### 5.4 `promotion-compile` has two input shapes, two audit kinds

Promotion is **not one workflow**. Two distinct workflows share the same entrypoint because they share the same output contract (a canonical record plus a locked hash audit record), but their inputs and audit semantics are different:

| Shape | Source | Audit record emitted |
|---|---|---|
| **Context promotion** (30 §7) — `{source_context_ref, selection, target_kind}` | A computed context selection | `context-promotion` — locks `source_content_hash` over the canonicalized context |
| **Extraction promotion** (80 §7) — `{extraction_draft_ref, candidate_path, target_kind}` | A candidate inside an `extraction-draft` | `extraction-promotion` — locks `source_content_hash` over the canonicalized draft candidate body; also carries `source_artifact_ref` for provenance back to the PDF/publication |

Both audit records discriminate on the `kind:` field and share three fields: `output_kind`, `output_ref`, `source_content_hash`. Everything else differs — and must, because a context selection and an AI-extracted candidate are not the same thing. A PDF-extracted `protocol` candidate does not come from a computed context and has no homogeneity or completeness to check; a context-selected `aliquot` does and must.

The `promotion-compile` pipeline branches on its input shape at the `parse` family (§4.2): one branch runs context-selection constraint checks (homogeneity, single-subject, source-context completeness) and emits `context-promotion`; the other runs candidate schema validation against the target kind and emits `extraction-promotion`. Shared: the output projector, the canonical record emission, the hash-and-lock step.

Authoritative homes: `context-promotion` definition lives in 30 §7. `extraction-promotion` definition lives in 80 §7. This spec owns the entrypoint dispatching.

## 6. Diagnostics

### 6.1 Biologist-readable primary, codes optional

Every diagnostic emitted by any pass carries:

- A **biologist-readable message** with path references to the implicated records (the primary consumer).
- An **optional structured code** (e.g., `CAPABILITY_MISMATCH_ROTOR`) for tooling.
- A **stage** (`normalize` / `bind` / `policy` / `plan` / `execute`) and **severity** (`info` / `warning` / `error`) from the kernel's existing enums.
- An **outcome** from `CompilerDiagnosticOutcome` indicating what kind of human or policy action would resolve it.
- Optional **remediation** suggestions (existing `RemediationSuggestion` kinds: `provide-missing-fact`, `confirm-choice`, `request-approval`, `supply-execution-capability`, `adjust-policy`).
- **Provenance** — which records, ontologies, or policies contributed.

The pattern follows the existing `ProtocolCompilerDiagnostic` shape in `server/src/compiler/protocol/ProtocolCompiler.ts`.

### 6.2 The five outcomes drive every UX path

`CompilerDiagnosticOutcome` is the load-bearing contract between the compiler and the UI:

| Outcome | Meaning | UX path |
|---|---|---|
| `auto-resolved` | The compiler resolved an ambiguity without asking. Informational. | Summary-only surface. |
| `needs-confirmation` | One or more candidates satisfy a role; biologist must pick. | Clickable quick-fix (single-select) or chatbox (50 §12). |
| `needs-missing-fact` | A required fact is absent. Compile is blocked on human input. | Form field for the missing fact; possibly backed by an extraction-draft. |
| `policy-blocked` | Active policy profile refuses this action at the current strictness. | Request-approval flow (when profile allows) or authoring another profile. |
| `execution-blocked` | Capability gap at execution time (no qualified rotor, no certified BSC). | Lab-state or capability authoring required before re-compile. |

The outcome, not the message, is what determines how the UI surfaces the diagnostic. Per-outcome UX is already partially wired; the full surface is Phase 2.

### 6.2.1 Diagnostic outcome is not record status

Two orthogonal axes are easily conflated; naming them here once for the whole suite:

- **Diagnostic outcome** (`CompilerDiagnosticOutcome` — kernel enum): a property of an individual diagnostic emitted *during* a compile. Values: `auto-resolved` / `needs-confirmation` / `needs-missing-fact` / `policy-blocked` / `execution-blocked`.
- **Record status** (per-kind lifecycle state): a property of a *persisted record* describing where it is in its authoring lifecycle. Examples: `planned-run.status = draft | ready | executing | completed | failed` (50 §7.2); `local-protocol.status = draft | active | superseded | retracted` (50 §5.2); `extraction-draft.status = pending_review | partially_promoted | rejected | promoted` (80 §3.1).

`ready` is a planned-run status, not a diagnostic outcome. `auto-resolved` is a diagnostic outcome, not a record status. The compiler reads record statuses as inputs and emits diagnostic outcomes; it does not write record statuses except where the pipeline explicitly mints a new record. The two vocabularies do not overlap.

### 6.3 Partial-context diagnostics

Per 30 §6, passes that compute context against incomplete inputs emit a `needs-missing-fact` diagnostic pointing at the absent field and tagging every assertion that inherits from the partial context with a "supported by partial context" note. The compiler does not refuse to produce results for partial contexts; it produces them with the diagnostic attached. This is the first-class carrier of "we computed what we could; here's what we couldn't."

### 6.4 Source-drift diagnostics

Per 30 §7, a `context-promotion` locks `source_content_hash` at promotion time. During later compiles, the drift-detection pass recomputes the current context hash and, on mismatch, emits a `needs-confirmation` diagnostic: "the source context for promotion `P` has changed since promotion; re-promote or confirm." Implementation is already factored out in `server/src/context/PromotionCompiler.ts` (`computeSourceContentHash`, `detectSourceDrift`).

### 6.5 Cascade diagnostics (retraction and lab-state)

Retraction-cascade (40 §7.2) and lab-state-cascade (50 §10.5) both emit `needs-confirmation` diagnostics on downstream records when an upstream record changes. The walker is shared: `server/src/compiler/labState/LabStateCascadeWalker.ts` is the Phase-1 prototype; 40 §7.2's general retraction cascade reuses the same mechanism in Phase 2.

## 7. Caching

### 7.1 Content-hash-keyed, in-memory, auto-invalidating

The cache key for a compile is a SHA-256 over the canonicalized input envelope plus the resolved policy profile plus the versions of every derivation-model the derive_context passes used. Cache value is the full `CompileResult`.

Canonicalization is the same recursive key-sort used by `computeSourceContentHash` in `PromotionCompiler.ts`. Canonicalization divergence between cache key and promotion hash is forbidden — both use the single canonicalize helper.

### 7.2 Invalidation

The cache is in-memory per server process. It is invalidated by:

- Upstream record edit (touched via `GitRepoAdapter` write; the repo adapter signals the cache).
- Policy-profile change (profile service signals the cache).
- Derivation-model version bump (model store signals the cache).

Invalidation is eager on the signal path; no time-based TTL. A restart flushes the cache.

### 7.3 Non-goal: disk cache

Per 00 §6, disk-persisted compile caches are a non-goal in v1. The in-memory cache is the entire v1 mechanism.

### 7.4 What the cache does not paper over

A cache miss is never an error. A cache hit is never authoritative for correctness; it only saves work. Every result in the cache was, at time of insertion, produced by a full compile.

## 8. Policy profiles

### 8.1 Profiles modulate strictness, not rules

The five seed profiles — `sandbox`, `tracked`, `regulated`, `notebook`, `GMP` — each map to a YAML bundle in `schema/core/policy-bundles/` (today: `sandbox`, `tracked`, `regulated`, `notebook`; `gmp` in Phase 2). A profile declares, per rule, the severity to apply and whether the diagnostic outcome escalates.

The compiler does **not** add rules per profile. Rules live in `*.lint.yaml` and pass implementations. A profile changes how the compiler reacts to each rule's findings.

### 8.2 Evaluator

`server/src/policy/PolicyProfileService.ts` exists and is authoritative. The kernel calls it with a `PolicyActionRequest` (`action`, `target`, `detail?`) and the service returns a `PolicyEvaluation` whose `decisions[]` are folded into the result's diagnostics via `policyDecisionDiagnostics` (kernel-internal helper). This path is preserved.

### 8.3 Profile resolution at compile time

The `resolve_policy_profile` pass in each pipeline (family: `normalize`) resolves the active profile from input metadata, workspace config, or a default. The resolved profile is part of the cache key (§7).

### 8.4 Profile non-goals in Phase 1

- Per-user profile overrides.
- Time-bounded profile activation.
- Automatic profile inference from record content.

All three are authored explicitly in Phase 1.

## 9. Testing strategy

### 9.1 Golden-file tests are primary

Per-pipeline golden tests: an input envelope + a pinned config produce a pinned `CompileResult`. Existing examples: `server/src/compiler/protocol/ProtocolCompiler.test.ts`, `server/src/compiler/CompilerKernel.test.ts`, `server/src/compiler/labState/LabStateCascadeWalker.test.ts`. The pattern: fixture in / snapshot out, reviewed in PR, regenerated on intentional change.

### 9.2 Per-pass unit tests for complex passes

Simple passes (thin wrappers over the record store) are covered by golden tests. Passes with non-trivial logic — disambiguate, capability_check, derive_context, structural_correspondence — get a dedicated unit-test file.

### 9.3 Property tests for kernel invariants

- **Determinism**: `compile(x) === compile(x)` byte-equal.
- **Replay idempotence**: re-running the same compile against the same record store yields the same `CompileResult`, including provenance timestamps that are pinned to input (not clock).
- **Content-hash stability**: semantically-equivalent inputs (key-reordering) produce the same cache key and the same `source_content_hash`.

Property tests are `server/src/compiler/*.property.test.ts` (to add; pattern set by `PromotionSourceDrift.test.ts`).

### 9.4 No round-trip through `pnpm test` in compiler-specs verification

Per repo norm, compiler-specs spec verifications use `tsc --noEmit` + targeted unit invocations, not the full `pnpm test`. The full suite runs in CI; spec-level verification targets the specific new code.

## 10. The ROS workflow through the compiler

For the canonical ROS positive-control workflow:

1. **Extraction-compile** on `DOC-thermo-dcfda-kit` (PDF) → `extraction-draft XDR-thermo-dcfda-v1` with candidate `protocol` `PRT-ros-positive-control-cccp-v1`, candidate operator refs, candidate material-spec mentions. Candidates below confidence threshold land in `ambiguity_spans[]`.
2. **Promotion-compile** (extraction-promotion branch, §5.4) on the draft's candidates → canonical `PRT-*` / `MSP-*` records + parallel `extraction-promotion` records (XPR-*) locking the candidate draft hash and carrying the source_artifact_ref back to the PDF.
3. **Protocol-compile** on `PRT-ros-positive-control-cccp-v1` → validated global protocol + lint diagnostics (schema, ontology-predicate checks).
4. **Local-protocol-compile** on `LPR-ros-hepg2-spectramax-v1` → structural-correspondence pass against `PRT-*`, substitution validity against context-role predicates, lab-state references resolved (`LST-spectramax-filter-cube`, `LST-dcfda-stock-location`).
5. **Run-plan-compile** on `PLR-ros-run-2026-04-17` → bindings resolved (plate, operator, aliquots), capability check (SpectraMax on greiner-655087 at ex485/em535), per-step contexts derived, policy profile applied. Result: `protocolCompilation.status = ready` (or a diagnostic path).
6. **Derive-context passes** during (4) and (5) invoke `ideal-mixing` (70) for composition math and `hepg2-growth-default` (70) for expected cell count; both model versions pin onto the resulting context.

Every entrypoint from §5 is exercised. Every family from §4.2 runs. Every diagnostic outcome in §6.2 has at least one surfacing path in this workflow.

## 11. Error model

### 11.1 Three distinct error classes

| Class | Meaning | Handling |
|---|---|---|
| **Diagnostic** | Compile completed; the result carries findings for the biologist. | Returned inside `CompileResult.diagnostics`. Normal path. |
| **Recoverable failure** | A pass could not proceed but the pipeline can surface a partial result (e.g., capability_check fails; still returns the plan with `execution-blocked`). | Returned inside `CompileResult` with outcome-bearing diagnostics. Normal path. |
| **Compiler bug** | Invariant violated (e.g., undefined pass family, YAML pipeline fails schema validation, kernel contract broken). | Throws. Surfaces in logs as a crash, not as a biologist-facing diagnostic. |

The third class is meant to be rare and loud. It is not a fallback for the first two.

### 11.2 No silent degradation

A pipeline that cannot run a pass (dependency unsatisfied, input missing a required field) emits a `needs-missing-fact` diagnostic and skips the dependent passes. It does **not** proceed as if the pass ran. Every subsequent pass has to check its own `depends_on[]` artifacts in state.

## 12. Provenance

Every `CompileResult` carries a `CompilerProvenanceEnvelope` (§3). The envelope's `sources[]` lists every record, ontology term, policy profile, user-input field, and system resource that contributed to the result. The envelope's `notes[]` records per-stage events ("bound role X to candidate Y via substitution," "policy profile Z allowed this action," "retrieved derivation-model DM-ideal-mixing version 3").

Provenance is the carrier that makes promotion and retraction cascades possible (30 §7, 40 §7.2). It is not an optional audit field; it is how the system answers "where did this come from."

## 13. Phase 1 scope and deltas

### 13.1 Existing and preserved

1. **CompilerKernel** (`server/src/compiler/CompilerKernel.ts`) — extend-only; public surface preserved.
2. **ProtocolCompiler** (`server/src/compiler/protocol/ProtocolCompiler.ts`) — refactored per 50 §5.6; remains the `protocol-compile` / `local-protocol-compile` entrypoint-adapter.
3. **MaterialCompiler** (`server/src/compiler/material/MaterialCompiler.ts`) — preserved.
4. **PolicyProfileService** (`server/src/policy/PolicyProfileService.ts`) — preserved.
5. **PromotionCompiler** (`server/src/context/PromotionCompiler.ts`) — serves `promotion-compile`; preserved + drift detection (30 §7).
6. **StructuralCorrespondencePass** (`server/src/compiler/protocol/StructuralCorrespondencePass.ts`) — wired into pipeline as a `validate`-family pass.
7. **LabStateCascadeWalker** (`server/src/compiler/labState/LabStateCascadeWalker.ts`) — wired into pipeline as a `validate`-family pass downstream of lab-state edits.
8. **LocalProtocolBuilder** (`server/src/compiler/protocol/LocalProtocolBuilder.ts`) — an `expand`-family pass.

### 13.2 New in Phase 1

1. **Pipeline dispatcher** (`server/src/compiler/pipeline/PipelineDispatcher.ts` — new). Reads a `CompilePipeline` YAML from the registry, resolves passes to pass implementations, runs the dag respecting `depends_on[]` and `when`, threads state, emits the unified `CompileResult`.
2. **Pass registry** (`server/src/compiler/pipeline/PassRegistry.ts` — new). Maps `pass id` → pass implementation. Pass implementations live alongside their current subsystems; the registry is a thin indirection.
3. **Compile cache** (`server/src/compiler/cache/CompileCache.ts` — new). Content-hash-keyed in-memory LRU. Subscribes to repo / policy / model invalidation signals.
4. **Missing pipeline YAMLs**: `local-protocol-compile.yaml`, `promotion-compile.yaml`, `ingestion-compile.yaml`.
5. **Partial-context diagnostic pass** (30 §6.1). New pass implementation in the `derive_context` family.
6. **End-to-end golden test** exercising the full ROS workflow through every entrypoint (§10).

### 13.3 Phase 2 and beyond

- **GMP policy bundle** + its escalation semantics.
- **Full retraction cascade** for claims/assertions (40 §7.2 Phase 2).
- **Disk-persisted compile cache** (if sessions span process restarts and warm-start becomes material).
- **Per-user / workspace-scoped policy overrides**.
- **Chatbox UX** for `needs-confirmation` diagnostics (data carrier exists today).

### 13.4 Migration

No committed compile results exist on disk today; the cache is per-process. No data migration. Code migration is the dispatcher + cache + missing pipelines + partial-context diagnostic pass; all additive.

## 14. Summary of deltas

| Action | Target | What |
|---|---|---|
| Preserve | `CompilerKernel.ts` | Diagnostic / binding / provenance machinery authoritative |
| Preserve | `ProtocolCompiler.ts`, `MaterialCompiler.ts`, `PolicyProfileService.ts`, `PromotionCompiler.ts`, `StructuralCorrespondencePass.ts`, `LabStateCascadeWalker.ts`, `LocalProtocolBuilder.ts` | Existing services as-is or per their owning spec |
| Preserve | `compile-pipelines/*.yaml`, `compile-pipeline.schema.yaml` | Existing pipeline definitions |
| **Add** | `server/src/compiler/pipeline/PipelineDispatcher.ts` | Dispatches a pipeline YAML (§4) |
| **Add** | `server/src/compiler/pipeline/PassRegistry.ts` | Pass-id → implementation registry |
| **Add** | `server/src/compiler/cache/CompileCache.ts` | In-memory content-hash cache (§7) |
| **Add** | `compile-pipelines/local-protocol-compile.yaml` | Pipeline for local-protocol-compile |
| **Add** | `compile-pipelines/promotion-compile.yaml` | Pipeline for promotion-compile |
| **Add** | `compile-pipelines/ingestion-compile.yaml` | Pipeline for ingestion-compile |
| **Add** | `server/src/compiler/context/PartialContextDiagnosticPass.ts` | Emits `needs-missing-fact` on partial contexts (30 §6.1) |
| **Add** | End-to-end golden test of ROS workflow through every entrypoint | §10 |

Four truly new services (dispatcher, registry, cache, partial-context pass). Three new YAMLs. One end-to-end test. The rest is confirmation.

---

## Appendix A. What this spec does *not* decide

- **Record kinds introduced anywhere in the system** — 20 / 30 / 40 / 50.
- **How derivation models compute model-derived fields** — 70.
- **How AI proposes candidate records** — 80.
- **Schema triplet mechanics** — existing project convention, `CLAUDE.md`.
- **GitRepoAdapter behavior** — preserved as-is per 00 §5.
- **REST / MCP surface specifics** — projection of entrypoints; not restated here.

## Appendix B. Terminology

- **Entrypoint** — the public compile function for a specific input type (`protocol-compile`, etc.).
- **Pipeline** — the YAML-declared ordered passes an entrypoint runs.
- **Pass** — a single pure step within a pipeline, belonging to one family.
- **Family** — one of seven pass categories (parse / normalize / disambiguate / validate / derive_context / expand / project).
- **Kernel** — the domain-agnostic diagnostic / binding / policy / provenance engine.
- **Dispatcher** — the code that loads a pipeline YAML and drives passes through the kernel.
- **Result** — `CompileResult` / `CompilationResult<T>` — the unified envelope returned by every entrypoint.
