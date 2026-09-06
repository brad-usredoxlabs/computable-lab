/**
 * RunCollectionView — collection view for /runs.
 *
 * Fetches all runs across studies via apiClient.listRuns() and renders them
 * in a two-column grid with filtering, sorting, and status-based tabs.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §6.1
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { runTabId } from '../event-editor/workspace/types'
import { openContent, openInNewTab } from '../shared/lib/openContent'
import { apiClient } from '../shared/api/client'
import type { RunListItem, RunsListResponse } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import { CollectionSearchSort } from '../shared/components/CollectionSearchSort'
import { quickCreateRun } from '../event-editor/create/quickCreateRun'
import { SCRATCH_STUDY_ID } from '../event-editor/legacyRouteResolution'
import './RunCollectionView.css'

export type RunSortField = 'name' | 'date_created' | 'date_updated'
export type RunSortDirection = 'asc' | 'desc'

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
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function RunCollectionView({ embedded = false }: { embedded?: boolean } = {}) {
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<RunSortField>('date_updated')
  const [sortDirection, setSortDirection] = useState<RunSortDirection>('desc')
  const [projects, setProjects] = useState<RecordEnvelope[] | null>(null)
  const [attachingId, setAttachingId] = useState<string | null>(null)
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()

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

  const refreshProjects = useCallback(async () => {
    try {
      const result = await apiClient.listRecordsByKind('study', 200)
      setProjects(result.records)
    } catch (err) {
      console.error('Failed to load projects:', err)
      setProjects([])
    }
  }, [])

  const openAttachPicker = useCallback(async (runId: string) => {
    setAttachingId(runId)
    if (projects === null) await refreshProjects()
  }, [projects, refreshProjects])

  const handleAttachToProject = useCallback(
    async (runId: string, studyId: string) => {
      if (!studyId) return
      try {
        const current = await apiClient.getRecord(runId)
        // PUT /records/:id replaces the payload wholesale, so merge the current
        // payload and add studyId (not a bare { studyId } patch).
        await apiClient.updateRecord(runId, {
          ...(current?.payload ?? {}),
          studyId,
        })
        setAttachingId(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Failed to attach run ${runId} to project:`, msg)
      }
      await fetchRuns()
    },
    [fetchRuns],
  )

  /* Filter by search query */
  const query = searchQuery.toLowerCase().trim()
  const filteredRuns = query
    ? runs.filter((run) => {
        const searchable = `${run.title} ${run.studyTitle ?? ''} ${run.experimentTitle ?? ''} ${run.recordId} ${run.status}`.toLowerCase()
        return searchable.includes(query)
      })
    : runs

  /* Sort runs */
  const sortedRuns = [...filteredRuns].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'name': {
        comparison = a.title.localeCompare(b.title)
        break
      }
      case 'date_created': {
        const createdA = a.startedAt ?? a.updatedAt ?? ''
        const createdB = b.startedAt ?? b.updatedAt ?? ''
        comparison = createdA.localeCompare(createdB)
        break
      }
      case 'date_updated': {
        comparison = (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')
        break
      }
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  /* Sort control handler — for onSortFieldChange prop compatibility */
  const handleSortFieldChange = (field: string) => {
    setSortField(field as RunSortField)
  }

  const handleNewRun = async () => {
    try {
      const { recordId, title } = await quickCreateRun({ studyId: SCRATCH_STUDY_ID })
      openContent(openTabs, navigate, { id: runTabId(recordId), kind: 'run', runId: recordId, title }, `/runs/${recordId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to create run:', msg)
    }
  }

  const handleStatusFilter = (status: string | null) => {
    setStatusFilter(status)
  }

  /* Sort control UI with search — mirrors LabCollectionView pattern */
  const sortControls = (
    <CollectionSearchSort
      query={searchQuery}
      onQueryChange={setSearchQuery}
      sortField={sortField}
      onSortFieldChange={handleSortFieldChange}
      sortDirection={sortDirection}
      onSortDirectionChange={(dir) => setSortDirection(dir)}
      sortFields={[
        { id: 'name', label: 'Name' },
        { id: 'date_created', label: 'Date Created' },
        { id: 'date_updated', label: 'Date Updated' },
      ]}
      placeholder="Search runs…"
    />
  )

  const collectionContent = (
    <div className="run-collection" data-testid="run-collection-view">
      {/* Header with title, sort controls, and action buttons */}
      <header className="run-collection__header">
        <h1 className="run-collection__title">Runs</h1>
        {sortControls}
      </header>

      {/* Actions bar (total + new button) — outside scrollable body */}
      <div className="run-collection__actions">
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

      <div className="run-collection__body">
        {/* Status filter bar — sticky at top of scrollable area */}
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
        ) : sortedRuns.length === 0 ? (
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
          <ul className="run-collection__list">
            {sortedRuns.map((run) => (
              <RunRow
                key={run.recordId}
                run={run}
                onNavigate={navigate}
                openTabs={openTabs}
                attaching={attachingId === run.recordId}
                projects={projects}
                onAttachClick={openAttachPicker}
                onAttachSelect={(studyId) => void handleAttachToProject(run.recordId, studyId)}
                onCancelAttach={() => setAttachingId(null)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  if (embedded) return collectionContent

  return (
    <AppShell
      brand="Runs"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
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
  openTabs,
  attaching,
  projects,
  onAttachClick,
  onAttachSelect,
  onCancelAttach,
}: {
  run: RunListItem
  onNavigate: (to: string) => void
  openTabs: ReturnType<typeof useOptionalOpenTabs>
  attaching: boolean
  projects: RecordEnvelope[] | null
  onAttachClick: (runId: string) => void
  onAttachSelect: (studyId: string) => void
  onCancelAttach: () => void
}) {
  const statusIcon = STATUS_ICONS[run.status] ?? '?'
  const studyTitle = run.studyTitle

  return (
    <li className="run-collection__row">
      <button
        type="button"
        className="run-card"
        data-testid={`run-card-${run.recordId}`}
        onClick={() => {
          openContent(openTabs, onNavigate, {
            id: runTabId(run.recordId),
            kind: 'run',
            runId: run.recordId,
            title: run.title ?? run.recordId,
          }, `/runs/${run.recordId}`)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          openInNewTab(openTabs, onNavigate, {
            id: runTabId(run.recordId),
            kind: 'run',
            runId: run.recordId,
            title: run.title ?? run.recordId,
          }, `/runs/${run.recordId}`)
        }}
        title="Left-click: open here · Right-click: open in new tab"
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
            <span className="run-card__study">{studyTitle ?? 'Unassigned'}</span>
            {run.experimentTitle && (
              <>
                <span className="run-card__separator">›</span>
                <span className="run-card__experiment">
                  {run.experimentTitle}
                </span>
              </>
            )}
            {(studyTitle || run.experimentTitle) && (
              <span className="run-card__separator">›</span>
            )}
            <span className="run-card__id">{run.recordId}</span>
          </div>
        </div>
        <span className="run-card__status-label">{run.status.replace('_', ' ')}</span>
      </button>
      {!studyTitle && (
        <div className="run-card__attach" data-testid={`run-attach-${run.recordId}`}>
          {attaching ? (
            projects === null ? (
              <span className="run-card__attach-loading">Loading projects…</span>
            ) : projects.length === 0 ? (
              <>
                <span className="run-card__attach-empty">No projects yet.</span>
                <button
                  type="button"
                  className="run-card__attach-cancel"
                  onClick={onCancelAttach}
                >
                  Cancel
                </button>
              </>
            ) : (
              <select
                className="run-card__attach-select"
                autoFocus
                defaultValue=""
                data-testid={`run-attach-select-${run.recordId}`}
                onChange={(e) => onAttachSelect(e.target.value)}
                onBlur={onCancelAttach}
              >
                <option value="" disabled>
                  Attach to project…
                </option>
                {projects.map((p) => {
                  const pid = p.recordId
                  const ptitle = (p.payload?.title as string | undefined) ?? pid
                  return (
                    <option key={pid} value={pid}>
                      {ptitle}
                    </option>
                  )
                })}
              </select>
            )
          ) : (
            <button
              type="button"
              className="run-card__attach-btn"
              onClick={() => onAttachClick(run.recordId)}
            >
              + Attach to project
            </button>
          )}
        </div>
      )}
    </li>
  )
}
