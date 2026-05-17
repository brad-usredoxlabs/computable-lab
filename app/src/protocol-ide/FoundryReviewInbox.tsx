import { useMemo, useState } from 'react'
import type { FoundryReviewContext, FoundryReviewStatus, FoundryReviewSummary } from '../shared/api/client'
import { FoundryReviewDetail } from './FoundryReviewDetail'
import { foundryReviewTimeAgo } from './foundryReviewTime'

type FoundryInboxFilter = 'active' | 'all' | FoundryReviewStatus

interface FoundryReviewInboxProps {
  reviews: FoundryReviewSummary[]
  selected?: { protocolId: string; variant: string } | null
  context?: FoundryReviewContext | null
  loading?: boolean
  error?: string | null
  onSelect: (review: FoundryReviewSummary) => void
  onContextChanged?: () => void
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

const FILTERS: Array<{ key: FoundryInboxFilter; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'queued', label: 'Queued' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'failed', label: 'Failed' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'all', label: 'All' },
]

export function FoundryReviewInbox({
  reviews,
  selected,
  context,
  loading,
  error,
  onSelect,
  onContextChanged,
}: FoundryReviewInboxProps): JSX.Element {
  const [filter, setFilter] = useState<FoundryInboxFilter>('active')
  const selectedKey = selected ? `${selected.protocolId}/${selected.variant}` : ''
  const counts = useMemo(() => {
    const next: Record<FoundryInboxFilter, number> = {
      active: 0,
      all: reviews.length,
      unreviewed: 0,
      reviewing: 0,
      queued: 0,
      rejected: 0,
      implemented: 0,
      failed: 0,
      blocked: 0,
    }
    for (const review of reviews) {
      next[review.status] += 1
      if (review.status !== 'rejected') {
        next.active += 1
      }
    }
    return next
  }, [reviews])
  const visibleReviews = reviews.filter((review) => {
    if (filter === 'all') return true
    if (filter === 'active') return review.status !== 'rejected'
    return review.status === filter
  })

  return (
    <div className="foundry-review-inbox" data-testid="foundry-review-inbox">
      <div className="foundry-review-inbox__list">
        <div className="foundry-review-inbox__header">
          <h2>Foundry Review Inbox</h2>
          <span>{visibleReviews.length} shown</span>
        </div>
        <div className="foundry-review-inbox__filters" aria-label="Foundry review filters">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`foundry-review-filter${filter === item.key ? ' foundry-review-filter--selected' : ''}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{counts[item.key]}</span>
            </button>
          ))}
        </div>
        {loading && <p className="foundry-review-inbox__muted">Loading Foundry reviews...</p>}
        {error && <p className="foundry-review-inbox__error">{error}</p>}
        {!loading && visibleReviews.length === 0 && (
          <p className="foundry-review-inbox__muted">No Foundry reviews match this filter.</p>
        )}
        <div className="foundry-review-inbox__rows">
          {visibleReviews.map((review) => {
            const key = `${review.protocolId}/${review.variant}`
            return (
              <button
                key={key}
                type="button"
                className={`foundry-review-row${key === selectedKey ? ' foundry-review-row--selected' : ''}`}
                onClick={() => onSelect(review)}
              >
                <span className="foundry-review-row__title">{review.title ?? review.protocolId}</span>
                <span className="foundry-review-row__meta">
                  {review.variant} · {statusLabel(review.status)} · {review.fixClassification}
                </span>
                <span className="foundry-review-row__meta">
                  {review.eventCount ?? 0} events · {review.patchSpecCount} specs
                  {review.lastInnerLoopAt && (
                    <> · <span
                      className="foundry-review-row__looped"
                      data-testid={`foundry-review-row-looped-${review.protocolId}-${review.variant}`}
                    >
                      Looped {foundryReviewTimeAgo(review.lastInnerLoopAt)}
                    </span></>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="foundry-review-inbox__detail">
        {!context ? (
          <div className="foundry-review-empty">
            <h2>Select a Foundry review</h2>
            <p>Choose one protocol/variant to load its isolated PDF, compiler, graph, browser, architect, and semantic context.</p>
          </div>
        ) : (
          <FoundryReviewDetail
            context={context}
            onChanged={() => onContextChanged?.()}
          />
        )}
      </div>

      <style>{`
        .foundry-review-inbox {
          display: grid;
          grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
          min-height: 100%;
          background: #f8fafc;
          color: #172033;
        }
        .foundry-review-inbox__list {
          border-right: 1px solid #d9e0ea;
          background: #fff;
          overflow: auto;
        }
        .foundry-review-inbox__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 0.9rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .foundry-review-inbox__filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          padding: 0.6rem 0.9rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .foundry-review-filter {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.45rem;
          border: 1px solid #d7deea;
          border-radius: 6px;
          background: #fff;
          color: #384455;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
        }
        .foundry-review-filter:hover,
        .foundry-review-filter--selected {
          background: #eef6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
        }
        .foundry-review-filter span {
          color: #64748b;
          font-weight: 700;
        }
        .foundry-review-inbox__header h2,
        .foundry-review-empty h2 {
          margin: 0;
          font-size: 1rem;
          letter-spacing: 0;
        }
        .foundry-review-inbox__rows {
          display: flex;
          flex-direction: column;
        }
        .foundry-review-row {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.25rem;
          text-align: left;
          padding: 0.75rem 0.9rem;
          border: 0;
          border-bottom: 1px solid #eef2f7;
          background: #fff;
          cursor: pointer;
        }
        .foundry-review-row:hover,
        .foundry-review-row--selected {
          background: #eef6ff;
        }
        .foundry-review-row__title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #111827;
          overflow-wrap: anywhere;
        }
        .foundry-review-row__meta,
        .foundry-review-inbox__muted,
        .foundry-review-inbox__error,
        .foundry-review-empty p {
          font-size: 0.78rem;
          color: #5b677a;
        }
        .foundry-review-row__looped {
          color: #1d4ed8;
          font-weight: 600;
        }
        .foundry-review-inbox__error {
          color: #b42318;
          padding: 0 0.9rem;
        }
        .foundry-review-inbox__muted {
          padding: 0 0.9rem;
        }
        .foundry-review-inbox__detail {
          overflow: auto;
        }
        .foundry-review-empty {
          max-width: 520px;
          margin: 2rem auto;
          padding: 1rem;
        }
      `}</style>
    </div>
  )
}
