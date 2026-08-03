/**
 * LabEntityWorkspace — individual lab entity view at /lab/:category/:entityId.
 *
 * Shows the record as a READ-ONLY TapTab (structured editor) surface so the
 * user sees the actual record content, not a metadata field dump. Uses the
 * same editor projection + ProjectionTapTabEditor as RecordEditPanel, but in
 * `disabled` (read-only) mode.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import { ProjectionTapTabEditor } from '../editor/taptab'
import type { EditorProjectionResponse } from '../types/uiSpec'
import type { RecordEnvelope } from '../types/kernel'
import './LabEntityWorkspace.css'

export function LabEntityWorkspace() {
  const { category, entityId } = useParams<{ category: string; entityId: string }>()
  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProjection(null)
    Promise.all([
      apiClient.getRecord(entityId),
      // Editor projection may be unavailable for kinds without a uiSpec —
      // degrade to a plain message rather than crashing.
      apiClient.getRecordEditorProjection(entityId).catch(() => null),
    ])
      .then(([rec, proj]) => {
        if (cancelled) return
        setRecord(rec)
        if (proj) setProjection(proj)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  const payload = record?.payload as Record<string, unknown> | null
  const title = typeof payload?.title === 'string' ? payload.title : entityId ?? ''
  const kind = typeof payload?.kind === 'string' ? payload.kind : category ?? ''

  // Read-only view — the editor is `disabled`, so no slot mutation is needed.
  const slots = useMemo(() => projection?.slots ?? [], [projection])

  const workspaceContent = (
    <div className="lab-entity-workspace" data-testid="lab-entity-workspace">
      {error ? (
        <p className="lab-entity-workspace__error">{error}</p>
      ) : loading ? (
        <p className="lab-entity-workspace__hint">Loading {kind}…</p>
      ) : !record || !payload ? (
        <p className="lab-entity-workspace__hint">Entity not found.</p>
      ) : (
        <>
          <header className="lab-entity-workspace__header">
            <div className="lab-entity-workspace__type-badge">L</div>
            <div>
              <h1 className="lab-entity-workspace__title">{title}</h1>
              <span className="lab-entity-workspace__id">{entityId}</span>
              <span className="lab-entity-workspace__kind">{kind}</span>
            </div>
          </header>

          <section className="lab-entity-workspace__viewer" data-testid="lab-entity-viewer">
            {projection ? (
              <ProjectionTapTabEditor
                blocks={projection.blocks}
                slots={slots}
                data={payload}
                disabled
              />
            ) : (
              <p className="lab-entity-workspace__hint">
                No structured read-only view is available for this record.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Lab"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={workspaceContent}
    />
  )
}
