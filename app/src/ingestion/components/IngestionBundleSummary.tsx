import type { IngestionBundleRecord } from '../../types/ingestion'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

export function IngestionBundleSummary({ bundle }: { bundle: IngestionBundleRecord }) {
  return (
    <article className="ingestion-card">
      <div className="ingestion-card__head">
        <div>
          <h4>{bundle.payload.title}</h4>
          <p>{humanize(bundle.payload.bundle_type)}</p>
        </div>
        <span className="ingestion-badge">{humanize(bundle.payload.status)}</span>
      </div>
      {bundle.payload.summary && <p className="ingestion-card__summary">{bundle.payload.summary}</p>}
      <div className="ingestion-card__meta">
        <span>{bundle.payload.candidate_refs?.length ?? 0} candidates</span>
        <span>{bundle.payload.issue_refs?.length ?? 0} issues</span>
      </div>
    </article>
  )
}
