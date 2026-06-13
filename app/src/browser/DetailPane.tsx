/**
 * DetailPane — right region of `/browser`. Shows the selected record
 * inline, editable via the same TipTap projection editor the legacy
 * record editor uses. No separate edit route (plan §8).
 *
 * Loads the editor projection from `apiClient.getRecordEditorProjection`.
 * Saves through `apiClient.updateRecord`. Tracks dirty state so the user
 * can see they have unsaved changes; the Save button activates only
 * when the editor is dirty.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../shared/api/client'
import { describeApiError } from '../shared/api/errors'
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor'
import type { TapTabEditorHandle } from '../editor/taptab/types'
import type { EditorProjectionResponse } from '../types/uiSpec'
import type { RecordEnvelope } from '../types/kernel'
import { ShareRecordDialog } from '../shared/sharing/ShareRecordDialog'
import { isPolicyRootKind } from '../shared/sharing/policyRoots'

export interface DetailPaneProps {
  recordId: string | null
  /** Fired after a successful save so the list can re-fetch. */
  onSaved: () => void
  /** Close the detail pane without navigating away (clears `?id=`). */
  onClose: () => void
}

interface DetailLoadState {
  record: RecordEnvelope | null
  projection: EditorProjectionResponse | null
  error: string | null
  loading: boolean
}

export function DetailPane({ recordId, onSaved, onClose }: DetailPaneProps) {
  const taptabRef = useRef<TapTabEditorHandle>(null)
  const [state, setState] = useState<DetailLoadState>({
    record: null,
    projection: null,
    error: null,
    loading: false,
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!recordId) {
      setState({ record: null, projection: null, error: null, loading: false })
      setDirty(false)
      setSaveError(null)
      return
    }
    let cancelled = false
    setState({ record: null, projection: null, error: null, loading: true })
    setDirty(false)
    setSaveError(null)
    Promise.all([
      apiClient.getRecord(recordId),
      // Projection endpoint may not be available for every record/schema.
      // Tolerate the failure: we fall back to a read-only JSON view.
      apiClient.getRecordEditorProjection(recordId).catch(() => null),
    ])
      .then(([record, projection]) => {
        if (cancelled) return
        setState({ record, projection, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          record: null,
          projection: null,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
        })
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  const handleChange = useCallback(
    (_payload: Record<string, unknown>, isDirty: boolean) => {
      setDirty(isDirty)
    },
    [],
  )

  const handleSave = useCallback(async () => {
    const record = state.record
    if (!record) return
    const editor = taptabRef.current?.getEditor()
    if (!editor) return
    setSaving(true)
    setSaveError(null)
    try {
      const docJson = editor.getJSON() as Record<string, unknown>
      await apiClient.updateRecord(record.recordId, docJson)
      setDirty(false)
      onSaved()
    } catch (err) {
      setSaveError(describeApiError(err))
    } finally {
      setSaving(false)
    }
  }, [state.record, onSaved])

  if (!recordId) {
    return (
      <section className="cl-browser__detail cl-browser__detail--empty" aria-label="Record detail">
        <p>Select a record to view its fields here.</p>
      </section>
    )
  }

  if (state.loading) {
    return (
      <section className="cl-browser__detail" aria-label="Record detail">
        <header className="cl-browser__detail-header">
          <span>{recordId}</span>
        </header>
        <div className="cl-browser__detail-empty">Loading…</div>
      </section>
    )
  }

  if (state.error || !state.record) {
    return (
      <section className="cl-browser__detail" aria-label="Record detail">
        <header className="cl-browser__detail-header">
          <span>{recordId}</span>
          <button type="button" className="cl-browser__detail-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="cl-browser__detail-error">
          Failed to load record: {state.error ?? 'unknown error'}
        </div>
      </section>
    )
  }

  return (
    <section className="cl-browser__detail" aria-label="Record detail">
      <header className="cl-browser__detail-header">
        <div className="cl-browser__detail-title">
          <span className="cl-browser__detail-id">{state.record.recordId}</span>
          {dirty && <span className="cl-browser__detail-dirty">Unsaved</span>}
        </div>
        <div className="cl-browser__detail-actions">
          {isPolicyRootKind((state.record.payload as { kind?: string })?.kind ?? state.record.meta?.kind) ? (
            <button
              type="button"
              className="cl-browser__detail-save"
              onClick={() => setShareOpen(true)}
              title="Manage who can see and edit this record"
            >
              Share
            </button>
          ) : null}
          <button
            type="button"
            className="cl-browser__detail-save"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="cl-browser__detail-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>
      {shareOpen ? (
        <ShareRecordDialog recordId={state.record.recordId} onClose={() => setShareOpen(false)} />
      ) : null}
      {saveError && <div className="cl-browser__detail-error">{saveError}</div>}
      {state.projection ? (
        <ProjectionTapTabEditor
          ref={taptabRef}
          blocks={state.projection.blocks}
          slots={state.projection.slots}
          data={state.record.payload}
          disabled={saving}
          onUpdate={handleChange}
          style={state.projection.taptab?.style ?? 'prose'}
        />
      ) : (
        <pre className="cl-browser__detail-fallback">
          {JSON.stringify(state.record.payload, null, 2)}
        </pre>
      )}
    </section>
  )
}
