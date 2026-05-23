import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  completeFoundryJob,
  continueFoundryJob,
  createFoundryJob,
  getFoundryJob,
  listFoundryJobs,
  type FoundryAcquisitionJobEvent,
  type FoundryAcquisitionJobKind,
  type FoundryAcquisitionJobRecord,
  type FoundryAcquisitionJobStatus,
  type FoundryAcquisitionStructuredResult,
} from '../shared/api/foundryJobsClient'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; jobs: FoundryAcquisitionJobRecord[]; selected?: JobDetail }
  | { status: 'error'; message: string }

interface JobDetail {
  job: FoundryAcquisitionJobRecord
  events: FoundryAcquisitionJobEvent[]
}

const JOB_KINDS: Array<{ value: FoundryAcquisitionJobKind; label: string }> = [
  { value: 'labware-from-spec', label: 'Labware from spec' },
  { value: 'protocol-from-document', label: 'Protocol from document' },
  { value: 'material-from-source', label: 'Material from source' },
  { value: 'literature-extraction', label: 'Literature extraction' },
]

function statusClass(value: FoundryAcquisitionJobStatus | FoundryAcquisitionStructuredResult['status'] | string): string {
  if (value === 'running' || value === 'queued') return 'foundry-jobs-pill--active'
  if (value === 'complete' || value === 'ready_for_review') return 'foundry-jobs-pill--ok'
  if (value === 'failed' || value === 'canceled' || value === 'blocked') return 'foundry-jobs-pill--error'
  if (value === 'needs-review' || value === 'incomplete') return 'foundry-jobs-pill--warn'
  return ''
}

function formatTime(value: string | undefined): string {
  if (!value) return 'unknown'
  return new Date(value).toLocaleString()
}

