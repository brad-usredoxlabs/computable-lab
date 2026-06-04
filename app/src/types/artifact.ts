/**
 * Frontend types for the Artifact record (schema/studies/artifact.schema.yaml).
 *
 * Artifacts are Study-scoped supporting records — vendor PDFs, protocols,
 * write-ups, training records, saved prompts, and conclusions — kept beside
 * a study's experiments and runs so a study folder carries everything FAIR.
 *
 * Mirror of the YAML schema. Keep this in sync when the schema changes.
 */

import type { JSONContent } from '@tiptap/core'

/** Subtype discriminator. Determines which polymorphic body field is used. */
export type ArtifactKind =
  | 'pdf'
  | 'protocol'
  | 'writeup'
  | 'training'
  | 'saved-prompt'
  | 'conclusion'

/** File reference (mirrors schema/core/datatypes/file-ref.schema.yaml). */
export interface FileRef {
  file_name: string
  media_type: string
  source_url?: string
  size_bytes?: number
  sha256?: string
  stored_path?: string
  page_count?: number
}

/** Per-page extracted text for PDF artifacts. */
export interface ArtifactExtractedPage {
  pageNumber: number
  text: string
}

/** Provenance for vendor-PDF and protocol artifacts. */
export interface ArtifactSource {
  vendor?: string
  url?: string
  query?: string
  ingestedAt?: string
  [k: string]: unknown
}

/**
 * Full artifact payload as persisted to YAML.
 *
 * Field population by `artifactKind`:
 * - `pdf`        → `file` + `extractedText` (and optionally `source`)
 * - `protocol`   → `body` (TipTap JSON)
 * - `writeup`    → `body`
 * - `training`   → `body`
 * - `conclusion` → `body`
 * - `saved-prompt` → `promptText`
 */
export interface Artifact {
  kind: 'artifact'
  recordId: string
  title: string
  shortSlug?: string
  studyId: string
  experimentId?: string
  artifactKind: ArtifactKind
  state?: string
  tags?: string[]

  file?: FileRef
  extractedText?: ArtifactExtractedPage[]
  body?: JSONContent
  promptText?: string

  source?: ArtifactSource
  metadata?: Record<string, unknown>

  // FAIRCommon mixins (server-populated)
  description?: string
  license?: string
  relatedIdentifiers?: string[]
  keywords?: string[]
  createdAt?: string
  createdBy?: string
  updatedAt?: string
}

/**
 * Lightweight artifact header for tree/list rendering — what BrowseTab and
 * StudyTreeNode carry. Avoids loading the full TipTap body / extracted text
 * payload when only listing.
 */
export interface ArtifactSummary {
  recordId: string
  title: string
  artifactKind: ArtifactKind
  studyId: string
  experimentId?: string
  path: string
  updatedAt?: string
  /** Page count for PDFs; word count or character count for documents. */
  size?: number
}
