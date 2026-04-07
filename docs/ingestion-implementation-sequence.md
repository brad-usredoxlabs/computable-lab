# Ingestion Implementation Sequence

Date: 2026-03-22
Status: Draft

This document converts the ingestion ADR and schema plan into an execution sequence.

The goal is to ship a trustworthy ingestion system incrementally, with each step producing usable value and a bounded review surface.

## Guiding Principles

1. Build reviewable ingestion infrastructure before broad source support.
2. Prefer deterministic parser adapters over free-form AI extraction.
3. Persist intermediate artifacts, candidates, and issues rather than hiding them in transient jobs.
4. Publish canonical records only after explicit review approval.
5. Keep the UI biologist-facing and operationally clear.

## Sequence Overview

1. PR1: Ingestion schema foundation
2. PR2: Job store, API, and worker shell
3. PR3: Ingestion dashboard shell
4. PR4: Cayman PDF collection and extraction adapter
5. PR5: Cayman normalization, matching, and review bundle
6. PR6: Cayman publish to plate-layout templates
7. PR7: Sigma HTML collection and extraction adapter
8. PR8: Sigma formulation normalization and review bundle
9. PR9: Sigma publish to material-spec and recipe

## Milestones

### Milestone A

PR1 through PR3

Goal:

- ingestion records exist
- jobs can be submitted and tracked
- dashboard can display job, bundle, candidate, and issue state

### Milestone B

PR4 through PR6

Goal:

- Cayman PDF can be ingested into reviewable screening-library bundles
- approved bundles can publish `plate-layout-template` records

### Milestone C

PR7 through PR9

Goal:

- Sigma HTML formulation pages can be ingested into reviewable formulation-family bundles
- approved bundles can publish `material-spec` and `recipe` records

## PR1: Ingestion Schema Foundation

### Goal

Create the schema foundation for staged ingestion, artifacts, candidates, bundles, and issues without changing runtime behavior yet.

### Files

- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-job.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-artifact.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-candidate-bundle.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-candidate.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/ingestion/ingestion-issue.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/ingestion-source-ref.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/ontology-match-candidate.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/publish-result.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/schema/core/datatypes/ingestion-metrics.schema.yaml`
- `/home/brad/git/codex-cl/computable-lab/src/schema/SchemaRegistry.test.ts`

### Deliverables

- first-class ingestion record schemas
- reusable source-ref, ontology-match, publish-result, and metrics datatypes
- schema validation coverage for the new record family

### Exit Criteria

- all ingestion schemas load and validate
- record references between job, artifact, bundle, candidate, and issue schemas resolve correctly
- no existing record types are affected

### Risk

Low. This is additive schema groundwork.

## PR2: Job Store, API, And Worker Shell

### Goal

Add the backend runtime for creating, persisting, and progressing ingestion jobs through stages.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/IngestionHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/routes.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionWorker.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/types.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/records.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`

### Deliverables

- create/list/get ingestion job endpoints
- background worker shell that can execute staged jobs
- persisted stage transitions and job metrics
- support for attaching source artifacts to jobs

### Exit Criteria

- user can create an ingestion job from a file or URL stub
- job status persists as records, not only in memory
- job detail endpoint exposes bundle, candidate, and issue references cleanly

### Risk

Medium. This adds a new backend workflow and API surface.

## PR3: Ingestion Dashboard Shell

### Goal

Create the initial biologist-facing dashboard for upload, status tracking, and review navigation.

### Files

- `/home/brad/git/codex-cl/semantic-eln/src/pages/IngestionPage.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/IngestionJobList.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/IngestionJobDetail.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/IngestionBundleSummary.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/api/client.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/types/ingestion.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/Layout.tsx`

### Deliverables

- ingestion dashboard route
- upload or URL submission entry point
- job list with stage and status
- job detail with bundles, issues, and review counts

### Exit Criteria

- user can submit a stub job from the UI
- dashboard shows “queued”, “running”, “waiting for review”, and “published”
- job summaries use biologist-facing wording rather than parser internals

### Risk

Medium. Mostly frontend and API alignment.

## PR4: Cayman PDF Collection And Extraction Adapter

### Goal

Ingest Cayman-style screening-library PDFs into structured extraction artifacts.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/adapters/caymanPlateMapPdf.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/pdf/TableExtractionService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/normalization/chemSymbolNormalization.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionWorker.ts`
- `/home/brad/git/codex-cl/computable-lab/src/vendor-documents/service.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/adapters/CaymanPlateMapPdf.test.ts`

### Deliverables

- deterministic PDF adapter for repeated four-column plate tables
- extraction of:
  - plate number
  - well position
  - contents
  - vendor catalog number
- explicit retention of `Unused` wells
- normalized symbol handling for Greek and delta-like characters

### Exit Criteria

- Cayman PDF produces structured extraction artifacts with page and row provenance
- adapter does not collapse `Unused` wells into absence
- extraction can represent 13 separate 96-well plate tables

### Risk

High. PDF table extraction is the first difficult source-specific adapter.

### Notes

Do not publish any canonical records here. Stay in artifact extraction only.

## PR5: Cayman Normalization, Matching, And Review Bundle

### Goal

Turn Cayman extraction artifacts into reviewable screening-library bundles with candidates and issues.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/pipelines/caymanLibraryPipeline.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/matching/MaterialMatchService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/issues/IssueBuilder.ts`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/exaTools.ts`
- `/home/brad/git/codex-cl/computable-lab/src/mcp/tools/ontologyTools.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/CandidateReviewPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/IssueReviewPanel.tsx`

### Deliverables

- one screening-library candidate bundle per Cayman product ingestion
- plate-layout, vendor-product, material, and well-assignment candidates
- product-level defaults attached to the bundle:
  - `1.0 mM`
  - `DMSO`
  - package metadata such as `25 µL` / `50 µL`
- review issues for:
  - ambiguous material names
  - unresolved ontology matches
  - extraction gaps
  - source conflicts

### Exit Criteria

- dashboard can show:
  - “13 plates detected”
  - “812 compounds parsed”
  - “N names need review”
- candidates preserve page, row, and artifact provenance
- unresolved names are explicit review items rather than silent failures

### Risk

High. This is the first end-to-end candidate and review flow.

## PR6: Cayman Publish To Plate-Layout Templates

### Goal

Publish approved Cayman screening-library bundles into canonical records.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/publishers/CaymanLibraryPublisher.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/IngestionHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialLifecycleHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/PublishApprovalPanel.tsx`

