/**
 * ProjectDetailsView — left-pane content for the `project-details` tab
 * kind. Phase 12 landing surface for an opened study.
 *
 *  - Header: study title + record id
 *  - RUNS: flat list of all runs linked to this project (via GET /runs?studyId=)
 *    Shows ALL runs regardless of experiment grouping. Runs with no
 *    experiment parent appear here too.
 *  - Experiments → runs tree (collapsible, legacy grouping)
 *  - Protocols section
 *  - Artifact sections grouped by kind
 *
 * Clicking a run opens its method event graph as a deck tab.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../workspace/WorkspaceContext'
import { recordCreateTabId, recordEditTabId } from '../workspace/types'
import { getStudyTree, getRunMethod } from '../../shared/api/treeClient'
import { quickCreateRun } from '../create/quickCreateRun'
import { apiClient, type ProtocolContextResponse, type RunListItem } from '../../shared/api/client'
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

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'

function protocolSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'protocol'
}

function newProtocolId(title: string): string {
  return `PRT-${protocolSlug(title)}-${Math.random().toString(36).slice(2, 6)}`
}

type ProtocolContextRecord = ProtocolContextResponse['projectTemplates'][number]

function protocolRecordTitle(record: ProtocolContextRecord): string {
  const payload = record.payload as Record<string, unknown>
  return typeof payload.title === 'string' ? payload.title : record.recordId
}

function protocolRecordExperimentId(record: ProtocolContextRecord): string | null {
  const payload = record.payload as Record<string, unknown>
  const links = payload.links && typeof payload.links === 'object'
    ? payload.links as Record<string, unknown>
    : {}
  return typeof links.experimentId === 'string' ? links.experimentId : null
}

function chooseProtocolRecord(records: ProtocolContextRecord[], promptTitle: string): ProtocolContextRecord | null {
  if (records.length === 0) return null
  if (records.length === 1) return records[0] ?? null
  const options = records.map((record, index) => `${index + 1}. ${record.recordId} - ${protocolRecordTitle(record)}`).join('\n')
  const answer = window.prompt(`${promptTitle}\n\n${options}`, '1')?.trim()
  if (!answer) return null
  const byIndex = Number(answer)
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= records.length) return records[byIndex - 1] ?? null
  return records.find((record) => record.recordId === answer) ?? null
}

interface ProjectDetailsViewProps {
  studyId: string
}

export function ProjectDetailsView({ studyId }: ProjectDetailsViewProps) {
  const ws = useWorkspace()
  const [study, setStudy] = useState<StudyTreeNode | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(true)
  const [treeEpoch, setTreeEpoch] = useState(0)
  const [protocolContext, setProtocolContext] = useState<ProtocolContextResponse | null>(null)
  const [protocolContextLoading, setProtocolContextLoading] = useState(true)
  const [protocolContextError, setProtocolContextError] = useState<string | null>(null)
  const [allRuns, setAllRuns] = useState<RunListItem[]>([])
  const [runsLoading, setRunsLoading] = useState(true)

  useEffect(() => {
    const onChanged = () => setTreeEpoch((e) => e + 1)
    window.addEventListener('cl:records-changed', onChanged)
    return () => window.removeEventListener('cl:records-changed', onChanged)
  }, [])

  // Fetch all runs for this project (flat, non-hierarchical)
  useEffect(() => {
    let cancelled = false
    setRunsLoading(true)
    apiClient.listRuns({ studyId, limit: 200 })
      .then((res) => {
        if (!cancelled) setAllRuns(res.runs)
      })
      .catch(() => { if (!cancelled) setAllRuns([]) })
      .finally(() => { if (!cancelled) setRunsLoading(false) })
    return () => { cancelled = true }
  }, [studyId, treeEpoch])

  useEffect(() => {
    let cancelled = false
    setProtocolContextLoading(true)
    setProtocolContextError(null)
    apiClient.getProtocolContext({ studyId })
      .then((res) => {
        if (!cancelled) setProtocolContext(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) setProtocolContextError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setProtocolContextLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studyId, treeEpoch])

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
  }, [studyId, treeEpoch])

  useEffect(() => {
    let cancelled = false
    apiClient
      .getAccessPolicy(studyId)
      .then((p) => { if (!cancelled) setCanEdit(p.canWrite) })
      .catch(() => { if (!cancelled) setCanEdit(false) })
    return () => { cancelled = true }
  }, [studyId, treeEpoch])

  const openNewExperiment = useCallback(() => {
    ws.openTab({
      id: recordCreateTabId('experiment', studyId),
      kind: 'record-create',
      nodeType: 'experiment',
      studyId,
      title: 'New experiment',
    })
  }, [studyId, ws])

  const [creatingRun, setCreatingRun] = useState(false)

  const openNewRunDirect = useCallback(async () => {
    setCreatingRun(true)
    try {
      const result = await quickCreateRun({ studyId })
      ws.openTab({
        id: `tab-deck-new-${result.recordId}`,
        kind: 'deck',
        eventGraphId: '',
        runId: result.recordId,
        title: result.title,
      })
      ws.setRightPaneMode('protocol')
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingRun(false)
    }
  }, [studyId, ws])

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

      {/* RUNS — flat list of all runs linked to this project */}
      <section
        className="project-details-view__section"
        data-testid="project-details-runs"
      >
        <div className="project-details-view__section-head">
          <h3 className="project-details-view__section-title">Runs</h3>
          {canEdit ? (
            <button
              type="button"
              className="project-details-view__create-btn"
              onClick={() => void openNewRunDirect()}
              disabled={creatingRun}
              data-testid="project-details-new-run-direct"
              title="Create a run and open the event editor"
            >
              {creatingRun ? 'Creating…' : '+ New Run'}
            </button>
          ) : (
            <span
              className="project-details-view__readonly-hint"
              title="This study belongs to another user."
            >
              read-only
            </span>
          )}
        </div>
        {runsLoading ? (
          <p className="project-details-view__hint">Loading runs…</p>
        ) : allRuns.length === 0 ? (
          <p className="project-details-view__hint">
            No runs yet. Click "+ New Run" to create one and start working.
          </p>
        ) : (
          <ul className="project-details-view__tree">
            {allRuns.map((run) => (
              <FlatRunRow
                key={run.recordId}
                run={run}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        className="project-details-view__section"
        data-testid="project-details-tree"
      >
        <div className="project-details-view__section-head">
          <h3 className="project-details-view__section-title">Experiments</h3>
          {canEdit ? (
            <button
              type="button"
              className="project-details-view__create-btn"
              onClick={openNewExperiment}
              data-testid="project-details-new-experiment"
            >
              + New experiment
            </button>
          ) : null}
        </div>
        {treeError ? (
          <p className="project-details-view__error">{treeError}</p>
        ) : treeLoading ? (
          <p className="project-details-view__hint">Loading project tree…</p>
        ) : !study || study.experiments.length === 0 ? (
          <p className="project-details-view__hint">
            No experiments yet. Experiments are optional groupings for runs.
          </p>
        ) : (
          <ul className="project-details-view__tree">
            {study.experiments.map((exp) => (
              <ExperimentRow
                key={exp.recordId}
                experiment={exp}
                studyId={studyId}
                canEdit={canEdit}
                projectTemplates={protocolContext?.projectTemplates ?? []}
                experimentProtocols={protocolContext?.experimentProtocols ?? []}
              />
            ))}
          </ul>
        )}
      </section>

      <ProtocolContextSection
        studyId={studyId}
        canEdit={canEdit}
        context={protocolContext}
        loading={protocolContextLoading}
        error={protocolContextError}
      />

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

/**
 * FlatRunRow — a run in the flat RUNS section. Takes a RunListItem
 * (from GET /runs?studyId=) instead of a RunTreeNode. Opens the
 * run's method event graph as a deck tab on click.
 */
function FlatRunRow({
  run,
}: {
  run: RunListItem
}) {
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)

  const openDeck = useCallback(async () => {
    setBusy(true)
    try {
      const summary = await getRunMethod(run.recordId)
      if (!summary.hasMethod || !summary.methodEventGraphId) {
        ws.openTab({
          id: `tab-deck-new-${run.recordId}`,
          kind: 'deck',
          eventGraphId: '',
          runId: run.recordId,
          title: run.title,
        })
        return
      }
      ws.openTab({
        id: `tab-deck-${summary.methodEventGraphId}`,
        kind: 'deck',
        eventGraphId: summary.methodEventGraphId,
        runId: run.recordId,
        title: run.title,
      })
    } catch {
      ws.openTab({
        id: `tab-deck-new-${run.recordId}`,
        kind: 'deck',
        eventGraphId: '',
        runId: run.recordId,
        title: run.title,
      })
    } finally {
      setBusy(false)
    }
  }, [run.recordId, run.title, ws])

  return (
    <li className="project-details-view__tree-item project-details-view__tree-item--run">
      <div className="project-details-view__tree-row">
        <button
          type="button"
          className="project-details-view__tree-toggle project-details-view__tree-toggle--run"
          data-testid={`project-details-run-${run.recordId}`}
          onClick={() => void openDeck()}
          disabled={busy}
          title={`Open ${run.title} in the event editor`}
        >
          <span className="project-details-view__chev" aria-hidden>▶</span>
          <span className="project-details-view__tree-title">{run.title}</span>
          <span className="project-details-view__tree-meta">{run.status}</span>
        </button>
      </div>
    </li>
  )
}

function ExperimentRow({
  experiment,
  studyId,
  canEdit,
  projectTemplates,
  experimentProtocols,
}: {
  experiment: ExperimentTreeNode
  studyId: string
  canEdit: boolean
  projectTemplates: ProtocolContextRecord[]
  experimentProtocols: ProtocolContextRecord[]
}) {
  const ws = useWorkspace()
  const [open, setOpen] = useState(true)
  const hasRuns = experiment.runs.length > 0

  const [creatingRun, setCreatingRun] = useState(false)

  const openNewRun = useCallback(async () => {
    setCreatingRun(true)
    try {
      const result = await quickCreateRun({
        studyId,
        experimentId: experiment.recordId,
      })
      ws.openTab({
        id: `tab-deck-new-${result.recordId}`,
        kind: 'deck',
        eventGraphId: '',
        runId: result.recordId,
        title: result.title,
      })
      ws.setRightPaneMode('protocol')
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingRun(false)
    }
  }, [experiment.recordId, studyId, ws])

  const createExperimentProtocol = useCallback(async () => {
    const source = chooseProtocolRecord(projectTemplates, 'Choose a project protocol to specialize for this experiment. Enter a number or recordId.')
    if (!source) return
    const title = window.prompt('Experiment protocol title', `${protocolRecordTitle(source)} - ${experiment.title}`)?.trim()
    try {
      const result = await apiClient.specializeProtocolForExperiment({
        protocolId: source.recordId,
        studyId,
        experimentId: experiment.recordId,
        ...(title ? { title } : {}),
      })
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      const payload = result.record.payload as Record<string, unknown>
      const resolvedTitle = typeof payload.title === 'string' ? payload.title : result.record.recordId
      ws.openTab({
        id: recordEditTabId(result.record.recordId),
        kind: 'record-edit',
        recordId: result.record.recordId,
        recordKind: 'local-protocol',
        title: resolvedTitle,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [experiment.recordId, experiment.title, projectTemplates, studyId, ws])

  return (
    <li className="project-details-view__tree-item">
      <div className="project-details-view__tree-row">
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
        {canEdit ? (
          <>
            <button
              type="button"
              className="project-details-view__create-btn project-details-view__create-btn--row"
              onClick={() => void createExperimentProtocol()}
              disabled={projectTemplates.length === 0}
              data-testid={`project-details-new-protocol-${experiment.recordId}`}
              title={projectTemplates.length === 0 ? 'Create a project protocol first' : `Specialize a protocol for ${experiment.title}`}
            >
              + Protocol
            </button>
            <button
              type="button"
              className="project-details-view__create-btn project-details-view__create-btn--row"
              onClick={() => void openNewRun()}
              disabled={creatingRun}
              data-testid={`project-details-new-run-${experiment.recordId}`}
              title={`Create a run under ${experiment.title}`}
            >
              {creatingRun ? '…' : '+ Run'}
            </button>
          </>
        ) : null}
      </div>
      {open && hasRuns ? (
        <ul className="project-details-view__tree project-details-view__tree--nested">
          {experiment.runs.map((run) => (
            <RunRow
              key={run.recordId}
              run={run}
              canEdit={canEdit}
              availableProtocols={[
                ...experimentProtocols.filter((record) => protocolRecordExperimentId(record) === experiment.recordId),
                ...projectTemplates,
              ]}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function RunRow({
  run,
  canEdit,
  availableProtocols,
}: {
  run: RunTreeNode
  canEdit: boolean
  availableProtocols: ProtocolContextRecord[]
}) {
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
        ws.openTab({
          id: `tab-deck-new-${run.recordId}`,
          kind: 'deck',
          eventGraphId: '',
          runId: run.recordId,
          title: run.title,
        })
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

  const attachProtocolMethod = useCallback(async () => {
    const source = chooseProtocolRecord(availableProtocols, 'Choose a protocol to use in this run. Enter a number or recordId.')
    if (!source) return
    setBusy(true)
    setMissing(false)
    try {
      const result = await apiClient.useProtocolInRun({
        protocolId: source.recordId,
        runId: run.recordId,
        studyId: run.studyId,
        experimentId: run.experimentId,
      })
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      ws.openTab({
        id: `tab-deck-${result.methodEventGraphId}`,
        kind: 'deck',
        eventGraphId: result.methodEventGraphId,
        runId: run.recordId,
        title: run.title,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [availableProtocols, run.experimentId, run.recordId, run.studyId, run.title, ws])

  return (
    <li className="project-details-view__tree-item project-details-view__tree-item--run">
      <div className="project-details-view__tree-row">
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
        {canEdit ? (
          <button
            type="button"
            className="project-details-view__create-btn project-details-view__create-btn--row"
            onClick={() => void attachProtocolMethod()}
            disabled={busy || availableProtocols.length === 0}
            data-testid={`project-details-use-protocol-${run.recordId}`}
            title={availableProtocols.length === 0 ? 'Create or specialize a protocol first' : `Use a protocol in ${run.title}`}
          >
            + Method
          </button>
        ) : null}
      </div>
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

function ProtocolContextSection({
  studyId,
  canEdit,
  context,
  loading,
  error,
}: {
  studyId: string
  canEdit: boolean
  context: ProtocolContextResponse | null
  loading: boolean
  error: string | null
}) {
  const ws = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const projectTemplates = context?.projectTemplates ?? []
  const experimentProtocols = context?.experimentProtocols ?? []

  const createProtocolTemplate = async () => {
    const title = window.prompt('Protocol title', 'New protocol template')?.trim()
    if (!title) return
    const recordId = newProtocolId(title)
    setCreating(true)
    setCreateError(null)
    try {
      await apiClient.createRecord(PROTOCOL_SCHEMA_ID, {
        kind: 'protocol',
        protocolLayer: 'universal',
        recordId,
        title,
        state: 'draft',
        links: { studyId },
        overview: '',
        purpose: '',
        notes: '',
        steps: [
          {
            stepId: 'step-001',
            kind: 'other',
            description: 'Draft protocol step.',
          },
        ],
      })
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      ws.openTab({
        id: recordEditTabId(recordId),
        kind: 'record-edit',
        recordId,
        recordKind: 'protocol',
        title,
      })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <section
      className="project-details-view__section"
      data-testid="project-details-protocols"
    >
      <div className="project-details-view__section-head">
        <h3 className="project-details-view__section-title">Protocols</h3>
        {canEdit ? (
          <button
            type="button"
            className="project-details-view__create-btn"
            onClick={() => void createProtocolTemplate()}
            disabled={creating}
            data-testid="project-details-new-protocol"
          >
            + New protocol
          </button>
        ) : null}
      </div>
      {createError ? <p className="project-details-view__error">{createError}</p> : null}
      {error ? (
        <p className="project-details-view__error">{error}</p>
      ) : loading ? (
        <p className="project-details-view__hint">Loading protocols…</p>
      ) : projectTemplates.length === 0 && experimentProtocols.length === 0 ? (
        <p className="project-details-view__hint">No project or experiment protocols filed for this study.</p>
      ) : (
        <>
          <ProtocolRecordGroup title="Project templates" records={projectTemplates} />
          <ProtocolRecordGroup title="Experiment protocols" records={experimentProtocols} />
        </>
      )}
    </section>
  )
}

function ProtocolRecordGroup({ title, records }: { title: string; records: ProtocolContextResponse['projectTemplates'] }) {
  if (records.length === 0) return null
  return (
    <div className="project-details-view__artifact-group">
      <h4 className="project-details-view__group-title">{title} ({records.length})</h4>
      <ul className="project-details-view__artifact-list">
        {records.map((record) => (
          <ProtocolRecordRow key={record.recordId} record={record} />
        ))}
      </ul>
    </div>
  )
}

function ProtocolRecordRow({ record }: { record: ProtocolContextResponse['projectTemplates'][number] }) {
  const ws = useWorkspace()
  const payload = record.payload as Record<string, unknown>
  const title = typeof payload.title === 'string' ? payload.title : record.recordId
  const kind = typeof payload.kind === 'string' ? payload.kind : 'protocol'
  return (
    <li>
      <button
        type="button"
        className="project-details-view__artifact-row"
        data-testid={`project-details-protocol-${record.recordId}`}
        onClick={() => ws.openTab({
          id: recordEditTabId(record.recordId),
          kind: 'record-edit',
          recordId: record.recordId,
          recordKind: kind,
          title,
        })}
        title={`Open ${title}`}
      >
        <span className="project-details-view__artifact-title">{title}</span>
        <span className="project-details-view__artifact-sub">{record.recordId} · {kind}</span>
      </button>
    </li>
  )
}