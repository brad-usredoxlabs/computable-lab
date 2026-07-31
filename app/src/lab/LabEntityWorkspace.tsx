/**
 * LabEntityWorkspace — individual lab entity view at /lab/:category/:entityId.
 *
 * Phase 8 shell implementation. Shows entity record with basic fields.
 * Full protocol steps, material hierarchy, equipment calibration, etc.
 * are follow-on work.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §8.2-§8.6
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import './LabEntityWorkspace.css'

export function LabEntityWorkspace() {
  const { category, entityId } = useParams<{ category: string; entityId: string }>()
  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) return
    setLoading(true)
    setError(null)
    apiClient.getRecord(entityId)
      .then((rec) => setRecord(rec))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [entityId])

  const payload = record?.payload as Record<string, unknown> | null
  const title = typeof payload?.title === 'string' ? payload.title : entityId ?? ''
  const kind = typeof payload?.kind === 'string' ? payload.kind : category ?? ''

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

          <section className="lab-entity-workspace__section" data-testid="lab-entity-details">
            <h2 className="lab-entity-workspace__section-title">Details</h2>
            <dl className="lab-entity-workspace__fields">
              {Object.entries(payload).slice(0, 12).map(([key, value]) => {
                if (typeof value === 'object') return null
                return (
                  <div key={key} className="lab-entity-workspace__field">
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                )
              })}
            </dl>
          </section>

          <section className="lab-entity-workspace__section" data-testid="lab-entity-connections">
            <h2 className="lab-entity-workspace__section-title">Connections</h2>
            <div className="lab-entity-workspace__connections-grid">
              <div>
                <h3>Recent Runs</h3>
                <p className="lab-entity-workspace__placeholder">No runs using this entity.</p>
              </div>
              <div>
                <h3>Related Claims</h3>
                <p className="lab-entity-workspace__placeholder">No related claims.</p>
              </div>
              <div>
                <h3>Projects</h3>
                <p className="lab-entity-workspace__placeholder">No linked projects.</p>
              </div>
            </div>
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
