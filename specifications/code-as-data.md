# Protocol PDF Extraction to Canonical YAML: Engineering Spec

## Purpose

Build an extraction pipeline that reads laboratory protocol PDFs and emits a structured YAML artifact that can be fed into a downstream ingestion engine. The extraction system should treat the PDF as an imperfect human document and produce a **candidate machine-readable representation** with provenance, uncertainty, and explicit unresolved terms.

The YAML output is **not** the final source of truth. It is an intermediate artifact that will be validated, normalized, and compiled by the ingestion engine into computable-lab records such as event graphs, materials, labware, conditions, and contextual assertions.

---

## Core idea

A protocol PDF is prose. The extractor converts prose into data.

This is a form of **protocol-as-data** or **code-as-data**:

* the PDF is the human-facing source
* the extractor emits structured YAML
* the ingestion engine validates and compiles that YAML
* downstream systems turn the result into computable meaning

The extractor must never silently invent certainty. It should preserve ambiguity instead of flattening it.

---

## Product goal

Given a vendor protocol PDF, Word document, or other semi-structured protocol source, the system should:

1. read the file
2. recover text, layout, headings, tables, and page spans
3. identify steps, materials, equipment, timings, temperatures, centrifugation conditions, incubation conditions, and outputs
4. emit a canonical YAML candidate document
5. attach source provenance to every extracted element where feasible
6. mark uncertainty and unresolved terms explicitly
7. produce output suitable for ingestion by a validator/compiler pipeline

---

## Non-goals

The first version should **not** try to:

* directly execute protocols
* fully resolve ontology mappings during extraction
* fully normalize every reagent name into a canonical material object
* infer missing facts without marking them as inferred
* replace the ingestion engine
* replace human review for ambiguous protocols

---

## Design principles

### 1. Candidate data, not truth

The model should emit a structured candidate representation, not final authoritative records.

### 2. Preserve provenance

Every extracted step, quantity, condition, or table-derived fact should retain page and span references when possible.

### 3. Preserve uncertainty

If a term is ambiguous, unresolved, or inferred, say so in the YAML.

### 4. Separate extraction from normalization

Extraction reads what the document appears to say. Normalization resolves what the system believes it means.

### 5. Be schema-first

The output should conform to a clear schema or at minimum a strict canonical shape that can be validated.

### 6. Prefer explicitness over cleverness

It is better to emit unresolved placeholders than hallucinated specificity.

---

## System overview

The system should be decomposed into stages.

### Stage 1: document acquisition

Inputs:

* PDF protocols
* Word documents
* possibly plain text, HTML, or scanned images later

Outputs:

* raw file bytes
* file metadata
* document identifier

### Stage 2: document parsing

Parse the source into a structured intermediate representation.

Desired extracted features:

* page-level text
* reading order
* headings and section structure
* paragraphs
* numbered or bulleted steps
* tables
* figure captions
* header/footer detection
* page numbers
* OCR fallback if needed for scanned PDFs

Output should be a document IR such as:

```yaml
source_document:
  id: src_001
  filename: vendor_protocol.pdf
  content_type: application/pdf
  pages:
    - page_number: 1
      blocks:
        - type: heading
          text: Sample Preparation
        - type: paragraph
          text: Add 500 uL lysis buffer to each sample.
        - type: table
          rows:
            - ["Reagent", "Volume"]
            - ["Lysis buffer", "500 uL"]
```

### Stage 3: semantic extraction

Use rules, models, or hybrid methods to identify semantic units:

* protocol title
* prerequisites
* materials/reagents
* consumables
* equipment/instruments
* labware
* steps/actions
* timing
* temperature
* centrifugal force / rpm
* wash cycles
* transfer relationships
* incubation conditions
* outputs / expected products
* warnings / notes / critical instructions

### Stage 4: YAML candidate emission

Emit canonical YAML in a stable shape.

### Stage 5: validation and ingestion handoff

Run schema validation and lightweight linting before handing to the ingestion engine.

---

## Architecture recommendation

A practical first version should use a hybrid pipeline:

1. deterministic parser for text/layout/table extraction
2. optional OCR for scans
3. rule-based pre-segmentation into sections and candidate steps
4. LLM pass to convert segmented content into canonical YAML
5. strict validation layer
6. review UI or diff layer for unresolved fields

Do **not** rely on a single model pass over raw PDF bytes as the only mechanism.

---

## Required outputs

The extractor should emit at least two artifacts.

### A. canonical YAML candidate

Primary handoff artifact for ingestion.

### B. extraction report

Machine-readable report describing:

* extraction warnings
* unresolved entities
* confidence summaries
* validation failures
* missing spans
* OCR usage

Example:

```yaml
report:
  source_file: vendor_protocol.pdf
  extraction_status: partial
  warnings:
    - "Centrifuge speed mentioned as rpm only; relative centrifugal force unresolved"
    - "Term 'wash buffer' not uniquely resolved"
  unresolved_terms:
    - wash buffer
    - binding buffer
  ocr_used: false
```

---

## Canonical YAML shape

The exact schema can evolve, but the emitted document should look roughly like this.

```yaml
kind: protocol-extraction-candidate
id: protocol_candidate_001
name: DNA Extraction Protocol
source:
  file_name: vendor_protocol.pdf
  file_hash: sha256:REPLACE_ME
  content_type: application/pdf
  pages_total: 7

metadata:
  extractor_version: 0.1.0
  created_at: 2026-04-18T00:00:00Z
  language: en
  extraction_mode: hybrid

protocol:
  title: DNA Extraction from Tissue
  goal: Extract genomic DNA from tissue samples
  domain: molecular biology
  outputs:
    - text: purified DNA
      output_type: material_candidate

sections:
  - id: sec_001
    heading: Sample Preparation
    provenance:
      page_start: 2
      page_end: 2
    steps:
      - id: step_001
        sequence_no: 1
        action: add
        description: Add 500 uL lysis buffer to each sample tube.
        inputs:
          - text: lysis buffer
            role: reagent
            resolution_status: unresolved
        destinations:
          - text: sample tube
            resolution_status: unresolved
        amount:
          value: 500
          unit: uL
        conditions: []
        provenance:
          source_span: "page 2, lines 14-15"
        uncertainty:
          status: low
          notes: []

      - id: step_002
        sequence_no: 2
        action: incubate
        description: Incubate at 56 C for 10 minutes.
        duration:
          value: 10
          unit: min
        conditions:
          - type: temperature
            value: 56
            unit: C
        provenance:
          source_span: "page 2, lines 16-16"
        uncertainty:
          status: low
          notes: []

entities:
  materials:
    - text: lysis buffer
      entity_type: material_candidate
      resolution_status: unresolved
      provenance:
        source_span: "page 2, lines 14-15"
  labware:
    - text: sample tube
      entity_type: labware_candidate
      resolution_status: unresolved

warnings:
  - "No explicit centrifuge rotor specified"

ingestion_hints:
  likely_record_types:
    - protocol
    - event-graph
    - material-definition
    - labware-definition
```

---

## Extraction schema requirements

The YAML should support the following top-level sections.

### Top-level fields

* `kind`
* `id`
* `name`
* `source`
* `metadata`
* `protocol`
* `sections`
* `entities`
* `warnings`
* `ingestion_hints`

### Step-level fields

Each step should try to support:

* `id`
* `sequence_no`
* `action`
* `description`
* `actor` if explicitly stated or inferred
* `inputs`
* `outputs`
* `sources`
* `destinations`
* `amount`
* `duration`
* `conditions`
* `equipment_refs` or equipment text
* `provenance`
* `uncertainty`
* `notes`
* `status` if the source distinguishes required/optional or alternate paths

### Entity-level fields

Each extracted entity should support:

* `text`
* `entity_type`
* `candidate_name`
* `resolution_status`
* `possible_matches` optional
* `ontology_refs` optional and tentative
* `provenance`
* `notes`

---

## Controlled action vocabulary

The extractor should normalize verb phrases into a constrained action set where possible, while also preserving the original text.

Recommended starter action vocabulary:

* `add`
* `transfer`
* `mix`
* `incubate`
* `centrifuge`
* `wash`
* `remove_supernatant`
* `resuspend`
* `dry`
* `heat`
* `cool`
* `vortex`
* `pipette`
* `seal`
* `unseal`
* `measure`
* `filter`
* `aliquot`
* `collect`
* `discard`
* `store`
* `repeat`
* `prepare_solution`
* `dilute`
* `sonicate`
* `shake`
* `wait`
* `optional_step`
* `other`

For every normalized action, preserve the original wording.

Example:

```yaml
action: centrifuge
raw_action_text: Centrifuge the samples at 5000 x g for 10 min.
```

---

## Provenance model

Provenance is mandatory wherever feasible.

Minimum provenance fields:

* `source_file`
* `page_start`
* `page_end`
* `source_span`
* `block_ids` if available from parser IR
* `extraction_method` such as rule, llm, table_parser, ocr

Example:

```yaml
provenance:
  source_file: vendor_protocol.pdf
  page_start: 3
  page_end: 3
  source_span: "page 3, lines 8-10"
  extraction_method: llm
```

---

## Uncertainty model

Every extracted item should optionally carry uncertainty metadata.

Suggested structure:

```yaml
uncertainty:
  status: low
  notes: []
```

Allowed statuses:

* `low`
* `medium`
* `high`
* `unresolved`
* `inferred`

Examples:

```yaml
uncertainty:
  status: inferred
  notes:
    - "Actor assumed to be human operator"
```

```yaml
uncertainty:
  status: unresolved
  notes:
    - "The protocol refers to 'binding buffer' but no composition or catalog identity is given"
```

---

## Tables

Tables in protocols are often critical. The system should treat tables as first-class content.

Typical table types:

* reagent composition tables
  n- plate layouts
* thermocycler programs
* centrifugation schedules
* wash programs
* part or catalog tables

Requirements:

* parse tables separately from flowing text
* preserve row/column coordinates if possible
* emit table-derived semantic content and raw table backup

Example:

```yaml
tables:
  - id: tbl_001
    title: Reagent Preparation
    provenance:
      source_span: "page 1, table 1"
    columns: [Reagent, Volume, Notes]
    rows:
      - [Buffer A, 10 mL, Prepare fresh]
```

Then map into entities or steps only when justified.

---

## OCR strategy

OCR should be a fallback, not the default, for digitally native PDFs.

Recommended behavior:

* first attempt native text extraction
* detect low-text or image-only pages
* run OCR only on affected pages
* preserve whether text came from OCR
* surface OCR confidence warnings in the report

---

## Ingestion boundary

The extraction tool stops before full semantic resolution.

The ingestion engine should be responsible for things like:

* schema validation
* ontology/entity resolution
* unit normalization
* converting rpm to rcf where possible
* mapping text entities to material definitions, formulations, material instances, labware definitions, instruments, and event graph nodes
* splitting composite steps into atomic event nodes if required
* policy-driven acceptance or rejection

The extraction tool may provide `ingestion_hints`, but should not masquerade as the ingestion engine.

---

## Error handling philosophy

Failure should be explicit and structured.

Possible extraction outcomes:

* `success`
* `partial`
* `failed`

A partial extraction is acceptable if the system can still emit useful YAML plus warnings.

Example:

```yaml
metadata:
  extraction_status: partial
  fatal_errors: []
  nonfatal_errors:
    - "Unable to confidently parse table on page 5"
```

---

## Review workflow

The ideal user flow is:

1. user uploads protocol PDF
2. extractor emits candidate YAML + report
3. user reviews unresolved fields and warnings
4. ingestion engine validates and compiles
5. resulting records enter computable-lab

A later UI should allow users to:

* jump from YAML field back to source page/span
* correct unresolved entities
* accept/reject inferred structure
* compare raw extracted text vs normalized YAML

---

## Suggested implementation plan

### Phase 1: minimum viable extractor

Goal: extract stepwise protocols from clean digital PDFs.

Build:

* PDF parser wrapper
* document IR
* simple heading/step segmentation
* LLM prompt for canonical YAML emission
* schema validator
* report generator

Support initially:

* title
* sections
* numbered steps
* quantities
* durations
* temperatures
* centrifugation conditions
* raw material names
* basic provenance

