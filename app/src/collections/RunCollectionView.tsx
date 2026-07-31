/**
 * RunCollectionView — collection view for /runs.
 *
 * Fetches all runs across studies via apiClient.listRuns() and renders them
 * in chronologically grouped sections: In Progress, Today, Yesterday, This
 * week, All runs.  Supports filtering by status.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §6.1
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RunListItem, RunsListResponse } from '../shared/api/client'
import './RunCollectionView.css'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

const RUN_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'aborted',
  'failed',
  'superseded',
] as const

/* ------------------------------------------------------------------ */
/* Date helpers                                                       */
/* ------------------------------------------------------------------ */

function getChronologicalGroup(run: RunListItem): string {
  if (run.status === 'in_progress') return 'in-progress'

  const updatedAt = run.updatedAt ? new Date(run.updatedAt) : null
  if (!updatedAt || isNaN(updatedAt.getTime())) return 'all'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const thisWeek = new Date(today.getTime() - 7 * 86400000)

  if (updatedAt >= today) return 'today'
  if (updatedAt >= yesterday) return 'yesterday'
  if (updatedAt >= thisWeek) return 'this-week'
  return 'all'
}

const GROUP_ORDER = [
  'in-progress',
  'today',
  'yesterday',
  'this-week',
  'all',
] as const

const GROUP_LABELS: Record<string, string> = {
  'in-progress': 'In Progress',
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This Week',
  all: 'All Runs',
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function RunCollectionView() {
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result: RunsListResponse = await apiClient.listRuns({
        ...(statusFilter ? { status: statusFilter } : {}),
        limit: 200,
      })
      setRuns(result.runs)
      setTotalCount(result.total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to load runs: ${msg}`)
      setRuns([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void fetchRuns()
  }, [fetchRuns])

  /* Group runs chronologically */
  const groups = useMemo(() => {
    const map = new Map<string, RunListItem[]>()
    for (const key of GROUP_ORDER) {
      map.set(key, [])
    }
    for (const run of runs) {
      const group = getChronologicalGroup(run)
      const bucket = map.get(group)!
      bucket.push(run)
    }
    return map
  }, [runs])

  /* Active groups (only those with runs) */
  const visibleGroups = useMemo(
    () => GROUP_ORDER.filter((key) => groups.get(key)!.length > 0),
    [groups],
  )

  const handleNewRun = () => {
    navigate('/create/study')
  }

  const handleStatusFilter = (status: string | null) => {
    setStatusFilter(status)
  }

  const collectionContent = (
    <div className="run-collection" data-testid="run-collection-view">
      {/* Header */}
      <header className="run-collection__header">
        <h1 className="run-collection__title">Runs</h1>
        <div className="run-collection__header-actions">
          {totalCount > 0 && (
            <span className="run-collection__total">{totalCount} total</span>
          )}
          <button
            type="button"
            className="run-collection__new-btn"
            data-testid="run-collection-new"
            onClick={handleNewRun}
          >
            + New Run
          </button>
        </div>
      </header>

      {/* Status filter bar */}
      <div
        className="run-collection__filters"
        role="tablist"
        aria-label="Run status filters"
      >
        <button
          role="tab"
          aria-selected={statusFilter === null}
          className={`run-collection__filter-tab${statusFilter === null ? ' run-collection__filter-tab--active' : ''}`}
          onClick={() => handleStatusFilter(null)}
        >
          All
        </button>
        {RUN_STATUSES.map((status) => (
          <button
            key={status}
            role="tab"
            aria-selected={statusFilter === status}
            className={`run-collection__filter-tab run-collection__filter-tab--status run-collection__filter-tab--${status}${statusFilter === status ? ' run-collection__filter-tab--active' : ''}`}
            onClick={() => handleStatusFilter(status === statusFilter ? null : status)}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="run-collection__loading" data-testid="runs-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="run-collection__skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="run-collection__error" data-testid="runs-error">
          <span className="run-collection__error-icon" aria-hidden>
            ⚠
          </span>
          <p>{error}</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="run-collection__empty" data-testid="runs-empty">
          <span className="run-collection__empty-icon" aria-hidden>
            ◆
          </span>
          <p>
            {statusFilter
              ? `No runs with status "${statusFilter}".`
              : 'No runs yet.'}
          </p>
        </div>
      ) : (
        <div className="run-collection__content">
          {visibleGroups.map((groupKey) => {
            const groupRuns = groups.get(groupKey)!
            if (groupRuns.length === 0) return null
            return (
              <section
                key={groupKey}
                className="run-collection__group"
                data-testid={`runs-group-${groupKey}`}
              >
                <h2
                  className="run-collection__group-header"
                  data-testid={`runs-group-header-${groupKey}`}
                >
                  {GROUP_LABELS[groupKey]}
                  <span className="run-collection__group-count">
                    {groupRuns.length}
                  </span>
                </h2>
                <ul className="run-collection__list">
                  {groupRuns.map((run) => (
                    <RunRow key={run.recordId} run={run} onNavigate={navigate} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Runs"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}

/* ------------------------------------------------------------------ */
/* RunRow                                                             */
/* ------------------------------------------------------------------ */

const STATUS_ICONS: Record<string, string> = {
  planned: '○',
  in_progress: '●',
  completed: '✓',
  aborted: '✕',
  failed: '✕',
  superseded: '↗',
}

function RunRow({
  run,
  onNavigate,
}: {
  run: RunListItem
  onNavigate: (to: string) => void
}) {
  const statusIcon = STATUS_ICONS[run.status] ?? '?'

  return (
    <li className="run-collection__row">
      <button
        type="button"
        className="run-card"
        data-testid={`run-card-${run.recordId}`}
        onClick={() => onNavigate(`/runs/${run.recordId}`)}
        aria-label={`Run ${run.title} (${run.status})`}
      >
        <span
          className={`run-card__status run-card__status--${run.status}`}
          aria-hidden
        >
          {statusIcon}
        </span>
        <div className="run-card__body">
          <h3 className="run-card__title">{run.title}</h3>
          <div className="run-card__meta">
            <span className="run-card__study">{run.studyTitle}</span>
            {run.experimentTitle && (
              <>
                <span className="run-card__separator">›</span>
                <span className="run-card__experiment">
                  {run.experimentTitle}
                </span>
              </>
            )}
            <span className="run-card__separator">›</span>
            <span className="run-card__id">{run.recordId}</span>
          </div>
        </div>
        <span className="run-card__status-label">{run.status.replace('_', ' ')}</span>
      </button>
    </li>
  )
}
