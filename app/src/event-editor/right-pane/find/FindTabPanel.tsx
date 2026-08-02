/**
 * FindTabPanel — Phase 12 right-pane mode for in-project navigation.
 * Renamed from `BrowseTabPanel`; the artifact list at the bottom is
 * unchanged, but a study tree (experiments → runs) now sits above it
 * so the user can jump straight into a run.
 *
 *  - Tree: experiments + runs, fetched from `getStudyTree()` and filtered
 *    to the active study. Clicking a run opens it as its own top-level tab
 *    at `/runs/:runId` with a project-origin breadcrumb.
 *  - Artifact rows: grouped by kind (Protocols / PDFs / Write-ups / etc.)
 *    via `useStudyArtifacts`. Click → openTab via `tabForArtifact`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { recordCreateTabId, recordEditTabId, runTabId, type BreadcrumbItem } from '../../workspace/types'
import { useOptionalOpenTabs } from '../../../shared/shell/OpenTabsContext'
import { useStudyArtifacts } from '../useStudyArtifacts'
import {
  useProjectInventory,
  useProjectUsage,
  deckLabwareItems,
  deckMaterialItems,
  mergeInventoryItems,
  type InventoryRecord,
} from '../useProjectInventory'
import { useOptionalEventEditor } from '../../EventEditorContext'
import { artifactKindLabel, tabForArtifact } from '../openArtifactInViewer'
import { getStudyTree } from '../../../shared/api/treeClient'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'
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

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'

type ProtocolContextRecord = ProtocolContextResponse['projectTemplates'][number]

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

async function createProjectProtocolRecord(studyId: string, title: string): Promise<ProtocolContextRecord> {
  const recordId = newProtocolId(title)
  const payload = {
    kind: 'protocol',
    protocolLayer: 'universal',
    recordId,
    title,
    state: 'draft',
    links: { studyId },
    overview: '',
    purpose: '',
    notes: '',
    steps: [{ stepId: 'step-001', kind: 'other', description: 'Draft protocol step.' }],
  }
  await apiClient.createRecord(PROTOCOL_SCHEMA_ID, payload)
  return {
    recordId,
    schemaId: PROTOCOL_SCHEMA_ID,
    payload,
  }
}

function promptForNewProjectProtocol(studyId: string, defaultTitle: string): Promise<ProtocolContextRecord | null> {
  const title = window.prompt('Protocol title', defaultTitle)?.trim()
  if (!title) return Promise.resolve(null)
  return createProjectProtocolRecord(studyId, title)
}

export function FindTabPanel() {
  const ws = useWorkspace()
  const studyId = ws.state.studyId
  const { artifacts, loading, error, refresh } = useStudyArtifacts(studyId)
  const inventory = useProjectInventory(studyId)
  const usage = useProjectUsage(studyId)
  const grouped = useMemo(() => groupByKind(artifacts), [artifacts])

  // The currently-open deck (null on non-deck tabs). Labware placed on the deck
  // and materials referenced by its events live in the event graph, not as
  // studyId-filtered records — surface them directly so things you just added
  // show up immediately.
  const editor = useOptionalEventEditor()
  const deckState = editor?.state ?? null
  const deckLabwares = useMemo(
    () => (deckState ? deckLabwareItems(deckState.labwares) : []),
    [deckState],
  )
  const deckMaterials = useMemo(
    () => (deckState ? deckMaterialItems(deckState.events) : []),
    [deckState],
  )
  // Merge each Materials/Labwares section with (a) project-wide usage across the
  // runs (anchored to experiment/run) and (b) the live deck's items. Usage goes
  // first so its anchors win the union; deck items add anything unsaved.
  const inventorySections = useMemo(
    () =>
      inventory.sections.map((section) => {
        if (section.label === 'Labwares') {
          return { ...section, records: mergeInventoryItems(section.records, [...usage.labwares, ...deckLabwares]) }
        }
        if (section.label === 'Materials') {
          return { ...section, records: mergeInventoryItems(section.records, [...usage.materials, ...deckMaterials]) }
        }
        return section
      }),
    [inventory.sections, usage.materials, usage.labwares, deckLabwares, deckMaterials],
  )

  const [study, setStudy] = useState<StudyTreeNode | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)
  const [protocolContext, setProtocolContext] = useState<ProtocolContextResponse | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)

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

  const projectCrumb: BreadcrumbItem | undefined = study
    ? { label: study.title, entityType: 'project' as const, id: study.recordId, route: `/project/${study.recordId}` }
    : undefined

  const refreshProtocolContext = useCallback(() => {
    let cancelled = false
    apiClient.getProtocolContext({ studyId })
      .then((result) => {
        if (!cancelled) setProtocolContext(result)
      })
      .catch(() => {
        if (!cancelled) setProtocolContext(null)
      })
    return () => {
      cancelled = true
    }
  }, [studyId])

  useEffect(() => {
    const disposeTree = refreshTree()
    const disposeProtocols = refreshProtocolContext()
    return () => {
      disposeTree()
      disposeProtocols()
    }
  }, [refreshTree, refreshProtocolContext])

  // Stay live when the creation spine adds an experiment/run (the
  // record-create surface dispatches cl:records-changed on save).
  useEffect(() => {
    const onChanged = () => {
      refreshTree()
      refreshProtocolContext()
      void refresh()
      inventory.refresh()
      usage.refresh()
    }
    window.addEventListener('cl:records-changed', onChanged)
    return () => window.removeEventListener('cl:records-changed', onChanged)
  }, [refreshTree, refreshProtocolContext, refresh, inventory, usage])

  const openNewExperiment = useCallback(() => {
    setCreateMenuOpen(false)
    ws.openTab({
      id: recordCreateTabId('experiment', studyId),
      kind: 'record-create',
      nodeType: 'experiment',
      studyId,
      title: 'New experiment',
    })
  }, [studyId, ws])

  const createProjectProtocol = useCallback(async () => {
    setCreateMenuOpen(false)
    try {
      const record = await promptForNewProjectProtocol(studyId, 'New protocol template')
      if (!record) return
      const title = protocolRecordTitle(record)
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      ws.openTab({
        id: recordEditTabId(record.recordId),
        kind: 'record-edit',
        recordId: record.recordId,
        recordKind: 'protocol',
        title,
      })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [studyId, ws])

  // Open the study record itself in a TapTab left-pane tab — the way back
  // to the study from the Find tree (mirrors InventoryRow's record-edit).
  const openStudyRecord = useCallback(() => {
    ws.openTab({
      id: recordEditTabId(studyId),
      kind: 'record-edit',
      recordId: studyId,
      recordKind: 'study',
      title: study?.title ?? studyId,
    })
  }, [studyId, study, ws])

  return (
    <div className="right-panel find-tab" data-testid="find-tab">
      <header className="find-tab__head">
        <button
          type="button"
          className="find-tab__study-open"
          onClick={openStudyRecord}
          data-testid="find-tab-open-study"
          title={`Open ${study?.title ?? studyId} record`}
        >
          <h3 className="right-panel__heading">{studyId}</h3>
        </button>
        <button
          type="button"
          className="find-tab__refresh"
          onClick={() => {
            refreshTree()
            refreshProtocolContext()
            void refresh()
            inventory.refresh()
            usage.refresh()
          }}
          data-testid="find-tab-refresh"
          aria-label="Refresh project tree and artifacts"
          title="Refresh"
        >
          ↻
        </button>
      </header>

      <section className="find-tab__tree" data-testid="find-tab-tree">
        <div className="find-tab__group-head">
          <h4 className="right-panel__heading find-tab__group-heading">
            Experiments
          </h4>
          <div className="find-tab__create-menu-wrap">
            <button
              type="button"
              className="find-tab__create-btn"
              onClick={() => setCreateMenuOpen((open) => !open)}
              data-testid="find-tab-new-experiment"
              title="Add to this project"
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
            >
              +
            </button>
            {createMenuOpen ? (
              <div className="find-tab__create-menu" role="menu">
                <button type="button" role="menuitem" onClick={openNewExperiment}>Experiment</button>
                <button type="button" role="menuitem" onClick={() => void createProjectProtocol()}>Protocol</button>
              </div>
            ) : null}
          </div>
        </div>
        {treeError ? (
          <p className="right-panel__error">{treeError}</p>
        ) : treeLoading ? (
          <p className="right-panel__hint">Loading tree…</p>
        ) : !study || study.experiments.length === 0 ? (
          <p className="right-panel__hint">
            No experiments yet for <code>{studyId}</code> — use + above to
            create the first one.
          </p>
        ) : (
          <ul className="find-tab__tree-list">
            {study.experiments.map((exp) => (
              <ExperimentRow
                key={exp.recordId}
                experiment={exp}
                studyId={studyId}
                projectTemplates={protocolContext?.projectTemplates ?? []}
                experimentProtocols={protocolContext?.experimentProtocols ?? []}
                projectCrumb={projectCrumb}
              />
            ))}
          </ul>
        )}
      </section>

      <section data-testid="find-tab-inventory">
        {inventory.error ? (
          <p className="right-panel__error">{inventory.error}</p>
        ) : inventory.loading && inventorySections.every((s) => s.records.length === 0) ? (
          <p className="right-panel__hint">Loading inventory…</p>
        ) : inventorySections.every((s) => s.records.length === 0) ? (
          <p className="right-panel__hint">
            No labware, aliquots, materials, or protocols to show yet.
          </p>
        ) : (
          inventorySections.map((section) =>
            section.records.length === 0 ? null : (
              <section key={section.key} className="find-tab__group">
                <h4 className="right-panel__heading find-tab__group-heading">
                  {section.label} ({section.records.length})
                </h4>
                <div className="right-panel__group">
                  {section.records.map((record) => (
                    <InventoryRow key={record.recordId} record={record} />
                  ))}
                </div>
              </section>
            ),
          )
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
                    <ArtifactRow key={row.recordId} artifact={row} projectCrumb={projectCrumb} />
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

function ExperimentRow({
  experiment,
  studyId,
  projectTemplates,
  experimentProtocols,
  projectCrumb,
}: {
  experiment: ExperimentTreeNode
  studyId: string
  projectTemplates: ProtocolContextRecord[]
  experimentProtocols: ProtocolContextRecord[]
  projectCrumb?: BreadcrumbItem
}) {
  const ws = useWorkspace()
  const [open, setOpen] = useState(true)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const hasRuns = experiment.runs.length > 0

  const openNewRun = useCallback(() => {
    setCreateMenuOpen(false)
    ws.openTab({
      id: recordCreateTabId('run', experiment.recordId),
      kind: 'record-create',
      nodeType: 'run',
      studyId,
      experimentId: experiment.recordId,
      title: 'New run',
    })
  }, [experiment.recordId, studyId, ws])

  const createExperimentProtocol = useCallback(async () => {
    setCreateMenuOpen(false)
    try {
      const source = projectTemplates.length > 0
        ? chooseProtocolRecord(projectTemplates, 'Choose a project protocol to specialize for this experiment. Enter a number or recordId.')
        : await promptForNewProjectProtocol(studyId, `${experiment.title} protocol template`)
      if (!source) return
      const title = window.prompt('Experiment protocol title', `${protocolRecordTitle(source)} - ${experiment.title}`)?.trim()
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

  // Open the experiment record in a TapTab left-pane tab. The chevron stays a
  // separate disclosure toggle, so clicking the title navigates (file-tree
  // convention: triangle expands, name opens).
  const openExperimentRecord = useCallback(() => {
    ws.openTab({
      id: recordEditTabId(experiment.recordId),
      kind: 'record-edit',
      recordId: experiment.recordId,
      recordKind: 'experiment',
      title: experiment.title,
    })
  }, [experiment.recordId, experiment.title, ws])

  return (
    <li>
      <div className="find-tab__tree-row-wrap">
        <button
          type="button"
          className="find-tab__chev-btn"
          data-testid={`find-tab-experiment-toggle-${experiment.recordId}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${experiment.title}`}
          disabled={!hasRuns}
        >
          <span className="find-tab__chev" aria-hidden>
            {hasRuns ? (open ? '▾' : '▸') : '·'}
          </span>
        </button>
        <button
          type="button"
          className="find-tab__tree-row"
          data-testid={`find-tab-experiment-${experiment.recordId}`}
          onClick={openExperimentRecord}
          title={`Open ${experiment.title} record`}
        >
          <span className="find-tab__row-title">{experiment.title}</span>
          <span className="find-tab__row-meta">{experiment.runs.length}</span>
        </button>
        <div className="find-tab__create-menu-wrap">
          <button
            type="button"
            className="find-tab__create-btn"
            onClick={() => setCreateMenuOpen((open) => !open)}
            data-testid={`find-tab-new-run-${experiment.recordId}`}
            title={`Add under ${experiment.title}`}
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
          >
            +
          </button>
          {createMenuOpen ? (
            <div className="find-tab__create-menu" role="menu">
              <button type="button" role="menuitem" onClick={openNewRun}>Run</button>
              <button type="button" role="menuitem" onClick={() => void createExperimentProtocol()}>Protocol</button>
            </div>
          ) : null}
        </div>
      </div>
      {open && hasRuns ? (
        <ul className="find-tab__tree-list find-tab__tree-list--nested">
          {experiment.runs.map((run) => (
            <RunRow
              key={run.recordId}
              run={run}
              availableProtocols={[
                ...experimentProtocols.filter((record) => protocolRecordExperimentId(record) === experiment.recordId),
                ...projectTemplates,
              ]}
              projectCrumb={projectCrumb}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function RunRow({
  run,
  availableProtocols,
  projectCrumb,
}: {
  run: RunTreeNode
  availableProtocols: ProtocolContextRecord[]
  projectCrumb?: BreadcrumbItem
}) {
  const ws = useWorkspace()
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()
  const [busy, setBusy] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)

  const openRun = useCallback(() => {
    openTabs?.openTab(
      { id: runTabId(run.recordId), kind: 'run', runId: run.recordId, title: run.title },
      true,
      projectCrumb ? [projectCrumb] : undefined,
    )
    navigate(`/runs/${run.recordId}`)
  }, [run.recordId, run.title, projectCrumb, openTabs, navigate])

  const attachProtocolMethod = useCallback(async () => {
    setCreateMenuOpen(false)
    setBusy(true)
    try {
      const source = availableProtocols.length > 0
        ? chooseProtocolRecord(availableProtocols, 'Choose a protocol to use in this run. Enter a number or recordId.')
        : await promptForNewProjectProtocol(run.studyId, `${run.title} protocol template`)
      if (!source) return
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
    <li>
      <div className="find-tab__tree-row-wrap">
        <button
          type="button"
          className="find-tab__tree-row"
          data-testid={`find-tab-run-${run.recordId}`}
          onClick={() => void openRun()}
          title={`Open ${run.title} in its own tab`}
        >
          <span className="find-tab__chev" aria-hidden>
            ▶
          </span>
          <span className="find-tab__row-title">{run.title}</span>
        </button>
        <div className="find-tab__create-menu-wrap">
          <button
            type="button"
            className="find-tab__create-btn"
            onClick={() => setCreateMenuOpen((open) => !open)}
            disabled={busy}
            data-testid={`find-tab-use-protocol-${run.recordId}`}
            title={`Add method to ${run.title}`}
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
          >
            +
          </button>
          {createMenuOpen ? (
            <div className="find-tab__create-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void attachProtocolMethod()}>Method from protocol</button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function ArtifactRow({ artifact, projectCrumb }: { artifact: ArtifactSummary; projectCrumb?: BreadcrumbItem }) {
  const openTabs = useOptionalOpenTabs()
  const navigate = useNavigate()
  const tab = tabForArtifact(artifact)
  const disabled = tab === null
  return (
    <button
      type="button"
      className="right-panel__row"
      data-testid={`find-tab-row-${artifact.recordId}`}
      disabled={disabled}
      onClick={() => {
        if (!tab) return
        if (tab.kind === 'pdf' || tab.kind === 'document') {
          const route =
            tab.kind === 'pdf'
              ? `/artifact/pdf/${tab.artifactId}`
              : `/artifact/document/${tab.artifactId}`
          openTabs?.openTab(tab, true, projectCrumb ? [projectCrumb] : undefined)
          navigate(route)
        }
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

function InventoryRow({ record }: { record: InventoryRecord }) {
  const ws = useWorkspace()
  const editable = record.editable !== false
  const anchors = record.anchors ?? []
  const VISIBLE_ANCHORS = 3
  return (
    <button
      type="button"
      className="right-panel__row"
      data-testid={`find-tab-inv-${record.recordId}`}
      disabled={!editable}
      onClick={() => {
        if (!editable) return
        // Open the record in a TapTab left-pane tab — stays in the project,
        // keeps the right panel, no navigation.
        ws.openTab({
          id: recordEditTabId(record.recordId),
          kind: 'record-edit',
          recordId: record.recordId,
          recordKind: record.kind,
          title: record.title,
        })
      }}
      title={
        anchors.length > 0
          ? `${record.title} — used in: ${anchors.map((a) => `${a.experimentTitle} / ${a.runTitle}`).join(', ')}`
          : editable
            ? `Open ${record.title} for editing`
            : `${record.title} — on the deck (no saved record to edit yet)`
      }
    >
      <span className="right-panel__row-title">{record.title}</span>
      <span className="right-panel__row-sub">{record.recordId}</span>
      {anchors.length > 0 ? (
        <span className="find-tab__anchors" data-testid={`find-tab-inv-anchors-${record.recordId}`}>
          {anchors.slice(0, VISIBLE_ANCHORS).map((a) => (
            <span key={a.runId} className="find-tab__anchor">
              {a.experimentTitle} / {a.runTitle}
            </span>
          ))}
          {anchors.length > VISIBLE_ANCHORS ? (
            <span className="find-tab__anchor find-tab__anchor--more">
              +{anchors.length - VISIBLE_ANCHORS} more
            </span>
          ) : null}
        </span>
      ) : null}
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
