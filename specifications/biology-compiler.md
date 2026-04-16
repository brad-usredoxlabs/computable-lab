# computable-lab Biology Compiler Specification

Status: Draft architecture specification
Audience: coding agents, maintainers, compiler implementers, UI designers
Primary design stance: declarative, GitHub-native, YAML as source of truth

---

## 1. Purpose

computable-lab should be re-centered around a **biology compiler**.

The compiler is the system's center of gravity. All other surfaces are clients, projections, or adapters around it:

- AI assistants
- plate event editors
- tabular and graph views
- robot import/export
- validation and diagnostics
- run planning
- execution capture
- provenance and evidence linkage

The compiler is not merely a code generator. It is the deterministic engine that turns declarative biological intent and event descriptions into validated graph transformations, projections, diagnostics, and platform-specific artifacts.

The project should shift from being primarily **noun-centric** to **verb-centric**.

That does **not** mean nouns become unimportant. It means:

- **verbs / events / actions** are the primary organizing principle of lab activity
- **nouns** (materials, labwares, instruments, operators, outputs) are the typed participants in those events

In practice: materials and labwares remain crucial, but they should be modeled as participants in explicit event structures rather than as the sole conceptual center of the application.

---

## 2. Core principles

### 2.1 YAML is the source of truth

All durable records are declarative YAML records stored in Git.

The application is GitHub-native. The canonical source of truth is the repository content, not an opaque database state.

### 2.2 Everything important is declarative

If a rule, mapping, policy, transform, UI hint, or semantic relationship can be expressed as data, it should be expressed as data.

Examples:

- schemas
- lint/business rules
- UI hints
- compile policies
- robot capability models
- event templates
- vocabulary/ontology mappings

### 2.3 The compiler owns correctness

The compiler, not the UI and not the LLM, owns:

- normalization
- validation
- graph mutation semantics
- diagnostic production
- macro expansion
- projection into downstream artifacts

### 2.4 AI is an assistant, not the source of truth

AI may:

- parse language
- extract intent
- propose nodes/events
- surface ambiguities
- suggest fixes
- convert foreign artifacts into candidate semantic records

AI may not be the final authority on graph correctness.

### 2.5 User-in-the-loop ambiguity resolution

Biological protocols are ambiguous. The system should treat ambiguity resolution as a first-class workflow.

The compiler should be able to say:

- this is valid
- this is invalid
- this is underspecified
- this requires user choice
- this can be auto-resolved under policy X

### 2.6 Separation of layers of meaning

This is a defining architectural principle of computable-lab.

The system must explicitly separate:

1. **event graph / context layer**
2. **knowledge layer**

The **event graph** records what was planned, what was done, what resources participated, what quantities were moved, what locations changed, what measurements were taken, and what deterministic state transformations follow from those events.

From that event graph, the compiler derives one or more **contexts**: computed views over the event graph that summarize state, lineage, concentrations, bindings, locations, timings, and other derived facts.

The **knowledge layer** sits above context. It contains claims, assertions, expectations, interpretations, and evidence-backed statements *about* a context.

Examples:

- Event/context layer: 100 uL of formulation F was transferred into well A1 at time T.
- Event/context layer: based on deterministic concentration math, the nominal concentration of compound X in A1 is now 1 uM.
- Knowledge layer: based on prior validation data and a growth model, this well is expected to contain ~300,000 cells after 48 hours.
- Knowledge layer: observed fluorescence is consistent with mitochondrial stress.

This separation is the key thing that makes computable-lab more than a plate editor. A plate editor manipulates placements and transfers. computable-lab creates a context-rich event graph that higher-level knowledge can reference, challenge, and support with evidence.

Therefore:

- contexts are computed from event graphs
- claims/assertions are attached to contexts, not conflated with raw event edits
- evidence supports assertions about contexts
- deterministic facts and biological expectations are both first-class, but they must not be collapsed into the same undifferentiated layer

---

## 3. The compiler as center of gravity

### 3.1 What the compiler does

The compiler takes one or more declarative inputs and produces one or more deterministic outputs.

Inputs may include:

