# Run Workspace Implementation Sequence

Date: 2026-03-24
Status: Draft

This document turns the run workspace ADR into an incremental patch plan.

The goal is to ship a run-centered scientific workspace with minimal schema churn, reuse of the existing event graph and execution stack, and no renewed expansion into broad vendor-ingestion infrastructure.

## Guiding Principles

1. Keep the event graph and plate editor at the center of the product.
2. Preserve platform/execution work as first-class infrastructure.
3. Reuse existing semantics records instead of creating parallel meaning models.
4. Reuse ingestion jobs as the review engine for result interpretation.
5. Publish canonical measurements, evidence, and assertions only after review.
6. Add at most one new backend orchestration layer and one new frontend workspace shell.

## Sequence Overview

1. PR1: Run workspace ADR, schema extensions, and backend types
2. PR2: Run workspace aggregate API
3. PR3: Run workspace page shell in `semantic-eln`
4. PR4: Run-linked result interpretation jobs
5. PR5: Measurement candidate approval and publish
6. PR6: AI-assisted meaning drafting
7. PR7: Evidence drafting and acceptance
8. PR8: Analysis bundle export and polish

## PR1: ADR, Schema Extensions, And Shared Types

### Goal

Establish the run workspace architecture, make the minimum additive schema changes, and define shared request/response types without changing user workflows yet.

### Files

- `/home/brad/git/codex-cl/computable-lab/docs/adr-run-workspace-centered-ai-thin-contract.md`
- `/home/brad/git/codex-cl/computable-lab/docs/run-workspace-implementation-sequence.md`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-job.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-candidate.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/types.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/records.ts`
- `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.test.ts`

### Patches

- Extend `ingestion-job` with optional:
  - `run_ref`
  - `event_graph_ref`
  - `read_event_ref`
  - `measurement_context_ref`
- Add `instrument_result_file` to `ingestion-job.source_kind`.
- Add `measurement` to `ingestion-candidate.candidate_type`.
- Add matching TypeScript types and record-builder support.
- Add schema load/validation coverage for the additive fields.

### Exit Criteria

- schema registry loads the updated ingestion schemas cleanly
- TypeScript types model run-linked result interpretation
- no existing ingestion flows break

### Risk

Low.

## PR2: Run Workspace Aggregate API

### Goal

Create a single run-centered backend read API that assembles the data needed for the new workspace UI.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/types.ts`
- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunWorkspaceService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/index.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/routes.ts`
- `/home/brad/git/codex-cl/computable-lab/src/server.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`

### Patches

- Add `RunWorkspaceService` to collect:
  - `run`
  - attached method event graph
  - `measurement-context` records scoped to the run
  - `well-role-assignment` and `well-group` records scoped to those contexts
  - run-linked ingestion jobs
  - run-linked `measurement`, `evidence`, and `assertion` records
- Add `GET /runs/:id/workspace`.
- Register the new handlers in server bootstrap.
- Add integration coverage for the aggregate response.

### Exit Criteria

- a single API call can render a run workspace shell
- no new record types are introduced
- the aggregate response prefers references and summaries over duplicated record payloads when possible

### Risk

Medium.

## PR3: Run Workspace Page Shell

### Goal

Create the main run workspace UI shell and route without yet changing authoring or measurement publish behavior.

### Files

- `/home/brad/git/codex-cl/semantic-eln/src/pages/RunWorkspacePage.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunWorkspaceShell.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunWorkspaceOverview.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/hooks/useRunWorkspace.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/server.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/App.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/Layout.tsx`

### Patches

- Add a run workspace route.
- Fetch `GET /runs/:id/workspace`.
- Render four sections or tabs:
  - `Plan`
  - `Meaning`
  - `Results`
  - `Claims`
- Link out to the existing labware editor for plan editing rather than duplicating authoring UI.
- Show run summary, event graph summary, measurement context summary, result job summary, and evidence summary.

### Exit Criteria

- a user can open one run and see all major workflow state in one place
- the page feels run-centered rather than ingestion-centered
- no existing labware-editor behavior regresses

### Risk

Medium.

## PR4: Run-Linked Result Interpretation Jobs

### Goal

Shift result ingestion from direct measurement publish toward run-linked interpretation jobs using the existing ingestion engine.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunResultsService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionWorker.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/types.ts`
- `/home/brad/git/codex-cl/computable-lab/src/measurement/MeasurementParserValidationService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/measurement/parsers/ParserRegistry.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/IngestionApi.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunResultsPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/hooks/useRunResults.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`

### Patches

- Add run-centered endpoints:
  - `POST /runs/:id/results`
  - `GET /runs/:id/results`
  - `GET /runs/:id/results/:jobId`
