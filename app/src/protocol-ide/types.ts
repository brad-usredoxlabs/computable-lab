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

export interface FileRef {
  kind: 'file'
  id: string
  fileName?: string
  mimeType?: string
  size?: number
}

// ---------------------------------------------------------------------------
// ProtocolIdeSession
// ---------------------------------------------------------------------------

export type ProtocolIdeSourceMode = 'vendor_search' | 'pdf_url' | 'upload' | 'directive'

export type ProtocolIdeStatus =
  | 'draft'
  | 'importing'
  | 'projecting'
  | 'reviewing'
  | 'ready'
  | 'exported'
  | 'failed'
  | 'awaiting_variant_selection'

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

  // ── Lab context (spec-028) ──────────────────────────────────────────
  /** Resolved lab context with provenance, from latest projection */
  labContext?: {
    labwareKind: string
    plateCount: number
    sampleCount: number
    source: {
      labwareKind: 'default' | 'directive' | 'manual'
      plateCount: 'default' | 'directive' | 'manual'
      sampleCount: 'default' | 'directive' | 'manual'
    }
  }

  // ── Extraction variant selection (spec-029) ─────────────────────────
  /** Zero-based index of the extraction variant selected by the user. */
  selectedVariantIndex?: number
}
