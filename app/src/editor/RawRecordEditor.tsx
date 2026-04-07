import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { parse, stringify } from 'yaml'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { apiClient } from '../shared/api/client'
import { ApiError, NetworkError } from '../shared/api/errors'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { SchemaRecordForm } from './forms/SchemaRecordForm'
import { TapTabEditor, serializeDocument, isDirty } from './taptab'
import type { TapTabEditorHandle } from './taptab'
import type {
  RecordEnvelope,
  SchemaInfo,
  ValidationResult,
  LintResult,
  JsonSchema,
} from '../types/kernel'
import type { UISpec } from '../types/uiSpec'

interface ParseResult {
  valid: boolean
  data?: Record<string, unknown>
  error?: string
}

/**
 * Generate a YAML template from a JSON Schema.
 * Pre-fills required fields and const values with helpful comments.
 */
function generateTemplateFromSchema(schema: JsonSchema, schemaId: string): string {
  const lines: string[] = []

  // Add header comment
  lines.push(`# ${schema.title || 'New Record'}`)
  if (schema.description) {
    lines.push(`# ${schema.description.split('\n')[0]}`)
  }
  lines.push('')

  // Add $schema reference
  lines.push(`$schema: "${schemaId}"`)
  lines.push('')

  const required = new Set(schema.required || [])
  const properties = schema.properties || {}

  // Process properties - required first, then optional
  const requiredProps = Object.entries(properties).filter(([key]) => required.has(key))
  const optionalProps = Object.entries(properties).filter(([key]) => !required.has(key))

  if (requiredProps.length > 0) {
    lines.push('# Required fields')
    for (const [key, prop] of requiredProps) {
      addPropertyToTemplate(lines, key, prop as JsonSchema, true)
    }
    lines.push('')
  }

  if (optionalProps.length > 0) {
    lines.push('# Optional fields')
    for (const [key, prop] of optionalProps) {
      addPropertyToTemplate(lines, key, prop as JsonSchema, false)
    }
  }

  return lines.join('\n')
}

function addPropertyToTemplate(lines: string[], key: string, prop: JsonSchema, isRequired: boolean): void {
  // Add description as comment
  if (prop.description) {
    const desc = prop.description.split('\n')[0].substring(0, 80)
    lines.push(`# ${desc}`)
  }

  // Handle const values
  if (prop.const !== undefined) {
    lines.push(`${key}: ${JSON.stringify(prop.const)}`)
    return
  }

  // Handle different types with valid placeholder values
  const type = prop.type
  if (type === 'array') {
    lines.push(`${key}: []`)
  } else if (type === 'object') {
    lines.push(`${key}: {}`)
  } else if (type === 'string') {
    if (isRequired) {
      lines.push(`${key}: ""  # REQUIRED`)
    } else if (prop.description?.includes('e.g.,')) {
      const match = prop.description.match(/e\.g\.,?\s*([^)]+)/i)
      lines.push(`# ${key}: ${match ? `"${match[1].trim()}"` : '""'}`)
    } else {
      lines.push(`# ${key}: ""`)
    }
  } else if (type === 'number' || type === 'integer') {
    lines.push(isRequired ? `${key}: 0  # REQUIRED` : `# ${key}: 0`)
  } else if (type === 'boolean') {
    lines.push(isRequired ? `${key}: false  # REQUIRED` : `# ${key}: false`)
  } else {
    lines.push(isRequired ? `${key}:   # REQUIRED` : `# ${key}:`)
  }
}

function setCodeMirrorContent(view: EditorView, next: string): void {
  const current = view.state.doc.toString()
  if (current === next) return

  view.dispatch({
    changes: { from: 0, to: current.length, insert: next },
  })
}