- Create result interpretation jobs with:
  - attached file or URL
  - optional `readEventRef`
  - optional `measurementContextRef`
  - optional parser hint
- Reuse ingestion job infrastructure to persist:
  - extraction preview
  - parser choice
  - alignment issues
  - proposed measurement candidates
- Keep vendor/source-specific adapters available, but subordinate them to run alignment.

### Exit Criteria

- result files can be attached from the run workspace
- job state is visible in the run workspace
- no canonical `measurement` record is written until explicit approval

### Risk

Medium to High.

## PR5: Measurement Candidate Approval And Publish

### Goal

Publish canonical `measurement` records from approved run-linked interpretation jobs.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunResultsService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/measurement/MeasurementService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MeasurementHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunResultsPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/types/ingestion.ts`

### Patches

- Add `POST /runs/:id/results/:jobId/approve`.
- Refactor `MeasurementService` so canonical write logic can be called from approved candidates rather than only from raw direct ingest.
- Keep `POST /measurements/ingest` for backward compatibility, but mark it as a low-level path.
- Persist clear provenance from measurement to source artifact, run, event graph, and read event.

### Exit Criteria

- an approved result job can publish one or more `measurement` records
- published measurement records are linked to run and read-event context
- direct measurement ingest remains available but is no longer the preferred user path

### Risk

Medium.

## PR6: AI-Assisted Meaning Drafting

### Goal

Use AI to propose measurement semantics from the event graph and current plate state while publishing into existing semantics records only after review.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunMeaningService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/types.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ai/systemPrompt.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunMeaningPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/hooks/useAiChat.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/api/aiClient.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/ai.ts`

### Patches

- Add `POST /runs/:id/meaning/draft`.
- AI input:
  - event graph
  - selected wells
  - known materials
  - existing measurement contexts and role assignments
- AI output:
  - proposed `measurement-context`
  - proposed `well-role-assignment`
  - proposed `well-group`
  - unresolved questions
- Render suggestions in a review panel and save via existing record APIs.

### Exit Criteria

- users can get semantic suggestions without inventing a new meaning model
- the event graph remains the operational source and semantics remain explicit records
- AI proposals are reviewable and non-destructive

### Risk

Medium.

## PR7: Evidence Drafting And Acceptance

### Goal

Generate evidence and assertion drafts from reviewed measurements plus well semantics.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunEvidenceService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/SemanticsHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/measurement/MeasurementService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunClaimsPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/hooks/useKnowledgeExtraction.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`

### Patches

- Add:
  - `POST /runs/:id/evidence/draft`
  - `POST /runs/:id/evidence/accept`
- Use:
  - selected measurements
  - measurement contexts
  - control/treatment roles
  - readout definitions
  - existing claim references when available
- Draft:
  - `evidence`
  - `assertion`
  - optional claim links
- Keep human approval before persistence.

### Exit Criteria

- evidence can be drafted from run data rather than only literature-like extraction
- generated records cite measurements, event graph context, and source files cleanly
- review UI makes ambiguity explicit

### Risk

Medium.

## PR8: Analysis Bundle Export And Workflow Polish

### Goal

Produce a clean handoff package for analysis while tightening the run workspace UX.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/run-workspace/RunAnalysisBundleService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/RunWorkspaceHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/execution/PlateMapExporter.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/run-workspace/RunWorkspaceShell.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`

### Patches

- Add `GET /runs/:id/analysis-bundle`.
- Export a normalized package containing:
  - run summary
  - event graph summary
  - plate map export
  - measurement summaries
  - semantic assignments
  - evidence/assertion summaries
  - raw artifact references
- Polish the workspace shell so the main workflow can be completed without bouncing across separate pages.

### Exit Criteria

- a run can be exported for downstream stats or notebook workflows
- all critical run state is discoverable from the workspace page
- the core workflow no longer feels ingestion-dashboard-centric

### Risk

Low to Medium.

## Freeze List

During this sequence, avoid adding:

- new top-level scientific record types
- new vendor-specific ingestion families unless needed for an active experiment
- a generic self-serve adapter-authoring platform
- a second plate-state or well-meaning model

## Protected Subsystems

These subsystems are explicitly preserved and remain strategic:

- event graph and plate editor
- execution planning and platform registry
- robot compilation/execution adapters
- measurement, evidence, and assertion records

## Success Criteria

At the end of this sequence, the product should support one coherent run-centered loop:

1. author run in plate terms
2. define what wells mean
3. attach result files to read events
4. review and publish measurements
5. draft and accept evidence/assertions
6. export a clean analysis bundle

If that loop works, the project is back on its intended center without discarding the editor, robot platform work, or schema-backed rigor.
