# Computable-Lab Workflow and Datatypes Manifesto

Status: Living document
Date: 2026-04-11
Authors: Brad (domain lead), Claude (architect)
Related: `specifications/material-identity-and-resolution.md`, `specification.md`

## 1. What Computable-Lab Is For

A biologist runs an experiment on Tuesday afternoon. The results change Wednesday morning's plan. By Friday, two colleagues in another building need to reproduce the Tuesday work with different cell lines and a different plate reader.

Computable-lab exists to make that story work. Not by forcing biologists to fill out accounting forms, but by capturing what happened in the lab with enough semantic precision that a compiler can reason about it: which equipment was used, what verbs it performed, which materials went into which wells at what concentrations, who was trained to operate the centrifuge, and whether the plate reader was calibrated last month.

The system serves two audiences simultaneously:

- **The biologist at the bench**, who needs a tool that is faster and more helpful than a paper notebook. If it is slower or more frustrating than scribbling in a Moleskine, it has failed.
- **The compiler**, which needs unambiguous, semantically linked records to validate protocols, plan executions, and reproduce experiments across labs and across time.

The design tension between these two audiences is the central challenge. The manifesto describes how computable-lab resolves it.

## 2. The Prime Directive

**If something can be expressed as data, it must be expressed as data.**

Domain meaning lives in schemas, lint rules, and controlled vocabularies — never in application code. Code exists only to interpret, validate, render, and derive from data. This is not an aspiration; it is the architectural constraint that makes cross-lab reproducibility possible.

## 3. The Core Datatypes

Computable-lab tracks everything that matters in a research laboratory. These datatypes are connected to each other through semantic references, and those connections are what make protocols compilable and experiments reproducible.

### People

People have roles, skills, and authorizations. A person record is the anchor for training records, competency authorizations, and audit trails. The compiler uses person records to answer: "Is anyone in this lab trained and authorized to operate this equipment for this protocol step?"

### Materials

Materials follow a five-level hierarchy from abstract concept to physical aliquot (see `material-identity-and-resolution.md`). The disambiguation problem is solved at the point of entry: the biologist searches, the system resolves to a controlled identity, and downstream records reference that identity — not free text.

### Equipment and Instruments

A centrifuge, a biosafety cabinet, a bead beater, a thermal cycler — these are the physical tools of the lab. Each piece of equipment:

- Belongs to a **class** (the model/family: "Eppendorf 5810R") that carries semantic identity
- Exists as an **instance** (the specific unit: serial number, location, maintenance status)
- Declares the **verbs** it can perform (centrifuge, mix, incubate, thermal-cycle)
- Declares the **labware** it can accept, potentially through sub-modules (a centrifuge rotor that accepts 1.5 mL tubes vs. one that accepts SBS microplates)
- Requires **calibrations** and **preventive maintenance** on a schedule
- May require **training** before a person is authorized to operate it

Instruments are a subclass of equipment: they are equipment that measures. A qPCR machine, a plate reader, a spectrophotometer — these produce data. The distinction matters to the compiler (instruments produce results; equipment transforms state) but not to the biologist at the point of entry.

This is the same Class-to-Instance pattern used by materials: the class carries the semantic identity and capabilities; the instance carries the serial number, location, and current status.

### Labware

Labware is what holds samples: microplates, tubes, flasks, petri dishes. Labware definitions are controlled vocabulary — a "96-well flat-bottom microplate" means the same thing in every lab. Labware instances are physical objects with barcodes that exist on a bench right now.

The compiler needs labware definitions to validate protocols: can this centrifuge rotor accept this plate format? Can this plate reader read this plate type? These are admissibility checks that prevent protocol compilation errors before anything reaches the bench.

### Verbs

Verbs are the controlled vocabulary of lab actions. There are roughly 20-30 canonical verbs that describe 90% of what happens in a biology lab:

- **Liquid handling**: dispense, aspirate, transfer, dilute, wash
- **Sample preparation**: centrifuge, mix, vortex, homogenize, filter, lyse
- **Thermal**: incubate, thermal-cycle, heat, cool
- **Analytical**: read, measure, image, weigh
- **Manual**: label, seal, unseal, store, dispose

Verbs are tightly controlled — they are not a search-and-add entity like materials or equipment. They are a curated, finite set defined by the system. Equipment declares which verbs it can perform. Protocols are sequences of verb invocations with bound parameters. The compiler validates that every verb in a protocol can be realized by available equipment.

### Protocols

A protocol is a reusable, parameterized sequence of steps. Each step is a verb invocation with parameters: what material, what labware, what conditions. Protocols are extracted from event graphs (what actually happened) and generalized into templates that can be re-bound to different equipment, materials, and personnel.

The compiler uses protocols to answer: "Can this lab execute this protocol?" — by checking that every verb has capable equipment, every material is available, every operator is trained, and every instrument is calibrated.

### Knowledge: Claims, Assertions, and Evidence

The knowledge layer captures what was learned. Claims are semantic triples (subject-predicate-object). Assertions are scoped claims with evidence references and measured outcomes. This is how Tuesday's results inform Wednesday's experiment design — not through free-text notes, but through structured, queryable knowledge records.

