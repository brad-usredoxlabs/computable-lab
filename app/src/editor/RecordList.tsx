import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { ApiError, NetworkError } from '../shared/api/errors'
import type { RecordEnvelope, SchemaInfo } from '../types/kernel'

export function RecordList() {
  const { schemaId } = useParams<{ schemaId: string }>()
  const [records, setRecords] = useState<RecordEnvelope[]>([])
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadData = async () => {
    if (!schemaId) return
    
    setLoading(true)
    setError(null)
    try {
      const [recordsData, schemaData] = await Promise.all([
        apiClient.getRecords(schemaId),
        apiClient.getSchema(schemaId),
      ])
      setRecords(recordsData)
      setSchema(schemaData)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [schemaId])

  if (!schemaId) {
    return <div className="error-display">No schema ID provided</div>
  }

  if (loading) {
    return <div className="loading">Loading records...</div>
  }

  if (error) {
    return (
      <div className="error-display">
        <h2>Error loading records</h2>
        {ApiError.isApiError(error) && (
          <p className="error-code">Code: {error.code}</p>
        )}
        <p className="error-message">{error.message}</p>
        {NetworkError.isNetworkError(error) && (
          <p className="error-hint">Check that the server is running at localhost:3000</p>
        )}
        <button onClick={loadData} className="btn btn-retry">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="record-list">
      <header className="record-list-header">
        <div className="breadcrumb">
          <Link to="/schemas">Schemas</Link>
          <span className="breadcrumb-separator">/</span>
          <span>{schema?.title || schemaId}</span>
        </div>
        <h1>{schema?.title || schemaId}</h1>
        {schema?.description && (
          <p className="schema-description">{schema.description}</p>
        )}
      </header>

      <div className="record-list-actions">
        <Link
          to={`/new?schemaId=${encodeURIComponent(schemaId)}`}
          className="btn btn-primary"
        >
          New Record
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <h2>No records</h2>
          <p>No records exist for this schema yet.</p>
          <Link
            to={`/new?schemaId=${encodeURIComponent(schemaId)}`}
            className="btn btn-primary"
          >
            Create first record
          </Link>
        </div>
      ) : (
        <ul className="record-items">
          {records.map((record, index) => (
            <li key={record.recordId || `record-${index}`} className="record-item">
              <Link
                to={`/records/${encodeURIComponent(record.recordId)}`}
                className="record-link"
              >
                <code className="record-id">{record.recordId}</code>
                <span className="record-type">{record.meta?.kind || 'record'}</span>
                {record.meta?.path && (
                  <span className="record-path">{record.meta.path}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