- protocol records
- local protocol records
- planned run records
- executed run records
- event graph fragments
- robot-native artifacts
- AI-extracted candidate nodes/events
- user edit intents

Outputs may include:

- normalized event graph fragments
- validation diagnostics
- quick-fix proposals
- graph mutations
- platform-specific robot plans
- execution checklists
- human-readable summaries
- provenance links
- derived contexts
- context objects partitioned into deterministic and biological expected-state components
- knowledge-layer claim/assertion targets grounded in those contexts

### 3.2 What becomes a surface around the compiler

All major application features should become compiler clients:

- visual plate editor -> emits declarative event-edit intents into the compiler
- table/grid views -> render compiler projections
- AI assistant -> proposes candidate compiler inputs and explains compiler diagnostics
- importer pipeline -> transforms foreign artifacts into compiler-ready records
- export pipeline -> compiles graphs into robot-specific plans and reports

### 3.3 Why this matters

Without a compiler-centered design, correctness leaks into:

- UI components
- ad hoc API handlers
- agent prompts
- scattered scripts

That creates hidden logic, inconsistent behavior, and poor testability.

With a compiler-centered design, behavior becomes:

- inspectable
- versioned
- testable
- explainable
- reusable across UI, AI, and automation

---

## 4. Core conceptual model: verb-centric biology

### 4.1 Events are primary

The primary semantic unit is the **event**.

Examples:

- transfer
- add_material
- mix
- incubate
- wash
- read
- harvest
- measure
- centrifuge
- seal
- unseal
- sample_operation
- create_container
- assign_source
- assign_destination
- aliquot
- derive_formulation

An event may:

- consume inputs
- produce outputs
- mutate state
- change locations
- attach evidence
- establish lineage

### 4.2 Nouns are typed participants

Nouns are the typed things that participate in events.

These include:

- materials
- material definitions
- formulations
- material instances
- labware classes
- labware definitions
- labware instances
- instruments
- tools
- operators
- outputs/data assets

### 4.3 Event graph

The lab's work is represented as an **event graph**.

The event graph is the semantic backbone.

Nodes may include:

- events
- entities/resources
- data/evidence artifacts
- contexts
- claims/assertions

Edges may represent:

- input_to
- output_of
- located_in
- derived_from
- measured_by
- asserted_by
- planned_from
- actualizes
- compiled_from

---

## 4.4 Two semantic/computational layers inside biology workflows

Within biology event graphs, computable-lab must model two distinct but linked layers:

1. **deterministic process layer**
2. **biological state/expectation layer**

### 4.4.1 Deterministic process layer

This layer captures what can be computed directly from explicit events, declared inputs, and deterministic transform rules.

Examples:

- how much material was added to a well
- what the starting concentration of a formulation was
- what the nominal post-transfer concentration is
- what the current container volume should be
- what lineage relationships follow from transfers and aliquots

This layer should be reproducible from declarative records and compiler passes alone.

### 4.4.2 Biological state / expectation layer

This layer captures model-based biological expectations, assumptions, and domain-specific derived state that are not mere direct transfer arithmetic.

Examples:

- 100,000 mammalian cells were seeded 48 hours ago
- under growth model G and condition set C, the well is expected to contain ~300,000 cells now
- expected confluence is 70%
- expected media nutrient depletion is within range R
- expected viable cell count differs from deterministic seeded count due to growth, death, attachment, and biological response

This layer is crucial and must also be declarative. The maths, assumptions, models, coefficients, and provenance for these expectations must be defined in YAML records, not hidden in application code or agent prompts.

### 4.4.3 Why the distinction matters

The deterministic layer answers questions like:

- what should the nominal concentration be?
- what volume should be present?
- what was transferred where?

The biological layer answers questions like:

- how many cells do we expect to be present now?
- what biological state do we expect after incubation?
- what baseline assumptions are we making before measurement?

Both layers feed context, but they should remain distinguishable. A context may contain:

- deterministic derived fields
- biological expected-state fields
- observed measured fields
- assertions comparing expected versus observed

### 4.4.4 Declarative modeling requirement

Biological expectation logic must be represented in YAML-defined artifacts such as:

