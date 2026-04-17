# 10 — Charter

Status: Authoritative
Date: 2026-04-16
Role in suite: framing document for all of `compiler-specs/`

---

## 1. Purpose

computable-lab is a biology compiler. This is the operative sentence of the system and it deserves to be taken seriously.

"Compiler" here does not mean code-generator. It means: the deterministic engine that takes declarative descriptions of biological intent and activity, validates them, computes their consequences, and produces artifacts — canonical records, execution plans, diagnostics, derived state, knowledge-layer grounding. Every other surface in the system — UI, AI assistant, importers, exporters, MCP tools — is a client of the compiler, not a peer to it.

This charter names the principles, non-goals, and forcing function that the other seven specifications in `compiler-specs/` must respect. Where a downstream spec appears to contradict this charter, the charter wins or the charter needs revising — both are acceptable outcomes; silent drift is not.

## 2. Core principles

### 2.1 YAML-in-Git is the source of truth

All durable records are declarative YAML files stored in a Git repository. There is no opaque database holding state that diverges from what is in the files. The repository IS the system's memory.

Consequences:
- Every meaningful change is a commit; every meaningful question is answerable by reading files plus replaying the event graph.
- Provenance is structural, not tagged — the Git history and the event graph together form an audit trail by construction.
- The same repository is readable by humans, the compiler, the AI assistant, and external tools without special indexing.

### 2.2 Everything important is declarative

If a rule, mapping, policy, transform, template, UI hint, or relationship can be expressed as data, it must be expressed as data. TypeScript code exists to interpret, validate, render, derive, and project — not to hold domain knowledge.

Consequences:
- Business rules live in `*.lint.yaml`, never in TS branches.
- Compile pipelines are declared in YAML, not orchestrated in code (see 60).
- Biology models (growth, mixing, equilibration) are declared derivation-model records (see 70), not hardcoded formulas.
- Ontology predicates, context-roles, equipment capabilities, event types — all declarative records.
- New domain knowledge enters the system by authoring YAML, not by writing TypeScript.

### 2.3 The compiler owns correctness

The compiler is the single authority for whether a record, plan, or derivation is correct. Not the UI. Not the AI assistant. Not ad-hoc API handlers. Not agent prompts. Not downstream scripts. The compiler.

Consequences:
- UI components emit edit-intents and render compiler projections; they do not contain validation logic.
- The AI assistant proposes candidate records and expresses them in compiler-native form; it does not vouch for correctness.
- Every mutation to canonical state passes through a compiler entrypoint.

### 2.4 AI is assistant, not authority

The AI layer does four things: it extracts candidate structure from unstructured inputs; it translates user natural language into compiler edit-intents; it explains compiler diagnostics and proposes quick-fixes; and it suggests plans where multiple valid choices exist and biologists want ranked options.

The AI does not write canonical records directly. Every AI output is subject to compiler validation and human review before it affects canonical state. See 80.

### 2.5 User-in-the-loop ambiguity resolution

Biological protocols are ambiguous. This is not a defect to eliminate; it is a property of the subject matter. The system treats ambiguity resolution as a first-class workflow.

The compiler emits diagnostics of five kinds:
- **error** — structural invalid; rejected.
- **warning** — valid but questionable; proceeds with flag.
- **ambiguity** — multiple valid interpretations; requires resolution.
- **suggestion** — optional improvement offered.
- **auto-fix available** — compiler can resolve under a declared policy with user confirmation.

Resolution happens primarily through chatbox-style dialogue (biologist converses with the AI until the compiler is satisfied), with clickable quick-fixes for simple cases.

### 2.6 Verb-centric with typed noun participants

Events are primary. Materials, labwares, instruments, operators, and data artifacts are typed participants in events, not the central conceptual unit.

This is a deliberate inversion. Earlier computable-lab thinking was noun-centric: "we have a plate, let's define what's in each well." Compiler-centered thinking is verb-centric: "we did a series of events, let the compiler compute what's in each well." The noun state is derived from the verb history, not authored directly.

Nouns remain crucial. Materials have a 5-level hierarchy (Concept / Formulation / Vendor Product / Instance / Aliquot) that is the authoritative reference for material identity; labwares have a 3-layer model (class / defined / instance). The inversion is not that nouns become unimportant but that they become participants in events rather than the sole holders of meaning.

