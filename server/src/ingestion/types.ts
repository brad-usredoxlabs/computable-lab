import type { RecordEnvelope, RecordStore } from '../store/types.js';

export const INGESTION_SCHEMA_IDS = {
  job: 'https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml',
  artifact: 'https://computable-lab.com/schema/computable-lab/ingestion-artifact.schema.yaml',
  bundle: 'https://computable-lab.com/schema/computable-lab/ingestion-candidate-bundle.schema.yaml',
  candidate: 'https://computable-lab.com/schema/computable-lab/ingestion-candidate.schema.yaml',
  issue: 'https://computable-lab.com/schema/computable-lab/ingestion-issue.schema.yaml',
} as const;

export type IngestionSourceKind =
  | 'vendor_plate_map_pdf'
  | 'vendor_formulation_html'
  | 'vendor_plate_map_spreadsheet'
  | 'vendor_catalog_page'
  | 'vendor_protocol_pdf'
  | 'instrument_plate_reader'
  | 'instrument_qpcr'
  | 'instrument_gc_ms'
  | 'instrument_gc_fid'
  | 'instrument_fluorescence_microscopy'
  | 'other';

export type IngestionJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_review'
  | 'approved_for_publish'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export type IngestionJobStage = 'collect' | 'extract' | 'normalize' | 'match' | 'review' | 'publish';

export interface IngestionJobProgress {
  phase: string;
  current: number;
  total: number;
  unit: string;
  percent?: number | undefined;
  message?: string | undefined;
  updated_at: string;
}

export interface IngestionJobPayload {
  kind: 'ingestion-job';
  id: string;
  name: string;
  status: IngestionJobStatus;
  stage: IngestionJobStage;
  source_kind: IngestionSourceKind;
  adapter_kind?: string | undefined;
  ontology_preferences?: string[] | undefined;
  submitted_by?: string | undefined;
  submitted_at: string;
  started_at?: string | undefined;
  completed_at?: string | undefined;
  source_refs?: Array<Record<string, unknown>> | undefined;
  artifact_refs?: Array<Record<string, unknown>> | undefined;
  bundle_refs?: Array<Record<string, unknown>> | undefined;
  issue_refs?: Array<Record<string, unknown>> | undefined;
  progress?: IngestionJobProgress | undefined;
  metrics?: Record<string, unknown> | undefined;
  publish_summary?: Record<string, unknown> | undefined;
  notes?: string | undefined;
}

export interface IngestionArtifactPayload {
  kind: 'ingestion-artifact';
  id: string;
  job_ref: Record<string, unknown>;
  artifact_role: 'primary_source' | 'supporting_source' | 'ocr_output' | 'html_snapshot' | 'spreadsheet_snapshot' | 'normalized_extract';
  source_url?: string | undefined;
  file_ref?: Record<string, unknown> | undefined;
  media_type?: string | undefined;
  sha256?: string | undefined;
  fetch_metadata?: Record<string, unknown> | undefined;
  text_extract?: Record<string, unknown> | undefined;
  table_extracts?: Array<Record<string, unknown>> | undefined;
  html_extract?: Record<string, unknown> | undefined;
  page_map?: Array<Record<string, unknown>> | undefined;
  provenance?: Record<string, unknown> | undefined;
}

export interface IngestionBundlePayload {
  kind: 'ingestion-candidate-bundle';
  id: string;
  job_ref: Record<string, unknown>;
  title: string;
  bundle_type: 'screening_library' | 'formulation_family' | 'vendor_product_batch' | 'other';
  status: 'draft' | 'in_review' | 'approved' | 'partially_approved' | 'rejected' | 'published';
  summary?: string | undefined;
  candidate_refs?: Array<Record<string, unknown>> | undefined;
  issue_refs?: Array<Record<string, unknown>> | undefined;
  metrics?: Record<string, unknown> | undefined;
  publish_plan?: Record<string, unknown> | undefined;
  review_snapshot?: Record<string, unknown> | undefined;
}

