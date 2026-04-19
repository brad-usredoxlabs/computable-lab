import { useState } from 'react'
import type {
  IngestionJobDetail,
  IngestionArtifactRecord,
  IngestionBundleRecord,
  IngestionCandidateRecord,
  IngestionIssueRecord,
} from '../../types/ingestion'

export type IngestionTreeNode =
  | { kind: 'job' }
  | { kind: 'artifact'; recordId: string }
  | { kind: 'bundle'; recordId: string }
  | { kind: 'candidate'; recordId: string }
  | { kind: 'issue'; recordId: string }

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function artifactLabel(artifact: IngestionArtifactRecord): string {
  return artifact.payload.file_ref?.file_name
    || artifact.payload.source_url
    || artifact.payload.id
    || artifact.recordId
}

function artifactIcon(artifact: IngestionArtifactRecord): string {
  const mime = artifact.payload.file_ref?.media_type || artifact.payload.media_type || ''
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
  if (mime.includes('html') || mime.includes('text')) return '📃'
  return '📎'
}

function candidatesInBundle(
  bundle: IngestionBundleRecord,
  allCandidates: IngestionCandidateRecord[],
): IngestionCandidateRecord[] {
  const refs = bundle.payload.candidate_refs
  if (!refs || refs.length === 0) return []
  const ids = new Set(refs.map((ref) => ref.id))
  return allCandidates.filter((cand) => ids.has(cand.recordId) || ids.has(cand.payload.id))
}

function issuesInBundle(
  bundle: IngestionBundleRecord,
  allIssues: IngestionIssueRecord[],
): IngestionIssueRecord[] {
  const refs = bundle.payload.issue_refs
  if (!refs || refs.length === 0) return []
  const ids = new Set(refs.map((ref) => ref.id))
  return allIssues.filter((issue) => ids.has(issue.recordId) || ids.has(issue.payload.id))
}

function isSelected(
  selection: IngestionTreeNode | null,
  kind: IngestionTreeNode['kind'],
  recordId?: string,
): boolean {
  if (!selection) return false
  if (selection.kind !== kind) return false
  if (kind === 'job') return true
  return 'recordId' in selection && selection.recordId === recordId
}

interface GroupProps {
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}

function Group({ label, count, defaultOpen = true, children }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="itree-group">
      <button type="button" className="itree-group__head" onClick={() => setOpen((v) => !v)}>
        <span className="itree-twisty">{open ? '▾' : '▸'}</span>
        <span className="itree-group__label">{label}</span>
        <span className="itree-group__count">{count}</span>
      </button>
      {open && <div className="itree-group__body">{children}</div>}
    </div>
  )
}

interface Props {
  detail: IngestionJobDetail | null
  selection: IngestionTreeNode | null
  onSelect: (node: IngestionTreeNode) => void
}

