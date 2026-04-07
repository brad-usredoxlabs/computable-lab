# Ingestion Schema Plan

Date: 2026-03-22
Status: Draft

This document turns the ingestion ADR into a concrete schema and rollout plan.

The goal is to add a reviewable ingestion model without blocking current vendor-document or formulation workflows.

## Design Principles

1. Preserve provenance at every layer.
2. Separate candidate truth from canonical published truth.
3. Keep ingestion additive to existing `material`, `vendor-product`, `recipe`, and `plate-layout-template` models.
4. Prefer explicit review state over hidden parser confidence.
5. Model work in biologist-facing terms.

## New Record Families

We should add a dedicated `schema/ingestion/` family with five initial record types.

### 1. `ingestion-job`

Purpose:

- top-level persisted job state
- stage progression
- metrics, summary, and publish status

Proposed file:

- `computable-lab/schema/ingestion/ingestion-job.schema.yaml`

Core fields:

- `kind: ingestion-job`
- `id`
- `name`
- `status`
- `stage`
- `source_kind`
- `adapter_kind`
- `submitted_by`
- `submitted_at`
- `started_at`
- `completed_at`
- `source_refs[]`
- `artifact_refs[]`
- `bundle_refs[]`
- `issue_refs[]`
- `publish_summary`
- `metrics`
- `notes`

Enums:

- `status`:
  - `queued`
  - `running`
  - `waiting_for_review`
  - `approved_for_publish`
  - `publishing`
  - `published`
  - `failed`
  - `cancelled`
- `stage`:
  - `collect`
  - `extract`
  - `normalize`
  - `match`
  - `review`
  - `publish`
- `source_kind`:
  - `vendor_plate_map_pdf`
  - `vendor_formulation_html`
  - `vendor_plate_map_spreadsheet`
  - `vendor_catalog_page`
  - `other`

### 2. `ingestion-artifact`

Purpose:

- represent one uploaded or fetched source artifact
- keep raw extraction products linked to jobs

Proposed file:

- `computable-lab/schema/ingestion/ingestion-artifact.schema.yaml`

Core fields:

- `kind: ingestion-artifact`
- `id`
- `job_ref`
- `artifact_role`
- `source_url`
- `file_ref`
- `media_type`
- `sha256`
- `fetch_metadata`
- `text_extract`
- `table_extracts[]`
- `html_extract`
- `page_map`
- `provenance`

Enums:

- `artifact_role`:
  - `primary_source`
  - `supporting_source`
  - `ocr_output`
  - `html_snapshot`
  - `spreadsheet_snapshot`
  - `normalized_extract`

This record is the bridge between current `vendor-document` style ingestion and the new job model.

### 3. `ingestion-candidate-bundle`

Purpose:

- group related candidate outputs into one reviewable publish unit

Examples:

- one Cayman screening library
- one RPMI family with six formulation variants

Proposed file:

- `computable-lab/schema/ingestion/ingestion-candidate-bundle.schema.yaml`

Core fields:

- `kind: ingestion-candidate-bundle`
- `id`
- `job_ref`
- `title`
- `bundle_type`
- `summary`
- `status`
- `candidate_refs[]`
- `issue_refs[]`
- `publish_plan`
- `review_snapshot`

Enums:

- `bundle_type`:
  - `screening_library`
  - `formulation_family`
  - `vendor_product_batch`
  - `other`
- `status`:
  - `draft`
  - `in_review`
  - `approved`
  - `partially_approved`
  - `rejected`
  - `published`

### 4. `ingestion-candidate`

Purpose:

- represent one proposed publishable object before canonicalization

Proposed file:

- `computable-lab/schema/ingestion/ingestion-candidate.schema.yaml`

Core fields:

- `kind: ingestion-candidate`
- `id`
- `job_ref`
- `bundle_ref`
- `candidate_type`
- `title`
- `status`
- `source_refs[]`
- `confidence`
- `normalized_name`
- `payload`
- `proposed_record_kind`
- `proposed_schema_id`
- `match_refs[]`
- `issue_refs[]`
- `publish_result`