- growth-model definitions
- state-estimation formulas
- assumption sets
- media depletion models
- viability adjustment models
- expectation policies tied to assay or cell line

The compiler should be able to read these declarations and compute or at least stage expected-state values for review.

### 4.4.5 Example

```yaml
kind: biological-state-model
id: BSM-HepG2-growth-default
name: HepG2 default growth expectation
applies_to:
  cell_line: HepG2
  culture_format: adherent_plate
inputs:
  - seeded_cell_count
  - elapsed_hours
  - media_type
  - treatment_condition
  - expected_doubling_time_hours
derivations:
  expected_cell_count:
    expression: seeded_cell_count * 2 ** (elapsed_hours / expected_doubling_time_hours)
notes:
  - assumes exponential growth in non-confluent range
  - must be overridden when treatment is cytotoxic
provenance:
  based_on:
    - PMID:placeholder
```

A context for a specific well could then include both:

- deterministic concentration and volume state from event compilation
- biological expected cell count from a declared biological-state model

This is a major part of what makes computable-lab a biology compiler rather than merely a liquid-handling editor.

## 5. Protocol and run lifecycle

The compiler must explicitly support the distinction between:

1. high-level protocol
2. local protocol
3. planned run
4. executed run

### 5.1 High-level protocol

A high-level protocol is the abstract, often vendor-supplied or literature-derived description of intended biological procedure.

Characteristics:

- platform-agnostic or loosely platform-constrained
- often ambiguous or underspecified
- may arrive as PDF, Word, HTML, robot export, or prose
- may contain domain assumptions not made explicit

Examples:

- vendor DNA extraction protocol PDF
- published cell treatment protocol
- SOP-like narrative recipe

The high-level protocol is not execution-ready. It is a semantic source artifact.

### 5.2 Local protocol

A local protocol is the lab-specific compiled/adapted version of a high-level protocol.

Characteristics:

- resolved for a specific lab's instruments, policies, and materials
- clarifies local defaults
- captures institution/lab-specific operational choices
- may incorporate substitutions, calibrations, timing policies, tip-use policies, etc.

Examples:

- this vendor kit protocol as adapted to our Integra Assist Plus
- this extraction method using our specific centrifuge and deepwell plate format

The local protocol should remain declarative and reusable.

### 5.3 Planned run

A planned run is an instance-level binding of a local protocol to real planned resources and operational parameters.

Characteristics:

- binds abstract roles to concrete material instances and labware instances
- resolves deck/container assignments
- selects instruments/tools
- fixes quantities, locations, and run-specific parameters
- may emit per-platform robot plans

A planned run says, in effect:

- what we intend to do today
- with which actual materials/labwares/tools
- under which resolved settings

### 5.4 Executed run

An executed run is the actualized record of what happened.

Characteristics:

- references the planned run or local protocol it actualizes
- records operator, timestamps, deviations, actual measured values, instrument outputs
- records evidence and provenance
- may partially diverge from plan

The executed run is not merely a status field on the plan. It is a first-class record of actuality.

### 5.5 Compiler responsibilities across the lifecycle

The compiler should support transitions such as:

- high-level protocol -> candidate semantic event graph
- high-level protocol -> local protocol
- local protocol -> planned run
- planned run -> robot plan(s)
- planned run + execution evidence -> executed run
- executed run -> derived contexts / claims / evidence graph

---

## 6. Material model

Material remains one of the most important noun families, but should be made explicit as a layered model.

### 6.1 Ontologically-defined material definition

Represents the semantic identity of a substance or material concept.

Examples:

- clofibrate (CHEBI-backed)
- DMEM
- bovine serum albumin
- HepG2 cells

Properties:

- ontology references
- synonyms
- semantic class
- external identifiers
- general semantic facts

### 6.2 Formulation specification

Represents a defined composition or recipe involving one or more material definitions.

Examples:

- 1 uM clofibrate in DMSO
- DMEM + 10% FBS + 1% pen/strep
- AA supplementation mix with defined FA:BSA ratio

Properties:

- components
- proportions/concentrations
- units
- preparation instructions or references
- derived_from semantic definitions

### 6.3 Instantiated material

