/**
 * Type definitions for Protocol IDE session records.
 *
 * Mirrors the schema at:
 *   schema/workflow/protocol-ide-session.schema.yaml
 */

// ---------------------------------------------------------------------------
// Ref type (minimal — matches the datatypes/ref.schema.yaml shape)
// ---------------------------------------------------------------------------

export interface Ref {
  kind: 'record'
  id: string
  type?: string
  label?: string
}

// ---------------------------------------------------------------------------
// File ref (minimal — matches the datatypes/file-ref.schema.yaml shape)
// ---------------------------------------------------------------------------

/**
 * Mirrors schema/core/datatypes/file-ref.schema.yaml.
 * Schema uses snake_case so the persisted payload does too.
 */
export interface FileRef {
  file_name: string
  media_type: string
  source_url?: string
  size_bytes?: number
  sha256?: string
  stored_path?: string
  page_count?: number
}

// ---------------------------------------------------------------------------
// ProtocolIdeSession
// ---------------------------------------------------------------------------

export type ProtocolIdeSourceMode = 'vendor_search' | 'pdf_url' | 'upload' | 'directive'

export type ProtocolIdeStatus =
  | 'draft'
  | 'importing'
  | 'imported'
  | 'import_failed'
  | 'projecting'
  | 'projected'
  | 'projection_failed'
  | 'reviewing'
  | 'ready'
  | 'exported'
  | 'failed'

export interface ProtocolIdeSession {
  kind: 'protocol-ide-session'

  recordId: string

  // Source selection snapshot
  sourceMode: ProtocolIdeSourceMode
  vendor?: string
  title?: string
  pdfUrl?: string
  landingUrl?: string
  uploadedAssetRef?: FileRef

  // Current source refs
  vendorDocumentRef?: Ref
  ingestionJobRef?: Ref
  protocolImportRef?: Ref
  extractedTextRef?: Ref
  evidenceRefs?: Ref[]

  // Latest directive
  latestDirectiveText?: string

  // Latest projection refs / snapshots
  latestProtocolRef?: Ref
  latestEventGraphRef?: Ref
  latestEventGraphCacheKey?: string

  // Latest overlay summaries
  latestDeckSummaryRef?: Ref
  latestToolsSummaryRef?: Ref
  latestReagentsSummaryRef?: Ref
  latestBudgetSummaryRef?: Ref

  // Rolling issue summary
  rollingIssueSummary?: string

  // Current issue cards
  issueCardRefs?: Ref[]

  // Last export metadata
  lastExportAt?: string
  lastExportBundleRef?: Ref

  // Status
  status: ProtocolIdeStatus

  // Free-form notes
  notes?: string
}
