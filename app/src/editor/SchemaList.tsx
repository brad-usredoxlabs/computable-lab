import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { ApiError, NetworkError } from '../shared/api/errors'
import type { SchemaInfo } from '../types/kernel'

export function SchemaList() {
  const [schemas, setSchemas] = useState<SchemaInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadSchemas = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.getSchemas()
      setSchemas(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchemas()
  }, [])

  if (loading) {
    return <div className="loading">Loading schemas...</div>
  }

  if (error) {
    return (
      <div className="error-display">
        <h2>Error loading schemas</h2>
        {ApiError.isApiError(error) && (
          <p className="error-code">Code: {error.code}</p>
        )}
        <p className="error-message">{error.message}</p>
        {NetworkError.isNetworkError(error) && (
          <p className="error-hint">Check that the server is running at localhost:3000</p>
        )}
        <button onClick={loadSchemas} className="btn btn-retry">
          Retry
        </button>
      </div>
    )
  }

  if (schemas.length === 0) {
    return (
      <div className="empty-state">
        <h2>No schemas available</h2>
        <p>The server has no schemas registered.</p>
      </div>
    )
  }

  return (
    <div className="schema-list">
      <h1>Schemas</h1>
      <p className="schema-list-description">
        Select a schema to browse its records.
      </p>
      <ul className="schema-items">
        {schemas.map((schema) => (
          <li key={schema.id} className="schema-item">
            <Link
              to={`/schemas/${encodeURIComponent(schema.id)}/records`}
              className="schema-link"
            >
              <h2 className="schema-title">{schema.title || schema.id}</h2>
              {schema.description && (
                <p className="schema-description">{schema.description}</p>
              )}
              <code className="schema-id">{schema.id}</code>
              <span className="schema-path">{schema.path}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
