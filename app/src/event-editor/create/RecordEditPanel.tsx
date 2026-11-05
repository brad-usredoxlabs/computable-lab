/**
 * RecordEditPanel — view/edit an existing record in a TapTab left pane, in
 * place, without leaving the project workspace.
 *
 * Opened as a `record-edit` workspace tab (e.g. from the Find tab's inventory
 * rows). Mirrors RecordCreatePanel, but loads an existing record + its editor
 * projection and persists with updateRecord instead of createRecord. The tab
 * stays open after a save so the user can keep editing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { describeApiError } from '../../shared/api/errors'
import { isRecordWriteLocked } from '../../shared/records/lifecycleLock'
import { primeContentLockedStates, isContentLockedSetResolved } from '../../shared/records/contentLockedStatesCache'
// Import via the barrel — index.ts pulls in taptab.css; a direct
// `./TapTabEditor` import renders the editor unstyled.
import {
  ProjectionTapTabEditor,
  serializeDocument,
  type TapTabEditorHandle,
} from '../../editor/taptab'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import './RecordCreatePanel.css'

export interface RecordEditPanelProps {
  recordId: string
  title: string
  recordKind?: string
  onClose?: () => void
}

// Identity fields are never editable from the form — changing them would
// fork the record's identity rather than edit it.
const IDENTITY_PATHS = new Set(['recordId', 'kind'])

export function RecordEditPanel({ recordId, title, recordKind, onClose }: RecordEditPanelProps) {
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)
  const [projectionError, setProjectionError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isCreatingRun, setIsCreatingRun] = useState(false)
  const [createRunError, setCreateRunError] = useState<string | null>(null)
  const [contentLockedStates, setContentLockedStates] = useState<string[]>([])
  const [terminalStates, setTerminalStates] = useState<string[]>([])
  const contentLocked = isRecordWriteLocked(formData, contentLockedStates, terminalStates)
  const [saving, setSaving] = useState(false)
  const [draftRevisionId, setDraftRevisionId] = useState<string | null>(null)
  const [lockPending, setLockPending] = useState(false)
  const [contentLockedUnresolved, setContentLockedUnresolved] = useState(false)

  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setError(null)
    setProjection(null)
    setProjectionError(null)
    setSavedAt(null)
    setContentLockedUnresolved(false)

    Promise.all([
      apiClient.getRecord(recordId),
      apiClient.getRecordEditorProjection(recordId).catch((err: unknown) => {
        if (!cancelled) {
          setProjectionError(err instanceof Error ? err.message : 'Editor projection unavailable')
        }
        return null
      }),
    ])
      .then(([record, proj]) => {
        if (cancelled) return
        const payload = (record.payload ?? {}) as Record<string, unknown>
        setFormData(payload)
        if (proj) setProjection(proj)
        // Prime declared content-locked and terminal sets from the lifecycle
        const lifecycleId = (record.payload as { lifecycleId?: string }).lifecycleId
        if (lifecycleId) {
            setLockPending(true)
            let lockCount = 2
            const lockDone = () => {
                if (!cancelled && --lockCount === 0) {
                    setLockPending(false)
                    setContentLockedUnresolved(!isContentLockedSetResolved(lifecycleId))
                }
            }

            primeContentLockedStates(lifecycleId)
              .then((states) => { if (!cancelled) setContentLockedStates(states) })
              .catch(() => { if (!cancelled) setContentLockedStates([]) })
              .finally(lockDone)

            apiClient.getLifecycleTerminalStates(lifecycleId)
              .then((termStates) => { if (!cancelled) setTerminalStates(termStates) })
              .catch(() => { if (!cancelled) setTerminalStates([]) })
              .finally(lockDone)
          }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(describeApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [recordId])

  const slots = useMemo(() => {
    if (!projection) return []
    return projection.slots.map((slot) =>
      IDENTITY_PATHS.has(slot.path.replace(/^\$\./, '')) ? { ...slot, readOnly: true } : slot,
    )
  }, [projection])

  const handleEditorUpdate = useCallback((serialized: Record<string, unknown>) => {
    setFormData(serialized)
    setSavedAt(null)
  }, [])

  const handleSave = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      setIsSaving(true)
      setError(null)
      try {
        let payload: Record<string, unknown> = formData
        const editor = taptabEditorRef.current?.getEditor()
        if (editor) {
          payload = serializeDocument(editor.getJSON(), formData)
        }
        // Identity is fixed for an edit. Re-stamp `recordId` ONLY when the
        // stored payload actually carries that field — some schemas declare
        // `recordId` inside the payload, while others (e.g. controlled-
        // document, `unevaluatedProperties: false`) declare only `id`.
        // Inventing `recordId` there 422s with "must NOT have unevaluated
        // properties" (QMS-6E D3b receipt trail-H step 19).
        if ('recordId' in formData || payload.recordId !== undefined) {
          payload.recordId = recordId
        }
        await apiClient.updateRecord(recordId, payload)
        window.dispatchEvent(new CustomEvent('cl:records-changed'))
        setSavedAt(Date.now())
      } catch (err) {
        setError(describeApiError(err))
      } finally {
        setIsSaving(false)
      }
    },
    [formData, recordId],
  )

  const handleCreateRun = useCallback(async () => {
    setIsCreatingRun(true)
    setCreateRunError(null)
    try {
      const result = await apiClient.createPlannedRun({
        title: `Run: ${title}`,
        sourceType: 'protocol',
        sourceRef: { kind: 'record', id: recordId, type: 'protocol' },
      })
      if (!result.recordId) {
        throw new Error('Server did not return a record ID')
      }
      if (onClose) onClose()
    } catch (err) {
      setCreateRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreatingRun(false)
    }
  }, [recordId, title, onClose])

  const handleCreateDraftRevision = useCallback(async () => {
    setSaving(true)
    try {
      const result = await apiClient.createDraftCopy(recordId, {})
      if (result.record?.recordId) {
        window.dispatchEvent(new CustomEvent('cl:records-changed'))
        setDraftRevisionId(result.record.recordId)
      }
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setSaving(false)
    }
  }, [recordId])

  const useProjection = projection !== null && !loading && !loadError

  return (
    <div className="record-create-panel" data-testid="record-edit-panel">
      <header className="record-create-panel__head">
        <h2 className="record-create-panel__title">{title}</h2>
        <span className="record-create-panel__sub">{recordId}</span>
      </header>

      <form className="record-create-panel__form" onSubmit={(e) => void handleSave(e)}>
        <div className="record-create-panel__body">
          {error ? (
            <div className="record-create-panel__error" role="alert">
              {error}
            </div>
          ) : null}

          {loadError ? (
            <p className="record-create-panel__hint">
              Couldn't open this record for editing: {loadError}
            </p>
          ) : loading ? (
            <p className="record-create-panel__hint">Loading record…</p>
          ) : useProjection && projection ? (
            <ProjectionTapTabEditor
              ref={taptabEditorRef as never}
              blocks={projection.blocks}
              slots={slots}
              data={formData}
              disabled={isSaving || contentLocked}
              onUpdate={handleEditorUpdate}
              enableOntologyCopilot
            />
          ) : (
            <p className="record-create-panel__hint">
              No structured editor is available for this record
              {projectionError ? ` (${projectionError})` : ''}.
            </p>
          )}
        </div>

        <footer className="record-create-panel__actions">
          {onClose ? (
            <button
              type="button"
              className="record-create-panel__btn"
              onClick={onClose}
              disabled={isSaving}
              data-testid="record-edit-close"
            >
              Close
            </button>
          ) : null}
          {savedAt || draftRevisionId ? <span className="record-create-panel__hint">{draftRevisionId ? 'Draft revision created' : 'Saved ✓'}</span> : null}
          {contentLocked
            ? (
              <button
                type="button"
                className="record-create-panel__btn record-create-panel__btn--primary"
                onClick={() => void handleCreateDraftRevision()}
                disabled={saving}
                data-testid="record-edit-create-draft-revision"
              >
                {saving ? 'Creating...' : 'Create draft revision'}
              </button>
            )
            : (
              <button
                type="submit"
                className="record-create-panel__btn record-create-panel__btn--primary"
                disabled={isSaving || loading || Boolean(loadError) || !useProjection || lockPending || contentLockedUnresolved}
                data-testid="record-edit-save"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            )}
          {recordKind === 'protocol' ? (
            <button
              type="button"
              className="record-create-panel__btn record-create-panel__btn--primary"
              onClick={() => void handleCreateRun()}
              disabled={isCreatingRun || isSaving || loading || Boolean(loadError)}
              data-testid="record-edit-create-run"
              style={{ marginLeft: '8px' }}
            >
              {isCreatingRun ? 'Creating…' : 'Create Run'}
            </button>
          ) : null}
        </footer>
        {createRunError ? (
          <div className="record-create-panel__error" role="alert" style={{ marginTop: '8px' }}>
            {createRunError}
          </div>
        ) : null}
      </form>
    </div>
  )
}