Enums:

- `candidate_type`:
  - `material`
  - `vendor_product`
  - `formulation`
  - `recipe`
  - `plate_layout`
  - `labware_instance`
  - `well_assignment`
- `status`:
  - `draft`
  - `needs_review`
  - `approved`
  - `rejected`
  - `published`

`payload` is intentionally typed as a flexible object in v1. It contains the proposed canonical payload before publish.

### 5. `ingestion-issue`

Purpose:

- model reviewable problems explicitly

Proposed file:

- `computable-lab/schema/ingestion/ingestion-issue.schema.yaml`

Core fields:

- `kind: ingestion-issue`
- `id`
- `job_ref`
- `bundle_ref`
- `candidate_ref`
- `severity`
- `issue_type`
- `title`
- `detail`
- `suggested_action`
- `resolution_status`
- `resolution_note`
- `evidence_refs[]`

Enums:

- `severity`:
  - `info`
  - `warning`
  - `error`
- `issue_type`:
  - `name_ambiguity`
  - `ontology_match_ambiguous`
  - `missing_vendor_identifier`
  - `table_parse_gap`
  - `symbol_normalization_changed`
  - `variant_grouping_uncertain`
  - `source_conflict`
  - `publish_blocker`
  - `other`
- `resolution_status`:
  - `open`
  - `accepted`
  - `resolved`
  - `waived`
  - `rejected`

## Supporting Datatypes

We should add reusable datatypes under `schema/core/datatypes/`.

### `ingestion-source-ref`

Purpose:

- point from jobs/candidates/issues to a source artifact and source fragment

Fields:

- `artifact_ref`
- `page`
- `section_label`
- `row_label`
- `cell_label`
- `quote`
- `locator_text`

### `ontology-match-candidate`

Purpose:

- store ranked ontology suggestions for materials and components

Fields:

- `namespace`
- `term_id`
- `label`
- `match_type`
- `score`
- `rationale`
- `accepted`

### `publish-result`

Purpose:

- store publish outcomes on candidate or bundle

Fields:

- `published`
- `record_ref`
- `published_at`
- `published_by`
- `note`

### `ingestion-metrics`

Purpose:

- store human-friendly counts for dashboards

Fields:

- `plates_detected`
- `wells_detected`
- `unused_wells_detected`
- `materials_detected`
- `variants_detected`
- `issues_open`
- `issues_blocking`

## Candidate Payload Shapes

We should standardize the `payload` shape by candidate type.

## `material` candidate payload

- `name`
- `synonyms[]`
- `domain`
- `primary_ref`
- `molecular_formula`
- `molecular_weight`
- `ontology_matches[]`

## `vendor_product` candidate payload

- `name`
- `vendor`
- `catalog_number`
- `material_ref_candidate`
- `declared_composition[]`
- `source_documents[]`
- `package_metadata`

## `formulation` / `recipe` candidate payload

- `name`
- `variant_label`
- `represented_material_candidate`
- `output`
  - `concentration`
  - `solvent_ref`
  - `composition[]`
- `input_roles[]`
- `provenance_summary`

## `plate_layout` candidate payload

- `name`
- `plate_format`
- `vendor`
- `plate_number`
- `screening_library_ref`
- `wells[]`

Each well entry:

- `well`
- `status`
- `material_candidate_ref`
- `vendor_product_candidate_ref`
- `catalog_number`
- `declared_concentration`
- `notes`

## `labware_instance` candidate payload

- `name`
- `labware_type`
- `source_plate_layout_candidate_ref`
- `initial_contents_policy`

This stays optional in the first publish phase.

## Schema Relationships

Primary relationship graph:

- `ingestion-job`
  - has many `ingestion-artifact`
  - has many `ingestion-candidate-bundle`
  - has many `ingestion-issue`
- `ingestion-candidate-bundle`
  - has many `ingestion-candidate`
  - has many `ingestion-issue`
