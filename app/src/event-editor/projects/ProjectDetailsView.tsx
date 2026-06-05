/**
 * ProjectDetailsView — left-pane content for the `project-details` tab
 * kind. Phase 12 landing surface for an opened study.
 *
 *  - Header: study title + record id
 *  - Experiments → runs tree (collapsible)
 *  - Artifact sections grouped by kind (Protocols / PDFs / Write-ups /
 *    Training / Conclusions / Saved prompts)
 *
 * Clicking a node anywhere in the view delegates to the workspace's
 * `openTab`:
 *   - Run → open the run's method event graph as a deck tab (one extra
 *     fetch via `getRunMethod`; runs without a method are non-clickable)
 *   - Artifact → open via `tabForArtifact`
 *
 * Read-only navigation only. Creating studies/experiments/runs lives
 * elsewhere (the legacy `/browser` page or the dedicated CLI). This view
 * just helps the user find and open something.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../workspace/WorkspaceContext'
import { getStudyTree, getRunMethod } from '../../shared/api/treeClient'
import { useStudyArtifacts } from '../right-pane/useStudyArtifacts'
import {
  artifactKindLabel,
  tabForArtifact,
} from '../right-pane/openArtifactInViewer'
import type {
  ExperimentTreeNode,
  RunTreeNode,
  StudyTreeNode,
} from '../../types/tree'
import type { ArtifactSummary } from '../../types/artifact'
import './ProjectDetailsView.css'

const KIND_ORDER: ArtifactSummary['artifactKind'][] = [
  'protocol',
  'pdf',
  'writeup',
  'conclusion',
  'training',
  'saved-prompt',
]

interface ProjectDetailsViewProps {
  studyId: string
}

export function ProjectDetailsView({ studyId }: ProjectDetailsViewProps) {
  const [study, setStudy] = useState<StudyTreeNode | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)

  useEffect(() => {
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

  const {
    artifacts,
    loading: artifactsLoading,
    error: artifactsError,
  } = useStudyArtifacts(studyId)

  const grouped = useMemo(() => groupByKind(artifacts), [artifacts])

  return (
    <div
      className="project-details-view"
      data-testid="project-details-view"
    >
      <header className="project-details-view__head">
        <h2 className="project-details-view__title">
          {study?.title ?? studyId}
        </h2>
        <span className="project-details-view__sub">{studyId}</span>
      </header>

      <section
        className="project-details-view__section"
        data-testid="project-details-tree"
      >
        <h3 className="project-details-view__section-title">Experiments</h3>
        {treeError ? (
          <p className="project-details-view__error">{treeError}</p>
        ) : treeLoading ? (
          <p className="project-details-view__hint">Loading project tree…</p>
        ) : !study ? (
          <p className="project-details-view__hint">
            No tree data for <code>{studyId}</code> yet — once the study is
            indexed, experiments and runs will show here.
          </p>
        ) : study.experiments.length === 0 ? (
          <p className="project-details-view__hint">
            No experiments yet. Use the record browser to create the first
            experiment under this study.
          </p>
        ) : (
          <ul className="project-details-view__tree">
            {study.experiments.map((exp) => (
              <ExperimentRow key={exp.recordId} experiment={exp} />
            ))}
          </ul>
        )}
      </section>

      <section
        className="project-details-view__section"
        data-testid="project-details-artifacts"
      >
        <h3 className="project-details-view__section-title">Artifacts</h3>
        {artifactsError ? (
          <p className="project-details-view__error">{artifactsError}</p>
        ) : artifactsLoading ? (
          <p className="project-details-view__hint">Loading artifacts…</p>
        ) : artifacts.length === 0 ? (
          <p className="project-details-view__hint">
            No artifacts yet. PDFs ingested from the Search tab will land
            here, as will any hand-authored protocol / write-up records.
          </p>
        ) : (
          KIND_ORDER.map((kind) => {
            const rows = grouped[kind]
            if (!rows || rows.length === 0) return null
            return (
              <div
                key={kind}
                className="project-details-view__artifact-group"
              >
                <h4 className="project-details-view__group-title">
                  {artifactKindLabel(kind)} ({rows.length})
                </h4>
                <ul className="project-details-view__artifact-list">
                  {rows.map((a) => (
                    <ArtifactRow key={a.recordId} artifact={a} />
                  ))}
                </ul>
              </div>
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
    <li className="project-details-view__tree-item">
      <button
        type="button"
        className="project-details-view__tree-toggle"
        data-testid={`project-details-experiment-${experiment.recordId}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="project-details-view__chev" aria-hidden>
          {hasRuns ? (open ? '▾' : '▸') : '·'}
        </span>
        <span className="project-details-view__tree-title">
          {experiment.title}
        </span>
        <span className="project-details-view__tree-meta">
          {experiment.runs.length} run{experiment.runs.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && hasRuns ? (
        <ul className="project-details-view__tree project-details-view__tree--nested">
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
    <li className="project-details-view__tree-item project-details-view__tree-item--run">
      <button
        type="button"
        className="project-details-view__tree-toggle project-details-view__tree-toggle--run"
        data-testid={`project-details-run-${run.recordId}`}
        onClick={() => void openMethodDeck()}
        disabled={busy}
        title={
          missing
            ? 'This run has no method event graph yet'
            : `Open ${run.title} in the event editor`
        }
      >
        <span className="project-details-view__chev" aria-hidden>
          ▶
        </span>
        <span className="project-details-view__tree-title">{run.title}</span>
        {missing ? (
          <span className="project-details-view__tree-meta">no method</span>
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
    <li>
      <button
        type="button"
        className="project-details-view__artifact-row"
        data-testid={`project-details-artifact-${artifact.recordId}`}
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
        <span className="project-details-view__artifact-title">
          {artifact.title}
        </span>
        <span className="project-details-view__artifact-sub">
          {artifact.recordId}
        </span>
      </button>
    </li>
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
