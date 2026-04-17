# Spec Suite Skeleton — computable-lab Biology Compiler

Status: Skeleton for approval before full drafting
Date: 2026-04-16

This document describes the eight specifications that constitute the biology compiler design, with one paragraph each on what each spec owns, which of the planning-session decisions it resolves, and which other specs it depends on. The goal is to confirm the shape before drafting full content.

The driving workflow for every spec is the **ROS positive control assay**. Each spec must describe its role in that workflow; if it cannot, the scope is wrong.

---

## 10 — Charter

**Owns:** Design principles (YAML-in-Git as source of truth, everything important is declarative, compiler owns correctness, AI is assistant not authority, user-in-the-loop ambiguity, event-derived vs model-derived vs observed as the layer-naming, verb-centric with typed noun participants). Non-goals (Opentrons/Integra importers, round-trip export, scheduling contention, PR-based Git, carryover in v1). Reading order and relationship to the other seven specs. The ROS positive control workflow as the single forcing function.

**Resolves:** Layer-naming correction (§4.2 of authority map). Phase 1 scope definition. Non-goals list. Principles from the deprecated `biology-compiler.md` charter, with corrections.

**Depends on:** Nothing. This is the framing document.

---

## 20 — Event Graph IR

**Owns:** The canonical event graph. Node kinds (events, resources, labware instances, operators, data artifacts). Edge kinds (input_to, output_of, located_in, derived_from, measured_by, actualizes). Event-type catalog grouped into five families: material movement (transfer, add_material, aliquot, harvest, sample), state transformation in place (mix, incubate, centrifuge, wash, heat, cool), lifecycle (create_container, seal, unseal, assign_source, assign_destination), measurement (read, measure, image, sample_operation), composition (derive_formulation, prepare). Phase 1 verb subset (transfer, add_material, mix, incubate, measure, create_container, aliquot). Transfer semantics: linear combination + volume additivity as the `ideal-mixing` derivation model, `carryover_policy` field reserved with v1 default `ignored`. Aliquot as a distinct *declared* gesture (master → long-term stock split), not equivalent to transfer. Event preconditions as declared context-structure requirements, checked at plan-compile time. Multi-channel pipette events as atomic multi-well arrays (not N parallel events).

**Resolves:** #11 (transfer semantics), #12 (5-family grouping), #13 (Phase 1 verb subset), #10 (event preconditions in Phase 1), #6 (series-only with multi-channel exception).

**Depends on:** 10-charter.

---

## 30 — Context

**Owns:** Contexts as computed state of a subject at a timepoint. Subject types (well, tube, plate, mouse, cohort, collection). Context contents reusing the existing `core/datatypes/composition-entry.schema.yaml`. Plate-context as a first-class peer to well-context (not a union of well-contexts), with plate-level state (seal, orientation, temperature). Time coordinates: four forms (ISO datetime, event-sequence index, named phase, duration offset) with precedence rules (exact datetime > event-index > named phase > offset) and compile-time resolution to concrete values. Partial contexts (computed with diagnostics when inputs are incomplete; downstream assertions inherit "supported by partial context" warnings). Context diff as a first-class compiler operation (between timepoints, between subjects, between expected and observed — the computational basis for assertion outcomes). Context cache (in-memory, content-hash-keyed, auto-invalidating). **Context promotion**: arbitrary selection, per-target-kind constraint checks (homogeneity for `material-spec`, single-subject for `material-instance`, etc.), six target kinds (`material-spec`, `material-instance`, `aliquot`, `plate-layout-template`, `assay-definition`, `context-snapshot`), append-only versioning with `supersedes`, snapshot locked at promotion time, source-drift diagnostics on retroactive event-graph edits downstream of promotions. Selections as (possibly ephemeral) `collection` references. Dual representation of observed properties: plain value or `{value, assertion_ref}` when the value carries expert judgment. Model-version pinning (context records which `derivation-model` versions were used; re-computation re-uses pinned versions by default).

**Resolves:** #3 (context is key, computed, promotable), #5 (time coordinates), #7 (partial contexts), #8 (diffs), #9 (cache invalidation), #4 (plate-context first-class), #41 (model version pinning), plus context-promotion decisions A1/A2/A3 from the load-bearing set, plus #21 (dual-representation observed properties).

**Depends on:** 10-charter, 20-event-graph-ir.

---

## 40 — Knowledge

