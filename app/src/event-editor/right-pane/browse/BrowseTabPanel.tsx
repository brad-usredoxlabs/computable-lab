/**
 * BrowseTabPanel — workspace right-pane mode that lists the study's
 * artifacts grouped by kind. Clicking a row opens the artifact in the
 * left-pane viewer (deck/pdf/document) via WorkspaceContext.openTab.
 *
 * For Phase 7 this replaces the empty-state "Open PDF…/Open document…"
 * prompts in ProjectWorkspacePage. The plan also calls for surfacing the
 * study's experiments → runs → event graphs alongside the artifacts; that
 * tree is wired in a follow-up since runs don't yet expose a "default
 * event graph" the deck viewer can deep-link to.
 *
 * The panel is intentionally minimal — a tree view library / virtualized
 * row renderer can replace the plain list when the study grows.
 */

import { useMemo } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useStudyArtifacts } from '../useStudyArtifacts'
import { artifactKindLabel, tabForArtifact } from '../openArtifactInViewer'
import type { ArtifactSummary } from '../../../types/artifact'
import './browse.css'

const KIND_ORDER: ArtifactSummary['artifactKind'][] = [
  'protocol',
  'pdf',
  'writeup',
  'conclusion',
  'training',
  'saved-prompt',
]

export function BrowseTabPanel() {
  const ws = useWorkspace()
  const { artifacts, loading, error, refresh } = useStudyArtifacts(ws.state.studyId)

  const grouped = useMemo(() => groupByKind(artifacts), [artifacts])

  return (
    <div className="right-panel browse-tab" data-testid="browse-tab">
      <header className="browse-tab__head">
        <h3 className="right-panel__heading">{ws.state.studyId}</h3>
        <button
          type="button"
          className="browse-tab__refresh"
          onClick={() => void refresh()}
          data-testid="browse-tab-refresh"
          aria-label="Refresh artifact list"
          title="Refresh"
        >
          ↻
        </button>
      </header>
      {error ? <p className="right-panel__error">{error}</p> : null}
      {loading ? (
        <p className="right-panel__hint">Loading artifacts…</p>
      ) : artifacts.length === 0 ? (
        <p className="right-panel__hint">
          No artifacts yet. Phase 9 will pipe ingested vendor PDFs into the
          study automatically; until then you can hand-author one under{' '}
          <code>records/studies/{ws.state.studyId}/artifacts/</code>.
        </p>
      ) : (
        KIND_ORDER.map((kind) => {
          const rows = grouped[kind]
          if (!rows || rows.length === 0) return null
          return (
            <section key={kind} className="browse-tab__group">
              <h4 className="right-panel__heading browse-tab__group-heading">
                {artifactKindLabel(kind)} ({rows.length})
              </h4>
              <div className="right-panel__group">
                {rows.map((row) => (
                  <ArtifactRow key={row.recordId} artifact={row} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function ArtifactRow({ artifact }: { artifact: ArtifactSummary }) {
  const ws = useWorkspace()
  const tab = tabForArtifact(artifact)
  const disabled = tab === null
  return (
    <button
      type="button"
      className="right-panel__row"
      data-testid={`browse-tab-row-${artifact.recordId}`}
      disabled={disabled}
      onClick={() => {
        if (tab) ws.openTab(tab)
      }}
      title={
        disabled
          ? `${artifactKindLabel(artifact.artifactKind)} doesn't have a viewer yet`
          : `Open ${artifact.title}`
      }
    >
      <span className="right-panel__row-title">{artifact.title}</span>
      <span className="right-panel__row-sub">
        {artifact.recordId}
        {artifact.size !== undefined ? ` · ${artifact.size}` : ''}
      </span>
    </button>
  )
}

function groupByKind(
  artifacts: ArtifactSummary[],
): Partial<Record<ArtifactSummary['artifactKind'], ArtifactSummary[]>> {
  const out: Partial<Record<ArtifactSummary['artifactKind'], ArtifactSummary[]>> =
    {}
  for (const a of artifacts) {
    const arr = out[a.artifactKind] ?? []
    arr.push(a)
    out[a.artifactKind] = arr
  }
  return out
}