Represents a specific physical or inventory-bound material instance.

Examples:

- bottle LOT-123 of DMSO
- vial V0008 of 1 uM clofibrate in DMSO prepared on 2026-04-16
- specific thawed aliquot of HepG2 cells

Properties:

- lot/batch
- creation/preparation event
- storage location
- expiration
- provenance
- current amount / state

### 6.4 Compiler implications

The compiler should be able to reason over these layers distinctly.

Examples:

- a user may reference a semantic material concept when they really need a formulation
- a protocol may call for a formulation while a run requires a concrete instantiated material
- ambiguity between semantic definition, formulation, and instance must be surfaced clearly

---

## 7. Labware model

Labware should be similarly layered.

### 7.1 Generic labware class

Represents a type/class of container.

Examples:

- 96-well plate
- 12-well reservoir
- 1.5 mL tube
- GC vial

### 7.2 Defined labware specification

Represents a more precise manufacturer/model-defined labware type.

Examples:

- Corning 96-well plate CR123455
- specific Integra reservoir SKU

Properties:

- geometry
- well topology
- capacity
- vendor model
- compatibility constraints

### 7.3 Labware instance

Represents a specific physical instance or in-run container.

Examples:

- plate PLATE-001 in deck position B2
- reservoir RES-TEST-01 created for a test edit

### 7.4 Compiler implications

The compiler should support reasoning such as:

- generic labware sufficient at high-level protocol stage
- defined labware required for local protocol or robot planning
- labware instance required for planned or executed runs

---

## 8. Transfer definition

I do not have the exact verbatim wording from yesterday, so the following is a reconstructed definition that preserves the spirit of the earlier discussion.

### 8.1 Canonical transfer definition

A **transfer** is an event in which a specified quantity of one or more material instances is moved from a source location context to a destination location context using a tool or process, under constraints that may change the state, composition, lineage, or amount of the participating locations and materials.

### 8.2 Required semantic elements of a transfer

A transfer should be expressible declaratively with fields such as:

- source location
- destination location(s)
- transferred quantity/quantities
- transferred participant(s) (usually material instance or aliquot)
- tool/process used or assumed
- policy context (tips, contamination, mixing, carryover assumptions)
- whether the source is decremented, sampled, or treated as effectively infinite
- whether the destination is additive, replacement, or part of a dilution chain

### 8.3 Transfer outcomes

A transfer may:

- decrement source quantity
- increment destination quantity
- derive a new aliquot/material state
- change concentration/composition in destination
- establish lineage from source to destination
- trigger downstream constraints or required events

### 8.4 Why this matters

Transfer is not just a UI gesture. It is a semantically rich event type that can be:

- edited visually
- expressed textually
- expanded into robot actions
- validated against tool geometry and contamination policy
- linked to actual execution evidence

---

## 9. Compiler pipeline

### 9.1 General pipeline

A request, record, or imported artifact should flow through a staged compiler pipeline.

1. ingestion
2. parsing / structural extraction
3. semantic normalization
4. ambiguity detection
5. user/AI-assisted resolution
6. graph construction or graph mutation
7. validation + diagnostics
8. expansion / lowering
9. projection into outputs

### 9.2 Ingestion modes

The compiler should support multiple ingestion modes.

#### A. Native declarative inputs

Examples:

- YAML protocol
- YAML planned run
- YAML event fragment
- robot-intermediate YAML from Assist

These can often go directly into normalization/validation.

#### B. Structured foreign technical inputs

Examples:

- Opentrons Python script
- Integra Assist Plus YAML/XML-like intermediates

These should use dedicated importers/parsers and can often bypass LLM extraction entirely.

#### C. Unstructured or semi-structured human artifacts

Examples:

- vendor PDF
- protocol DOCX
- prose SOP
- literature procedure section

These benefit from a **pre-compiler AI stage** that extracts candidate semantic nodes/events before deterministic compiler passes.

---

## 10. Pre-compiler AI stage

### 10.1 Role of the small local model

A small local model such as Qwen3.5-9B may be used as a **pre-compiler** for messy inputs.

