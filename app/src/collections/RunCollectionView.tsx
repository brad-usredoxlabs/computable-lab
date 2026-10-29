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
import { buildGcSheetCreateChain, gcSheetCreatedRunId } from '../run/gc/gcSheetCreate'
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

  // GC-12 (D2): the CREATE front door — "New GC run sheet" mints the full
  // minimal-valid chain (party → request → sample → run → entry → sequence,
  // header LAST — the GC-4 create-last discipline) via the EXISTING
  // createRecord and lands on /runs/<minted runId> where the GC run-sheet
  // section then shows the new sheet. Purely additive: no route change, no
  // existing behavior touched (the DNA "New Run" stays as-is).
  const [gcCreateOpen, setGcCreateOpen] = useState(false)
  const [gcMethods, setGcMethods] = useState<Array<{ recordId: string; payload: { name?: string; title?: string } }>>([])
  // GC-12 fix-cycle-3 (DIRFIX-3 minor 2): the gc-method fetch's IN-FLIGHT
  // state. The form opens and the fetch is user-triggered but NOT instant —
  // the method row must show a LOADING arm while the list is in flight,
  // never the "No gc-methods are configured" lie (the regate2 defect: a user
  // who opened the form quickly was told the registry was empty while a
  // method existed and the fetch was mid-flight).
  const [gcMethodsLoaded, setGcMethodsLoaded] = useState(false)
  // GC-12 dirfix MINOR-FIX (defect 1): the registry read's SETTLED FAILURE
  // state (a REJECTED fetch). The old catch settled a failure as
  // "loaded + empty list" (gcMethodsLoaded=true, gcMethods still []), so the
  // row rendered the empty-state lie "No gc-methods are configured" on a
  // failed read — the regate2 defect 2 class, moved from the in-flight
  // window to the failure window. A failure is its OWN arm: it names the
  // real cause and offers a Retry — never the not-ready claim.
  // GC-12 DIRFIX-M3-2 (adv cycle-2 defect 2, probe A_ROW_TEXT): the arm is
  // keyed on this failure STATE (null = no failure, non-null = settled
  // failure), NEVER on the truthiness of the message text — a rejection
  // with an EMPTY message (new Error('')) used to store '' (falsy) and fall
  // through to the "No gc-methods are configured" lie. Empty messages store
  // the honest generic cause line instead of ''.
  const [gcMethodsError, setGcMethodsError] = useState<string | null>(null)
  const [gcEquipment, setGcEquipment] = useState<Array<{ recordId: string; payload: { name?: string } }>>([])
  const [gcMethodId, setGcMethodId] = useState('')
  const [gcInstrumentId, setGcInstrumentId] = useState('')
  const [gcTitle, setGcTitle] = useState('')
  const [gcVial, setGcVial] = useState('')
  const [gcSampleLabel, setGcSampleLabel] = useState('')
  const [gcBusy, setGcBusy] = useState(false)
  const [gcNote, setGcNote] = useState<string | null>(null)

  // Lazy: the method + instrument lists are fetched only when the form is
  // OPENED (user-triggered — the collection's mount fetches stay untouched).
  // GC-12 dirfix MINOR-FIX (defect 1): the registry read is ONE named path —
  // the form open AND the failure arm's Retry both run this, so there is a
  // single fetch surface (no divergent inline fetch).
  const fetchGcRegistry = useCallback(async () => {
    try {
      const [m, e] = await Promise.all([
        apiClient.listRecordsByKind('gc-method', 500),
        apiClient.listRecordsByKind('equipment', 500),
      ])
      setGcMethods(m.records as unknown as typeof gcMethods)
      setGcEquipment(e.records as unknown as typeof gcEquipment)
      setGcMethodsError(null)
      setGcMethodsLoaded(true)
    } catch (err) {
      // GC-12 dirfix MINOR-FIX (defect 1): a REJECTED read is a SETTLED
      // FAILURE — never "loaded + empty list" (that old shape rendered the
      // empty-state lie on a failed read — the regate2 defect 2 class). The
      // failure arm names the real cause and offers the Retry; it never
      // renders the empty-state claim and never spins the loading arm.
      // GC-12 DIRFIX-M3-2 (adv cycle-2 defect 2, probe A_ROW_TEXT): the
      // failure STATE is what the arm keys on — a rejection whose message is
      // the EMPTY string must still settle the failure arm, not fall through
      // to the "No gc-methods are configured" lie (an empty message is not a
      // cause: the arm shows the honest generic cause line instead).
      const raw = err instanceof Error ? err.message : String(err)
      setGcMethodsError(raw || 'no cause was provided')
      setGcMethodsLoaded(true)
    }
  }, [])

  const openGcCreate = useCallback(async () => {
    setGcCreateOpen(true)
    setGcNote(null)
    // A RE-OPEN starts fresh: a stale in-flight flag / stale failure /
    // stale method pick from a prior open must not linger (the loading arm
    // reflects THIS fetch).
    setGcMethodsLoaded(false)
    setGcMethodsError(null)
    void fetchGcRegistry()
  }, [fetchGcRegistry])

  // The D2 mint chain (bait #12: build the chain, never assume lane seed).
  const handleGcCreate = useCallback(async () => {
    if (gcBusy) {
      // GC-12 fix-cycle-3 (DIRFIX-3 minor 6): a click during an in-flight
      // create used to be a SILENT no-op (the browser-gate phase-3
      // reproduction: the sample add took >12 s and the create click that
      // followed fired no request and showed no message). Now it is
      // VISIBLE — a named note on the ignored click, never a silent
      // swallow (the form's note line is the owner, one note per state).
      setGcNote('A create is already in progress — the sheet lands when it completes.')
      return
    }
    const title = gcTitle.trim()
    const vial = gcVial.trim()
    const label = gcSampleLabel.trim()
    // GC-12 fix-cycle-3 (DIRFIX-3 minor 2): NO silent first-method fallback.
    // The old `gcMethods[0]?.recordId` fallback created the sheet with a
    // method the user never chose (and, while the fetch was in flight, the
    // fallback silently picked the first of a list the user could not see).
    // The user must SELECT a method — an unselected method is a NAMED
    // reason below, never an unasked-for pick.
    const method = gcMethodId
    if (!title || !vial || !label || !method) {
      setGcNote('Enter a sheet title, a vial, a sample label, and select a gc-method to create the sheet.')
      return
    }
    setGcBusy(true)
    setGcNote(null)
    try {
      const chain = buildGcSheetCreateChain({
        title,
        gcMethodId: method,
        ...(gcInstrumentId ? { instrumentId: gcInstrumentId } : {}),
        vial,
        sampleLabel: label,
        rand: Math.random().toString(36).slice(2, 8),
      })
      // Mint IN ORDER (create-last: the sequence header is the final step).
      for (const step of chain) {
        await apiClient.createRecord(step.schemaId, step.payload)
      }
      const createdRunId = gcSheetCreatedRunId(chain)
      setGcCreateOpen(false)
      setGcTitle('')
      setGcVial('')
      setGcSampleLabel('')
      navigate(`/runs/${createdRunId}`)
    } catch (err) {
      setGcNote(err instanceof Error ? err.message : String(err))
    } finally {
      setGcBusy(false)
    }
  }, [gcBusy, gcTitle, gcVial, gcSampleLabel, gcMethodId, gcMethods, gcInstrumentId, navigate])

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

      {/* Actions bar (total + new buttons) — outside scrollable body */}
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
        {/* GC-12 (D2): the GC run-sheet create front door (additive — the DNA
            "+ New Run" above is untouched). */}
        <button
          type="button"
          className="run-collection__new-btn"
          data-testid="gc-run-collection-new"
          onClick={() => void openGcCreate()}
        >
          + New GC run sheet
        </button>
      </div>

      {/* GC-12 (D2): the inline create form — rendered only when the user
          opened it (user-triggered; the collection's mount fetches stay
          untouched). The instrument select is OPTIONAL data (the lane's
          equipment records); the gc-method select is data-driven. No method
          configured → a NAMED reason + the real authoring door (never a
          dead disabled form — dead-chrome clause). */}
      {gcCreateOpen && (
        <div className="run-collection__gc-create" data-testid="gc-run-create-form">
          <label htmlFor="gc-run-create-title">Sheet title</label>
          <input
            id="gc-run-create-title"
            data-testid="gc-run-create-title"
            value={gcTitle}
            onChange={(e) => setGcTitle(e.target.value)}
            placeholder="e.g. FAME batch 10/28"
          />
          <div data-testid="gc-run-create-method-row">
            <label htmlFor="gc-run-create-method">GC method</label>
            {gcMethodsError ? (
              // GC-12 dirfix MINOR-FIX (defect 1): the SETTLED FAILURE arm —
              // the registry read was REJECTED. Distinct from BOTH the
              // in-flight LOADING arm and the genuine empty arm: a failed
              // read never claims "No gc-methods are configured" (the
              // empty-state lie a failed read is not evidence for) and never
              // spins "Loading…". The arm names the real cause and offers a
              // Retry (a live affordance — dead-chrome ban).
              // GC-12 DIRFIX-M3-2 (adv cycle-2 defect 2, probe A_ROW_TEXT):
              // keyed on the failure STATE (gcMethodsError is null only when
              // no read failed), never on message truthiness — an
              // empty-message rejection still lands here with the honest
              // generic cause line (the empty message is stored as the named
              // cause, never as '').
              <span className="gc-run-create__error" data-testid="gc-run-create-method-error">
                Could not load registry: {gcMethodsError}
                <button
                  type="button"
                  data-testid="gc-run-create-method-retry"
                  onClick={() => {
                    setGcMethodsError(null)
                    setGcMethodsLoaded(false)
                    void fetchGcRegistry()
                  }}
                >
                  Retry
                </button>
              </span>
            ) : !gcMethodsLoaded ? (
              // GC-12 fix-cycle-3 (DIRFIX-3 minor 2): the IN-FLIGHT arm —
              // the list is still loading; never claim "none configured"
              // mid-fetch (that was the regate2 false-empty).
              <span className="gc-run-create__notready" data-testid="gc-run-create-method-loading">
                Loading gc-methods…
              </span>
            ) : gcMethods.length === 0 ? (
              <span className="gc-run-create__notready" data-testid="gc-run-create-method-notready">
                No gc-methods are configured.{' '}
                <a href="/registry" data-testid="gc-run-create-method-author">
                  Author a method in the registry
                </a>{' '}
                (the gc-method manual-entry provenance arms).
              </span>
            ) : (
              <select
                id="gc-run-create-method"
                data-testid="gc-run-create-method"
                value={gcMethodId}
                onChange={(e) => setGcMethodId(e.target.value)}
              >
                <option value="">Select gc-method…</option>
                {gcMethods.map((m) => (
                  <option key={m.recordId} value={m.recordId}>
                    {m.payload.name ?? m.payload.title ?? m.recordId}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label htmlFor="gc-run-create-vial">Vial</label>
          <input
            id="gc-run-create-vial"
            data-testid="gc-run-create-vial"
            value={gcVial}
            onChange={(e) => setGcVial(e.target.value)}
            placeholder="e.g. 101"
          />
          <label htmlFor="gc-run-create-sample">Sample label</label>
          <input
            id="gc-run-create-sample"
            data-testid="gc-run-create-sample"
            value={gcSampleLabel}
            onChange={(e) => setGcSampleLabel(e.target.value)}
            placeholder="e.g. RES35077-4"
          />
          <label htmlFor="gc-run-create-instrument">Instrument (optional)</label>
          <select
            id="gc-run-create-instrument"
            data-testid="gc-run-create-instrument"
            value={gcInstrumentId}
            onChange={(e) => setGcInstrumentId(e.target.value)}
          >
            <option value="">No instrument</option>
            {gcEquipment.map((eq) => (
              <option key={eq.recordId} value={eq.recordId}>
                {eq.payload.name ?? eq.recordId}
              </option>
            ))}
          </select>
          <div data-testid="gc-run-create-actions">
            <button
              type="button"
              data-testid="gc-run-create-cancel"
              onClick={() => setGcCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="gc-run-create-submit"
              onClick={() => void handleGcCreate()}
            >
              {gcBusy ? 'Creating…' : 'Create GC run sheet'}
            </button>
          </div>
          {gcNote ? (
            <p className="gc-run-create__note" data-testid="gc-run-create-note">
              {gcNote}
            </p>
          ) : null}
        </div>
      )}

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
