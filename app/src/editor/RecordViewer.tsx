import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { stringify } from 'yaml'
import { apiClient } from '../shared/api/client'
import { ApiError, NetworkError } from '../shared/api/errors'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { SectionedForm } from '../shared/forms/SectionedForm'
import type { RecordEnvelope, ValidationResult, LintResult } from '../types/kernel'
import type { UISpec } from '../types/uiSpec'

interface RecordWithDiagnostics {
  record: RecordEnvelope
  validation?: ValidationResult
  lint?: LintResult
}

export function RecordViewer() {
  const { recordId } = useParams<{ recordId: string }>()
  const [data, setData] = useState<RecordWithDiagnostics | null>(null)
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null)
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadRecord = async () => {
    if (!recordId) return

    setLoading(true)
    setError(null)
    try {
      // Try combined endpoint first for efficiency
      try {
        const combined = await apiClient.getRecordWithUI(recordId)
        setData({ record: combined.record as unknown as RecordEnvelope })
        setUiSpec(combined.uiSpec)
        setSchema(combined.schema)
      } catch {
        // Fallback: fetch record separately
        const record = await apiClient.getRecord(recordId)
        setData({ record })
        // Try to get UISpec
        try {
          const spec = await apiClient.getUiSpec(record.schemaId)
          setUiSpec(spec)
        } catch {
          setUiSpec(null)
        }
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
  const hasSectionedView = Boolean(uiSpec?.form?.sections?.length)

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
      </div>

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
        {hasSectionedView ? (
          <div className="p-4 bg-white rounded border border-gray-200">
            <SectionedForm
              uiSpec={uiSpec!}
              schema={schema}
              formData={record.payload}
              readOnly
            />
          </div>
        ) : (
          <pre className="data-display">
            <code>{stringify(record.payload)}</code>
          </pre>
        )}
      </section>

      <section className="record-diagnostics">
        <h2>Diagnostics</h2>
        <DiagnosticsPanel validation={validation} lint={lint} />
      </section>
    </div>
  )
}
