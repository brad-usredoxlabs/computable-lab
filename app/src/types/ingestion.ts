export type IngestionSourceKind =
  | 'vendor_plate_map_pdf'
  | 'vendor_formulation_html'
  | 'vendor_plate_map_spreadsheet'
  | 'vendor_catalog_page'
  | 'instrument_plate_reader'
  | 'instrument_qpcr'
  | 'instrument_gc_ms'
  | 'instrument_gc_fid'
  | 'instrument_fluorescence_microscopy'
  | 'other'

export type IngestionJobStage = 'collect' | 'extract' | 'normalize' | 'match' | 'review' | 'publish'
export type IngestionJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_review'
  | 'approved_for_publish'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export interface IngestionJobProgress {
  phase: string
  current: number
  total: number
  unit: string
  percent?: number
  message?: string
  updated_at: string
}

export interface IngestionRef {
  kind: 'record'
  id: string
  type: string
  label?: string
}

export interface IngestionJobSummary {
  id: string
  name: string
  sourceKind: IngestionSourceKind
  stage: IngestionJobStage
  status: IngestionJobStatus
  submittedAt: string
  startedAt?: string
  completedAt?: string
  progress?: IngestionJobProgress
  artifactCount: number
  bundleCount: number
  candidateCount: number
  issueCount: number
  blockingIssueCount: number
}

export interface IngestionArtifactRecord {
  recordId: string
  payload: {
    kind: 'ingestion-artifact'
    id: string
    artifact_role: string
    source_url?: string
    media_type?: string
    text_extract?: {
      method?: string
      excerpt?: string
    }
    html_extract?: {
      method?: string
      title?: string
      variant_count?: number
      vendor?: string
    }
    table_extracts?: Array<{
      id: string
      page?: number
      row_count?: number
      note?: string
    }>
    file_ref?: {
      file_name: string
      media_type: string
      size_bytes?: number
      sha256?: string
      source_url?: string
    }
    provenance?: {
      source_type?: string
      added_at?: string
      note?: string
    }
  }
}

export interface IngestionBundleRecord {
  recordId: string
  payload: {
    kind: 'ingestion-candidate-bundle'
    id: string
    title: string
    bundle_type: string
    status: string
    summary?: string
    candidate_refs?: IngestionRef[]
    issue_refs?: IngestionRef[]
    metrics?: Record<string, number>
    publish_plan?: Record<string, unknown>
    review_snapshot?: Record<string, unknown>
  }
}

export interface IngestionCandidateRecord {
  recordId: string
  payload: {
    kind: 'ingestion-candidate'
    id: string
    candidate_type: string
    title: string
    status: string
    normalized_name?: string
    confidence?: number
    match_refs?: Array<{
      label: string
      term_id: string
      match_type: string
      score: number
    }>
    payload: Record<string, unknown>
  }
}

export interface IngestionIssueRecord {
  recordId: string
  payload: {
    kind: 'ingestion-issue'
    id: string
    severity: 'info' | 'warning' | 'error'
    issue_type: string
    title: string
    resolution_status: string
    detail?: string
  }
}

export interface IngestionJobDetail {
  job: {
    recordId: string
    payload: {
      kind: 'ingestion-job'
      id: string
      name: string
      source_kind: IngestionSourceKind
      ontology_preferences?: string[]
      stage: IngestionJobStage
      status: IngestionJobStatus
      submitted_at: string
      started_at?: string
      completed_at?: string
      progress?: IngestionJobProgress
      metrics?: Record<string, number>
    }
  }
  artifacts: IngestionArtifactRecord[]
  bundles: IngestionBundleRecord[]
  candidates: IngestionCandidateRecord[]
  issues: IngestionIssueRecord[]
}

export interface CreateIngestionJobRequest {
  name?: string
  sourceKind: IngestionSourceKind
  adapterKind?: string
  ontologyPreferences?: string[]
  submittedBy?: string
  source: {
    sourceUrl?: string
    fileName?: string
    mediaType?: string
    sizeBytes?: number
    sha256?: string
    note?: string
    contentBase64?: string
  }
}

export interface IngestionJobListResponse {
  items: IngestionJobSummary[]
  total: number
}

// AI suggestion types

export interface SourceKindSuggestion {
  suggestedKind: IngestionSourceKind
  confidence: number
  reasoning: string
}

export interface RunMappingSuggestion {
  runId: string
  runTitle: string
  readEventIndex?: number
  measurementContextId?: string
  confidence: number
  reasoning: string
}

export interface RunMappingResponse {
  suggestions: RunMappingSuggestion[]
}

export interface IssueExplanation {
  explanation: string
  suggestedFix: string
}

export interface OntologyTermSuggestion {
  termId: string
  label: string
  ontology: string
  score: number
  reasoning: string
}

export interface OntologyMappingItem {
  candidateId: string
  candidateTitle: string
  currentTermId?: string
  suggestions: OntologyTermSuggestion[]
}

export interface IngestionPublishResult {
  bundleId: string
  createdRecordIds: string[]
  createdMaterialIds: string[]
  createdVendorProductIds: string[]
  createdPlateLayoutTemplateIds: string[]
  createdLabwareIds: string[]
  createdMaterialSpecIds?: string[]
  createdRecipeIds?: string[]
}