export function RawRecordEditor() {
  const { recordId } = useParams<{ recordId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const schemaId = searchParams.get('schemaId')

  const isEditMode = Boolean(recordId)

  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [editorMode, setEditorMode] = useState<'form' | 'yaml'>('form')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult>({ valid: true, data: {} })
  const [validation, setValidation] = useState<ValidationResult | undefined>()
  const [lint, setLint] = useState<LintResult | undefined>()

  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)

  const activeSchemaId = record?.schemaId || schemaId || null
  const schemaDefinition = schema?.schema
  const hasSchemaForm = Boolean(schemaDefinition)

  // Track original data for dirty checking
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({})
  const [isDirtyState, setIsDirtyState] = useState(false)

  const loadUiSpec = useCallback(async (targetSchemaId: string) => {
    try {
      const spec = await apiClient.getUiSpec(targetSchemaId)
      setUiSpec(spec)
    } catch (err) {
      console.warn('UI spec unavailable; continuing without it.', err)
      setUiSpec(null)
    }
  }, [])

  // Load record (edit mode) or schema (create mode)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        if (isEditMode && recordId) {
          const data = await apiClient.getRecord(recordId)
          setRecord(data)
          setFormData(data.payload)
          setOriginalData(structuredClone(data.payload))
          setParseResult({ valid: true, data: data.payload })

          const schemaData = await apiClient.getSchema(data.schemaId)
          setSchema(schemaData)
          await loadUiSpec(data.schemaId)
        } else if (schemaId) {
          const schemaData = await apiClient.getSchema(schemaId)
          setSchema(schemaData)
          await loadUiSpec(schemaId)

          const initialPayload: Record<string, unknown> = {}
          setFormData(initialPayload)
          setOriginalData(structuredClone(initialPayload))
          setParseResult({ valid: true, data: initialPayload })
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isEditMode, recordId, schemaId, loadUiSpec])

  useEffect(() => {
    if (!hasSchemaForm) {
      setEditorMode('yaml')
    }
  }, [hasSchemaForm])

  // Initialize CodeMirror editor only in YAML mode
  useEffect(() => {
    if (editorMode !== 'yaml') {
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
      return
    }

    if (!editorRef.current || loading) return

    let initialContent: string
    if (Object.keys(formData).length > 0) {
      initialContent = stringify(formData)
    } else if (record) {
      initialContent = stringify(record.payload)
    } else if (schemaDefinition && activeSchemaId) {
      initialContent = generateTemplateFromSchema(schemaDefinition, activeSchemaId)
    } else {
      initialContent = `# Enter record payload as YAML\n$schema: "${activeSchemaId || ''}"\n`
    }

    try {
      const parsed = parse(initialContent) as Record<string, unknown>
      setParseResult({ valid: true, data: parsed })
    } catch (err) {
      setParseResult({
        valid: false,
        error: err instanceof Error ? err.message : 'Parse error',
      })
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        yaml(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return

          const content = update.state.doc.toString()
          try {
            const parsed = parse(content) as Record<string, unknown>
            setParseResult({ valid: true, data: parsed })
            setFormData(parsed)
          } catch (err) {
            setParseResult({
              valid: false,
              error: err instanceof Error ? err.message : 'Parse error',
            })
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [editorMode, loading, record, schemaDefinition, activeSchemaId])

  // Keep YAML editor content in sync when switching from form mode.
  useEffect(() => {
    if (editorMode !== 'yaml' || !viewRef.current) return
    setCodeMirrorContent(viewRef.current, stringify(formData))
    setParseResult({ valid: true, data: formData })
  }, [editorMode, formData])

  // Check dirty state for TapTab editor
  useEffect(() => {
    if (editorMode === 'form' && uiSpec && taptabEditorRef.current) {
      const editor = taptabEditorRef.current.getEditor()
      if (editor) {
        const docJson = editor.getJSON()
        const serialized = serializeDocument(docJson, originalData)
        setIsDirtyState(isDirty(originalData, serialized))
      }
    }
  }, [editorMode, uiSpec, originalData])

  const handleSave = useCallback(async () => {
    let payload: Record<string, unknown> | undefined

    if (editorMode === 'yaml') {
      if (!parseResult.valid) return
      payload = parseResult.data
    } else if (editorMode === 'form' && uiSpec && taptabEditorRef.current) {
      // Use TapTab editor for serialization
      const editor = taptabEditorRef.current.getEditor()
      if (editor) {
        const docJson = editor.getJSON()
        payload = serializeDocument(docJson, formData)
        setIsDirtyState(false)
      }
    } else if (editorMode === 'form') {
      payload = formData
    }

    if (!payload) return

    setSaving(true)
    setError(null)
    setValidation(undefined)
    setLint(undefined)

    try {
      if (isEditMode && recordId) {
        const response = await apiClient.updateRecord(recordId, payload)
        setRecord(response.record)
        setValidation(response.validation)
        setLint(response.lint)
        // Update original data after successful save
        setOriginalData(structuredClone(payload))
      } else if (activeSchemaId) {
        const response = await apiClient.createRecord(activeSchemaId, payload)
        setValidation(response.validation)
        setLint(response.lint)
        navigate(`/records/${encodeURIComponent(response.record.recordId)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setSaving(false)
    }
  }, [editorMode, formData, parseResult, uiSpec, isEditMode, recordId, activeSchemaId, navigate])

  const handleCancel = useCallback(() => {
    if (isEditMode && recordId) {
      navigate(`/records/${encodeURIComponent(recordId)}`)
    } else if (activeSchemaId) {
      navigate(`/schemas/${encodeURIComponent(activeSchemaId)}/records`)
    } else {
      navigate('/schemas')
    }
  }, [isEditMode, recordId, activeSchemaId, navigate])

  const handleModeChange = useCallback((nextMode: 'form' | 'yaml') => {
    if (nextMode === 'form' && !parseResult.valid) return

    if (nextMode === 'form' && parseResult.data) {
      setFormData(parseResult.data)
    }

    setEditorMode(nextMode)
  }, [parseResult])

  // Determine if TapTab should be used (form mode with uiSpec available)
  const useTapTab = editorMode === 'form' && uiSpec !== null && hasSchemaForm

  const canSave = editorMode === 'form'
    ? !saving
    : !saving && parseResult.valid && Boolean(parseResult.data)

  if (!isEditMode && !schemaId) {
    return (
      <div className="error-display">
        <h2>Missing schema</h2>
        <p>A schemaId is required to create a new record.</p>
        <Link to="/schemas" className="btn">
          Browse Schemas
        </Link>
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading record...</div>
  }

  if (error && !record) {
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
        <button onClick={() => window.location.reload()} className="btn btn-retry">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="raw-record-editor">
      <header className="editor-header">
        <div className="breadcrumb">
          <Link to="/schemas">Schemas</Link>
          <span className="breadcrumb-separator">/</span>
          {record ? (
            <>
              <Link to={`/schemas/${encodeURIComponent(record.schemaId)}/records`}>
                {record.schemaId}
              </Link>
              <span className="breadcrumb-separator">/</span>
              <Link to={`/records/${encodeURIComponent(record.recordId)}`}>
                {record.recordId}
              </Link>
              <span className="breadcrumb-separator">/</span>
              <span>Edit</span>
            </>
          ) : activeSchemaId ? (
            <>
              <Link to={`/schemas/${encodeURIComponent(activeSchemaId)}/records`}>
                {activeSchemaId}
              </Link>
              <span className="breadcrumb-separator">/</span>
              <span>New Record</span>
            </>
          ) : null}
        </div>
        <h1>{isEditMode ? 'Edit Record' : 'New Record'}</h1>
      </header>

      <div className="editor-actions">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="btn btn-primary"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {isDirtyState && !saving && (
          <span className="dirty-indicator" title="Unsaved changes">
            ●
          </span>
        )}
        <button onClick={handleCancel} className="btn btn-secondary">
          Cancel
        </button>
      </div>

      {hasSchemaForm && (
        <div className="editor-mode-toggle" role="tablist" aria-label="Editor mode">
          <button
            type="button"
            className={`mode-btn ${editorMode === 'form' ? 'mode-btn--active' : ''}`}
            onClick={() => handleModeChange('form')}
            disabled={editorMode === 'yaml' && !parseResult.valid}
          >
            Form
          </button>
          <button
            type="button"
            className={`mode-btn ${editorMode === 'yaml' ? 'mode-btn--active' : ''}`}
            onClick={() => handleModeChange('yaml')}
          >
            YAML
          </button>
        </div>
      )}

      {editorMode === 'yaml' && !parseResult.valid && (
        <div className="parse-error">
          <strong>Parse Error:</strong> {parseResult.error}
        </div>
      )}

      {error && record && (
        <div className="save-error">
          <strong>Save Error:</strong> {error.message}
        </div>
      )}

      {useTapTab && uiSpec && (
        <div className="editor-container editor-container--taptab">
          <TapTabEditor
            ref={taptabEditorRef}
            data={formData}
            uiSpec={uiSpec}
            schema={schema?.schema ?? {}}
            disabled={saving}
          />
        </div>
      )}

      {editorMode === 'form' && !useTapTab && schemaDefinition && (
        <div className="editor-container editor-container--form">
          <SchemaRecordForm
            schema={schemaDefinition}
            uiSpec={uiSpec}
            formData={formData}
            onChange={setFormData}
            disabled={saving}
          />
        </div>
      )}

      {editorMode === 'yaml' && (
        <div className="editor-container">
          <div ref={editorRef} className="codemirror-wrapper" />
        </div>
      )}

      <section className="editor-diagnostics">
        <h2>Diagnostics</h2>
        <DiagnosticsPanel validation={validation} lint={lint} />
      </section>
    </div>
  )
}