## 4. The Connections

The power of computable-lab is not in any single record type. It is in the semantic connections between them:

```
Person ──trained-on──► Equipment
Person ──authorized-for──► Competency
Equipment ──instance-of──► Equipment Class
Equipment ──can-perform──► Verb
Equipment ──accepts──► Labware (possibly via sub-modules/rotors)
Equipment ──requires──► Calibration Schedule
Protocol ──step-uses-verb──► Verb
Protocol ──step-uses-material──► Material
Protocol ──step-uses-labware──► Labware
Protocol ──requires-equipment──► Equipment (via verb capabilities)
Run ──executes──► Protocol
Run ──performed-by──► Person
Run ──produces──► Event Graph
Event Graph ──contains──► Events (verb invocations with bound parameters)
Claim ──derived-from──► Run
Assertion ──cites──► Evidence
```

The compiler traverses these connections. When a biologist says "run this protocol on Wednesday," the compiler can check: Is the centrifuge calibrated? Is the plate reader available? Is the operator trained on the liquid handler? Is the required cell line in stock? These are not hypothetical features — they are the reason the data model exists.

## 5. The UX Contract

### Principle: AI Pre-Compilation

The biologist should never have to fill in a field that the system can infer. When a biologist searches for "Eppendorf 5810R centrifuge," the AI should:

1. Search external knowledge sources (vendor catalogs, ontologies, instrument databases)
2. Present a list of candidates
3. When the biologist selects one, pre-compile the record: fill in manufacturer, model, known capabilities, compatible rotors, labware compatibility — everything the AI can determine from external sources
4. Present the pre-compiled record in the editing surface for review and save

The biologist's job is to confirm and correct, not to type from scratch. The same pattern applies to materials, labware, equipment, and any other "stuff" that enters the system.

### Principle: Controlled Language at the Point of Entry

Free text is the enemy of interoperability. Every time a biologist types a material name, an equipment model, or a labware description into a free-text field, the potential for semantic drift increases. Computable-lab eliminates free-text entry for identifiable entities by using search-first input:

1. **Local records first** — has this entity already been defined in this lab?
2. **Ontology and vendor search** — can we resolve this to a controlled identity?
3. **AI-assisted creation** — if neither, the AI helps build a new record with as much structure as possible

This is the pattern established by the materials combobox (MaterialPicker) and it is the canonical input pattern for all "stuff" entities: materials, labware, equipment. Verbs are different — they are a curated finite set, not a search-and-discover entity.

### Principle: The TapTab Surface

Every record, when opened for viewing or editing, is rendered in the TapTab rich-text editor surface. This is not a form. It is a structured document that feels like a familiar word processor but enforces schema constraints through its block structure. The biologist sees a document; the system sees structured data.

The flow for adding a new entity:

1. **Search combobox** — the biologist types a query
2. **Candidate list** — results appear below, from local records, ontologies, and external sources
3. **Selection** — arrow-key or click selects a candidate
4. **Pre-compiled record in TapTab** — the selected candidate is AI-compiled into a schema-conformant record and displayed in TapTab as a temporary (unsaved) record
5. **Review and save** — the biologist reviews, edits if needed, and saves to persist as a permanent lab record

### Principle: Zero-Friction Compilation

When the system detects a gap — missing calibration, untrained operator, unavailable material — it does not block. It guides forward with suggestions: "This centrifuge needs calibration. [Schedule calibration] [Override for this run]." Gaps degrade gracefully to manual steps rather than hard stops. The system is a compiler with warnings, not a gatekeeper with errors.

## 6. Cross-Lab Reproducibility

The ultimate goal is that a computable-lab project from Lab A can be loaded into Lab B and the compiler can answer: "What do you need to run this protocol here?"

This requires that shared entities use controlled vocabularies:

- **Verbs** are universal: "centrifuge" means the same thing everywhere
- **Labware definitions** are standardized: an SBS-format 96-well plate is the same in every lab
- **Material concepts** are ontology-backed: ChEBI:3750 is clofibrate in every lab
- **Equipment classes** are shared: an "Eppendorf 5810R" has the same capabilities everywhere

What differs between labs is the instances: which specific centrifuge, which lot of clofibrate, which trained operator. The compiler maps protocol requirements (expressed in shared vocabulary) to local resources (expressed as instances) and reports what is available, what is missing, and what needs substitution.

## 7. Design Constraints

These constraints are non-negotiable:

1. **All domain meaning is data.** No business logic in code. Validation in schemas, business rules in lint specs, UI behavior in UI specs.
2. **Git is the source of truth.** Records are versioned YAML in Git. No opaque databases. All derived artifacts are rebuildable.
3. **No free-text rot.** Identifiable entities must resolve to controlled identities at the point of entry.
4. **The AI serves the biologist.** AI pre-compiles records, resolves ambiguity, and fills gaps. It does not create busywork or demand information the biologist does not have.
5. **The compiler serves reproducibility.** Every connection in the data model exists because the compiler needs it to validate, plan, or reproduce an experiment.
6. **The UX serves speed.** Tuesday afternoon's results inform Wednesday morning's design. The system must be fast enough to keep up with the pace of research.
