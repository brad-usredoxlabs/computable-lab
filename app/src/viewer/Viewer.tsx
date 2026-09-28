/**
 * Read-only evidence viewer component.
 *
 * Fail-closed rules (spec: "Schema/viewer version mismatches must fail
 * closed with downloads still usable"):
 *
 *   - schema_version !== 'tyf.evidence/1'  -> FULL fail-closed: content
 *     panes (events/records) are blank; only the banner and the artifact
 *     download list render. An unknown schema means we cannot reason about
 *     the meaning of events/records at all.
 *   - viewer_version !== 1                 -> partial fail-closed: the
 *     wire schema is still understood, so events/records render, but a
 *     banner warns the API contract drifted. Downloads always render.
 *
 * All text is rendered through React's normal text escaping. Raw-HTML
 * injection (`dangerously` set-inner-HTML) is BANNED in this directory
 * (enforced by test).
 */
import { useState } from 'react'
import type {
  EvidenceArtifact,
  ResolveArtifact,
  UntrustedEvidenceDocument,
} from './types'

const SUPPORTED_SCHEMA_VERSION = 'tyf.evidence/1'
const SUPPORTED_VIEWER_VERSION = 1

interface ViewerProps {
  document: UntrustedEvidenceDocument
  resolveArtifact: ResolveArtifact
}

export function Viewer({ document: doc, resolveArtifact }: ViewerProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const schemaOk = doc.schema_version === SUPPORTED_SCHEMA_VERSION
  const viewerOk = doc.viewer_version === SUPPORTED_VIEWER_VERSION
  const mismatched = !schemaOk || !viewerOk

  // Content panes render only when the schema itself is understood.
  const showContent = schemaOk
  const events = showContent ? doc.events ?? [] : []
  const recordsById = new Map(
    (showContent ? doc.records ?? [] : []).map((r) => [r.id, r]),
  )

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  return (
    <div
      className="viewer-root"
      style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 880, padding: 16 }}
    >
      <header style={{ borderBottom: '1px solid #d4d4d8', paddingBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{doc.barcode}</div>
        <div style={{ color: '#52525b' }}>{doc.sample_id}</div>
        <div style={{ color: '#71717a', fontSize: 12 }}>{doc.schema_version}</div>
      </header>

      {mismatched && (
        <div
          role="alert"
          style={{
            margin: '12px 0',
            padding: '8px 12px',
            border: '1px solid #b45309',
            background: '#fef3c7',
            color: '#92400e',
          }}
        >
          Unsupported evidence version — downloads remain available
        </div>
      )}

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <section aria-label="Events">
          <h2 style={{ fontSize: 14, textTransform: 'uppercase', color: '#52525b' }}>Events</h2>
          {events.length === 0 ? (
            <p style={{ color: '#71717a' }}>No events available.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {events.map((event) => (
                <li key={event.id} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      background: event.id === selectedEventId ? '#e0e7ff' : '#f4f4f5',
                      border: '1px solid #d4d4d8',
                      cursor: 'pointer',
                    }}
                  >
                    {event.id} — {event.type}
                    <span style={{ color: '#71717a', marginLeft: 8, fontSize: 12 }}>
                      {event.occurred_at}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Linked records">
          <h2 style={{ fontSize: 14, textTransform: 'uppercase', color: '#52525b' }}>
            Linked records
          </h2>
          {!selectedEvent ? (
            <p style={{ color: '#71717a' }}>Select an event to inspect its records.</p>
          ) : (
            selectedEvent.record_ids.map((recordId) => {
              const record = recordsById.get(recordId)
              if (!record) {
                return (
                  <p key={recordId} style={{ color: '#b91c1c' }}>
                    Missing record: {recordId}
                  </p>
                )
              }
              return (
                <div key={record.id} style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14 }}>
                    {record.id} — {record.type}
                  </h3>
                  <pre
                    style={{
                      background: '#f4f4f5',
                      padding: 8,
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(record.data, null, 2)}
                  </pre>
                </div>
              )
            })
          )}
        </section>
      </main>

      <ArtifactList artifacts={doc.artifacts ?? []} resolveArtifact={resolveArtifact} />
    </div>
  )
}

function ArtifactList({
  artifacts,
  resolveArtifact,
}: {
  artifacts: EvidenceArtifact[]
  resolveArtifact: ResolveArtifact
}) {
  return (
    <section aria-label="Artifacts" style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 14, textTransform: 'uppercase', color: '#52525b' }}>
        Artifacts
      </h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {artifacts.map((artifact) => {
          // Only host-provided authorized URLs become links. undefined ->
          // the entry renders as disabled inert text, never a link.
          const url = resolveArtifact(artifact.id)
          return (
            <li key={artifact.id} style={{ marginBottom: 4 }}>
              {url ? (
                <a href={url} download={artifact.name}>
                  {artifact.name} ({artifact.kind}, {formatSize(artifact.size)})
                </a>
              ) : (
                <span data-disabled="true" aria-disabled="true" style={{ color: '#a1a1aa' }}>
                  {artifact.name} ({artifact.kind}, {formatSize(artifact.size)}) — unavailable
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return String(bytes)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
