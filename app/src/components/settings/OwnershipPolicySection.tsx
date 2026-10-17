/**
 * OwnershipPolicySection — Settings "Ownership & Sharing" (§T11 / OWN-11).
 *
 * Read-first: GET /settings/ownership-policy renders the RESOLVED lab policy
 * as a `kind | owner | visibility | filed to | share targets` table. The
 * resolved doc's kindRules is a KEYED MAP (server coerces the payload array —
 * OwnershipPolicyService.ts:46); the table reads the map.
 *
 * Advanced edit: inline CodeMirror YAML mount (RawRecordEditor.tsx pattern —
 * there is no importable editor component) over the RAW record payload, whose
 * kindRules is the ARRAY the PUT carries. Save = PUT the parsed payload, then
 * REFETCH the GET (single source of truth — never splice local state).
 *
 * Error law (FIX-RUN-1 defect-5): a server 403/422 renders as a row ABOVE the
 * controls, which stay operable for retry; save is disabled ONLY on
 * unparseable YAML, never after a server refusal. Server messages surface
 * verbatim (errors.ts:3).
 *
 * No hardcoded kinds/visibilities/user ids here (D9) — the table renders
 * whatever the doc says.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { parse, stringify } from 'yaml'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { apiClient, type OwnershipPolicyDocView, type OwnershipPolicyKindRule, type OwnershipPolicyResponse } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

interface ParseResult {
  valid: boolean
  data?: Record<string, unknown>
  error?: string
}

interface SaveError {
  message: string
  rows: Array<{ path: string; message: string }>
}

export function OwnershipPolicySection() {
  const [response, setResponse] = useState<OwnershipPolicyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [saving, setSaving] = useState(false)

  const editorRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiClient.getOwnershipPolicy()
      setResponse(res)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await apiClient.getOwnershipPolicy()
        if (!cancelled) setResponse(res)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  // Mount the YAML editor over the RAW payload (array kindRules), not the
  // coerced resolved doc. Re-mounts whenever the record changes (e.g. after a
  // save refetch) so the editor always shows what the server has.
  useEffect(() => {
    if (!advancedOpen || !editorRef.current || !response?.record) return

    const initialContent = stringify(response.record.payload)
    try {
      setParseResult({ valid: true, data: parse(initialContent) as Record<string, unknown> })
    } catch (err) {
      setParseResult({ valid: false, error: err instanceof Error ? err.message : 'Parse error' })
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
            setParseResult({ valid: true, data: parse(content) as Record<string, unknown> })
          } catch (err) {
            setParseResult({
              valid: false,
              error: err instanceof Error ? err.message : 'Parse error',
            })
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [advancedOpen, response])

  const handleSave = async () => {
    if (!parseResult?.valid || !parseResult.data) return
    setSaving(true)
    setSaveError(null)
    try {
      await apiClient.putOwnershipPolicy(parseResult.data)
      // Success = refetch the GET; the table then proves persistence.
      await load()
    } catch (err) {
      if (ApiError.isApiError(err)) {
        setSaveError({
          message: err.message,
          rows: err.validation?.errors ?? [],
        })
      } else {
        setSaveError({ message: err instanceof Error ? err.message : String(err), rows: [] })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="info-row">
        <span className="info-row__value">Loading...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="info-row" data-testid="policy-load-error" role="alert">
        <span className="info-row__value" style={{ color: '#c92a2a' }}>{loadError}</span>
      </div>
    )
  }

  const resolved: OwnershipPolicyDocView | null = response?.resolved ?? null
  if (!resolved) {
    return (
      <div className="info-row" data-testid="policy-not-configured">
        <span className="info-row__value">Not configured</span>
      </div>
    )
  }

  const ruleCells = (rule: OwnershipPolicyKindRule) => (
    <>
      <td>{rule.owner}</td>
      <td>{rule.visibility}</td>
      <td>{rule.filedTo}</td>
      <td>{(rule.shareTargets ?? []).join(', ')}</td>
    </>
  )

  const saveDisabled = !parseResult?.valid || saving

  return (
    <div className="ownership-policy-section">
      {saveError && (
        <div className="info-row" data-testid="policy-save-error" role="alert">
          <span className="info-row__value" style={{ color: '#c92a2a' }}>{saveError.message}</span>
          {saveError.rows.map((row, i) => (
            <span key={`${row.path}-${i}`} className="info-row__value" style={{ color: '#c92a2a', display: 'block' }}>
              {row.path}: {row.message}
            </span>
          ))}
        </div>
      )}

      <div className="info-row">
        <span className="info-row__label">Scope</span>
        <span className="info-row__value">{resolved.scope.type}:{resolved.scope.id}</span>
      </div>
      <div className="info-row">
        <span className="info-row__label">Lab owner</span>
        <span className="info-row__value">{resolved.labOwnerUserId}</span>
      </div>

      <table className="policy-table" data-testid="policy-table">
        <thead>
          <tr>
            <th>kind</th>
            <th>owner</th>
            <th>visibility</th>
            <th>filed to</th>
            <th>share targets</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(resolved.kindRules).map(([kind, rule]) => (
            <tr key={kind} data-testid={`policy-row-${kind}`}>
              <td>{kind}</td>
              {ruleCells(rule)}
            </tr>
          ))}
          <tr data-testid="policy-fallback-row">
            <td>(fallback)</td>
            {ruleCells(resolved.fallback)}
          </tr>
        </tbody>
      </table>

      <button
        className="btn btn-secondary"
        data-testid="policy-advanced-toggle"
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {advancedOpen ? 'Hide advanced YAML edit' : 'Advanced YAML edit'}
      </button>

      {advancedOpen && (
        <div className="policy-advanced">
          <div ref={editorRef} className="codemirror-wrapper" />
          {parseResult && !parseResult.valid && (
            <div className="info-row" data-testid="policy-parse-error" role="alert">
              <span className="info-row__value" style={{ color: '#c92a2a' }}>{parseResult.error}</span>
            </div>
          )}
          <button
            className="btn btn-primary"
            data-testid="policy-save"
            disabled={saveDisabled}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save policy'}
          </button>
        </div>
      )}
    </div>
  )
}