function latestJobs(jobs: FoundryAcquisitionJobRecord[]): FoundryAcquisitionJobRecord[] {
  return jobs.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function FoundryAcquisitionJobsPanel(): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [newJobKind, setNewJobKind] = useState<FoundryAcquisitionJobKind>('labware-from-spec')
  const [newJobPrompt, setNewJobPrompt] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (preferredId?: string | null) => {
    try {
      const { jobs } = await listFoundryJobs()
      const ordered = latestJobs(jobs)
      const resolvedId = preferredId ?? selectedId ?? ordered[0]?.id ?? null
      const selected = resolvedId ? await getFoundryJob(resolvedId) : undefined
      setSelectedId(resolvedId)
      setLoadState({ status: 'ready', jobs: ordered, ...(selected ? { selected } : {}) })
    } catch (err) {
      setLoadState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  useEffect(() => {
    void load(null)
  }, [])

  useEffect(() => {
    if (loadState.status !== 'ready') return
    const selected = loadState.selected?.job
    const shouldPoll = selected?.status === 'queued' || selected?.status === 'running'
    if (!shouldPoll) return
    const timer = window.setInterval(() => void load(selected.id), 2500)
    return () => window.clearInterval(timer)
  }, [loadState])

  const jobsByStatus = useMemo(() => {
    if (loadState.status !== 'ready') return []
    const counts = new Map<string, number>()
    for (const job of loadState.jobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [loadState])

  const selectJob = async (id: string) => {
    setSelectedId(id)
    await load(id)
  }

  const submitFeedback = async () => {
    if (loadState.status !== 'ready' || !loadState.selected || !feedback.trim()) return
    setBusy(true)
    try {
      const detail = await continueFoundryJob(loadState.selected.job.id, feedback)
      setFeedback('')
      await load(detail.job.id)
    } finally {
      setBusy(false)
    }
  }

  const markComplete = async () => {
    if (loadState.status !== 'ready' || !loadState.selected) return
    setBusy(true)
    try {
      const detail = await completeFoundryJob(loadState.selected.job.id)
      await load(detail.job.id)
    } finally {
      setBusy(false)
    }
  }

  const submitNewJob = async () => {
    const prompt = newJobPrompt.trim()
    if (!prompt) return
    setBusy(true)
    setCreateError(null)
    try {
      const detail = await createFoundryJob({ kind: newJobKind, prompt })
      setNewJobPrompt('')
      await load(detail.job.id)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (loadState.status === 'loading') {
    return <div className="foundry-jobs-page">Loading Foundry jobs...</div>
  }

  if (loadState.status === 'error') {
    return (
      <div className="foundry-jobs-page">
        <div className="foundry-jobs-error">
          <h1>Foundry Jobs</h1>
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void load(selectedId)}>Retry</button>
        </div>
        <FoundryJobsStyles />
      </div>
    )
  }

  const selected = loadState.selected

  return (
    <div className="foundry-jobs-page" data-testid="foundry-acquisition-jobs-panel">
      <header className="foundry-jobs-header">
        <div>
          <h1>Foundry Jobs</h1>
          <p>{loadState.jobs.length} acquisition jobs. Structured outputs are produced from tool traces.</p>
        </div>
        <div className="foundry-jobs-header__actions">
          <Link to="/protocol-ide/foundry/status" className="foundry-jobs-button">Ledger status</Link>
          <button type="button" onClick={() => void load(selectedId)}>Refresh</button>
        </div>
      </header>

      <section className="foundry-jobs-counts" aria-label="Foundry acquisition job counts">
        {jobsByStatus.length === 0 ? (
          <div className="foundry-jobs-count"><span>No jobs</span><strong>0</strong></div>
        ) : jobsByStatus.map(([status, count]) => (
          <div key={status} className="foundry-jobs-count">
            <span>{status}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>

      <section className="foundry-jobs-card foundry-jobs-create" aria-label="Create Foundry acquisition job">
        <div className="foundry-jobs-create__controls">
          <label>
            <span>Kind</span>
            <select
              value={newJobKind}
              onChange={(event) => setNewJobKind(event.target.value as FoundryAcquisitionJobKind)}
              disabled={busy}
            >
              {JOB_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </select>
          </label>
          <label className="foundry-jobs-create__prompt">
            <span>Request</span>
            <textarea
              value={newJobPrompt}
              onChange={(event) => setNewJobPrompt(event.target.value)}
              placeholder="Find the vendor PDF for Thermo plate 12345 and draft a labware definition..."
              disabled={busy}
            />
          </label>
          <button type="button" onClick={submitNewJob} disabled={busy || !newJobPrompt.trim()}>
            {busy ? 'Starting...' : 'Start job'}
          </button>
        </div>
        {createError && <p className="foundry-jobs-create__error">{createError}</p>}
      </section>

      <div className="foundry-jobs-layout">
        <aside className="foundry-jobs-list" aria-label="Foundry acquisition jobs">
          {loadState.jobs.length === 0 ? (
            <p className="foundry-jobs-muted">No acquisition jobs have been created yet.</p>
          ) : loadState.jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              className={`foundry-jobs-list-item ${job.id === selectedId ? 'foundry-jobs-list-item--selected' : ''}`}
              onClick={() => void selectJob(job.id)}
            >
              <span>{job.title || job.prompt}</span>
              <strong>{job.jobKind}</strong>
              <em className={`foundry-jobs-pill ${statusClass(job.status)}`}>{job.status}</em>
            </button>
          ))}
        </aside>

        <main className="foundry-jobs-detail">
          {selected ? (
            <FoundryJobDetailView
              detail={selected}
              feedback={feedback}
              busy={busy}
              onFeedbackChange={setFeedback}
              onSubmitFeedback={submitFeedback}
              onMarkComplete={markComplete}
            />
          ) : (
            <div className="foundry-jobs-empty">Select a job to inspect its outputs.</div>
          )}
        </main>
      </div>
      <FoundryJobsStyles />
    </div>
  )
}

function FoundryJobDetailView({
  detail,
  feedback,
  busy,
  onFeedbackChange,
  onSubmitFeedback,
  onMarkComplete,
}: {
  detail: JobDetail
  feedback: string
  busy: boolean
  onFeedbackChange: (value: string) => void
  onSubmitFeedback: () => void
  onMarkComplete: () => void
}): JSX.Element {
  const { job, events } = detail
  const summary = job.outputSummary
  const lastAssistant = job.turns.slice().reverse().find((turn) => turn.role === 'assistant')
  const canContinue = job.status !== 'running' && job.status !== 'queued'
  const canComplete = job.status === 'needs-review' || job.status === 'failed'

  return (
    <>
      <section className="foundry-jobs-card">
        <div className="foundry-jobs-card__header">
          <div>
            <h2>{job.title || job.prompt}</h2>
            <p>{job.jobKind} · Updated {formatTime(job.updatedAt)}</p>
          </div>
          <span className={`foundry-jobs-pill ${statusClass(job.status)}`}>{job.status}</span>
        </div>
        <p className="foundry-jobs-prompt">{job.prompt}</p>
        {summary && (
          <div className="foundry-jobs-next-action">
            <span className={`foundry-jobs-pill ${statusClass(summary.status)}`}>{summary.status}</span>
            <p>{summary.nextAction}</p>
          </div>
        )}
      </section>

      {summary ? <FoundryOutputSummary summary={summary} /> : (
        <section className="foundry-jobs-card">
          <h3>Structured Output</h3>
          <p className="foundry-jobs-muted">No structured output summary has been written for this job yet.</p>
        </section>
      )}

      <section className="foundry-jobs-grid">
        <div className="foundry-jobs-card">
          <h3>Assistant Report</h3>
          {lastAssistant ? <pre className="foundry-jobs-report">{lastAssistant.content}</pre> : <p className="foundry-jobs-muted">No assistant report yet.</p>}
        </div>
        <div className="foundry-jobs-card">
          <h3>Event Log</h3>
          <div className="foundry-jobs-events">
            {events.slice(-16).map((event, index) => (
              <div key={`${event.ts ?? index}-${event.phase}`} className="foundry-jobs-event">
                <span>{event.source}</span>
                <strong>{event.phase}</strong>
                <p>{event.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="foundry-jobs-card">
        <h3>Continue Job</h3>
        <textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
          placeholder="Ask the agent to fill a gap, retry with a source, or revise the draft..."
          disabled={!canContinue || busy}
        />
        <div className="foundry-jobs-actions">
          <button type="button" onClick={onSubmitFeedback} disabled={!canContinue || !feedback.trim() || busy}>
            {busy ? 'Working...' : 'Send feedback'}
          </button>
          <button type="button" onClick={onMarkComplete} disabled={!canComplete || busy}>
            Mark complete
          </button>
        </div>
      </section>
    </>
  )
}

function FoundryOutputSummary({ summary }: { summary: FoundryAcquisitionStructuredResult }): JSX.Element {
  return (
    <section className="foundry-jobs-card foundry-jobs-output" data-testid="foundry-output-summary">
      <div className="foundry-jobs-card__header">
        <h3>Structured Output</h3>
        <span className={`foundry-jobs-pill ${statusClass(summary.status)}`}>{summary.status}</span>
      </div>

      <div className="foundry-jobs-output-grid">
        <OutputList
          title="Artifacts"
          empty="No artifacts detected."
          items={summary.artifacts.map((artifact) => ({
            key: `${artifact.kind}:${artifact.path}`,
            heading: artifact.label || artifact.kind,
            meta: artifact.status || artifact.tool || '',
            body: artifact.path,
          }))}
        />
        <OutputList
          title="Records"
          empty="No promoted records detected."
          items={summary.records.map((record) => ({
            key: `${record.kind}:${record.recordId}:${record.path ?? ''}`,
            heading: record.recordId,
            meta: [record.kind, record.status].filter(Boolean).join(' · '),
            body: record.path || record.tool || '',
          }))}
        />
      </div>

      <OutputList
        title="Blockers"
        empty="No blockers reported."
        items={summary.blockers.map((blocker, index) => ({
          key: `${blocker.tool ?? 'blocker'}:${blocker.code}:${index}`,
          heading: blocker.code,
          meta: [blocker.severity, blocker.tool, blocker.field].filter(Boolean).join(' · '),
          body: blocker.message,
        }))}
      />

      <div className="foundry-jobs-tool-table-wrap">
        <table className="foundry-jobs-tool-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Status</th>
              <th>Kind</th>
              <th>Outputs</th>
            </tr>
          </thead>
          <tbody>
            {summary.toolRuns.length === 0 ? (
              <tr><td colSpan={4}>No tool calls summarized.</td></tr>
            ) : summary.toolRuns.map((run, index) => (
              <tr key={`${run.tool}-${index}`}>
                <td><code>{run.tool}</code></td>
                <td><span className={`foundry-jobs-pill ${run.ok ? 'foundry-jobs-pill--ok' : 'foundry-jobs-pill--error'}`}>{run.ok ? 'ok' : 'failed'}</span></td>
                <td>{run.kind || run.status || '—'}</td>
                <td>{run.artifactPaths.length + run.recordIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OutputList({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: Array<{ key: string; heading: string; meta: string; body: string }>
}): JSX.Element {
  return (
    <div className="foundry-jobs-output-list">
      <h4>{title}</h4>
      {items.length === 0 ? <p className="foundry-jobs-muted">{empty}</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <div>
                <strong>{item.heading}</strong>
                {item.meta && <span>{item.meta}</span>}
              </div>
              {item.body && <code>{item.body}</code>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FoundryJobsStyles(): JSX.Element {
  return (
    <style>{`
      .foundry-jobs-page {
        height: 100%;
        overflow: auto;
        padding: 1rem;
        background: #f8fafc;
        color: #172033;
      }
      .foundry-jobs-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .foundry-jobs-header h1,
      .foundry-jobs-card h2,
      .foundry-jobs-card h3,
      .foundry-jobs-output-list h4 {
        margin: 0;
        letter-spacing: 0;
      }
      .foundry-jobs-header h1 {
        font-size: 1.25rem;
      }
      .foundry-jobs-card h2 {
        font-size: 1rem;
      }
      .foundry-jobs-card h3 {
        font-size: 0.92rem;
      }
      .foundry-jobs-output-list h4 {
        font-size: 0.78rem;
        text-transform: uppercase;
        color: #64748b;
      }
      .foundry-jobs-header p,
      .foundry-jobs-card__header p,
      .foundry-jobs-muted,
      .foundry-jobs-error p {
        margin: 0.35rem 0 0;
        color: #5b677a;
        font-size: 0.82rem;
      }
      .foundry-jobs-header__actions,
      .foundry-jobs-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .foundry-jobs-header__actions button,
      .foundry-jobs-actions button,
      .foundry-jobs-error button,
      .foundry-jobs-button {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        color: #1f2937;
        padding: 0.42rem 0.7rem;
        font-size: 0.8rem;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .foundry-jobs-header__actions button:disabled,
      .foundry-jobs-actions button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .foundry-jobs-counts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.65rem;
        margin-bottom: 1rem;
      }
      .foundry-jobs-create {
        margin-bottom: 1rem;
      }
      .foundry-jobs-create__controls {
        display: grid;
        grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto;
        gap: 0.75rem;
        align-items: end;
      }
      .foundry-jobs-create label {
        display: grid;
        gap: 0.3rem;
      }
      .foundry-jobs-create label span {
        color: #64748b;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
      }
      .foundry-jobs-create select,
      .foundry-jobs-create textarea {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        color: #172033;
        font: inherit;
        font-size: 0.84rem;
      }
      .foundry-jobs-create select {
        min-height: 2.35rem;
        padding: 0 0.55rem;
      }
      .foundry-jobs-create textarea {
        min-height: 2.35rem;
        max-height: 8rem;
        resize: vertical;
        padding: 0.55rem;
      }
      .foundry-jobs-create button {
        min-height: 2.35rem;
        border: 1px solid #2563eb;
        border-radius: 6px;
        background: #2563eb;
        color: #fff;
        padding: 0 0.85rem;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
      }
      .foundry-jobs-create button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .foundry-jobs-create__error {
        margin: 0.6rem 0 0;
        color: #991b1b;
        font-size: 0.8rem;
      }
      .foundry-jobs-count,
      .foundry-jobs-card,
      .foundry-jobs-list,
      .foundry-jobs-error {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .foundry-jobs-count {
        padding: 0.75rem;
      }
      .foundry-jobs-count span {
        display: block;
        color: #64748b;
        font-size: 0.75rem;
        text-transform: uppercase;
      }
      .foundry-jobs-count strong {
        display: block;
        margin-top: 0.25rem;
        font-size: 1.25rem;
      }
      .foundry-jobs-layout {
        display: grid;
        grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
        gap: 1rem;
        align-items: start;
      }
      .foundry-jobs-list {
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        max-height: calc(100vh - 13rem);
        overflow: auto;
      }
      .foundry-jobs-list-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.3rem 0.5rem;
        align-items: center;
        width: 100%;
        text-align: left;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        padding: 0.6rem;
        color: inherit;
        cursor: pointer;
      }
      .foundry-jobs-list-item--selected,
      .foundry-jobs-list-item:hover {
        border-color: #bfdbfe;
        background: #eff6ff;
      }
      .foundry-jobs-list-item span {
        grid-column: 1 / -1;
        font-size: 0.82rem;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .foundry-jobs-list-item strong {
        color: #64748b;
        font-size: 0.72rem;
      }
      .foundry-jobs-detail {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
      }
      .foundry-jobs-card,
      .foundry-jobs-error {
        padding: 0.9rem;
      }
      .foundry-jobs-card__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 0.65rem;
      }
      .foundry-jobs-prompt {
        margin: 0;
        color: #334155;
        font-size: 0.88rem;
      }
      .foundry-jobs-next-action {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        margin-top: 0.75rem;
        padding: 0.65rem;
        border-radius: 6px;
        background: #f8fafc;
      }
      .foundry-jobs-next-action p {
        margin: 0;
        font-size: 0.82rem;
        color: #334155;
      }
      .foundry-jobs-grid,
      .foundry-jobs-output-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
      .foundry-jobs-output-list ul {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .foundry-jobs-output-list li {
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 0.55rem;
        min-width: 0;
      }
      .foundry-jobs-output-list li div {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .foundry-jobs-output-list li strong {
        font-size: 0.8rem;
      }
      .foundry-jobs-output-list li span {
        color: #64748b;
        font-size: 0.72rem;
        white-space: nowrap;
      }
      .foundry-jobs-output-list code,
      .foundry-jobs-tool-table code {
        display: block;
        margin-top: 0.35rem;
        color: #334155;
        font-size: 0.74rem;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .foundry-jobs-tool-table-wrap {
        overflow: auto;
        margin-top: 0.9rem;
      }
      .foundry-jobs-tool-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8rem;
      }
      .foundry-jobs-tool-table th,
      .foundry-jobs-tool-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 0.45rem;
        text-align: left;
      }
      .foundry-jobs-tool-table th {
        color: #64748b;
        font-size: 0.72rem;
        text-transform: uppercase;
      }
      .foundry-jobs-events {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        max-height: 360px;
        overflow: auto;
      }
      .foundry-jobs-event {
        border-left: 3px solid #cbd5e1;
        padding-left: 0.5rem;
      }
      .foundry-jobs-event span,
      .foundry-jobs-event strong {
        font-size: 0.72rem;
        color: #64748b;
      }
      .foundry-jobs-event strong {
        margin-left: 0.4rem;
        color: #334155;
      }
      .foundry-jobs-event p {
        margin: 0.2rem 0 0;
        font-size: 0.78rem;
      }
      .foundry-jobs-report {
        margin: 0;
        white-space: pre-wrap;
        overflow: auto;
        max-height: 360px;
        color: #334155;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.78rem;
      }
      .foundry-jobs-detail .foundry-jobs-card textarea {
        width: 100%;
        min-height: 5.5rem;
        resize: vertical;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0.65rem;
        font: inherit;
        font-size: 0.84rem;
        margin: 0.6rem 0;
      }
      .foundry-jobs-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 1.35rem;
        border-radius: 999px;
        background: #e2e8f0;
        color: #334155;
        padding: 0.12rem 0.5rem;
        font-size: 0.72rem;
        font-weight: 700;
        white-space: nowrap;
      }
      .foundry-jobs-pill--active {
        background: #dbeafe;
        color: #1d4ed8;
      }
      .foundry-jobs-pill--ok {
        background: #dcfce7;
        color: #166534;
      }
      .foundry-jobs-pill--warn {
        background: #fef3c7;
        color: #92400e;
      }
      .foundry-jobs-pill--error {
        background: #fee2e2;
        color: #991b1b;
      }
      .foundry-jobs-empty {
        color: #64748b;
        font-size: 0.9rem;
      }
      @media (max-width: 900px) {
        .foundry-jobs-header,
        .foundry-jobs-layout,
        .foundry-jobs-create__controls,
        .foundry-jobs-grid,
        .foundry-jobs-output-grid {
          grid-template-columns: 1fr;
        }
        .foundry-jobs-header {
          display: block;
        }
        .foundry-jobs-header__actions {
          margin-top: 0.75rem;
        }
        .foundry-jobs-list {
          max-height: none;
        }
      }
    `}</style>
  )
}
