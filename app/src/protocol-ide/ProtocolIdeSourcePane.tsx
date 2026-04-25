/**
 * Protocol IDE Source Evidence Pane — renders the imported source artifact,
 * extracted text, provenance metadata, and evidence citations.
 *
 * The pane is the left-column companion to the event-graph review surface.
 * It keeps source evidence visible and grounded so graph nodes and issue
 * cards can reference page/snippet citations.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Source Evidence                                            │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  [PDF / Artifact Preview]                                   │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Extracted Text / Snippets                                  │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Provenance Metadata                                        │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Evidence Citations (collapsible)                           │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  [Trace / Diagnostics — secondary]                          │
 *   └─────────────────────────────────────────────────────────────┘
 */

import { useState } from 'react'
import type { ProtocolIdeSession } from './types'
import type { IngestionArtifactRecord, IngestionIssueRecord } from '../../types/ingestion'

// ---------------------------------------------------------------------------
// Evidence model types — shared between pane and graph nodes / issue cards
// ---------------------------------------------------------------------------

/** A single evidence citation linking a page/snippet to a record */
export interface EvidenceCitation {
  /** Unique citation id */
  id: string
  /** The artifact this citation belongs to */
  artifactId: string
  /** Page number (1-based) or undefined for non-PDF sources */
  page?: number
  /** Snippet text from the source */
  snippet?: string
  /** Offset range within the extracted text */
  textRange?: { start: number; end: number }
  /** Human-readable label */
  label?: string
}

/** A resolved artifact with its extracted text and citations */
export interface EvidenceArtifact {
  /** The ingestion artifact record */
  artifact: IngestionArtifactRecord
  /** Extracted text excerpts */
  textExcerpts: Array<{
    method?: string
    excerpt: string
  }>
  /** Table extracts with page info */
  tableExcerpts: Array<{
    id: string
    page?: number
    row_count?: number
    note?: string
  }>
  /** Citations that reference this artifact */
  citations: EvidenceCitation[]
}