export function IngestionArtifactTree({ detail, selection, onSelect }: Props) {
  if (!detail) {
    return <div className="itree-empty">Select or create a job to see its artifacts.</div>
  }

  const { artifacts, bundles, candidates, issues } = detail
  const referencedCandidateIds = new Set<string>()
  const referencedIssueIds = new Set<string>()
  for (const bundle of bundles) {
    for (const ref of bundle.payload.candidate_refs ?? []) referencedCandidateIds.add(ref.id)
    for (const ref of bundle.payload.issue_refs ?? []) referencedIssueIds.add(ref.id)
  }
  const orphanCandidates = candidates.filter(
    (c) => !referencedCandidateIds.has(c.recordId) && !referencedCandidateIds.has(c.payload.id),
  )
  const orphanIssues = issues.filter(
    (i) => !referencedIssueIds.has(i.recordId) && !referencedIssueIds.has(i.payload.id),
  )

  return (
    <div className="itree">
      <button
        type="button"
        className={`itree-root ${isSelected(selection, 'job') ? 'itree-row--selected' : ''}`}
        onClick={() => onSelect({ kind: 'job' })}
      >
        <span className="itree-root__icon">🧪</span>
        <span className="itree-root__label">{detail.job.payload.name}</span>
        <span className="itree-root__badge">{humanize(detail.job.payload.status)}</span>
      </button>

      <Group label="Source artifacts" count={artifacts.length}>
        {artifacts.length === 0 && <div className="itree-empty">No artifacts.</div>}
        {artifacts.map((artifact) => (
          <button
            type="button"
            key={artifact.recordId}
            className={`itree-row ${isSelected(selection, 'artifact', artifact.recordId) ? 'itree-row--selected' : ''}`}
            onClick={() => onSelect({ kind: 'artifact', recordId: artifact.recordId })}
          >
            <span className="itree-row__icon">{artifactIcon(artifact)}</span>
            <span className="itree-row__label" title={artifactLabel(artifact)}>{artifactLabel(artifact)}</span>
            <span className="itree-row__sub">{humanize(artifact.payload.artifact_role)}</span>
          </button>
        ))}
      </Group>

      <Group label="Bundles" count={bundles.length}>
        {bundles.length === 0 && <div className="itree-empty">No bundles yet. Run the job to produce candidates.</div>}
        {bundles.map((bundle) => {
          const bundleCandidates = candidatesInBundle(bundle, candidates)
          const bundleIssues = issuesInBundle(bundle, issues)
          return (
            <div key={bundle.recordId} className="itree-bundle">
              <button
                type="button"
                className={`itree-row ${isSelected(selection, 'bundle', bundle.recordId) ? 'itree-row--selected' : ''}`}
                onClick={() => onSelect({ kind: 'bundle', recordId: bundle.recordId })}
              >
                <span className="itree-row__icon">📦</span>
                <span className="itree-row__label" title={bundle.payload.title}>{bundle.payload.title}</span>
                <span className="itree-row__sub">{humanize(bundle.payload.status)}</span>
              </button>
              <div className="itree-bundle__children">
                {bundleCandidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.recordId}
                    candidate={candidate}
                    selected={isSelected(selection, 'candidate', candidate.recordId)}
                    onSelect={onSelect}
                  />
                ))}
                {bundleIssues.map((issue) => (
                  <IssueRow
                    key={issue.recordId}
                    issue={issue}
                    selected={isSelected(selection, 'issue', issue.recordId)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </Group>

      {orphanCandidates.length > 0 && (
        <Group label="Candidates (unbundled)" count={orphanCandidates.length} defaultOpen={false}>
          {orphanCandidates.map((candidate) => (
            <CandidateRow
              key={candidate.recordId}
              candidate={candidate}
              selected={isSelected(selection, 'candidate', candidate.recordId)}
              onSelect={onSelect}
            />
          ))}
        </Group>
      )}

      {orphanIssues.length > 0 && (
        <Group label="Issues (unbundled)" count={orphanIssues.length}>
          {orphanIssues.map((issue) => (
            <IssueRow
              key={issue.recordId}
              issue={issue}
              selected={isSelected(selection, 'issue', issue.recordId)}
              onSelect={onSelect}
            />
          ))}
        </Group>
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: IngestionCandidateRecord
  selected: boolean
  onSelect: (node: IngestionTreeNode) => void
}) {
  return (
    <button
      type="button"
      className={`itree-row itree-row--nested ${selected ? 'itree-row--selected' : ''}`}
      onClick={() => onSelect({ kind: 'candidate', recordId: candidate.recordId })}
    >
      <span className="itree-row__icon">•</span>
      <span className="itree-row__label" title={candidate.payload.title}>{candidate.payload.title}</span>
      <span className="itree-row__sub">{humanize(candidate.payload.candidate_type)}</span>
    </button>
  )
}

function IssueRow({
  issue,
  selected,
  onSelect,
}: {
  issue: IngestionIssueRecord
  selected: boolean
  onSelect: (node: IngestionTreeNode) => void
}) {
  const icon = issue.payload.severity === 'error' ? '⛔' : issue.payload.severity === 'warning' ? '⚠' : 'ℹ'
  return (
    <button
      type="button"
      className={`itree-row itree-row--nested itree-row--issue-${issue.payload.severity} ${selected ? 'itree-row--selected' : ''}`}
      onClick={() => onSelect({ kind: 'issue', recordId: issue.recordId })}
    >
      <span className="itree-row__icon">{icon}</span>
      <span className="itree-row__label" title={issue.payload.title}>{issue.payload.title}</span>
      <span className="itree-row__sub">{humanize(issue.payload.issue_type)}</span>
    </button>
  )
}
