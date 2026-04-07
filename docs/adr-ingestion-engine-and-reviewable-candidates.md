# ADR: Ingestion Engine With Reviewable Candidates

Status: Proposed
Date: 2026-03-22

## Context

Computable Lab can now represent:

- ontology-backed `material`
- reusable `material-spec`
- concrete `material-instance` and `aliquot`
- vendor metadata and OCR-derived vendor document drafts
- concentration-aware formulations and composition
- plate and event models suitable for automated screening workflows

This is necessary but not sufficient for real-world ingestion.

Two representative source classes expose the gap:

1. screening-library source documents such as the Cayman Bio-Active Lipid I Screening Library PDF
2. multi-variant formulation sources such as Sigma RPMI 1640 formulation pages

These sources are messy in ways that matter scientifically:

- PDFs may preserve table layout imperfectly
- chemical names include superscripts, subscripts, Greek letters, deltas, hydrates, salts, and stereochemical qualifiers
- source documents mix product defaults, per-row data, and package metadata
- vendor pages may disagree across versions or regions
- one source may define many publishable outputs:
  - materials
  - vendor products
  - formulations
  - plate-layout templates
  - instantiated labwares

The current vendor-document flow is intentionally narrow:

- attach source document
- OCR or text-extract it
- draft a small composition preview

That is appropriate for PR8, but it is not a sufficient architecture for:

- large plate-map ingestion
- multi-variant formulation ingestion
- multi-stage normalization and ontology resolution
- explicit human review before publishing canonical records

The product goal is:

- ingest high-complexity vendor content into trustworthy scientific records
- preserve provenance and uncertainty at every stage
- provide a biologist-friendly review workflow
- keep AI in a support role rather than letting it directly publish raw guesses

## Decision

We will add a first-class ingestion subsystem built around staged jobs, deterministic parser adapters, reviewable candidate bundles, and explicit publish approval.

The ingestion engine will produce review artifacts first and canonical records only after approval.

## Core Decision Elements

### 1. Ingestion Jobs Are First-Class Records

We will add an `ingestion-job` record as the top-level object for one ingestion run.

Each job will move through explicit stages:

1. `collect`
2. `extract`
3. `normalize`
4. `match`
5. `review`
6. `publish`

Each stage may emit:

- artifacts
- structured candidate records
- review issues
- metrics and confidence summaries
- publish outputs

Jobs must persist intermediate state rather than keeping it only in process memory.

### 2. Deterministic Parser Adapters First, AI-Assisted Second

We will treat ingestion as an adapter-driven pipeline.

Initial adapter families:

- `vendor_plate_map_pdf`
- `vendor_formulation_html`
- `vendor_plate_map_spreadsheet`

Adapter responsibilities:

- detect source structure
- extract repeated tables and sections
- normalize symbols and formatting
- emit structured candidate payloads
- attach provenance and confidence

AI may assist with:

- section segmentation
- symbol normalization
- ontology match ranking
- issue summarization
- candidate bundle summarization

AI will not directly create canonical records from raw documents.

### 3. Candidate Graph Before Publish

The engine will produce candidate records before any canonical publish step.

Initial candidate classes:

- material candidates
- vendor-product candidates
- formulation candidates
- plate-layout candidates
- labware instantiation candidates
- well-assignment candidates
- ontology-match candidates
- review issues

These candidates form a graph rooted in one ingestion job and grouped into one or more candidate bundles.

### 4. Human Review Is Required For Canonical Publish

Human review is part of the model, not an afterthought.

The review surface must be biologist-facing:

- “13 plates detected”
- “812 compounds parsed”
- “26 names need review”
- “5 formulation variants found”

Review should focus on scientific and operational questions:

- Is this the right product/version?
- Are the parsed names correct?
- Are unresolved names acceptable?
- Are these formulation variants scientifically distinct?
- Should this publish plate-layout templates, saved formulations, instantiated labwares, or all three?

### 5. Publish Is Explicit And Reproducible

Publishing is a stage transition from reviewed candidates to canonical records.

