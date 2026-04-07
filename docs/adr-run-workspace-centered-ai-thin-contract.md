# ADR: Run Workspace Centered AI Thin Contract

Date: 2026-03-24
Status: Proposed

## Context

`computable-lab` now has substantial capability across several layers:

- schema-backed scientific records
- event-graph authoring and plate-centric workflow editing
- platform-aware execution planning and robot compilation
- ingestion jobs, artifacts, candidates, and review flows
- measurement parsing
- evidence, claim, and assertion models
- AI-assisted event drafting and knowledge extraction

This is valuable, but the product center has drifted.

Recent ingestion work has emphasized vendor-specific source adapters and parser workflows. That is useful in bounded cases, but it is not the primary workflow a biologist experiences as "doing science" in the system.

The biologist-facing workflow is closer to:

1. set up a run intuitively in plate terms
2. define what wells and controls mean
3. execute manually or on a robot
4. attach result files to the intended run/readout
5. convert reviewed data into evidence and assertions
6. export a clean analysis package

The repository already contains most of the primitives needed for this:

- run header and method attachment in `schema/studies/run.schema.yaml`
- event graph as the primary authoring object in `schema/workflow/event-graph.schema.yaml`
- semantic well meaning via `measurement-context`, `well-role-assignment`, and `well-group`
- measurement records linked to event graph and read event
- evidence and assertion records
- AI event drafting and review-first ingestion infrastructure

The missing piece is not a large new schema family. The missing piece is a run-centered orchestration layer that connects these existing capabilities without expanding into another general-purpose ingestion platform.

## Decision

Adopt a run workspace as the primary product surface and keep AI behind a thin proposal contract.

Canonical workflow:

1. `run` is the working unit
2. the event graph and plate editor remain the center of authoring
3. semantic meaning is expressed through existing semantics records
4. raw result files are interpreted in the context of a run and read event before canonical publish
5. measurements, evidence, and assertions are published only after review

AI contract:

- AI may draft proposed event edits
- AI may draft semantic meaning assignments
- AI may propose result-to-run mappings and parser choices
- AI may draft evidence and assertions
- AI may summarize ambiguity and missing information
- AI may not directly publish canonical records without review

## Core Model

The product should rely on the following core records:

- `study`
- `experiment`
- `run`
- `event-graph`
- `measurement-context`
- `well-role-assignment`
- `well-group`
- `measurement`
- `evidence`
- `assertion`

Execution/planning records remain part of the platform and are not demoted:

- `planned-run`
- `execution-plan`
- `robot-plan`
- execution runtime records

These remain essential because robot decks, platform constraints, and plate-state authoring are core to how a biologist thinks and works.

## Product Surface

The main user-facing workflow should become a single run workspace with four coordinated areas:

1. `Plan`
   - edit the event graph
   - define plate layouts and protocol intent
   - attach method/platform context

2. `Meaning`
   - define control and treatment meaning
   - assign semantic well roles
   - define measurement contexts and readout expectations

3. `Results`
   - attach instrument output files to a run
   - propose parser and plate/read-event alignment
   - review measurement candidates and issues

4. `Claims`
   - generate evidence bundles from measurements plus semantics
   - draft assertion candidates
   - export a downstream analysis bundle

This is more flexible than a rigid LIMS or ERP workflow, but more bounded than a free-form agentic notebook.

## Architectural Direction

### 1. Event Graph Remains The System Spine

The event graph remains the canonical representation of what was intended and what happened operationally.

It is the source for:

- plate state and well lineage
- transfer and read events
- platform-agnostic execution intent
- downstream mapping of results to read events and labware instances

### 2. Semantics Stay Separate But Adjacent

Well meaning should not be embedded as ad hoc JSON inside event details when existing semantics records already cover the problem.

The authoritative semantics layer remains:

- `measurement-context`
- `well-role-assignment`
- `well-group`

AI may propose these records or edits to them, but they remain explicit and reviewable.

### 3. Result Interpretation Is Run-Linked, Not Vendor-Centered

Ingestion should shift from a primarily vendor-centered framing to a run interpretation framing.

The first question for a result file should be:

- which run does this belong to
- which read event does it satisfy
- which labware instance or output does it correspond to
- which measurement context gives it meaning

Vendor-specific adapters remain useful, but they are implementation details behind this run-centered workflow.

### 4. Review-First Publish Applies To Results Too

The existing ingestion architecture already uses jobs, candidates, and approval before canonical publish.

That same discipline should be applied to result files:

- result file arrives
- system extracts and interprets
- candidate measurement mapping is reviewed
- canonical `measurement` record is published
- evidence/assertion drafting occurs after reviewed measurement publish

### 5. AI Contract Must Stay Thin

We should not build a broad autonomous ingestion platform or agent execution substrate at this stage.

The thin AI contract consists of three proposal classes:

1. event drafting
2. result interpretation
3. evidence drafting

Each proposal returns:

- proposed records or changes
- confidence
- unresolved questions
- provenance
- human-readable summary

## API Direction

Add a run workspace API family that assembles and coordinates existing record families:

- `GET /runs/:id/workspace`
- `POST /runs/:id/meaning/draft`
- `POST /runs/:id/results`
- `GET /runs/:id/results`
- `GET /runs/:id/results/:jobId`
- `POST /runs/:id/results/:jobId/approve`
- `POST /runs/:id/evidence/draft`
- `POST /runs/:id/evidence/accept`
- `GET /runs/:id/analysis-bundle`

Existing endpoints remain valid, but run-centered endpoints become the preferred path in the UI.

## Minimum Schema Changes

Do not add new top-level scientific record types for this initiative.

Make only bounded additive schema changes:

1. Extend `ingestion-job` with optional run/result alignment references:
   - `run_ref`
   - `event_graph_ref`
   - `read_event_ref`
   - `measurement_context_ref`
   - add `instrument_result_file` to `source_kind`

2. Extend `ingestion-candidate.candidate_type` with:
   - `measurement`

No changes are required yet to:

- `run`
- `measurement`
- `evidence`
- `assertion`

We should document a canonical `read` event payload convention before formalizing more schema around readout contracts.

## Consequences

Positive:

- the event graph and plate editor remain the center of the product
- robot/platform work remains first-class and is not lost
- result ingestion becomes scientifically meaningful rather than only parser-driven
- AI is leveraged aggressively without becoming the source of truth
- the system becomes closer to a bounded scientific workspace than either an ERP or a free-form agent shell

Tradeoffs:

- vendor-specific ingestion becomes explicitly secondary
- some existing ingestion naming and UX will need reframing around runs rather than sources
- measurement ingestion must be reworked from direct publish to review-first publish

## Non-Goals

Out of scope for this ADR:

- building a generic self-serve website scraper platform
- replacing the existing execution platform abstractions
- introducing a second plate-state model outside the event graph
- letting AI publish canonical records without review
- expanding schema families unless forced by real run workflows

## Implementation Principle

Prefer one new orchestration layer over multiple new model layers.

That means:

- add a run workspace service
- reuse existing semantics records
- reuse existing ingestion jobs for review-first result interpretation
- reuse existing measurement, evidence, and assertion records as publish targets

This is the narrowest path that recenters the project without discarding the plate editor, robot platform support, or schema-backed scientific rigor.
