import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { stringify } from 'yaml'
import { apiClient } from '../shared/api/client'
import { ApiError, NetworkError } from '../shared/api/errors'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { ProjectionTapTabEditor } from './taptab/TapTabEditor'
import type { RecordEnvelope, ValidationResult, LintResult } from '../types/kernel'
import type { ProjectionBlock, ProjectionSlot } from '../types/uiSpec'
import { ShareRecordDialog } from '../shared/sharing/ShareRecordDialog'
import { isPolicyRootKind } from '../shared/sharing/policyRoots'

interface RecordWithDiagnostics {
  record: RecordEnvelope
  validation?: ValidationResult
  lint?: LintResult
}

export function RecordViewer() {
  const { recordId } = useParams<{ recordId: string }>()
  const [data, setData] = useState<RecordWithDiagnostics | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [blocks, setBlocks] = useState<ProjectionBlock[]>([])
  const [slots, setSlots] = useState<ProjectionSlot[]>([])
  const [projectionError, setProjectionError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadRecord = async () => {
    if (!recordId) return

    setLoading(true)
    setError(null)
    setProjectionError(null)
    try {
      // Try combined endpoint first for efficiency
      try {
        const combined = await apiClient.getRecordWithUI(recordId)
        if (!combined.record) {
          setData(null)
        } else {
          setData({ record: combined.record as unknown as RecordEnvelope })
        }
      } catch {
        // Fallback: fetch record separately
        const record = await apiClient.getRecord(recordId)
        if (!record) {
          setData(null)
        } else {
          setData({ record })
        }
      }

      // Try to load editor projection for the TapTab read surface
      try {
        const projection = await apiClient.getRecordEditorProjection(recordId)
        setBlocks(projection.blocks)
        setSlots(projection.slots)
      } catch {
        // Projection unavailable — will fall back to structured payload
        setProjectionError(new Error('Projection unavailable'))
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecord()
  }, [recordId])

  if (!recordId) {
    return <div className="error-display">No record ID provided</div>
  }

  if (loading) {
    return <div className="loading">Loading record...</div>
  }

  if (error) {
    return (
      <div className="error-display">
        <h2>Error loading record</h2>
        {ApiError.isApiError(error) && (
          <p className="error-code">Code: {error.code}</p>
        )}
        <p className="error-message">{error.message}</p>
        {NetworkError.isNetworkError(error) && (
          <p className="error-hint">Check that the server is running at localhost:3000</p>
        )}
        <button onClick={loadRecord} className="btn btn-retry">
          Retry
        </button>
      </div>
    )
  }

  if (!data) {
    return <div className="error-display">Record not found</div>
  }

  const { record, validation, lint } = data
  const hasProjection = blocks.length > 0 && slots.length > 0

  return (
    <div className="record-viewer">
      <header className="record-viewer-header">
        <div className="breadcrumb">
          <Link to="/schemas">Schemas</Link>
          <span className="breadcrumb-separator">/</span>
          <Link to={`/schemas/${encodeURIComponent(record.schemaId)}/records`}>
            {record.schemaId}
          </Link>
          <span className="breadcrumb-separator">/</span>
          <span>{record.recordId}</span>
        </div>
        <h1>Record Detail</h1>
      </header>

      <div className="record-viewer-actions">
        <Link
          to={`/records/${encodeURIComponent(record.recordId)}/edit`}
          className="btn btn-primary"
        >
          Edit
        </Link>
        {isPolicyRootKind((record.payload as { kind?: string })?.kind ?? record.meta?.kind) ? (
          <button type="button" className="btn" onClick={() => setShareOpen(true)}>
            Share
          </button>
        ) : null}
      </div>
      {shareOpen ? (
        <ShareRecordDialog recordId={record.recordId} onClose={() => setShareOpen(false)} />
      ) : null}

      <section className="record-metadata">
        <h2>Metadata</h2>
        <dl className="metadata-list">
          <dt>ID</dt>
          <dd><code>{record.recordId}</code></dd>
          <dt>Kind</dt>
          <dd><code>{record.meta?.kind || 'record'}</code></dd>
          <dt>Schema</dt>
          <dd><code>{record.schemaId}</code></dd>
          {record.meta?.path && (
            <>
              <dt>Path</dt>
              <dd><code>{record.meta.path}</code></dd>
            </>
          )}
          {record.meta?.commitSha && (
            <>
              <dt>Commit</dt>
              <dd><code>{record.meta.commitSha.substring(0, 8)}</code></dd>
            </>
          )}
        </dl>
      </section>

      <section className="record-data">
        <h2>Payload</h2>
        {hasProjection ? (
          <div className="p-4 bg-white rounded border border-gray-200">
            <ProjectionTapTabEditor
              blocks={blocks}
              slots={slots}
              data={record.payload}
              disabled
            />
          </div>
        ) : (
          <div className="p-4 bg-white rounded border border-gray-200">
            {projectionError && (
              <p className="text-sm text-gray-500 mb-2">
                Projection unavailable — showing structured payload
              </p>
            )}
            <pre className="data-display">
              <code>{stringify(record.payload)}</code>
            </pre>
          </div>
        )}
      </section>

      <section className="record-diagnostics">
        <h2>Diagnostics</h2>
        <DiagnosticsPanel validation={validation} lint={lint} />
      </section>
    </div>
  )
}