**Owns:** The three knowledge-layer record kinds and their relationships. Claims as literature triples `(subject, predicate, object)` with predicates drawn from the existing `predicates.registry.yaml` (28 ontology-backed predicates across six families). Assertions as standalone experimental statements with generalized scope (`single_context` | `comparison` | `series` | `global`), optional `claim_ref` to opt into the world-claims graph, outcomes (measure, direction, effect_size) computed from or checkable against context diffs, evidence refs. `claim_ref` is **optional**, not required. Context-roles as a new kind: typed role templates with predicate prerequisites expressed in the extended lint DSL (`all / any / not / exists / context_contains / has_material_class / state_is`), stored as YAML records in `records/registry/context-roles/`. Applying a context-role to a context is a typed check that produces `verified` / `unsupported` / `ambiguous`. Evidence as bundles linking typed sources (result, context, event, publication, file, event_graph) to supported assertions or claims; many-to-many supported via `supports[]` array. Retraction as explicit `status: retracted` with reason in Phase 1; cascade diagnostics (walk provenance, flag dependent assertions) in Phase 2. Multi-assertion evidence bundling remains supported natively by the existing schema shape.

**Resolves:** Knowledge layer questions 1–6 from the pre-walk-home batch (keep both, invert dependency, add context-role, generalize scope, optional claim_ref, clean up legacy fields); #19 (context-roles as YAML records), #20 (same predicate DSL), #21 (observation as property with optional assertion-backing), #22 (explicit retraction, cascade later), #23 (evidence across multiple assertions).

**Depends on:** 10-charter, 30-context.

---

## 50 — Protocol & Run Lifecycle

**Owns:** Four distinct record kinds for the protocol/run lifecycle. `high-level-protocol` (platform-agnostic, often vendor-supplied or literature-derived; ingestion target only in Phase 1, no rich editing UI). `local-protocol` (lab-specific, `inherits_from: <HLP>` with structured overrides — equipment bindings, timing policies, tip policies, substitutions; structural correspondence required: same verbs, same order; diff-viewable against parent; re-compilable when parent changes). `planned-run` (instance-level binding of local-protocol to real material-instances, labware-instances, operators; capability-matching pass in the compiler checks binding validity — "can this rotor spin at 15,000g with this labware?" — and emits diagnostics on violations; AI-proposed plan quality ranking separate from correctness; biologist has final say). `executed-run` (actualized event graph, timestamps, operator, actual values; references `planned_run` via `actualizes`). `deviation` as a first-class kind linking `{planned_event, actual_event, reason, severity}`. `lab-state` as a new first-class kind: time-varying declarative records capturing current lab reality (equipment locations, mounted rotors, ambient conditions, stock levels); local-protocols reference `lab-state` for environmental assumptions; when lab-state changes, compiler flags local-protocols whose assumptions just stopped holding (same cascade mechanism as retraction). Planning UX: chatbox-style ambiguity resolution primarily, with clickable quick-fixes for simple cases.

**Resolves:** #2 protocol-lifecycle (distinct kinds), #14 (overlay+inheritance for local-protocol authoring), #15 (capability-matching + plan-quality scoring), #16 (separate deviation records), #17 (same verbs, same order), #18 (Phase 1 lifecycle scope), plus the lab-state decision from this session, plus #38 (chatbox-primary ambiguity resolution UX).

**Depends on:** 10-charter, 20-event-graph-ir, 30-context.

---

## 60 — Compiler

**Owns:** The compiler architecture. The existing `CompilerKernel` is extended, not replaced — its diagnostic/outcome machinery (`ready` / `needs-confirmation` / `needs-missing-fact` / `policy-blocked` / `execution-blocked`) is preserved. Per-input-type entrypoints wrap the kernel: `protocol-compile`, `local-protocol-compile`, `run-plan-compile`, `promotion-compile`, `extraction-compile`, `ingestion-compile`. Each entrypoint has a specialized input normalizer and output projector; all share the unified `CompileResult` shape. Compile pipelines are data-driven YAML (e.g. `schema/registry/compile-pipelines/run-plan-compile.yaml`) with ordered passes, conditional branches ("if input has unstructured source, run ai_extraction_pass first"), and declared pass dependencies. Pass families: parse/structure, semantic normalization, disambiguation, validation, context derivation, expansion/lowering, projection. Diagnostics are biologist-readable (templated messages with path references, same pattern as existing lint); structured codes are optional metadata for tooling. Caching is in-memory, content-hash-keyed, auto-invalidating. Policy profiles (sandbox / tracked / regulated / notebook / GMP) modulate diagnostic strictness — same rules, different severity thresholds — via a declarative override table per profile; profiles do not add new rules. Testing strategy: golden-file tests primary (event-graph-in → expected-context/diagnostics-out), property-based tests for kernel invariants (determinism, replay idempotence, content-hash stability), per-pass unit tests for complex passes.

**Resolves:** #24 (per-input-type entrypoints), #25 (data-driven YAML pipelines), #26 (biologist-readable diagnostics), #27 (in-memory content-hash cache), #29 (policy profiles modulate strictness), #30 (golden-file-primary testing), #33 (extend existing kernel).

**Depends on:** 10-charter, 20-event-graph-ir, 30-context, 40-knowledge, 50-protocol-lifecycle (for compile targets).

---

## 70 — Derivation Models