/** The evidence model consumed by graph nodes and issue cards */
export interface EvidenceModel {
  /** All resolved artifacts with their text and citations */
  artifacts: EvidenceArtifact[]
  /** All citations across artifacts */
  citations: EvidenceCitation[]
  /** Lookup: artifactId → EvidenceArtifact */
  byArtifactId: Record<string, EvidenceArtifact>
  /** Lookup: citationId → EvidenceCitation */
  byCitationId: Record<string, EvidenceCitation>
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProtocolIdeSourcePaneProps {
  /** The current Protocol IDE session */
  session: ProtocolIdeSession
  /** Optional ingestion artifacts to display */
  artifacts?: IngestionArtifactRecord[]
  /** Optional ingestion issues for trace/diagnostics */
  issues?: IngestionIssueRecord[]
  /** Optional evidence citations from the session */
  citations?: EvidenceCitation[]
  /** Callback when a citation is clicked */
  onCitationClick?: (citation: EvidenceCitation) => void
  /** Whether the pane is in a loading state */
  isLoading?: boolean
  /** Error message to display */
  error?: string | null
}

// ---------------------------------------------------------------------------
// Evidence model builder
// ---------------------------------------------------------------------------

/**
 * Build an EvidenceModel from session data and optional artifact/issue lists.
 * This is the shared model that graph nodes and issue cards consume.
 */
export function buildEvidenceModel(
  session: ProtocolIdeSession,
  artifacts: IngestionArtifactRecord[] = [],
  citations: EvidenceCitation[] = [],
): EvidenceModel {
  const byArtifactId: Record<string, EvidenceArtifact> = {}
  const byCitationId: Record<string, EvidenceCitation> = {}

  // Index citations by artifact
  const citationsByArtifact = new Map<string, EvidenceCitation[]>()
  for (const c of citations) {
    const list = citationsByArtifact.get(c.artifactId) ?? []
    list.push(c)
    citationsByArtifact.set(c.artifactId, list)
    byCitationId[c.id] = c
  }

  // Build artifact entries
  for (const artifact of artifacts) {
    const p = artifact.payload
    const textExcerpts: EvidenceArtifact['textExcerpts'] = []
    if (p.text_extract?.excerpt) {
      textExcerpts.push({
        method: p.text_extract.method,
        excerpt: p.text_extract.excerpt,
      })
    }
    const tableExcerpts: EvidenceArtifact['tableExcerpts'] =
      p.table_extracts ?? []

    byArtifactId[artifact.recordId] = {
      artifact,
      textExcerpts,
      tableExcerpts,
      citations: citationsByArtifact.get(artifact.recordId) ?? [],
    }
  }

  return {
    artifacts: Object.values(byArtifactId),
    citations,
    byArtifactId,
    byCitationId,
  }
}

// ---------------------------------------------------------------------------
// PDF / Artifact Preview
// ---------------------------------------------------------------------------

function ArtifactPreview({
  session,
  artifacts,
}: {
  session: ProtocolIdeSession
  artifacts: IngestionArtifactRecord[]
}): JSX.Element | null {
  // Prefer the first ingestion artifact if available
  const primaryArtifact = artifacts[0]
  const p = primaryArtifact?.payload

  // PDF URL from session
  if (session.pdfUrl) {
    return (
      <section
        className="source-pane-preview"
        data-testid="source-pane-preview"
      >
        <h3 className="source-pane-preview-title">Source Preview</h3>
        <div className="source-pane-preview-container" data-testid="source-pane-preview-container">
          <iframe
            src={session.pdfUrl}
            title="Source PDF preview"
            className="source-pane-iframe"
            data-testid="source-pane-pdf-iframe"
          />
          <a
            href={session.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="source-pane-preview-open-link"
            data-testid="source-pane-preview-open-link"
          >
            Open PDF in new tab ↗
          </a>
        </div>
      </section>
    )
  }

  // Fallback: show artifact metadata
  if (primaryArtifact) {
    const filename =
      p?.file_ref?.file_name || p?.source_url || primaryArtifact.recordId
    const mediaType = p?.file_ref?.media_type || p?.media_type || 'unknown'
    return (
      <section
        className="source-pane-preview"
        data-testid="source-pane-preview"
      >
        <h3 className="source-pane-preview-title">Artifact Preview</h3>
        <div className="source-pane-preview-container" data-testid="source-pane-preview-container">
          <dl className="source-pane-preview-meta">
            <dt>File</dt>
            <dd data-testid="source-pane-preview-filename">{filename}</dd>
            <dt>Media type</dt>
            <dd data-testid="source-pane-preview-mimetype">{mediaType}</dd>
            {p?.file_ref?.size_bytes != null && (
              <>
                <dt>Size</dt>
                <dd data-testid="source-pane-preview-size">
                  {formatBytes(p.file_ref.size_bytes)}
                </dd>
              </>
            )}
            {p?.source_url && (
              <>
                <dt>URL</dt>
                <dd data-testid="source-pane-preview-url">{p.source_url}</dd>
              </>
            )}
          </dl>
        </div>
      </section>
    )
  }

  // No artifact or PDF URL — show session-level info
  return (
    <section
      className="source-pane-preview"
      data-testid="source-pane-preview"
    >
      <h3 className="source-pane-preview-title">Source Preview</h3>
      <div className="source-pane-preview-container" data-testid="source-pane-preview-container">
        <p className="source-pane-preview-empty" data-testid="source-pane-preview-empty">
          No source artifact loaded yet. Use the intake pane to select a
          source document.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Extracted Text / Snippets
// ---------------------------------------------------------------------------

function ExtractedTextSection({
  artifacts,
}: {
  artifacts: IngestionArtifactRecord[]
}): JSX.Element | null {
  const textExcerpts: Array<{
    artifactId: string
    method?: string
    excerpt: string
  }> = []

  for (const artifact of artifacts) {
    const p = artifact.payload
    if (p.text_extract?.excerpt) {
      textExcerpts.push({
        artifactId: artifact.recordId,
        method: p.text_extract.method,
        excerpt: p.text_extract.excerpt,
      })
    }
  }

  if (textExcerpts.length === 0) {
    return null
  }

  return (
    <section
      className="source-pane-extracted-text"
      data-testid="source-pane-extracted-text"
    >
      <h3 className="source-pane-extracted-text-title">Extracted Text</h3>
      {textExcerpts.map((te, i) => (
        <div
          key={i}
          className="source-pane-excerpt"
          data-testid={`source-pane-excerpt-${i}`}
        >
          {te.method && (
            <span className="source-pane-excerpt-method">
              Method: {te.method}
            </span>
          )}
          <pre className="source-pane-excerpt-content">
            {te.excerpt}
          </pre>
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Table Extracts
// ---------------------------------------------------------------------------

function TableExtractsSection({
  artifacts,
}: {
  artifacts: IngestionArtifactRecord[]
}): JSX.Element | null {
  const allTables: Array<{
    artifactId: string
    id: string
    page?: number
    row_count?: number
    note?: string
  }> = []

  for (const artifact of artifacts) {
    const p = artifact.payload
    if (p.table_extracts?.length) {
      for (const t of p.table_extracts) {
        allTables.push({
          artifactId: artifact.recordId,
          ...t,
        })
      }
    }
  }

  if (allTables.length === 0) {
    return null
  }

  return (
    <section
      className="source-pane-table-extracts"
      data-testid="source-pane-table-extracts"
    >
      <h3 className="source-pane-table-extracts-title">Table Extracts</h3>
      <table className="source-pane-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Page</th>
            <th>Rows</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {allTables.map((t) => (
            <tr key={t.id} data-testid={`source-pane-table-row-${t.id}`}>
              <td>{t.id}</td>
              <td>{t.page ?? '—'}</td>
              <td>{t.row_count ?? '—'}</td>
              <td>{t.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Provenance Metadata
// ---------------------------------------------------------------------------

function ProvenanceSection({
  artifacts,
}: {
  artifacts: IngestionArtifactRecord[]
}): JSX.Element | null {
  const provenances = artifacts
    .map((a) => a.payload.provenance)
    .filter(Boolean) as NonNullable<IngestionArtifactRecord['payload']['provenance']>[]

  if (provenances.length === 0) {
    return null
  }

  return (
    <section
      className="source-pane-provenance"
      data-testid="source-pane-provenance"
    >
      <h3 className="source-pane-provenance-title">Provenance</h3>
      <dl className="source-pane-provenance-list">
        {provenances.map((prov, i) => (
          <div key={i} className="source-pane-provenance-entry">
            {prov.source_type && (
              <>
                <dt>Source type</dt>
                <dd>{prov.source_type}</dd>
              </>
            )}
            {prov.added_at && (
              <>
                <dt>Added at</dt>
                <dd>{new Date(prov.added_at).toLocaleString()}</dd>
              </>
            )}
            {prov.note && (
              <>
                <dt>Note</dt>
                <dd>{prov.note}</dd>
              </>
            )}
          </div>
        ))}
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Evidence Citations
// ---------------------------------------------------------------------------

function CitationsSection({
  citations,
  onCitationClick,
}: {
  citations: EvidenceCitation[]
  onCitationClick?: (citation: EvidenceCitation) => void
}): JSX.Element | null {
  if (citations.length === 0) {
    return null
  }

  return (
    <section
      className="source-pane-citations"
      data-testid="source-pane-citations"
    >
      <h3 className="source-pane-citations-title">
        Evidence Citations ({citations.length})
      </h3>
      <ul className="source-pane-citation-list">
        {citations.map((c) => (
          <li
            key={c.id}
            className="source-pane-citation-item"
            data-testid={`source-pane-citation-${c.id}`}
          >
            <button
              type="button"
              className="source-pane-citation-link"
              onClick={() => onCitationClick?.(c)}
              data-testid={`source-pane-citation-link-${c.id}`}
            >
              <span className="source-pane-citation-label">
                {c.label ?? `Citation ${c.id}`}
              </span>
              {c.page != null && (
                <span className="source-pane-citation-page">
                  p.{c.page}
                </span>
              )}
              {c.snippet && (
                <span className="source-pane-citation-snippet">
                  "{truncate(c.snippet, 80)}"
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trace / Diagnostics (secondary)
// ---------------------------------------------------------------------------

function TraceSection({
  issues,
}: {
  issues?: IngestionIssueRecord[]
}): JSX.Element | null {
  if (!issues || issues.length === 0) {
    return null
  }

  return (
    <details className="source-pane-trace" data-testid="source-pane-trace">
      <summary className="source-pane-trace-summary">
        Trace &amp; Diagnostics ({issues.length})
      </summary>
      <div className="source-pane-trace-body" data-testid="source-pane-trace-body">
        <ul className="source-pane-trace-list">
          {issues.map((issue) => (
            <li
              key={issue.recordId}
              className={`source-pane-trace-item source-pane-trace-item--${issue.payload.severity}`}
              data-testid={`source-pane-trace-item-${issue.recordId}`}
            >
              <span className="source-pane-trace-severity">
                {issue.payload.severity === 'error'
                  ? '⛔'
                  : issue.payload.severity === 'warning'
                    ? '⚠'
                    : 'ℹ'}
              </span>
              <span className="source-pane-trace-title">{issue.payload.title}</span>
              <span className="source-pane-trace-type">
                {issue.payload.issue_type}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProtocolIdeSourcePane({
  session,
  artifacts = [],
  issues,
  citations = [],
  onCitationClick,
  isLoading = false,
  error = null,
}: ProtocolIdeSourcePaneProps): JSX.Element {
  const evidenceModel = buildEvidenceModel(session, artifacts, citations)

  return (
    <aside
      className="protocol-ide-source-pane"
      role="complementary"
      aria-label="Source evidence"
      data-testid="protocol-ide-source-pane"
    >
      {/* Header */}
      <h2 className="protocol-ide-source-pane-title">Source Evidence</h2>

      {/* Error display */}
      {error && (
        <div
          className="protocol-ide-source-pane-error"
          data-testid="protocol-ide-source-pane-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          className="protocol-ide-source-pane-loading"
          data-testid="protocol-ide-source-pane-loading"
        >
          Loading source evidence…
        </div>
      )}

      {/* PDF / Artifact Preview — primary content */}
      <ArtifactPreview session={session} artifacts={artifacts} />

      {/* Extracted Text — primary content */}
      <ExtractedTextSection artifacts={artifacts} />

      {/* Table Extracts — primary content */}
      <TableExtractsSection artifacts={artifacts} />

      {/* Provenance Metadata — primary content */}
      <ProvenanceSection artifacts={artifacts} />

      {/* Evidence Citations — for graph nodes and issue cards */}
      <CitationsSection
        citations={evidenceModel.citations}
        onCitationClick={onCitationClick}
      />

      {/* Trace / Diagnostics — secondary */}
      <TraceSection issues={issues} />

      {/* Inline styles */}
      <style>{`
        .protocol-ide-source-pane {
          padding: 1rem;
          overflow-y: auto;
          height: 100%;
        }

        .protocol-ide-source-pane-title {
          font-size: 1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.75rem 0;
        }

        .protocol-ide-source-pane-error {
          background: #fff5f5;
          color: #c53030;
          border: 1px solid #feb2b2;
          border-radius: 4px;
          padding: 0.5rem 0.75rem;
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
        }

        .protocol-ide-source-pane-loading {
          color: #6c757d;
          font-size: 0.85rem;
          text-align: center;
          padding: 1rem;
        }

        /* Preview */
        .source-pane-preview {
          margin-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.75rem;
        }

        .source-pane-preview-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .source-pane-preview-container {
          border: 1px solid #dee2e6;
          border-radius: 4px;
          overflow: hidden;
        }

        .source-pane-iframe {
          width: 100%;
          height: 300px;
          border: none;
          display: block;
        }

        .source-pane-preview-open-link {
          display: block;
          padding: 0.4rem 0.75rem;
          background: #f8f9fa;
          color: #1971c2;
          text-decoration: underline;
          font-size: 0.8rem;
          text-align: center;
        }

        .source-pane-preview-meta {
          font-size: 0.85rem;
          padding: 0.5rem;
        }

        .source-pane-preview-meta dt {
          font-weight: 600;
          color: #495057;
        }

        .source-pane-preview-meta dd {
          margin: 0 0 0.25rem 0;
          color: #212529;
          word-break: break-all;
        }

        .source-pane-preview-empty {
          color: #6c757d;
          font-size: 0.85rem;
          padding: 1rem;
          text-align: center;
        }

        /* Extracted text */
        .source-pane-extracted-text {
          margin-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.75rem;
        }

        .source-pane-extracted-text-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .source-pane-excerpt {
          margin-bottom: 0.5rem;
        }

        .source-pane-excerpt-method {
          font-size: 0.75rem;
          color: #6c757d;
          display: block;
          margin-bottom: 0.25rem;
        }

        .source-pane-excerpt-content {
          font-size: 0.8rem;
          color: #212529;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 4px;
          padding: 0.5rem;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 200px;
          overflow-y: auto;
          margin: 0;
        }

        /* Table extracts */
        .source-pane-table-extracts {
          margin-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.75rem;
        }

        .source-pane-table-extracts-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .source-pane-table {
          width: 100%;
          font-size: 0.8rem;
          border-collapse: collapse;
        }

        .source-pane-table th,
        .source-pane-table td {
          padding: 0.3rem 0.5rem;
          border: 1px solid #dee2e6;
          text-align: left;
        }

        .source-pane-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #495057;
        }

        /* Provenance */
        .source-pane-provenance {
          margin-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.75rem;
        }

        .source-pane-provenance-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .source-pane-provenance-list {
          font-size: 0.85rem;
        }

        .source-pane-provenance-entry {
          margin-bottom: 0.5rem;
        }

        .source-pane-provenance-entry dt {
          font-weight: 600;
          color: #495057;
        }

        .source-pane-provenance-entry dd {
          margin: 0 0 0.25rem 0;
          color: #212529;
        }

        /* Citations */
        .source-pane-citations {
          margin-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 0.75rem;
        }

        .source-pane-citations-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .source-pane-citation-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .source-pane-citation-item {
          margin-bottom: 0.25rem;
        }

        .source-pane-citation-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          background: none;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 0.35rem 0.5rem;
          cursor: pointer;
          font-size: 0.8rem;
          text-align: left;
          color: #1971c2;
          transition: background 0.15s;
        }

        .source-pane-citation-link:hover {
          background: #e7f5ff;
        }

        .source-pane-citation-label {
          font-weight: 500;
        }

        .source-pane-citation-page {
          font-size: 0.75rem;
          color: #6c757d;
          background: #f1f3f5;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }

        .source-pane-citation-snippet {
          font-size: 0.75rem;
          color: #495057;
          font-style: italic;
        }

        /* Trace / Diagnostics — secondary */
        .source-pane-trace {
          margin-top: 0.5rem;
        }

        .source-pane-trace-summary {
          font-size: 0.8rem;
          color: #6c757d;
          cursor: pointer;
          user-select: none;
        }

        .source-pane-trace-body {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
        }

        .source-pane-trace-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .source-pane-trace-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8rem;
          padding: 0.25rem 0;
          border-bottom: 1px solid #e9ecef;
        }

        .source-pane-trace-item--error {
          color: #c53030;
        }

        .source-pane-trace-item--warning {
          color: #c05621;
        }

        .source-pane-trace-item--info {
          color: #2b6cb0;
        }

        .source-pane-trace-severity {
          font-size: 0.85rem;
        }

        .source-pane-trace-title {
          flex: 1;
          font-weight: 500;
        }

        .source-pane-trace-type {
          font-size: 0.7rem;
          color: #6c757d;
        }
      `}</style>
    </aside>
  )
}
