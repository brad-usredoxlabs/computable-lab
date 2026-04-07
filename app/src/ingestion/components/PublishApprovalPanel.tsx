import type { IngestionBundleRecord } from '../../types/ingestion'

export function PublishApprovalPanel(props: {
  bundle: IngestionBundleRecord
  busy: boolean
  onApprove: () => void
  onPublish: () => void
}) {
  const { bundle, busy, onApprove, onPublish } = props
  const approved = bundle.payload.status === 'approved' || bundle.payload.status === 'published'
  const published = bundle.payload.status === 'published'

  return (
    <article className="ingestion-card">
      <div className="ingestion-card__head">
        <div>
          <h4>{bundle.payload.title}</h4>
          <p>{bundle.payload.status.replace(/_/g, ' ')}</p>
        </div>
      </div>
      {bundle.payload.summary && <p className="ingestion-card__summary">{bundle.payload.summary}</p>}
      <div className="ingestion-actions">
        <button type="button" className="btn btn-secondary" onClick={onApprove} disabled={busy || approved}>
          {approved ? 'Approved' : 'Approve'}
        </button>
        <button type="button" className="btn btn-primary" onClick={onPublish} disabled={busy || !approved || published}>
          {published ? 'Published' : 'Publish'}
        </button>
      </div>
    </article>
  )
}
