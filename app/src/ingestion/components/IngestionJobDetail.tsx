import { CandidateReviewPanel } from './CandidateReviewPanel'
import { CaymanLibraryReviewPanel } from './CaymanLibraryReviewPanel'
import { FormulationVariantReviewPanel } from './FormulationVariantReviewPanel'
import { IngestionBundleSummary } from './IngestionBundleSummary'
import { IngestionIssueExplainer } from './IngestionIssueExplainer'
import { OntologyMappingReview } from './OntologyMappingReview'
import { PublishApprovalPanel } from './PublishApprovalPanel'
import type { IngestionJobDetail } from '../../types/ingestion'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function progressLabel(progress: NonNullable<IngestionJobDetail['job']['payload']['progress']>): string {
  if (progress.message) return progress.message
  if (progress.total > 0) return `${progress.current} of ${progress.total} ${progress.unit}`
  return humanize(progress.phase)
}

export function IngestionJobDetailPanel(props: {
  detail: IngestionJobDetail | null
  busy?: boolean
  jobId?: string | null
  onApproveBundle?: (bundleId: string) => void
  onPublishBundle?: (bundleId: string) => void
}) {
  const { detail, busy = false, jobId, onApproveBundle, onPublishBundle } = props
  if (!detail) {
    return <div className="ingestion-empty">Select a job to inspect its sources, bundles, and review state.</div>
  }

  const job = detail.job.payload
  const screeningLibraryBundle = detail.bundles.find((bundle) => bundle.payload.bundle_type === 'screening_library')

  return (
    <div className="ingestion-detail">
      <section className="ingestion-section">
        <div className="ingestion-section__head">
          <div>
            <p className="ingestion-section__eyebrow">Ingestion Job</p>
            <h3>{job.name}</h3>
          </div>
          <span className="ingestion-badge">{humanize(job.status)}</span>
        </div>
        <div className="ingestion-grid">
          <div className="ingestion-stat"><strong>Source kind</strong><span>{humanize(job.source_kind)}</span></div>
          <div className="ingestion-stat"><strong>Stage</strong><span>{job.stage}</span></div>
          <div className="ingestion-stat"><strong>Ontology preference</strong><span>{Array.isArray(job.ontology_preferences) && job.ontology_preferences.length > 0 ? job.ontology_preferences.join(' → ') : 'default'}</span></div>
          <div className="ingestion-stat"><strong>Artifacts</strong><span>{detail.artifacts.length}</span></div>
          <div className="ingestion-stat"><strong>Bundles</strong><span>{detail.bundles.length}</span></div>
          <div className="ingestion-stat"><strong>Candidates</strong><span>{detail.candidates.length}</span></div>
          <div className="ingestion-stat"><strong>Issues</strong><span>{detail.issues.length}</span></div>
        </div>
        {job.progress && (
          <div className="ingestion-job-progress">
            <div className="ingestion-job-progress__head">
              <strong>{humanize(job.progress.phase)}</strong>
              <span>{job.progress.current} / {job.progress.total} {job.progress.unit}</span>
            </div>
            <div className="ingestion-job-progress__bar">
              <div className="ingestion-job-progress__fill" style={{ width: `${job.progress.percent ?? 0}%` }} />
            </div>
            <div className="ingestion-job-progress__label">{progressLabel(job.progress)}</div>
          </div>
        )}
      </section>

      <section className="ingestion-section">
        <div className="ingestion-section__head">
          <div>
            <p className="ingestion-section__eyebrow">Source Files</p>
            <h3>Artifacts</h3>
          </div>
        </div>
        {detail.artifacts.length === 0 ? (
          <div className="ingestion-empty">No source artifacts attached yet.</div>
        ) : (
          <div className="ingestion-card-grid">
            {detail.artifacts.map((artifact) => (
              <article key={artifact.recordId} className="ingestion-card">
                <div className="ingestion-card__head">
                  <div>
                    <h4>{artifact.payload.file_ref?.file_name || artifact.payload.source_url || artifact.recordId}</h4>
                    <p>{humanize(artifact.payload.artifact_role)}</p>
                  </div>
                </div>
                <div className="ingestion-card__meta">
                  <span>{artifact.payload.file_ref?.media_type || artifact.payload.media_type || 'unknown media type'}</span>
                  <span>{artifact.payload.provenance?.source_type || 'manual'}</span>
                  {artifact.payload.table_extracts?.length ? <span>{artifact.payload.table_extracts.length} extracted tables</span> : null}
                  {artifact.payload.html_extract?.variant_count ? <span>{artifact.payload.html_extract.variant_count} variants</span> : null}
                </div>
                {artifact.payload.text_extract?.excerpt && <p className="ingestion-card__summary">{artifact.payload.text_extract.excerpt}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="ingestion-section">
        <div className="ingestion-section__head">
          <div>
            <p className="ingestion-section__eyebrow">Review Surface</p>
            <h3>Bundles</h3>
          </div>
        </div>
        {detail.bundles.length === 0 ? (
          <div className="ingestion-empty">No review bundles yet. This Milestone A shell is ready for adapter output.</div>
        ) : (
          <>
            <div className="ingestion-card-grid">
              {detail.bundles.map((bundle) => <IngestionBundleSummary key={bundle.recordId} bundle={bundle} />)}
            </div>
            {(onApproveBundle || onPublishBundle) && (
              <div className="ingestion-card-grid" style={{ marginTop: '0.75rem' }}>
                {detail.bundles.map((bundle) => (
                  <PublishApprovalPanel
                    key={`${bundle.recordId}-approval`}
                    bundle={bundle}
                    busy={busy}
                    onApprove={() => onApproveBundle?.(bundle.recordId)}
                    onPublish={() => onPublishBundle?.(bundle.recordId)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {screeningLibraryBundle && (
        <CaymanLibraryReviewPanel
          artifacts={detail.artifacts}
          bundle={screeningLibraryBundle}
          candidates={detail.candidates}
          issues={detail.issues}
        />
      )}

      <FormulationVariantReviewPanel candidates={detail.candidates} />

      <section className="ingestion-section">
        <div className="ingestion-section__head">
          <div>
            <p className="ingestion-section__eyebrow">Review Candidates</p>
            <h3>Candidates</h3>
          </div>
        </div>
        <CandidateReviewPanel candidates={detail.candidates} />
      </section>

      {detail.issues.length > 0 && (
        <section className="ingestion-section">
          <div className="ingestion-section__head">
            <div>
              <p className="ingestion-section__eyebrow">Issues</p>
              <h3>{detail.issues.length} issue{detail.issues.length !== 1 ? 's' : ''}</h3>
            </div>
          </div>
          <div className="ingestion-issues-list">
            {detail.issues.map((issue) => (
              <div key={issue.recordId} className="ingestion-issue">
                <div className="ingestion-issue__head">
                  <span className={`ingestion-badge ${issue.payload.severity === 'error' ? 'ingestion-badge--error' : issue.payload.severity === 'warning' ? 'ingestion-badge--warning' : ''}`}>
                    {issue.payload.severity}
                  </span>
                  <strong>{issue.payload.title}</strong>
                  <span className="ingestion-issue__type">{humanize(issue.payload.issue_type)}</span>
                </div>
                {issue.payload.detail && <p className="ingestion-issue__detail">{issue.payload.detail}</p>}
                {jobId && <IngestionIssueExplainer issue={issue} jobId={jobId} />}
              </div>
            ))}
          </div>
        </section>
      )}

      <OntologyMappingReview candidates={detail.candidates} />
      <style>{`
        .ingestion-job-progress { margin-top: 1rem; display: grid; gap: 0.4rem; }
        .ingestion-job-progress__head { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.9rem; color: #334155; }
        .ingestion-job-progress__bar { height: 0.5rem; border-radius: 999px; background: #e9ecef; overflow: hidden; }
        .ingestion-job-progress__fill { height: 100%; background: #1864ab; transition: width 160ms ease; }
        .ingestion-job-progress__label { font-size: 0.82rem; color: #64748b; }
        .ingestion-issues-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .ingestion-issue { padding: 0.6rem 0.75rem; border: 1px solid #f1f3f5; border-radius: 10px; }
        .ingestion-issue__head { display: flex; align-items: center; gap: 0.5rem; }
        .ingestion-issue__type { font-size: 0.78rem; color: #868e96; }
        .ingestion-issue__detail { margin: 0.3rem 0 0; color: #495057; font-size: 0.85rem; }
      `}</style>
    </div>
  )
}
