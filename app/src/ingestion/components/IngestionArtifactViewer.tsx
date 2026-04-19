import type {
  IngestionJobDetail,
  IngestionArtifactRecord,
  IngestionBundleRecord,
  IngestionCandidateRecord,
  IngestionIssueRecord,
} from '../../types/ingestion'
import { IngestionIssueExplainer } from './IngestionIssueExplainer'
import { PublishApprovalPanel } from './PublishApprovalPanel'
import type { IngestionTreeNode } from './IngestionArtifactTree'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

interface Props {
  detail: IngestionJobDetail
  selection: IngestionTreeNode | null
  jobId: string | null
  busy: boolean
  onApproveBundle: (bundleId: string) => void
  onPublishBundle: (bundleId: string) => void
}

export function IngestionArtifactViewer(props: Props) {
  const { detail, selection, jobId, busy, onApproveBundle, onPublishBundle } = props
  const node = selection ?? { kind: 'job' as const }

  if (node.kind === 'job') {
    return <JobView detail={detail} />
  }
  if (node.kind === 'artifact') {
    const artifact = detail.artifacts.find((a) => a.recordId === node.recordId)
    if (!artifact) return <NotFound label="artifact" />
    return <ArtifactView artifact={artifact} />
  }
  if (node.kind === 'bundle') {
    const bundle = detail.bundles.find((b) => b.recordId === node.recordId)
    if (!bundle) return <NotFound label="bundle" />
    return (
      <BundleView
        bundle={bundle}
        detail={detail}
        busy={busy}
        onApprove={() => onApproveBundle(bundle.recordId)}
        onPublish={() => onPublishBundle(bundle.recordId)}
      />
    )
  }
  if (node.kind === 'candidate') {
    const candidate = detail.candidates.find((c) => c.recordId === node.recordId)
    if (!candidate) return <NotFound label="candidate" />
    return <CandidateView candidate={candidate} />
  }
  if (node.kind === 'issue') {
    const issue = detail.issues.find((i) => i.recordId === node.recordId)
    if (!issue) return <NotFound label="issue" />
    return <IssueView issue={issue} jobId={jobId} />
  }
  return null
}

function NotFound({ label }: { label: string }) {
  return <div className="iview-empty">Selected {label} is no longer available. Pick another item in the tree.</div>
}

function JobView({ detail }: { detail: IngestionJobDetail }) {
  const job = detail.job.payload
  return (
    <div className="iview">
      <header className="iview__head">
        <div>
          <p className="iview__eyebrow">Ingestion job</p>
          <h2>{job.name}</h2>
        </div>
        <span className="ingestion-badge">{humanize(job.status)}</span>
      </header>
      <div className="iview__grid">
        <KeyVal k="Source kind" v={humanize(job.source_kind)} />
        <KeyVal k="Stage" v={job.stage} />
        <KeyVal k="Submitted" v={new Date(job.submitted_at).toLocaleString()} />
        {job.started_at && <KeyVal k="Started" v={new Date(job.started_at).toLocaleString()} />}
        {job.completed_at && <KeyVal k="Completed" v={new Date(job.completed_at).toLocaleString()} />}
        <KeyVal
          k="Ontology preference"
          v={job.ontology_preferences?.length ? job.ontology_preferences.join(' → ') : 'default'}
        />
        <KeyVal k="Artifacts" v={String(detail.artifacts.length)} />
        <KeyVal k="Bundles" v={String(detail.bundles.length)} />
        <KeyVal k="Candidates" v={String(detail.candidates.length)} />
        <KeyVal k="Issues" v={String(detail.issues.length)} />
      </div>
      <p className="iview__hint">Select an artifact, bundle, candidate, or issue in the tree to inspect it.</p>
    </div>
  )
}