Publish may create:

- ontology-backed `material`
- `vendor-product`
- `material-spec`
- `recipe`
- `plate-layout-template`
- optionally instantiated `labware`

Publish must record:

- which candidate bundle was approved
- which review issues were accepted, resolved, or waived
- the created canonical record IDs
- the source job and artifact provenance

## Source-Class Decisions

### Exhibit A: Cayman Screening Library

We will treat Cayman-style library documents as a dedicated screening-library ingestion problem, not as a generic OCR upload.

Expected deterministic parse model:

- repeated four-column table
- columns:
  - `plate_number`
  - `well_position`
  - `contents`
  - `vendor_catalog_number`
- explicit `Unused` wells retained as real well assignments
- product-level defaults attached at the bundle level:
  - `1.0 mM`
  - `DMSO`
  - package sizes such as `25 µL` or `50 µL`

Expected publish outputs:

- one screening-library bundle
- thirteen plate-layout templates
- optional thirteen instantiated labwares
- linked material and vendor-product candidates for compounds

### Exhibit B: Sigma RPMI

We will treat RPMI-style pages as a multi-variant formulation ingestion problem.

Expected deterministic parse model:

- HTML section detection first
- formulation-variant grouping second
- per-row ingredient extraction third

Each formulation variant should produce a formulation candidate with:

- variant name
- intended output identity
- component list
- concentration or quantity rows
- per-component ontology match suggestions
- review issues for ambiguous forms such as hydrates, salts, and stereochemistry

Expected publish outputs:

- one or more `material-spec`
- one or more `recipe`
- optionally linked vendor-product formulation provenance

## Why This Architecture

### Why Not “Let The Agent Read Anything And Publish Records”

That approach fails at exactly the cases that matter:

- large libraries
- ambiguous chemistry names
- multi-source disagreement
- partial OCR recovery
- publish decisions that change the persistent scientific inventory

The cost of a wrong publish is higher than the cost of a slightly slower review workflow.

### Why Candidate Records Instead Of One Large JSON Blob

Candidate records provide:

- stable review IDs
- selective approval and rejection
- provenance per candidate
- future diff and audit capability
- better MCP and AI read paths

### Why Job Records Instead Of Only Background Tasks

Job records give:

- resumability
- inspectable status
- explicit stage metrics
- artifact linkage
- reproducibility across restarts

## Consequences

Positive:

- ingestion becomes reviewable and publish-safe
- large vendor artifacts become manageable
- deterministic parsers can improve incrementally without breaking review/publish semantics
- AI becomes useful without becoming authoritative
- the UI can present ingestion in biologist terms rather than low-level parser events

Tradeoffs:

- additional schema surface
- additional backend orchestration complexity
- a new review UI and dashboard
- more records created during ingestion before publish

## Initial Scope

The first implementation should not attempt universal ingestion.

Initial supported adapters:

1. Cayman screening-library PDF
2. Sigma RPMI formulation HTML

Initial publish targets:

1. `plate-layout-template`
2. `material-spec`
3. `recipe`
4. linked `material` and `vendor-product`

Instantiated labware publish should be optional in the first cut.

## Implementation Phases

### Phase 1

- add `ingestion-job`
- add `ingestion-issue`
- add `ingestion-candidate-bundle`
- add background worker and dashboard shell

### Phase 2

- add Cayman plate-map PDF adapter
- publish to `plate-layout-template`

### Phase 3

- add Sigma formulation HTML adapter
- publish to `recipe` and `material-spec`

### Phase 4

- add ontology resolution service and AI-assisted review loop
- add spreadsheet fast-path
- add vendor-specific adapters

### Phase 5

- optionally add Cayman API adapter if a suitable API exists and provides stable product/library data

## Source Notes

Representative sources for the problem definition:

- Cayman product page for the Bio-Active Lipid I Screening Library
- Sigma RPMI 1640 formulation page
- supporting Sigma RPMI product surfaces

These sources are inputs to the ingestion problem, not direct canonical truth on their own. Canonical publish must still go through review.
