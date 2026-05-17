import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, type FoundryManifestIndex, type FoundryOperationalStatus } from '../shared/api/client'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: { status: FoundryOperationalStatus; index: FoundryManifestIndex } }
  | { status: 'error'; message: string }

const COUNT_LABELS: Array<{ key: keyof FoundryOperationalStatus['counts']; label: string }> = [
  { key: 'collected', label: 'PDFs' },
  { key: 'extractedText', label: 'Text' },
  { key: 'compiled', label: 'Compiled' },
  { key: 'architectReviewed', label: 'Architect' },
  { key: 'awaitingHumanReview', label: 'Awaiting review' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'queued', label: 'Queued' },
  { key: 'patching', label: 'Patching' },
  { key: 'implemented', label: 'Implemented' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'failed', label: 'Failed' },
]

function statusClass(value: string): string {
  if (value === 'queued' || value === 'reviewing') return 'foundry-status-pill--active'
  if (value === 'rejected') return 'foundry-status-pill--muted'
  if (value === 'failed' || value === 'blocked' || value === 'stalled') return 'foundry-status-pill--error'
  if (value === 'accepted' || value === 'completed' || value === 'implemented') return 'foundry-status-pill--ok'
  return ''
}

export function FoundryStatusPanel(): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const data = await apiClient.getFoundryStatus()
      setLoadState({ status: 'ready', data })
    } catch (err) {
      setLoadState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const groupedErrors = useMemo(() => {
    if (loadState.status !== 'ready') return []
    const groups = new Map<string, FoundryOperationalStatus['latestErrors']>()
    for (const error of loadState.data.status.latestErrors) {
      const list = groups.get(error.category) ?? []
      list.push(error)
      groups.set(error.category, list)
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [loadState])

  if (loadState.status === 'loading') {
    return <div className="foundry-status-page">Loading Foundry status...</div>
  }

  if (loadState.status === 'error') {
    return (
      <div className="foundry-status-page">
        <div className="foundry-status-error">
          <h1>Foundry Status</h1>
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    )
  }

  const { status, index } = loadState.data

  return (
    <div className="foundry-status-page" data-testid="foundry-status-panel">
      <header className="foundry-status-header">
        <div>
          <h1>Foundry Status</h1>
          <p>{status.protocolCount} protocols, {status.variantCount} variants. Updated {new Date(status.generated_at).toLocaleString()}.</p>
        </div>
        <div className="foundry-status-header__actions">
          <Link to="/protocol-ide" className="foundry-status-link">Review inbox</Link>
          <button type="button" onClick={() => void load()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="foundry-status-counts" aria-label="Foundry pipeline counts">
        {COUNT_LABELS.map((item) => (
          <div key={item.key} className={`foundry-status-count foundry-status-count--${item.key}`}>
            <span>{item.label}</span>
            <strong>{status.counts[item.key]}</strong>
          </div>
        ))}
      </section>

      <section className="foundry-status-section foundry-status-loop" data-testid="foundry-loop-runtime">
        <div className="foundry-status-section__header">
          <h2>Loop Runtime</h2>
          <span className={`foundry-status-pill ${status.loop.running ? 'foundry-status-pill--active' : statusClass(status.loop.status)}`}>
            {status.loop.running ? 'running' : status.loop.status}
          </span>
        </div>
        <div className="foundry-status-loop__facts">
          <span>PID: <strong>{status.loop.pid ?? 'none'}</strong></span>
          <span>Started: <strong>{status.loop.startedAt ? new Date(status.loop.startedAt).toLocaleString() : 'unknown'}</strong></span>
          <span>Runtime data: <code>{status.loop.metadataPath}</code></span>
          <span>Log: <code>{status.loop.logPath ?? 'not configured'}</code></span>
        </div>
        {status.loop.command && <code className="foundry-status-loop__command">{status.loop.command}</code>}
        {status.loop.error && <p className="foundry-status-loop__error">{status.loop.error}</p>}
      </section>

      <section className="foundry-status-grid">
        <div className="foundry-status-section">
          <div className="foundry-status-section__header">
            <h2>Next Tasks</h2>
            <span>{status.nextTasks.length}</span>
          </div>
          {status.nextTasks.length === 0 ? (
            <p className="foundry-status-muted">No runnable tasks reported.</p>
          ) : (
            <div className="foundry-status-task-list">
              {status.nextTasks.slice(0, 12).map((task) => (
                <Link
                  key={`${task.protocolId}/${task.variant}/${task.stage}`}
                  to={`/protocol-ide?protocolId=${encodeURIComponent(task.protocolId)}&variant=${encodeURIComponent(task.variant)}`}
                  className="foundry-status-task"
                >
                  <span>{task.protocolId}</span>
                  <strong>{task.variant}</strong>
                  <em>{task.stage}</em>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="foundry-status-section">
          <div className="foundry-status-section__header">
            <h2>Latest Errors</h2>
            <span>{status.latestErrors.length}</span>
          </div>
          {groupedErrors.length === 0 ? (
            <p className="foundry-status-muted">No recent compiler or loop errors in the rollup.</p>
          ) : (
            <div className="foundry-status-error-groups">
              {groupedErrors.slice(0, 6).map(([category, errors]) => (
                <details key={category} open={groupedErrors.length <= 2}>
                  <summary>
                    <span>{category}</span>
                    <strong>{errors.length}</strong>
                  </summary>
                  <ul>
                    {errors.slice(-5).map((error) => (
                      <li key={`${error.protocolId}/${error.variant}/${error.message}`}>
                        <span>{error.protocolId} / {error.variant}</span>
                        <p>{error.message}</p>
                        {error.artifact && <code>{error.artifact}</code>}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="foundry-status-section">
        <div className="foundry-status-section__header">
          <h2>Manifest Index</h2>
          <span>{index.manifests.length}</span>
        </div>
        <div className="foundry-status-table-wrap">
          <table className="foundry-status-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Variant</th>
                <th>Status</th>
                <th>Review</th>
                <th>Missing</th>
                <th>Manifest</th>
              </tr>
            </thead>
            <tbody>
              {index.manifests.map((manifest) => (
                <tr key={`${manifest.protocolId}/${manifest.variant}`}>
                  <td>
                    <Link to={`/protocol-ide?protocolId=${encodeURIComponent(manifest.protocolId)}&variant=${encodeURIComponent(manifest.variant)}`}>
                      {manifest.protocolId}
                    </Link>
                  </td>
                  <td>{manifest.variant}</td>
                  <td><span className={`foundry-status-pill ${statusClass(manifest.status)}`}>{manifest.status}</span></td>
                  <td><span className={`foundry-status-pill ${statusClass(manifest.humanReviewStatus)}`}>{manifest.humanReviewStatus}</span></td>
                  <td>{manifest.missingArtifactCount}</td>
                  <td><code>{manifest.path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .foundry-status-page {
          height: 100%;
          overflow: auto;
          padding: 1rem;
          background: #f8fafc;
          color: #172033;
        }
        .foundry-status-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .foundry-status-header h1 {
          margin: 0;
          font-size: 1.25rem;
          letter-spacing: 0;
        }
        .foundry-status-header p,
        .foundry-status-muted,
        .foundry-status-error p {
          margin: 0.35rem 0 0;
          color: #5b677a;
          font-size: 0.82rem;
        }
        .foundry-status-header__actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .foundry-status-header__actions button,
        .foundry-status-error button,
        .foundry-status-link {
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
        .foundry-status-header__actions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .foundry-status-counts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.55rem;
          margin-bottom: 1rem;
        }
        .foundry-status-count {
          min-height: 72px;
          border: 1px solid #dde5ef;
          border-radius: 6px;
          background: #fff;
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .foundry-status-count span {
          color: #5b677a;
          font-size: 0.74rem;
          font-weight: 700;
        }
        .foundry-status-count strong {
          color: #111827;
          font-size: 1.35rem;
          letter-spacing: 0;
        }
        .foundry-status-count--failed strong,
        .foundry-status-count--rejected strong {
          color: #b42318;
        }
        .foundry-status-count--queued strong,
        .foundry-status-count--patching strong,
        .foundry-status-count--reviewing strong {
          color: #1d4ed8;
        }
        .foundry-status-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .foundry-status-section,
        .foundry-status-error {
          border: 1px solid #dde5ef;
          border-radius: 6px;
          background: #fff;
          padding: 0.85rem;
        }
        .foundry-status-loop {
          margin-bottom: 1rem;
        }
        .foundry-status-loop__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.45rem;
          margin-bottom: 0.55rem;
        }
        .foundry-status-loop__facts span {
          color: #475569;
          font-size: 0.78rem;
        }
        .foundry-status-loop__facts strong {
          color: #111827;
        }
        .foundry-status-loop__facts code,
        .foundry-status-loop__command {
          color: #475569;
          font-size: 0.72rem;
          overflow-wrap: anywhere;
        }
        .foundry-status-loop__command {
          display: block;
          padding: 0.45rem;
          border: 1px solid #eef2f7;
          border-radius: 6px;
          background: #f8fafc;
        }
        .foundry-status-loop__error {
          margin: 0.55rem 0 0;
          color: #b42318;
          font-size: 0.78rem;
        }
        .foundry-status-section__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.7rem;
        }
        .foundry-status-section__header h2 {
          margin: 0;
          font-size: 0.95rem;
          letter-spacing: 0;
        }
        .foundry-status-section__header span {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .foundry-status-task-list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .foundry-status-task {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 0.5rem;
          align-items: center;
          padding: 0.5rem;
          border: 1px solid #eef2f7;
          border-radius: 6px;
          color: #1f2937;
          text-decoration: none;
        }
        .foundry-status-task:hover {
          background: #f8fafc;
        }
        .foundry-status-task span {
          overflow-wrap: anywhere;
          font-size: 0.78rem;
        }
        .foundry-status-task strong,
        .foundry-status-task em {
          font-size: 0.72rem;
          font-style: normal;
          color: #475569;
        }
        .foundry-status-error-groups {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .foundry-status-error-groups details {
          border: 1px solid #eef2f7;
          border-radius: 6px;
          padding: 0.5rem;
        }
        .foundry-status-error-groups summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .foundry-status-error-groups ul {
          list-style: none;
          padding: 0;
          margin: 0.5rem 0 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .foundry-status-error-groups li {
          border-top: 1px solid #eef2f7;
          padding-top: 0.45rem;
        }
        .foundry-status-error-groups li span,
        .foundry-status-error-groups li p,
        .foundry-status-error-groups li code {
          display: block;
          font-size: 0.72rem;
        }
        .foundry-status-error-groups li span {
          color: #475569;
          font-weight: 700;
        }
        .foundry-status-error-groups li p {
          margin: 0.2rem 0;
          color: #7f1d1d;
        }
        .foundry-status-error-groups li code,
        .foundry-status-table code {
          color: #475569;
          font-size: 0.7rem;
          overflow-wrap: anywhere;
        }
        .foundry-status-table-wrap {
          overflow: auto;
        }
        .foundry-status-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
        }
        .foundry-status-table th,
        .foundry-status-table td {
          text-align: left;
          border-bottom: 1px solid #eef2f7;
          padding: 0.5rem;
          vertical-align: top;
        }
        .foundry-status-table th {
          color: #475569;
          font-weight: 800;
          background: #f8fafc;
        }
        .foundry-status-table a {
          color: #1d4ed8;
          text-decoration: none;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        .foundry-status-pill {
          display: inline-flex;
          border: 1px solid #d7deea;
          border-radius: 6px;
          padding: 0.15rem 0.4rem;
          background: #fff;
          color: #475569;
          font-size: 0.7rem;
          font-weight: 700;
        }
        .foundry-status-pill--active {
          border-color: #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
        }
        .foundry-status-pill--muted {
          border-color: #e5e7eb;
          background: #f9fafb;
          color: #6b7280;
        }
        .foundry-status-pill--error {
          border-color: #fecaca;
          background: #fef2f2;
          color: #b42318;
        }
        .foundry-status-pill--ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }
        @media (max-width: 900px) {
          .foundry-status-header,
          .foundry-status-grid {
            grid-template-columns: 1fr;
          }
          .foundry-status-header {
            flex-direction: column;
          }
          .foundry-status-task {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
