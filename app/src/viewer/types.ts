/**
 * Types for the `tyf.evidence/1` evidence document consumed by the
 * standalone read-only evidence viewer.
 *
 * This is intentionally a self-contained type module — the viewer bundle
 * must not import anything from shared/ or the host app.
 */

export type ArtifactKind = 'graph' | 'trace' | 'script' | 'inputs' | 'zip' | 'pdf'

export interface EvidenceEvent {
  id: string
  type: string
  occurred_at: string
  sample_id: string
  record_ids: string[]
}

export interface EvidenceRecord {
  id: string
  type: string
  sample_id: string
  data: Record<string, unknown>
}

export interface SourceRevision {
  record_id: string
  commit: string
}

export interface EvidenceArtifact {
  id: string
  kind: ArtifactKind
  name: string
  sha256: string
  size: number
}

export interface TyfEvidenceDocument {
  schema_version: 'tyf.evidence/1'
  viewer_version: number
  sample_id: string
  barcode: string
  events: EvidenceEvent[]
  records: EvidenceRecord[]
  source_revisions: SourceRevision[]
  artifacts: EvidenceArtifact[]
}

/**
 * The document as it arrives from an untrusted host: nothing is trusted at
 * runtime, so version fields are widened here and checked (fail-closed)
 * before any content rendering.
 */
export type UntrustedEvidenceDocument = Omit<TyfEvidenceDocument, 'schema_version' | 'viewer_version'> & {
  schema_version: string
  viewer_version: number
}

/** Resolver handed in by the host: authorized same-origin URL or undefined. */
export type ResolveArtifact = (id: string) => string | undefined

export interface MountOptions {
  document: UntrustedEvidenceDocument
  resolveArtifact: ResolveArtifact
}

export interface ViewerHandle {
  destroy(): void
}