### Deliverables

- explicit approve and publish actions for screening-library bundles
- publish to:
  - `material`
  - `vendor-product`
  - `plate-layout-template`
- optional publish path for instantiated labwares, guarded behind explicit user choice
- publish summary recorded back onto the bundle and job

### Exit Criteria

- approved Cayman bundle can create 13 `plate-layout-template` records
- created canonical records link back to ingestion provenance
- publish does not proceed when blocking issues remain open

### Risk

Medium to high. This is the first canonical publish flow.

## PR7: Sigma HTML Collection And Extraction Adapter

### Goal

Ingest Sigma-style formulation HTML into structured formulation extraction artifacts.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/adapters/vendorFormulationHtml.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/html/HtmlSectionExtractionService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/adapters/VendorFormulationHtml.test.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/IngestionWorker.ts`

### Deliverables

- HTML-specific adapter for formulation pages
- extraction of variant sections and ingredient rows
- source artifact snapshots for vendor HTML and supporting URLs
- provenance back to variant section and row location

### Exit Criteria

- Sigma RPMI page yields structured variant and ingredient extraction artifacts
- extraction stays HTML-first and does not fall back to OCR for normal cases
- multiple formulation variants can be represented from one source family

### Risk

Medium. HTML is simpler than PDF, but variant grouping adds complexity.

## PR8: Sigma Formulation Normalization And Review Bundle

### Goal

Turn Sigma formulation extraction artifacts into reviewable formulation-family bundles.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/pipelines/vendorFormulationPipeline.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/matching/FormulationMatchService.ts`
- `/home/brad/git/codex-cl/computable-lab/src/ingestion/issues/IssueBuilder.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/FormulationVariantReviewPanel.tsx`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/CandidateReviewPanel.tsx`

### Deliverables

- one formulation-family bundle per Sigma formulation source
- formulation and recipe candidates per variant
- ingredient candidates with:
  - name
  - quantity or concentration
  - role
  - ontology match ranking
- review issues for:
  - ambiguous salts and hydrates
  - uncertain variant grouping
  - unresolved ingredients

### Exit Criteria

- dashboard can show:
  - “5 formulation variants found”
  - “N ingredients need review”
- formulation variants are represented separately, not flattened together
- ambiguous ingredient identity is explicit and reviewable

### Risk

High. Chemistry normalization and variant grouping are easy to get subtly wrong.

## PR9: Sigma Publish To Material-Spec And Recipe

### Goal

Publish approved Sigma formulation-family bundles into canonical reusable formulation records.

### Files

- `/home/brad/git/codex-cl/computable-lab/src/ingestion/publishers/VendorFormulationPublisher.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/IngestionHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/handlers/MaterialPrepHandlers.ts`
- `/home/brad/git/codex-cl/computable-lab/src/api/Api.test.ts`
- `/home/brad/git/codex-cl/semantic-eln/src/components/ingestion/PublishApprovalPanel.tsx`

### Deliverables

- publish approved formulation candidates to `material-spec`
- publish approved procedure candidates to `recipe`
- create or link required ontology-backed `material` records
- optionally link vendor-product provenance when present

### Exit Criteria

- approved Sigma bundle can create distinct `material-spec` and `recipe` records for each formulation variant
- published records preserve source and review provenance
- open blocking issues prevent publish

### Risk

Medium to high. Canonical publish semantics must stay aligned with existing formulation models.

## Cross-Cutting Follow-Ups

These are deliberately out of scope for PR1 through PR9, but should be tracked after the core sequence lands.

1. spreadsheet fast-path for vendor plate maps
2. richer ontology-assisted name resolution and salt/hydrate normalization
3. optional Cayman API adapter if a stable source exists
4. partial-bundle approval and partial publish support
5. richer publish targets such as screening-library canonical records

## Recommended Execution Order

Land in three milestones:

1. Milestone A: PR1 to PR3
2. Milestone B: PR4 to PR6
3. Milestone C: PR7 to PR9

Do not overlap Cayman and Sigma publish work before the shared ingestion infrastructure is stable.

## Acceptance Scenarios

### Cayman

1. Upload Cayman screening-library PDF
2. Job reaches `review`
3. Dashboard shows 13 plate bundles or one 13-plate screening-library bundle with clear review counts
4. Reviewer approves bundle
5. Publish creates `plate-layout-template` records and linked provenance

### Sigma RPMI

1. Submit Sigma RPMI formulation URL
2. Job reaches `review`
3. Dashboard shows formulation variants and unresolved ingredient issues
4. Reviewer approves bundle
5. Publish creates `material-spec` and `recipe` records per approved variant

## Recommendation

Do not begin with generic “ingest any document” behavior.

Start with:

1. ingestion infrastructure
2. Cayman PDF adapter
3. Sigma HTML adapter

That is the narrowest rollout that proves the architecture against two genuinely different source classes without overcommitting to a brittle universal parser.
