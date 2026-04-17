# Authority Map — computable-lab Biology Compiler Specifications

Status: Active
Date: 2026-04-16
Supersedes: `specifications/*.md`

---

## 1. Purpose

This document declares which specification is authoritative for each concept in computable-lab, following the decision to re-center the system around a biology compiler.

The specifications in `compiler-specs/` are the authoritative source. The prior documents in `specifications/` are deprecated; their content is redistributed across the new suite (table below).

This is not a rewrite for its own sake. The prior documents carried overlapping claims (three specs all touched material identity; two specs both defined verbs; one document was aspirational and two were status-quo). The new suite has one authoritative home per concept.

---

## 2. The new authoritative suite

Reading order follows dependency order. Each spec depends on the ones before it.

| # | File | Owns |
|---|---|---|
| 10 | `10-charter.md` | Design principles, rationale for compiler-centered pivot, non-goals |
| 20 | `20-event-graph-ir.md` | Canonical event graph: nodes, edges, event-type catalog, 5-family grouping, transfer/aliquot semantics, event preconditions |
| 30 | `30-context.md` | Contexts (computed from events), time coordinates, partial contexts, plate-contexts, context diffs, context promotion |
| 40 | `40-knowledge.md` | Claims (literature triples), assertions (scope-generalized), context-roles, evidence, retraction |
| 50 | `50-protocol-lifecycle.md` | High-level-protocol, local-protocol, planned-run, executed-run, deviations, lab-state, planning/binding UX |
| 60 | `60-compiler.md` | Kernel, per-input-type entrypoints, data-driven pipelines, diagnostics, caching, testing, policy profiles |
| 70 | `70-derivation-models.md` | YAML multi-step worksheet engine, model versioning, context pinning, unit checking |
| 80 | `80-ai-pre-compiler.md` | Extraction drafts, mention resolution, ambiguity resolution UX, configurable model backend |

---

## 3. Deprecations and content redistribution

The following documents in `specifications/` are **deprecated**. They remain in the repo for historical reference but are no longer authoritative. Their content is redistributed as follows:

### 3.1 `specifications/specification.md` → deprecated

Top-level spec covering records, identity, schema triplet, Git-as-source-of-truth.

- Core principles (declarative, Git-native, schema-driven) → `10-charter.md`
- Schema triplet definition (schema/lint/ui YAML) → preserved as-is in existing code and `CLAUDE.md`; not restated in new suite
- Record / RecordEnvelope / identity model → preserved as-is; not restated

### 3.2 `specifications/workflow-and-datatypes-manifesto.md` → deprecated

Datatypes, 5-level materials, verbs, protocols, knowledge.

- Material hierarchy (5 levels) → referenced by `30-context.md` (context contents) and `20-event-graph-ir.md` (event participants); full hierarchy doc retained as ground truth (see §3.3)
- Verb catalog → `20-event-graph-ir.md` (canonical event-type catalog with families)
- Protocol definitions → `50-protocol-lifecycle.md`
- Knowledge concepts → `40-knowledge.md`

### 3.3 `specifications/material-identity-and-resolution.md` → deprecated (but ground-truth content preserved)

Material hierarchy, search precedence, MaterialPicker UX.

- 5-level material hierarchy (Concept / Formulation / Vendor Product / Instance / Aliquot) → remains the authoritative reference for material structure, cited from `30-context.md`; not contradicted, not restated
- Three-source search (local / ontology / vendor) → `80-ai-pre-compiler.md` (mention resolution)
- MaterialPicker / OntologySidebar UX → no new home in compiler-specs; existing UX decisions remain; future UX evolution addressed in separate UI specs (not part of this suite)

The decision to deprecate this file while preserving its content is deliberate: the material hierarchy itself is correct and load-bearing; it just doesn't need to be restated in the new suite. The deprecation signals "this is no longer the primary entry point" without invalidating the content.

### 3.4 `specifications/api-and-mcp-reference.md` → deprecated

REST + MCP surface reference.

- Not replaced by a single spec. The API surface becomes a projection of the compiler's entrypoints (`60-compiler.md`) and the MCP tools list (existing code).
- Will be regenerated programmatically from compiler metadata rather than maintained as a hand-authored document.

### 3.5 `specifications/biology-compiler.md` → deprecated (in favor of the suite it outlined)