### Phase 2: table-aware extraction

Add:

* robust table extraction
* reagent tables
* plate layout tables
* program tables
* row/column provenance

### Phase 3: entity resolution handoff

Add:

* better unresolved entity tracking
* candidate ontology matching hooks
* ingestion hints
* review UI

### Phase 4: multi-source compiler family

Extend the same architecture to:

* Word protocols
* robot scripts
* vendor method files
* literature methods sections
* instrument result files

---

## Prompting strategy for the LLM layer

The model should be instructed to:

* produce only schema-conforming YAML
* never omit uncertainty when unsure
* never invent reagent identities, catalog numbers, or exact labware types not present in the source
* preserve original wording in description fields
* use the controlled action vocabulary where possible
* attach provenance spans when available
* emit unresolved placeholders instead of hallucinations

Useful model inputs:

* parsed page text
* section boundaries
* table extracts
* line numbers or block ids
* prior schema examples
* controlled vocabularies

---

## Suggested internal data structures

### Document IR

Parser-facing structure preserving raw layout semantics.

### Extraction Candidate

Stable intermediate object before YAML serialization.

### Validation Result

Schema and lint results.

### Review Patch

Optional human corrections before ingestion.

---

## Example of atomic event extraction

A source sentence such as:

> Add 500 uL of lysis buffer to each sample tube and incubate at 56 C for 10 minutes.

may remain as one extracted step in v1:

```yaml
- id: step_001
  sequence_no: 1
  action: add
  description: Add 500 uL of lysis buffer to each sample tube and incubate at 56 C for 10 minutes.
  inputs:
    - text: lysis buffer
      role: reagent
      resolution_status: unresolved
  destinations:
    - text: sample tube
      resolution_status: unresolved
  amount:
    value: 500
    unit: uL
  subsequent_conditions:
    - type: incubation
      duration:
        value: 10
        unit: min
      temperature:
        value: 56
        unit: C
  provenance:
    source_span: "page 2, lines 12-12"
```

The ingestion engine can later decide whether to split this into two atomic events.

---

## Acceptance criteria for v1

The system is acceptable for v1 if it can:

* process digitally native protocol PDFs
* identify title and section boundaries reasonably well
* extract ordered procedural steps
* capture common quantities, durations, and temperatures
* preserve page/span provenance for most extracted steps
* emit valid YAML conforming to the canonical shape
* explicitly mark unresolved entities and ambiguities
* generate a structured report of warnings/errors

The system is **not** acceptable if it:

* silently invents missing values
* emits free-form summaries instead of structured YAML
* loses source traceability
* collapses ambiguity into false certainty

---

## Engineering constraints

* deterministic components should be used wherever possible for parsing and validation
* LLM output must be validated before acceptance
* output should be reproducible enough for audit and review
* the pipeline should support later replacement of models without changing the canonical YAML contract
* all transforms should be inspectable and logged

---

## Open questions

These should be resolved during implementation:

1. What exact schema should define `protocol-extraction-candidate`?
2. Should the YAML be optimized for human review, machine ingestion, or both?
3. What is the minimal provenance granularity: page, line, block, token span?
4. Should action normalization happen in extraction or ingestion?
5. How should branching instructions such as optional steps, alternatives, and loops be represented?
6. How should table-only instructions be converted into steps versus retained as raw table structures?
7. How should scanned PDFs and poor OCR quality be surfaced to the user?

---

## Recommended near-term next step

Implement a narrow vertical slice:

* one clean digital protocol PDF
* one parser IR
* one LLM prompt
* one canonical YAML schema
* one validator
* one report output

Then iterate against real examples from:

* vendor protocols
* in-house SOPs
* robot-generated protocols

Use those examples to harden the schema before expanding scope.

---

## Summary

This system should be built as an **extractor that emits candidate structured data**, not as a magical one-shot protocol understanding engine.

The right contract is:

* source document in
* canonical YAML candidate out
* provenance and uncertainty preserved
* ingestion engine handles validation, normalization, and compilation

That separation is what makes the approach trustworthy, extensible, and compatible with the larger computable-lab compiler vision.
