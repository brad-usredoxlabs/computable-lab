/**
 * FindTabPanel — Phase 12 right-pane mode for in-project navigation.
 * Renamed from `BrowseTabPanel`; the artifact list at the bottom is
 * unchanged, but a study tree (experiments → runs) now sits above it
 * so the user can jump straight into a run's method deck.
 *
 *  - Tree: experiments + runs, fetched from `getStudyTree()` and filtered
 *    to the active study. Clicking a run resolves its method event graph
 *    via `getRunMethod` and opens it as a deck tab.
 *  - Artifact rows: grouped by kind (Protocols / PDFs / Write-ups / etc.)
 *    via `useStudyArtifacts`. Click → openTab via `tabForArtifact`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useStudyArtifacts } from '../useStudyArtifacts'
import { artifactKindLabel, tabForArtifact } from '../openArtifactInViewer'
import { getRunMethod, getStudyTree } from '../../../shared/api/treeClient'
import type {
  ExperimentTreeNode,
  RunTreeNode,
  StudyTreeNode,
} from '../../../types/tree'
import type { ArtifactSummary } from '../../../types/artifact'
import './find.css'

const KIND_ORDER: ArtifactSummary['artifactKind'][] = [
  'protocol',
  'pdf',
  'writeup',
  'conclusion',
  'training',
  'saved-prompt',
]

export function FindTabPanel() {
  const ws = useWorkspace()
  const studyId = ws.state.studyId
  const { artifacts, loading, error, refresh } = useStudyArtifacts(studyId)
  const grouped = useMemo(() => groupByKind(artifacts), [artifacts])

  const [study, setStudy] = useState<StudyTreeNode | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)

  const refreshTree = useCallback(() => {
    let cancelled = false
    setTreeLoading(true)
    setTreeError(null)
    getStudyTree()
      .then((res) => {
        if (cancelled) return
        const match = res.studies.find((s) => s.recordId === studyId) ?? null
        setStudy(match)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setTreeError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studyId])

  useEffect(() => {
    const dispose = refreshTree()
    return dispose
  }, [refreshTree])

  return (
    <div className="right-panel find-tab" data-testid="find-tab">
      <header className="find-tab__head">
        <h3 className="right-panel__heading">{studyId}</h3>
        <button
          type="button"
          className="find-tab__refresh"
          onClick={() => {
            refreshTree()
            void refresh()
          }}
          data-testid="find-tab-refresh"
          aria-label="Refresh project tree and artifacts"
          title="Refresh"
        >
          ↻
        </button>
      </header>

      <section className="find-tab__tree" data-testid="find-tab-tree">
        <h4 className="right-panel__heading find-tab__group-heading">
          Experiments
        </h4>
        {treeError ? (
          <p className="right-panel__error">{treeError}</p>
        ) : treeLoading ? (
          <p className="right-panel__hint">Loading tree…</p>
        ) : !study || study.experiments.length === 0 ? (
          <p className="right-panel__hint">
            No experiments yet for <code>{studyId}</code>.
          </p>
        ) : (
          <ul className="find-tab__tree-list">
            {study.experiments.map((exp) => (
              <ExperimentRow key={exp.recordId} experiment={exp} />
            ))}
          </ul>
        )}
      </section>

      <section data-testid="find-tab-artifacts">
        <h4 className="right-panel__heading find-tab__group-heading">
          Artifacts
        </h4>
        {error ? <p className="right-panel__error">{error}</p> : null}
        {loading ? (
          <p className="right-panel__hint">Loading artifacts…</p>
        ) : artifacts.length === 0 ? (
          <p className="right-panel__hint">
            No artifacts yet for <code>{studyId}</code>.
          </p>
        ) : (
          KIND_ORDER.map((kind) => {
            const rows = grouped[kind]
            if (!rows || rows.length === 0) return null
            return (
              <section key={kind} className="find-tab__group">
                <h4 className="right-panel__heading find-tab__group-heading">
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
      </section>
    </div>
  )
}

function ExperimentRow({ experiment }: { experiment: ExperimentTreeNode }) {
  const [open, setOpen] = useState(true)
  const hasRuns = experiment.runs.length > 0
  return (
    <li>
      <button
        type="button"
        className="find-tab__tree-row"
        data-testid={`find-tab-experiment-${experiment.recordId}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="find-tab__chev" aria-hidden>
          {hasRuns ? (open ? '▾' : '▸') : '·'}
        </span>
        <span className="find-tab__row-title">{experiment.title}</span>
        <span className="find-tab__row-meta">{experiment.runs.length}</span>
      </button>
      {open && hasRuns ? (
        <ul className="find-tab__tree-list find-tab__tree-list--nested">
          {experiment.runs.map((run) => (
            <RunRow key={run.recordId} run={run} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function RunRow({ run }: { run: RunTreeNode }) {
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const openMethodDeck = useCallback(async () => {
    setBusy(true)
    setMissing(false)
    try {
      const summary = await getRunMethod(run.recordId)
      if (!summary.hasMethod || !summary.methodEventGraphId) {
        setMissing(true)
        return
      }
      ws.openTab({
        id: `tab-deck-${summary.methodEventGraphId}`,
        kind: 'deck',
        eventGraphId: summary.methodEventGraphId,
        title: run.title,
      })
    } catch {
      setMissing(true)
    } finally {
      setBusy(false)
    }
  }, [run.recordId, run.title, ws])
  return (
    <li>
      <button
        type="button"
        className="find-tab__tree-row"
        data-testid={`find-tab-run-${run.recordId}`}
        onClick={() => void openMethodDeck()}
        disabled={busy}
        title={
          missing
            ? 'This run has no method event graph yet'
            : `Open ${run.title} in the event editor`
        }
      >
        <span className="find-tab__chev" aria-hidden>
          ▶
        </span>
        <span className="find-tab__row-title">{run.title}</span>
        {missing ? (
          <span className="find-tab__row-meta">no method</span>
        ) : null}
      </button>
    </li>
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
      data-testid={`find-tab-row-${artifact.recordId}`}
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
  const out: Partial<
    Record<ArtifactSummary['artifactKind'], ArtifactSummary[]>
  > = {}
  for (const a of artifacts) {
    const arr = out[a.artifactKind] ?? []
    arr.push(a)
    out[a.artifactKind] = arr
  }
  return out
}