Its job is not to invent truth. Its job is to turn unstructured artifacts into candidate declarative representations.

### 10.2 Appropriate uses

Good uses:

- parse vendor PDFs into candidate event nodes
- identify materials, labwares, timings, temperatures, volumes
- segment narrative instructions into event candidates
- mark ambiguity spans
- produce draft YAML for user review

Bad uses:

- final semantic authority
- silent ontology resolution without review
- direct mutation of canonical records without compiler validation

### 10.3 Output of the pre-compiler

The pre-compiler should emit candidate records such as:

```yaml
kind: protocol-extraction-draft
source_artifact: VENDOR-PDF-001
candidate_events:
  - kind: transfer
    source_role: reagent_A
    destination_role: sample_well
    volume_ul: 50
    confidence: 0.83
    ambiguities:
      - source container not specified
candidate_entities:
  - kind: material-definition-candidate
    name: Clofibrate
    external_refs:
      - chebi:...
```

### 10.4 Human review requirement

For vendor PDFs and other messy inputs, the default expectation should be:

- AI extracts draft structure
- compiler validates structure
- user reviews ambiguities / mappings
- only then is it promoted into canonical protocol/local protocol records

---

## 11. Native importers

Some source artifacts should bypass LLM-heavy parsing.

### 11.1 Opentrons script importer

An Opentrons importer should:

- parse Python AST and/or runtime-known command structure
- extract transfer/mix/load/instrument events
- map them into canonical event graph representations
- preserve original script linkage

### 11.2 Integra Assist Plus importer

An Assist importer should:

- parse native YAML/XML/config export
- map instrument-specific constructs into canonical events
- preserve tool/deck specifics as source metadata

### 11.3 Round-tripping goal

Where possible, the system should support:

- foreign artifact -> canonical graph
- canonical graph -> foreign artifact

This is most realistic when the canonical graph has enough expressive detail and when platform-specific details are preserved rather than erased.

---

## 12. Compiler passes

Compiler behavior should be factored into explicit passes.

Possible pass families:

### 12.1 Parse / structure passes

- syntax parsing
- artifact segmentation
- AST extraction
- record loading

### 12.2 Semantic normalization passes

- unit normalization
- canonical naming
- location normalization
- role binding
- ontology mapping

### 12.3 Disambiguation passes

- detect under-specification
- enumerate candidate bindings
- classify whether user choice is required

### 12.4 Validation passes

- schema validation
- business/lint validation
- domain constraints
- robot/tool compatibility checks
- lineage consistency checks

### 12.5 Context derivation passes

- derive deterministic state from event graph
- compute concentrations, nominal amounts, volumes, and lineage state
- apply declarative biological-state models to produce expected-state fields
- materialize context objects for downstream knowledge and evidence linkage

### 12.6 Expansion / lowering passes

- expand macros
- convert plate-region operations into per-well operations where needed
- lower high-level events into platform-specific primitives

### 12.7 Projection passes

- UI projections
- robot plans
- summaries
- execution sheets
- evidence linkage views
- expected-vs-observed comparison views

---

## 13. Diagnostics and ambiguity handling

### 13.1 Diagnostics are first-class outputs

The compiler should emit structured diagnostics, not just pass/fail.

Diagnostic classes may include:

- error
- warning
- ambiguity
- suggestion
- auto-fix available

### 13.2 Example ambiguity cases

- protocol says "add reagent" but reagent identity unresolved
- "transfer to plate" but target plate instance not chosen
- semantic material exists, but no formulation defined
- formulation exists, but no instantiated stock available
- source location implied but not explicit

### 13.3 User-in-the-loop workflow

When ambiguity exists, the system should present:

- what is ambiguous
- why it matters
- possible resolutions
- default policy, if any
- what downstream consequences each choice has

### 13.4 AI-in-the-loop workflow

AI may propose likely resolutions, but proposals must be explicit and reviewable.

---

## 14. Editing model and UI implications

The UI should become more IDE-like because it is operating over compiler-backed structures.

### 14.1 IDE-like behavior

The application should support:

- projections of the same graph in multiple views
- diagnostics panel
- quick fixes
- jump-to-definition for materials/labwares/events
- structured authoring panels
- preview of lowered/expanded events
- provenance inspection