This was the draft charter that motivated the pivot. Its content is redistributed across the new suite, with corrections from this planning session:

- Core principles → `10-charter.md`
- Verb-centric event model → `20-event-graph-ir.md`
- Context / knowledge layer separation → `30-context.md` + `40-knowledge.md`
- Material model (3 levels, INCORRECT — the 5-level hierarchy is authoritative) → `30-context.md` references existing 5-level
- Protocol lifecycle → `50-protocol-lifecycle.md`
- Compiler pipeline → `60-compiler.md`
- Derivation models (proposed "biological-state-model") → `70-derivation-models.md` (generalized, drops "biological" label — see §4.4)
- Pre-compiler AI stage → `80-ai-pre-compiler.md`

---

## 4. Corrections carried forward from the planning session

The draft biology-compiler.md contained several proposals that were corrected during the planning session. The new suite reflects the corrections.

### 4.1 Material hierarchy: 5 levels, not 3

The draft proposed Concept / Formulation / Instance. The existing code and `material-identity-and-resolution.md` use Concept / Formulation / Vendor-Product / Instance / Aliquot. The 5-level model is authoritative. Vendor-Product and Aliquot are real distinctions (commercial identity and deliberate long-term-stock splitting, respectively).

### 4.2 Layer naming: event-derived / model-derived / observed

The draft split "deterministic process layer" from "biological state / expectation layer." This is the wrong axis. Model-derived state is also deterministic given its inputs. The correct axis is the source of truth for each field:

- **event-derived** — computable from events alone (volumes, nominal concentrations, lineage)
- **model-derived** — computable from events plus a declared `derivation-model` (expected cell count, equilibrated pH, predicted viability)
- **observed** — entered from instruments or expert judgment (plate reader output, biologist's confluence call)

"Biological" is not a layer label; it describes the domain of a specific model. Non-biological models (dilution arithmetic, ideal mixing) share the mechanism.

### 4.3 Claims vs. assertions: keep both, invert dependency

The draft collapsed the distinction. The existing `knowledge/claim` and `knowledge/assertion` schemas draw a real line: claims are literature triples (world-level, citation-anchored), assertions are experimental statements grounded in contexts. Both are retained. The change: `assertion.claim_ref` becomes **optional**, not required. Assertions stand alone; they opt into the world-claims graph when relevant.

### 4.4 New record kinds introduced

- `context-role` — typed role template for contexts ("positive-control-for-ros"), checked against context structure at compile time
- `lab-state` — time-varying lab reality (which centrifuge lives where, which rotor is mounted, ambient conditions); local-protocols reference lab-state for environmental assumptions
- `derivation-model` — reusable YAML worksheet that computes model-derived context fields; generalizes beyond biological growth models to all parameterized derivations
- `deviation` — first-class record linking planned-event to actual-event with reason and severity
- `extraction-draft` — AI pre-compiler output; structured candidate records with confidence and ambiguity spans, for human review before promotion to canonical state

### 4.5 Scope generalization for assertions

Current `assertion.scope: {control_context, treated_context}` hardcodes comparative two-arm experiments. The new scope supports four shapes: `single_context`, `comparison` (N arms), `series` (time/dose sweeps), `global` (world claim, no experimental scope). The two-context comparison remains available as a case of `comparison` with two arms.

### 4.6 Context promotion as the reproducibility mechanism

A computed context can be **promoted** into a named, reusable canonical artifact with the source event graph as preparation provenance. Target kinds: `material-spec`, `material-instance`, `aliquot`, `plate-layout-template`, `assay-definition`, `context-snapshot`. Append-only versioning (`supersedes: <prior-id>`). Promotion is a compiler operation; selection is arbitrary; per-target-kind constraints are compiler-enforced. Promotion is **naming, not pooling** — pooling is a distinct event.

### 4.7 Role of the existing CompilerKernel

The existing `server/src/compiler/CompilerKernel.ts` is **extended**, not replaced. Its domain-agnostic diagnostic/outcome machinery is preserved. New per-input-type entrypoints (`protocol-compile`, `run-plan-compile`, `promotion-compile`, `extraction-compile`, etc.) wrap the kernel with specialized input normalizers and output projectors. Pipeline orchestration becomes data-driven YAML (§60).

---

## 5. Preserved without restatement

These structural commitments of the existing system are preserved and not restated in the new suite:

- **Schema triplet** (`*.schema.yaml` / `*.lint.yaml` / `*.ui.yaml`) — authoritative source in `schema/`, documented in `CLAUDE.md`
- **RecordEnvelope** — `server/src/types/index.ts`
- **Git as source of truth** — no database, YAML files in Git
- **Ajv as sole validation authority** — `server/src/validation/AjvValidator.ts`
- **LintEngine for business rules** — `server/src/lint/LintEngine.ts`, rules declared in `*.lint.yaml`
- **GitRepoAdapter** — `server/src/repo/GitRepoAdapter.ts`, with direct-commit-and-push as the v1 Git workflow (PR-based workflow deferred)

Changes to these layers are not in scope for the biology-compiler pivot.

---

## 6. Explicit non-goals (deferred or excluded)

These were considered and deferred or rejected for v1:

- **Opentrons / Integra Assist importers** — deferred to Phase 3+. Current ingestion covers vendor docs and literature; robot-artifact import is valuable but not gating.
- **Round-trip export to vendor formats** — non-goal. Import and export are independent projections; round-trip is aspirational and expensive.
- **Scheduling contention at plan-compile time** — deferred. Equipment availability ("the centrifuge is in use today by Alice") is not modeled in v1; capability matching is.
- **Disk-based compilation cache** — non-goal for v1. In-memory content-hash cache only.
- **PR-based Git workflow** — deferred. Direct-commit-and-push retained.
- **Concurrent event semantics beyond multi-channel pipettes** — non-goal. Biology labs are serial; the single exception (multi-channel pipettes) is modeled as atomic multi-well events.
- **Carryover / contamination modeling in transfers** — deferred to v2. `carryover_policy` field reserved for extension.

---

## 7. Cross-reference index

Where to find authoritative content for a given topic:

| Topic | Authoritative spec |
|---|---|
| Design principles, non-goals | `10-charter.md` |
| Event types, verbs, 5 families | `20-event-graph-ir.md` |
| Transfer semantics, aliquot | `20-event-graph-ir.md` |
| Event preconditions | `20-event-graph-ir.md` |
| Contexts (derived state) | `30-context.md` |
| Time coordinates | `30-context.md` |
| Context promotion | `30-context.md` |
| Plate-context | `30-context.md` |
| Context diff | `30-context.md` |
| Claims, assertions | `40-knowledge.md` |
| Context-roles | `40-knowledge.md` |
| Evidence | `40-knowledge.md` |
| Retraction | `40-knowledge.md` |
| High-level protocols | `50-protocol-lifecycle.md` |
| Local protocols | `50-protocol-lifecycle.md` |
| Planned runs, binding UX | `50-protocol-lifecycle.md` |
| Executed runs, deviations | `50-protocol-lifecycle.md` |
| Lab state | `50-protocol-lifecycle.md` |
| CompilerKernel extension | `60-compiler.md` |
| Compile entrypoints | `60-compiler.md` |
| Compile pipelines (YAML) | `60-compiler.md` |
| Diagnostics | `60-compiler.md` |
| Caching, testing | `60-compiler.md` |
| Policy profiles | `60-compiler.md` |
| Derivation models | `70-derivation-models.md` |
| Model versioning, pinning | `70-derivation-models.md` |
| Unit checking | `70-derivation-models.md` |
| AI pre-compiler, extraction drafts | `80-ai-pre-compiler.md` |
| Mention resolution | `80-ai-pre-compiler.md` |
| Ambiguity resolution UX | `80-ai-pre-compiler.md` |
| Material hierarchy (5 levels) | `specifications/material-identity-and-resolution.md` (deprecated file, preserved content) |
| Schema triplet | `CLAUDE.md` + `schema/` |
| RecordEnvelope, Git-as-SoT | `CLAUDE.md` + existing code |

---

## 8. Phase 1 deliverable scope

Per the planning session decision:

**Phase 1** = canonical event IR + deterministic compiler kernel extension + context promotion + one real end-to-end workflow (ROS positive control assay).

This means Phase 1 touches specs 20, 30, 40, 60, 70 in depth; specs 50 and 80 partially; spec 10 as framing. Full coverage of all 8 specs arrives across subsequent phases.

The ROS positive control workflow is the single forcing function: every spec in the suite must be able to describe its role in that workflow. If a spec can't, the spec is underspecified or out of scope.