### 2.7 Three layers of meaning

Context fields (the derived state of any subject at any timepoint) come from three sources. Keeping these sources distinct is what makes the system analytical rather than merely descriptive.

**Event-derived.** Computable from events alone, no model required. Examples: volume after a transfer, nominal concentration after mixing (using the `ideal-mixing` model, which is universal and parameter-free for this purpose), lineage, location. The compiler computes these deterministically.

**Model-derived.** Computable from events plus a declared `derivation-model` record with inputs, steps, and outputs. Examples: expected cell count under a growth model, predicted pH after equilibration, expected viable fraction after treatment. The model is human-authored YAML; the computation is mechanical. Model versions are pinned per context (see 70).

**Observed.** Entered from instruments (plate reader output, image analysis result) or expert judgment (biologist's confluence call). These values may or may not match model-derived expectations; the mismatch is often the interesting signal.

The previous draft distinguished "deterministic process" from "biological expectation." That split was wrong because model-derived state is also deterministic given its inputs. The correct axis is: what is the source of truth for this field — events, a model, or an instrument/expert?

### 2.8 Separation of context and knowledge

The event graph and the contexts derived from it describe *what is*. The knowledge layer describes *what we claim, assert, or expect*. These are different.

"Well A1 contains 100,000 HepG2 cells, 1 µL DMSO, and 0.1 µL CCCP at T=T0" is a context — a computed fact.

"Well A1 is serving as a positive control for ROS measurement" is a knowledge-layer statement — an assertion whose validity depends on the context satisfying a structural predicate (living cells ∧ Complex-I inhibitor ∧ redox-sensitive dye). The assertion is *about* the context.

The compiler computes contexts. Context-roles and assertions (see 40) carry biology-layer meaning and are grounded in contexts. Evidence supports assertions. Claims are literature-level triples that assertions may opt into supporting or contradicting.

Conflating these layers produces plate editors. Separating them produces a biology compiler.

## 3. Non-goals

The following are deliberately excluded from v1 or from the compiler's scope entirely. This list is load-bearing; treating any of these as a stretch goal will compromise the core.

- **Opentrons / Integra Assist native importers.** Deferred to Phase 3+. Current ingestion handles vendor documents and literature. Robot-artifact import is valuable but not gating for the biology compiler thesis.
- **Round-trip export to vendor formats.** Non-goal. Import and export are independent projections. Canonical-graph → Opentrons-script is fine; script → canonical → same-script is not attempted.
- **Scheduling contention at plan-compile time.** The compiler checks capability ("can this rotor spin at 15,000g"), not availability ("is Alice using the centrifuge right now"). Scheduling is out of scope.
- **Disk-based compile cache.** In-memory content-hash cache only.
- **PR-based Git workflow.** Direct commit and push retained; PR workflow deferred.
- **Concurrent event semantics beyond multi-channel pipettes.** Biology labs operate in series. Multi-channel pipettes are the one exception, handled as atomic multi-well events (see 20).
- **Carryover and contamination modeling in transfers.** `carryover_policy` field reserved with default `"ignored"` so v2 can extend without schema breakage. v1 ignores carryover.

## 4. The forcing function: ROS positive control

Every specification in this suite must describe its role in the ROS positive control assay workflow. If a spec cannot, either the spec is underspecified or the scope of the suite is wrong. This is the single end-to-end workflow that drives Phase 1.

**The workflow in brief:**

A biologist wants to measure reactive oxygen species (ROS) production in cultured HepG2 cells treated with test compounds. The assay requires a positive control: wells that should produce high ROS regardless of the test compounds, so that the plate reader and the dye chemistry are verified to be working. The canonical choice is CCCP (or another Complex-I inhibitor), which causes mitochondrial dysfunction and ROS spike.

1. Create a 96-well plate. Seed HepG2 cells into wells A1–H12, 100 µL at 1×10⁵ cells/mL in DMEM/10% FBS.
2. Incubate at 37°C, 5% CO₂, for 24 hours. (Context now has living cells with an expected growth model applied; event-derived has ~200,000 cells nominal, model-derived has the growth expectation, observed has nothing yet.)
3. Add CCCP (dissolved in DMSO) to designated positive control wells, vehicle (DMSO only) to designated vehicle control wells, and test compounds to experimental wells.
4. Incubate for 30 minutes.
5. Add a redox-sensitive dye (e.g., DCFDA) to every well.
6. Incubate for 30 minutes.
7. Read fluorescence on a plate reader.
8. Analyze: positive control wells should show elevated signal; vehicle controls should show baseline; experimental wells should be compared against both.

**What each spec must do for this workflow:**

- **20 (event graph IR):** provide the event types (create_container, add_material, incubate, add_material again for CCCP/vehicle/test, add_material for dye, incubate, measure) that represent this workflow canonically.
- **30 (context):** provide contexts for each well at each relevant timepoint (post-seed, post-CCCP, post-dye, post-read); provide plate-context for whole-plate state (sealed/incubating/temperature).
- **40 (knowledge):** provide the `positive-control-for-ros` context-role with prerequisite predicate (living HepG2 ∧ CCCP-or-equivalent ∧ DCFDA-or-equivalent), verify wells against the role at plan time, produce assertions comparing CCCP wells to vehicle wells with computed outcomes.
- **50 (lifecycle):** provide the high-level protocol (from vendor or literature) that describes the assay; provide the local-protocol that substitutes our plate reader, our dye stock, our centrifuge; provide the planned-run that binds roles to specific material-instances; provide the executed-run with deviations if any.
- **60 (compiler):** provide entrypoints that orchestrate this flow; emit diagnostics when (for example) the biologist tries to schedule a read before the dye has been added.
- **70 (derivation models):** provide the growth model for HepG2 nominal cell count at read time; provide the ideal-mixing model for DCFDA concentration after addition.
- **80 (AI pre-compiler):** provide extraction from the vendor DCFDA protocol PDF; provide mention resolution for "CCCP" → the right ChEBI term → our MSP-CCCP-1MM-DMSO stock.

If a biologist can run this workflow end-to-end using the compiler and get correct diagnostics, correct contexts, correct assertions, and reproducible records — the biology compiler thesis is proven.

## 5. Reading order

The specifications are numbered to indicate dependency order. Read in numeric order if new to the system. Each spec declares its own dependencies explicitly at the top.

- `00-authority-map.md` — which specs own what; deprecations.
- `01-spec-suite.md` — skeleton overview of the eight specs.
- `10-charter.md` — this document.
- `20-event-graph-ir.md` — the canonical event graph and event-type catalog.
- `30-context.md` — derived state, promotion, time coordinates.
- `40-knowledge.md` — claims, assertions, context-roles, evidence.
- `50-protocol-lifecycle.md` — the four lifecycle stages, deviations, lab-state.
- `60-compiler.md` — kernel, entrypoints, pipelines, diagnostics.
- `70-derivation-models.md` — the YAML worksheet engine.
- `80-ai-pre-compiler.md` — AI extraction and mention resolution.

## 6. Phase 1 scope

Phase 1 delivers: canonical event IR, compiler kernel extension, context promotion, and the ROS positive control workflow end-to-end. This touches specs 20, 30, 40, 60, and 70 in depth; 50 and 80 partially; this charter (10) as framing.

Full coverage of specs 50 and 80 arrives in subsequent phases. Specs 30, 40, 60, 70 must be complete enough in Phase 1 that the ROS workflow runs; the depth beyond the workflow may be less.

## 7. Relationship to existing code

The following layers are preserved as-is and are outside the scope of the biology-compiler pivot:

- Schema triplet (`*.schema.yaml` / `*.lint.yaml` / `*.ui.yaml`)
- RecordEnvelope and the canonical identity model
- Ajv as the single validation authority
- LintEngine for business rules
- GitRepoAdapter for Git operations (direct-commit-and-push in v1)

The following are extended, not replaced:

- `CompilerKernel` gains per-input-type entrypoints and data-driven pipelines (see 60).
- Event graph schema gains event preconditions and refined provenance (see 20).
- Context schema gains promotion support, completeness diagnostics, and derivation-version pinning (see 30).
- Predicate DSL gains context-inspection operators for context-roles (see 40).

The following are added as new record kinds:

- `context-role` (see 40)
- `lab-state` (see 50)
- `derivation-model` (see 70)
- `deviation` (see 50)
- `extraction-draft` (see 80)

No record kind is deleted. The material 5-level hierarchy is preserved; the knowledge layer's claim/assertion/evidence kinds are preserved with schema modifications specified in 40.
