/**
 * ClaimWorkspace — individual claim view at /claims/:claimId.
 *
 * Phase 7 shell implementation. Shows claim statement, status, and
 * evidence ledger structure. Full evidence/connections/history is
 * follow-on work.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §7.2
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import './ClaimWorkspace.css'

export function ClaimWorkspace() {
  const { claimId } = useParams<{ claimId: string }>()
  const [claim, setClaim] = useState<RecordEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!claimId) return
    setLoading(true)
    setError(null)
    apiClient.getRecord(claimId)
      .then((record) => setClaim(record))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [claimId])

  const payload = claim?.payload as Record<string, unknown> | null
  const statement = typeof payload?.statement === 'string' ? payload.statement : '(no statement)'
  const status = typeof payload?.status === 'string' ? payload.status : 'unknown'

  const workspaceContent = (
    <div className="claim-workspace" data-testid="claim-workspace">
      {error ? (
        <p className="claim-workspace__error">{error}</p>
      ) : loading ? (
        <p className="claim-workspace__hint">Loading claim…</p>
      ) : !claim || !payload ? (
        <p className="claim-workspace__hint">Claim not found.</p>
      ) : (
        <>
          <header className="claim-workspace__header">
            <div className="claim-workspace__type-badge">C</div>
            <div>
              <h1 className="claim-workspace__statement">{statement}</h1>
              <span className="claim-workspace__id">{claimId}</span>
            </div>
            <span className={`claim-workspace__status claim-workspace__status--${status}`}>
              {status}
            </span>
          </header>

          <section className="claim-workspace__section" data-testid="claim-evidence-ledger">
            <h2 className="claim-workspace__section-title">Evidence Ledger</h2>
            <div className="claim-workspace__evidence-groups">
              <div className="claim-workspace__evidence-group">
                <h3>Supporting</h3>
                <p className="claim-workspace__placeholder">No supporting evidence yet.</p>
              </div>
              <div className="claim-workspace__evidence-group">
                <h3>Contradictory</h3>
                <p className="claim-workspace__placeholder">No contradictory evidence yet.</p>
              </div>
              <div className="claim-workspace__evidence-group">
                <h3>Qualifying</h3>
                <p className="claim-workspace__placeholder">No qualifying evidence yet.</p>
              </div>
            </div>
          </section>

          <section className="claim-workspace__section" data-testid="claim-connections">
            <h2 className="claim-workspace__section-title">Connections</h2>
            <div className="claim-workspace__connections-grid">
              <div>
                <h3>Projects</h3>
                <p className="claim-workspace__placeholder">No linked projects.</p>
              </div>
              <div>
                <h3>Runs</h3>
                <p className="claim-workspace__placeholder">No linked runs.</p>
              </div>
              <div>
                <h3>Related Claims</h3>
                <p className="claim-workspace__placeholder">No related claims.</p>
              </div>
            </div>
          </section>

          <section className="claim-workspace__section" data-testid="claim-history">
            <h2 className="claim-workspace__section-title">History</h2>
            <p className="claim-workspace__placeholder">No revision history yet.</p>
          </section>
        </>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Claim"
      layout="workspace"
      leftPane={workspaceContent}
    />
  )
}