### 14.2 Plate event editing as projection

The plate event editor should be treated as a projection/editor over canonical event structures.

The visual editor emits declarative edit intents such as:

```yaml
intent: transfer
source: plateA:A1
destinations: [plateB:A1, plateB:A2, plateB:A3]
volume_ul: 20
```

The compiler then:

- validates
- expands
- diagnoses
- proposes fixes
- emits canonical graph mutations

### 14.3 Why this is better

This prevents UI components from becoming hidden domain engines.

---

## 15. AI integration model

### 15.1 AI roles

AI may play several roles around the compiler:

- pre-compiler extractor
- natural-language-to-edit translator
- ambiguity explainer
- quick-fix proposer
- architecture/judge assistant

### 15.2 Recommended tiering

A multi-stage assistant architecture is appropriate:

1. deterministic compiler for explicit/high-confidence operations
2. small local model for bounded interpretation and extraction
3. worldly model for open-world reasoning, ontology resolution, and research

### 15.3 AI should speak compiler-native structures

AI outputs should preferably be candidate YAML fragments, edit intents, or disambiguation proposals, not freeform prose alone.

---

## 16. Declarative record families

The exact schemas may evolve, but the system should likely converge on record families such as:

- material-definition
- formulation-spec
- material-instance
- labware-class
- labware-definition
- labware-instance
- protocol
- local-protocol
- planned-run
- executed-run
- event
- context
- biological-state-model
- deterministic-derivation-policy
- claim
- assertion
- evidence
- robot-plan
- import-draft / extraction-draft

These remain YAML-native and Git-trackable.

---

## 17. GitHub-native workflow

### 17.1 Repo as operational memory

The repo should contain:

- canonical YAML records
- schemas
- lint rules
- UI metadata
- compile policies
- generated artifacts where appropriate
- PR-based review history

### 17.2 Pull-request workflow

Changes may flow through PRs where:

- AI proposes record changes
- compiler runs validation/lint/projection checks
- humans review diffs and diagnostics
- approved changes merge into canonical state

### 17.3 Provenance advantage

Git history is part of provenance. The compiler should preserve references from generated artifacts back to source records and revisions.

---

## 18. Minimal viable compiler roadmap

A practical transition plan:

### Phase 1: canonical event IR

Define and stabilize canonical event graph structures and a few core event types:

- transfer
- add_material
- mix
- incubate
- read
- create_container
- assign_source

### Phase 2: deterministic compiler kernel

Implement:

- normalization
- validation
- diagnostics
- graph mutation application
- projection API

### Phase 3: native importers

Implement importers for:

- Opentrons scripts
- Integra Assist artifacts

### Phase 4: AI pre-compiler

Use small local model for:

- vendor PDF extraction
- narrative protocol drafting
- ambiguity flagging

### Phase 5: IDE-like surfaces

Rebuild or adapt editing panels to use compiler requests + diagnostics rather than custom hidden logic.

### Phase 6: run lifecycle

Add explicit support for:

- high-level protocol
- local protocol
- planned run
- executed run

### Phase 7: downstream compilation

Compile canonical graphs into:

- robot plans
- execution views
- provenance-linked evidence structures

---

## 19. Non-goals

The compiler is not:

- a monolithic chatbot
- a UI-specific rules engine
- a replacement for all human judgment
- a hidden imperative state machine whose truth is outside YAML

---

## 20. Final architectural summary

computable-lab should become a compiler-centered biology workbench.

- YAML in Git is the source of truth
- event graphs are the semantic core
- contexts are computed from event graphs and are the target of higher-level knowledge
- verbs/events are primary
- nouns remain typed participants of great importance
- high-level protocol, local protocol, planned run, and executed run are distinct lifecycle stages
- AI is used to extract, translate, suggest, and explain
- the compiler is used to normalize, validate, diagnose, mutate, and project
- UI, MCP, robot integrations, and AI all become surfaces around this core

The result should be a system where biology workflows are:

- declarative
- inspectable
- reproducible
- compiler-backed
- AI-assisted but not AI-dependent