**Owns:** The YAML multi-step worksheet engine that computes model-derived context fields. Each `derivation-model` record declares `inputs` (named fields with units), `steps` (ordered list of named intermediate expressions with units, evaluated in order, per-step unit-checked), and `output` (which step's value is the model's result). Expressions use a math.js-style syntax with a hard allowlist of functions (`+`, `-`, `*`, `/`, `**`, `log`, `exp`, `min`, `max`, `clamp`, plus declared biology primitives added over time). Models are append-only versioned (new version = new record with `supersedes`). Contexts record the version of each model used at compute time (`derivation_versions: {DM-growth-hepg2: 3}`); re-computation re-uses pinned versions unless explicitly told to upgrade. Models are domain-agnostic: `ideal-mixing` for linear combination + volume additivity is a model; `hepg2-growth-default` for expected cell count is a model; `ph-equilibration` is a model. No distinction at the engine level between "biological" and "non-biological" — domain is metadata. Authoring: software team seeds a starter library; bench biologists add models via PR; specialists author complex ones. Target audience: models must be human-readable in Git diffs.

**Resolves:** #8 from the original load-bearing list (derivation-model engine = multi-step YAML worksheet), #6 from the same (general mechanism, biological is metadata), #41 (model-version pinning), plus the "who writes models" question from this session (mixed: seed library + PR contributions).

**Depends on:** 10-charter, 30-context (models feed context).

---

## 80 — AI Pre-Compiler

**Owns:** The AI stage that sits in front of the deterministic compiler for messy inputs. Model-agnostic architecture (current deployment: Qwen3.5-9B local; configurable to Claude, other models, or local). Role: turn unstructured artifacts (vendor PDFs, prose SOPs, literature procedures, user free-text) into candidate declarative records for human review. Output is a formal `extraction-draft` record kind: structured candidate events, candidate entities, confidence per item, ambiguity spans, source-artifact reference. User reviews draft, promotes pieces to canonical records via the promotion compiler entrypoint. Mention resolution extended beyond materials/equipment/people to labware, protocols, claims, and contexts. Ambiguity resolution UX: chatbox-style dialogue as the primary mode (biologist converses with the AI to resolve ambiguities), with clickable quick-fixes for simple cases (single-select from proposed candidates). AI outputs compiler-native structures (YAML fragments, edit intents, extraction-drafts) — never freeform prose as canonical output. AI does not write canonical records directly; all writes go through human review + compiler validation.

**Resolves:** #37 (model-agnostic, current Qwen), #28 (formal extraction-draft kind), #38 (chatbox primary, clickable secondary), #39 (extended mention resolution), plus pre-compiler principles from the charter.

**Depends on:** 10-charter, 20-event-graph-ir (candidate events target this IR), 30-context (promotion is where drafts become canonical), 60-compiler (extraction-compile is an entrypoint).

---

## Dependency graph

```
        10-charter
            │
    ┌───────┼───────┐
    ▼       ▼       ▼
   20     (all)   (all)
   │
   ▼
   30 ──────┐
   │        │
   ▼        ▼
   40       70
   │        │
   ▼        │
   50       │
   │        │
   ▼        ▼
   60 ◀─────┘
   │
   ▼
   80
```

Reading order for implementation: 10 → 20 → 30 → 40 → 50 → 70 → 60 → 80.

Note that 70 (derivation models) depends on 30 but not on 40/50, so it can be drafted in parallel with 40+50 once 30 is settled.

---

## Resolution of the 9 load-bearing open questions

| # | Question | Where resolved |
|---|---|---|
| A1 | Unit of promotion | 30 — arbitrary selection, per-target-kind constraints |
| A2 | Promotion versioning | 30 — append-only with `supersedes` |
| A5 | Time coordinates | 30 — four forms with precedence |
| B10 | Event preconditions | 20 — Phase 1, unified with context-roles mechanism |
| C17 | Protocol "implements" semantics | 50 — same verbs, same order (structural correspondence) |
| D22 | Retraction and cascade | 40 — explicit status in Phase 1, cascade diagnostics later |
| E24 | Compiler entry points | 60 — per-input-type entrypoints sharing kernel |
| E26 | Diagnostic codes | 60 — biologist-readable primary, codes optional metadata |
| F31 + F32 | Driving workflow + Phase 1 scope | 10 — ROS positive control is the single forcing function; Phase 1 = event IR + kernel + promotion + ROS workflow |
| H41 | Versioning and pinning | 70 — models append-only, contexts pin versions |

---

## What happens next

Two options for how to proceed tonight:

**Option A** — Skeleton-only tonight. You review this document and the authority map. If the shape is right, we sleep on it. Subsequent sessions draft each spec in dependency order (10 → 20 → 30 → ...).

**Option B** — Tonight also draft 10-charter.md and 20-event-graph-ir.md in full. These are the two most foundational and the ones where the design is most settled. The other six can follow in subsequent sessions.

**Option C** — Tonight draft all eight specs at high level (the "what each spec says" layer, not deep implementation). Aggressive but possible given how thoroughly decided everything now is.

Your call.
