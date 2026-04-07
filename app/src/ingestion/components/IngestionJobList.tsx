import type { IngestionJobSummary } from '../../types/ingestion'

interface Props {
  items: IngestionJobSummary[]
  selectedJobId: string | null
  onSelect: (jobId: string) => void
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function progressLabel(job: IngestionJobSummary): string | null {
  const progress = job.progress
  if (!progress) return null
  if (progress.total <= 0) return progress.message ?? null
  return progress.message ?? `${progress.current} of ${progress.total} ${progress.unit}`
}

export function IngestionJobList({ items, selectedJobId, onSelect }: Props) {
  if (items.length === 0) {
    return <div className="ingestion-empty">No ingestion jobs yet.</div>
  }

  return (
    <div className="ingestion-list">
      {items.map((job) => (
        <button
          key={job.id}
          type="button"
          className={`ingestion-list__item ${selectedJobId === job.id ? 'ingestion-list__item--selected' : ''}`}
          onClick={() => onSelect(job.id)}
        >
          <div className="ingestion-list__title">{job.name}</div>
          <div className="ingestion-list__meta">
            <span>{humanize(job.sourceKind)}</span>
            <span>{job.stage}</span>
            <span>{humanize(job.status)}</span>
          </div>
          <div className="ingestion-list__meta ingestion-list__meta--counts">
            <span>{job.bundleCount} bundles</span>
            <span>{job.candidateCount} candidates</span>
            <span>{job.issueCount} issues</span>
          </div>
          {job.progress && (
            <div className="ingestion-list__progress">
              <div className="ingestion-list__progress-bar">
                <div
                  className="ingestion-list__progress-fill"
                  style={{ width: `${job.progress.percent ?? 0}%` }}
                />
              </div>
              <div className="ingestion-list__progress-label">{progressLabel(job)}</div>
            </div>
          )}
        </button>
      ))}
      <style>{`
        .ingestion-list__progress { margin-top: 0.55rem; display: grid; gap: 0.3rem; }
        .ingestion-list__progress-bar { height: 0.4rem; border-radius: 999px; background: #e9ecef; overflow: hidden; }
        .ingestion-list__progress-fill { height: 100%; background: #1864ab; transition: width 160ms ease; }
        .ingestion-list__progress-label { font-size: 0.78rem; color: #64748b; text-align: left; }
      `}</style>
    </div>
  )
}
