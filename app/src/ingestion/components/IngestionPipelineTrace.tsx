import type { IngestionJobDetail, IngestionJobStage } from '../../types/ingestion'
import type { IngestionTreeNode } from './IngestionArtifactTree'

const STAGES: IngestionJobStage[] = ['collect', 'extract', 'normalize', 'match', 'review', 'publish']

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function stageIndex(stage: IngestionJobStage): number {
  return STAGES.indexOf(stage)
}

interface Props {
  detail: IngestionJobDetail | null
  onSelectIssue: (node: IngestionTreeNode) => void
}

export function IngestionPipelineTrace({ detail, onSelectIssue }: Props) {
  if (!detail) {
    return <div className="itrace-empty">No job selected.</div>
  }
  const job = detail.job.payload
  const current = stageIndex(job.stage)
  const isFailed = job.status === 'failed'
  const isDone = job.status === 'published'

  const issueCounts = detail.issues.reduce(
    (acc, issue) => {
      acc[issue.payload.severity] = (acc[issue.payload.severity] ?? 0) + 1
      return acc
    },
    { info: 0, warning: 0, error: 0 } as Record<'info' | 'warning' | 'error', number>,
  )

  return (
    <div className="itrace">
      <section className="itrace__section">
        <h3 className="itrace__title">Pipeline</h3>
        <ol className="itrace__stages">
          {STAGES.map((stage, index) => {
            const state =
              isFailed && index === current ? 'failed'
              : isDone ? 'done'
              : index < current ? 'done'
              : index === current ? (job.status === 'running' ? 'running' : 'active')
              : 'pending'
            return (
              <li key={stage} className={`itrace-stage itrace-stage--${state}`}>
                <span className="itrace-stage__dot">
                  {state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'running' ? '●' : ''}
                </span>
                <span className="itrace-stage__label">{humanize(stage)}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="itrace__section">
        <h3 className="itrace__title">Status</h3>
        <div className="itrace__status-row">
          <span className={`ingestion-badge ${isFailed ? 'ingestion-badge--error' : ''}`}>{humanize(job.status)}</span>
          {job.started_at && <span className="itrace__sub">started {new Date(job.started_at).toLocaleTimeString()}</span>}
          {job.completed_at && <span className="itrace__sub">completed {new Date(job.completed_at).toLocaleTimeString()}</span>}
        </div>
      </section>

      {job.progress && (
        <section className="itrace__section">
          <h3 className="itrace__title">{humanize(job.progress.phase)}</h3>
          <div className="itrace__progress-bar">
            <div className="itrace__progress-fill" style={{ width: `${job.progress.percent ?? 0}%` }} />
          </div>
          <div className="itrace__progress-label">
            {job.progress.message ?? `${job.progress.current} / ${job.progress.total} ${job.progress.unit}`}
          </div>
          {job.progress.updated_at && (
            <div className="itrace__sub">updated {new Date(job.progress.updated_at).toLocaleTimeString()}</div>
          )}
        </section>
      )}

      <section className="itrace__section">
        <h3 className="itrace__title">Diagnostics</h3>
        {detail.issues.length === 0 ? (
          <p className="itrace__sub">No issues.</p>
        ) : (
          <>
            <div className="itrace__issue-counts">
              {issueCounts.error > 0 && <span className="ingestion-badge ingestion-badge--error">{issueCounts.error} error</span>}
              {issueCounts.warning > 0 && <span className="ingestion-badge ingestion-badge--warning">{issueCounts.warning} warning</span>}
              {issueCounts.info > 0 && <span className="ingestion-badge">{issueCounts.info} info</span>}
            </div>
            <ul className="itrace__issue-list">
              {detail.issues.slice(0, 12).map((issue) => (
                <li key={issue.recordId}>
                  <button
                    type="button"
                    className={`itrace__issue itrace__issue--${issue.payload.severity}`}
                    onClick={() => onSelectIssue({ kind: 'issue', recordId: issue.recordId })}
                  >
                    <span className="itrace__issue-icon">
                      {issue.payload.severity === 'error' ? '⛔' : issue.payload.severity === 'warning' ? '⚠' : 'ℹ'}
                    </span>
                    <span className="itrace__issue-title">{issue.payload.title}</span>
                    <span className="itrace__sub">{humanize(issue.payload.issue_type)}</span>
                  </button>
                </li>
              ))}
              {detail.issues.length > 12 && (
                <li className="itrace__sub">… and {detail.issues.length - 12} more</li>
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
