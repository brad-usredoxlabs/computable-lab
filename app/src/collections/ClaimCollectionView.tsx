/**
 * ClaimCollectionView — collection view for /claims.
 *
 * Lists all claim records grouped by operational status views:
 * Active, Retracted. Supports filtering by status and pagination.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §7.1
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppShell } from "../shared/shell"
import { WorkspaceTabStrip } from "../shared/shell/WorkspaceTabStrip"
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import './ClaimCollectionView.css'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface ClaimSummary {
  recordId: string
  claimId: string
  statement: string
  status: 'active' | 'retracted' | string
  subjectLabel?: string
  predicateLabel?: string
  objectLabel?: string
}

interface OperationalView {
  key: string
  label: string
  filter: ClaimFilter | null
}

interface ClaimFilter {
  status?: 'active' | 'retracted'
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract human-readable claim fields from a RecordEnvelope payload.
 */
function extractClaimSummary(env: RecordEnvelope): ClaimSummary {
  const p = env.payload as Record<string, unknown> | undefined

  const subject = (p?.subject as Record<string, unknown>) ?? {}
  const predicate = (p?.predicate as Record<string, unknown>) ?? {}
  const object_ = (p?.object as Record<string, unknown>) ?? {}

  return {
    recordId: env.recordId,
    claimId: String(p?.id ?? env.recordId),
    statement: typeof p?.statement === 'string' ? p.statement : '(no statement)',
    status: typeof p?.status === 'string' ? p.status : 'active',
    subjectLabel: (subject.label ?? subject.name ?? subject.id) as string | undefined,
    predicateLabel: (predicate.label ?? predicate.name ?? predicate.id) as string | undefined,
    objectLabel: (object_.label ?? object_.name ?? object_.id) as string | undefined,
  }
}

/** Operational view definitions per spec §7.1 */
const VIEWS: OperationalView[] = [
  { key: 'all', label: 'All', filter: null },
  { key: 'active', label: 'Active', filter: { status: 'active' } },
  { key: 'retracted', label: 'Retracted', filter: { status: 'retracted' } },
]

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function ClaimCollectionView() {
  const [claims, setClaims] = useState<ClaimSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState('all')
  const [totalCount, setTotalCount] = useState(0)

  const fetchClaims = useCallback(async (filter: ClaimFilter | null) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listClaims({
        ...(filter?.status ? { status: filter.status } : {}),
        limit: 200,
      })
      const summaries = result.claims.map(extractClaimSummary)
      setClaims(summaries)
      setTotalCount(result.total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to load claims: ${msg}`)
      setClaims([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const view = VIEWS.find(v => v.key === activeView)
    fetchClaims(view?.filter ?? null)
  }, [activeView, fetchClaims])

  /* Group claims into view counts for the tab strip */
  const viewCounts = useMemo(() => {
    const activeCount = claims.filter(c => c.status === 'active').length
    const retractedCount = claims.filter(c => c.status === 'retracted').length
    return { all: claims.length, active: activeCount, retracted: retractedCount }
  }, [claims])

  /* Render */
  const collectionContent = (
    <div className="claims-collection" data-testid="claim-collection-view">
        {/* Header */}
        <div className="claims-collection__header">
          <span className="claims-collection__header-icon" aria-hidden>◇</span>
          <h1>Claims</h1>
          <span className="claims-collection__total">
            {totalCount > 0 ? `${totalCount} total` : ''}
          </span>
        </div>

        {/* Operational view tabs */}
        <div className="claims-views" role="tablist" aria-label="Claim views">
          {VIEWS.map(view => (
            <button
              key={view.key}
              role="tab"
              aria-selected={activeView === view.key}
              className={`claims-views__tab${activeView === view.key ? ' claims-views__tab--active' : ''}`}
              onClick={() => setActiveView(view.key)}
            >
              {view.label}
              <span className="claims-views__count">{viewCounts[view.key as keyof typeof viewCounts] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="claims-loading" data-testid="claims-loading">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="claims-loading__skeleton" />
            ))}
          </div>
        ) : error ? (
          <div className="claims-empty" data-testid="claims-error">
            <div className="claims-empty__icon" aria-hidden>⚠</div>
            <p>{error}</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="claims-empty" data-testid="claims-empty">
            <div className="claims-empty__icon" aria-hidden>◇</div>
            <p>No claims found{activeView !== 'all' ? ` in the "${activeView}" view` : ''}.</p>
          </div>
        ) : (
          <div className="claims-list" data-testid="claims-list">
            {claims.map(claim => (
              <ClaimCard key={claim.recordId} claim={claim} />
            ))}
          </div>
        )}
      </div>
  )

  return (
    <AppShell
      brand="Claims"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={collectionContent}
    />
  )
}

/* ------------------------------------------------------------------ */
/* ClaimCard                                                          */
/* ------------------------------------------------------------------ */

function ClaimCard({ claim }: { claim: ClaimSummary }) {
  const badgeClass = claim.status === 'retracted'
    ? 'claim-card__badge--retracted'
    : 'claim-card__badge--active'

  return (
    <div
      className="claim-card"
      data-testid={`claim-card-${claim.claimId}`}
      data-claim-id={claim.claimId}
      role="button"
      tabIndex={0}
      aria-label={`Claim ${claim.claimId}: ${claim.statement}`}
    >
      <div className="claim-card__row">
        <span className="claim-card__id">{claim.claimId}</span>
        <div className="claim-card__body">
          <p className="claim-card__statement">{claim.statement}</p>
          <div className="claim-card__meta">
            <span className={`claim-card__badge ${badgeClass}`}>
              {claim.status === 'retracted' ? 'Retracted' : 'Active'}
            </span>
            {claim.subjectLabel && (
              <span className="claim-card__detail">
                {claim.subjectLabel} {claim.predicateLabel ?? ''} {claim.objectLabel ?? ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}