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
  const isProtocol = kind === 'protocol' || kind === 'local-protocol'

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
            {isProtocol ? (
              <ProtocolEntityView payload={payload} kind={kind} />
            ) : projection ? (
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

/**
 * ProtocolEntityView — concise executable step list as the MAIN view for a
 * protocol record, with the full long-form text in a collapsible <details>
 * block (never the dominant flow). The machine step list is the primary,
 * biologist-readable artifact; the long text is an expandable supplement.
 */
function ProtocolEntityView({
  payload,
  kind,
}: {
  payload: Record<string, unknown>
  kind: string
}) {
  const steps = Array.isArray(payload.steps) ? (payload.steps as Array<Record<string, unknown>>) : []
  const humanText = typeof payload.humanStepsText === 'string' ? payload.humanStepsText : null
  const title = typeof payload.title === 'string' ? payload.title : 'Protocol'

  return (
    <div className="protocol-entity-view" data-testid="protocol-entity-view">
      <h2 className="protocol-entity-view__kind">{kind === 'local-protocol' ? 'Local Protocol' : 'Protocol'}</h2>

      {steps.length > 0 ? (
        <ol className="protocol-entity-view__steps" data-testid="protocol-steps-main">
          {steps.map((s) => {
            const label = typeof s.label === 'string' ? s.label : 'Step'
            const desc = typeof s.description === 'string' ? s.description : null
            const ordinal =
              typeof s.ordinal === 'number' ? s.ordinal : (typeof s.ordinal === 'string' ? parseInt(s.ordinal, 10) : null)
            return (
              <li key={typeof s.stepId === 'string' ? s.stepId : String(ordinal ?? label)} className="protocol-entity-view__step">
                <span className="protocol-entity-view__num" aria-hidden>
                  {ordinal ?? '.'}
                </span>
                <span className="protocol-entity-view__step-body">
                  <span className="protocol-entity-view__label">{label}</span>
                  {desc ? <span className="protocol-entity-view__desc">{desc}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="lab-entity-workspace__hint">This protocol has no steps.</p>
      )}

      {humanText ? (
        <details className="protocol-entity-view__full" data-testid="protocol-full-text">
          <summary>Full protocol text</summary>
          <pre className="protocol-entity-view__full-pre">{humanText}</pre>
        </details>
      ) : null}

      <p className="protocol-entity-view__footer">{steps.length} step{steps.length === 1 ? '' : 's'} · {title}</p>
    </div>
  )
}