function ArtifactView({ artifact }: { artifact: IngestionArtifactRecord }) {
  const p = artifact.payload
  const filename = p.file_ref?.file_name || p.source_url || p.id
  const mediaType = p.file_ref?.media_type || p.media_type || 'unknown'
  return (
    <div className="iview">
      <header className="iview__head">
        <div>
          <p className="iview__eyebrow">Source artifact · {humanize(p.artifact_role)}</p>
          <h2>{filename}</h2>
        </div>
      </header>
      <div className="iview__grid">
        <KeyVal k="Media type" v={mediaType} />
        {p.file_ref?.size_bytes != null && <KeyVal k="Size" v={formatBytes(p.file_ref.size_bytes)} />}
        {p.file_ref?.sha256 && <KeyVal k="SHA-256" v={p.file_ref.sha256.slice(0, 16) + '…'} />}
        {p.source_url && <KeyVal k="URL" v={p.source_url} />}
        {p.provenance?.source_type && <KeyVal k="Provenance" v={p.provenance.source_type} />}
      </div>

      {p.text_extract?.excerpt && (
        <section className="iview__section">
          <h3>Text extract {p.text_extract.method ? <span className="iview__sub">· {p.text_extract.method}</span> : null}</h3>
          <pre className="iview__pre">{p.text_extract.excerpt}</pre>
        </section>
      )}

      {p.html_extract && (
        <section className="iview__section">
          <h3>HTML extract {p.html_extract.method ? <span className="iview__sub">· {p.html_extract.method}</span> : null}</h3>
          <div className="iview__grid">
            {p.html_extract.title && <KeyVal k="Title" v={p.html_extract.title} />}
            {p.html_extract.vendor && <KeyVal k="Vendor" v={p.html_extract.vendor} />}
            {p.html_extract.variant_count != null && <KeyVal k="Variants" v={String(p.html_extract.variant_count)} />}
          </div>
        </section>
      )}

      {p.table_extracts?.length ? (
        <section className="iview__section">
          <h3>Table extracts</h3>
          <table className="iview__table">
            <thead><tr><th>ID</th><th>Page</th><th>Rows</th><th>Note</th></tr></thead>
            <tbody>
              {p.table_extracts.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.page ?? ''}</td>
                  <td>{t.row_count ?? ''}</td>
                  <td>{t.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {p.provenance?.note && (
        <section className="iview__section">
          <h3>Provenance note</h3>
          <p>{p.provenance.note}</p>
        </section>
      )}
    </div>
  )
}

function BundleView({
  bundle,
  detail,
  busy,
  onApprove,
  onPublish,
}: {
  bundle: IngestionBundleRecord
  detail: IngestionJobDetail
  busy: boolean
  onApprove: () => void
  onPublish: () => void
}) {
  const p = bundle.payload
  return (
    <div className="iview">
      <header className="iview__head">
        <div>
          <p className="iview__eyebrow">Candidate bundle · {humanize(p.bundle_type)}</p>
          <h2>{p.title}</h2>
        </div>
        <span className="ingestion-badge">{humanize(p.status)}</span>
      </header>

      {p.summary && <p className="iview__summary">{p.summary}</p>}

      {p.metrics && Object.keys(p.metrics).length > 0 && (
        <div className="iview__grid">
          {Object.entries(p.metrics).map(([k, v]) => <KeyVal key={k} k={humanize(k)} v={String(v)} />)}
        </div>
      )}

      <section className="iview__section">
        <h3>Approval</h3>
        <PublishApprovalPanel bundle={bundle} busy={busy} onApprove={onApprove} onPublish={onPublish} />
      </section>

      <section className="iview__section">
        <h3>Linked candidates ({p.candidate_refs?.length ?? 0})</h3>
        {p.candidate_refs?.length ? (
          <ul className="iview__list">
            {p.candidate_refs.map((ref) => {
              const candidate = detail.candidates.find((c) => c.recordId === ref.id || c.payload.id === ref.id)
              return (
                <li key={ref.id}>
                  <strong>{candidate?.payload.title ?? ref.label ?? ref.id}</strong>
                  {candidate && <span className="iview__sub"> · {humanize(candidate.payload.candidate_type)}</span>}
                </li>
              )
            })}
          </ul>
        ) : <p className="iview__sub">None.</p>}
      </section>
    </div>
  )
}

function CandidateView({ candidate }: { candidate: IngestionCandidateRecord }) {
  const p = candidate.payload
  return (
    <div className="iview">
      <header className="iview__head">
        <div>
          <p className="iview__eyebrow">Candidate · {humanize(p.candidate_type)}</p>
          <h2>{p.title}</h2>
        </div>
        <span className="ingestion-badge">{humanize(p.status)}</span>
      </header>
      <div className="iview__grid">
        {p.normalized_name && <KeyVal k="Normalized name" v={p.normalized_name} />}
        {p.confidence != null && <KeyVal k="Confidence" v={p.confidence.toFixed(2)} />}
      </div>

      {p.match_refs?.length ? (
        <section className="iview__section">
          <h3>Ontology / material matches</h3>
          <table className="iview__table">
            <thead><tr><th>Label</th><th>Term</th><th>Type</th><th>Score</th></tr></thead>
            <tbody>
              {p.match_refs.map((m, i) => (
                <tr key={`${m.term_id}-${i}`}>
                  <td>{m.label}</td>
                  <td><code>{m.term_id}</code></td>
                  <td>{humanize(m.match_type)}</td>
                  <td>{m.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="iview__section">
        <h3>Payload</h3>
        <pre className="iview__pre">{JSON.stringify(p.payload, null, 2)}</pre>
      </section>
    </div>
  )
}

function IssueView({ issue, jobId }: { issue: IngestionIssueRecord; jobId: string | null }) {
  const p = issue.payload
  return (
    <div className="iview">
      <header className="iview__head">
        <div>
          <p className="iview__eyebrow">Issue · {humanize(p.issue_type)}</p>
          <h2>{p.title}</h2>
        </div>
        <span className={`ingestion-badge ${p.severity === 'error' ? 'ingestion-badge--error' : p.severity === 'warning' ? 'ingestion-badge--warning' : ''}`}>
          {p.severity}
        </span>
      </header>
      <div className="iview__grid">
        <KeyVal k="Resolution" v={humanize(p.resolution_status)} />
      </div>
      {p.detail && (
        <section className="iview__section">
          <h3>Detail</h3>
          <p>{p.detail}</p>
        </section>
      )}
      {jobId && (
        <section className="iview__section">
          <h3>AI explanation</h3>
          <IngestionIssueExplainer issue={issue} jobId={jobId} />
        </section>
      )}
    </div>
  )
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="iview__kv">
      <span className="iview__kv-k">{k}</span>
      <span className="iview__kv-v">{v}</span>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
