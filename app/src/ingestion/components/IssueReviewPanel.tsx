import type { IngestionIssueRecord } from '../../types/ingestion'

export function IssueReviewPanel({ issues }: { issues: IngestionIssueRecord[] }) {
  if (issues.length === 0) {
    return <div className="ingestion-empty">No issues recorded yet.</div>
  }

  return (
    <div className="ingestion-card-grid">
      {issues.map((issue) => (
        <article key={issue.recordId} className="ingestion-card">
          <div className="ingestion-card__head">
            <div>
              <h4>{issue.payload.title}</h4>
              <p>{issue.payload.issue_type.replace(/_/g, ' ')}</p>
            </div>
            <span className={`ingestion-badge ingestion-badge--${issue.payload.severity}`}>{issue.payload.severity}</span>
          </div>
          {issue.payload.detail && <p className="ingestion-card__summary">{issue.payload.detail}</p>}
        </article>
      ))}
    </div>
  )
}