- `ingestion-candidate`
  - may have many `ontology-match-candidate`
  - may have many `ingestion-issue`
  - may publish one canonical record

## Publish Mapping

### Cayman publish mapping

Bundle type:

- `screening_library`

Candidate types typically emitted:

- `material`
- `vendor_product`
- `plate_layout`
- optional `labware_instance`

Canonical publish mapping:

- `material` candidate -> `material`
- `vendor_product` candidate -> `vendor-product`
- `plate_layout` candidate -> `plate-layout-template`
- `labware_instance` candidate -> instantiated `labware`

### RPMI publish mapping

Bundle type:

- `formulation_family`

Candidate types typically emitted:

- `material`
- `vendor_product`
- `formulation`
- `recipe`

Canonical publish mapping:

- `material` candidate -> `material`
- `vendor_product` candidate -> `vendor-product`
- `formulation` candidate -> `material-spec`
- `recipe` candidate -> `recipe`

## API Plan

These do not need to be implemented immediately, but the schema plan assumes a corresponding API.

### Job lifecycle

- `POST /api/ingestion/jobs`
- `GET /api/ingestion/jobs`
- `GET /api/ingestion/jobs/:id`
- `POST /api/ingestion/jobs/:id/cancel`

### Artifact intake

- `POST /api/ingestion/jobs/:id/artifacts`
- `POST /api/ingestion/jobs/from-url`

### Review

- `GET /api/ingestion/jobs/:id/bundles`
- `GET /api/ingestion/bundles/:id`
- `PATCH /api/ingestion/candidates/:id`
- `PATCH /api/ingestion/issues/:id`

### Publish

- `POST /api/ingestion/bundles/:id/approve`
- `POST /api/ingestion/bundles/:id/publish`

## UI Plan

The dashboard should align with the schema model.

### Dashboard list

Based on `ingestion-job` summaries:

- job title
- source kind
- stage
- status
- started time
- review counts

### Job detail

Based on `ingestion-job`, `ingestion-artifact`, and bundle summaries:

- source artifacts
- stage timeline
- parser summary
- review cards
- publish actions

### Bundle review

Based on `ingestion-candidate-bundle`, `ingestion-candidate`, `ingestion-issue`:

- “13 plates detected”
- “812 compounds parsed”
- “26 names need review”
- “5 formulation variants found”

This is the main human review screen.

## Rollout Sequence

### Phase 1: Core records and worker shell

Add:

- `ingestion-job`
- `ingestion-artifact`
- `ingestion-candidate-bundle`
- `ingestion-candidate`
- `ingestion-issue`

Plus:

- minimal API and dashboard shell
- background worker execution model

### Phase 2: Cayman adapter

Add:

- PDF table extraction adapter
- symbol normalization
- plate-layout candidate payloads
- publish to `plate-layout-template`

### Phase 3: RPMI adapter

Add:

- HTML formulation adapter
- formulation family bundles
- publish to `recipe` and `material-spec`

### Phase 4: Match and review enrichment

Add:

- ontology match datatypes
- AI-assisted match ranking
- richer issue generation
- spreadsheet fast-path

### Phase 5: Vendor-specific optimization

Add:

- Cayman-specific metadata enrichment
- optional Cayman API adapter if suitable
- source-specific resolver improvements

## Open Questions

1. Should `screening-library` be a canonical publish target later, separate from bundles?
2. Should `plate-layout-template` gain explicit vendor library provenance fields instead of relying only on publish metadata?
3. Should `ingestion-candidate.payload` remain flexible long-term, or split into candidate-type-specific schemas after v1?
4. Should publish support partial-bundle approval in v1 or only full-bundle publish?

## Recommended First Cut

Build only enough schema and API to support:

1. Cayman PDF -> bundle -> plate-layout-template publish
2. Sigma HTML -> bundle -> `material-spec` and `recipe` publish

That is the narrowest path that proves the ingestion architecture on two materially different source classes.