export interface IngestionCandidatePayload {
  kind: 'ingestion-candidate';
  id: string;
  job_ref: Record<string, unknown>;
  bundle_ref?: Record<string, unknown> | undefined;
  candidate_type: 'material' | 'vendor_product' | 'formulation' | 'recipe' | 'plate_layout' | 'labware_instance' | 'well_assignment';
  title: string;
  status: 'draft' | 'needs_review' | 'approved' | 'rejected' | 'published';
  source_refs?: Array<Record<string, unknown>> | undefined;
  confidence?: number | undefined;
  normalized_name?: string | undefined;
  payload: Record<string, unknown>;
  proposed_record_kind?: string | undefined;
  proposed_schema_id?: string | undefined;
  match_refs?: Array<Record<string, unknown>> | undefined;
  issue_refs?: Array<Record<string, unknown>> | undefined;
  publish_result?: Record<string, unknown> | undefined;
}

export interface IngestionIssuePayload {
  kind: 'ingestion-issue';
  id: string;
  job_ref: Record<string, unknown>;
  bundle_ref?: Record<string, unknown> | undefined;
  candidate_ref?: Record<string, unknown> | undefined;
  severity: 'info' | 'warning' | 'error';
  issue_type: 'name_ambiguity' | 'ontology_match_ambiguous' | 'missing_vendor_identifier' | 'table_parse_gap' | 'symbol_normalization_changed' | 'variant_grouping_uncertain' | 'source_conflict' | 'publish_blocker' | 'parser_not_implemented' | 'other';
  title: string;
  resolution_status: 'open' | 'accepted' | 'resolved' | 'waived' | 'rejected';
  detail?: string | undefined;
  suggested_action?: string | undefined;
  resolution_note?: string | undefined;
  evidence_refs?: Array<Record<string, unknown>> | undefined;
}

export interface CreateIngestionArtifactInput {
  sourceUrl?: string | undefined;
  fileName?: string | undefined;
  mediaType?: string | undefined;
  sizeBytes?: number | undefined;
  sha256?: string | undefined;
  note?: string | undefined;
  contentBase64?: string | undefined;
  storedPath?: string | undefined;
}

export interface CreateIngestionJobInput {
  name?: string | undefined;
  sourceKind: IngestionSourceKind;
  adapterKind?: string | undefined;
  ontologyPreferences?: string[] | undefined;
  submittedBy?: string | undefined;
  source?: CreateIngestionArtifactInput | undefined;
}

export interface IngestionJobSummary {
  id: string;
  name: string;
  sourceKind: IngestionSourceKind;
  stage: IngestionJobStage;
  status: IngestionJobStatus;
  submittedAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  progress?: IngestionJobProgress | undefined;
  artifactCount: number;
  bundleCount: number;
  candidateCount: number;
  issueCount: number;
  blockingIssueCount: number;
}

export interface IngestionJobDetail {
  job: RecordEnvelope<IngestionJobPayload>;
  artifacts: Array<RecordEnvelope<IngestionArtifactPayload>>;
  bundles: Array<RecordEnvelope<IngestionBundlePayload>>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
  issues: Array<RecordEnvelope<IngestionIssuePayload>>;
}

export interface IngestionPublishResult {
  bundleId: string;
  createdRecordIds: string[];
  createdMaterialIds: string[];
  createdVendorProductIds: string[];
  createdPlateLayoutTemplateIds: string[];
  createdLabwareIds: string[];
  createdMaterialSpecIds?: string[] | undefined;
  createdRecipeIds?: string[] | undefined;
}

export interface IngestionContext {
  store: RecordStore;
}

// Protocol PDF extraction types
export interface MaterialReference {
  name: string;
  volume?: string;
  concentration?: string;
}

export interface ExtractedProtocolStep {
  stepNumber: number;
  rawText: string;
  verbKeyword: 'add' | 'vortex' | 'incubate' | 'centrifuge' | 'pipette' | 'wash' | 'elute' | 'mix' | 'transfer' | 'aspirate' | 'discard' | 'other';
  materials: MaterialReference[];
  equipmentHints: string[];
  parameters: {
    temperature?: string;
    duration?: string;
    speed?: string;
    volume?: string;
  };
}

export interface ProtocolPdfExtraction {
  title: string;
  steps: ExtractedProtocolStep[];
  materialsIndex: MaterialReference[];
  equipmentIndex: string[];
}
