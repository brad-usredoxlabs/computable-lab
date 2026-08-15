/**
 * ProjectWorkspacePage — route component for `/project/:studyId` and
 * `/project/:studyId/event-graph/:eventGraphId`.
 *
 * Phase 12 reshaped the navigation hierarchy:
 *   - Project tabs in the topbar switch studies (handled by ProjectTabStrip).
 *   - WITHIN a study, the user navigates via the right-pane Find tab
 *     (a tree of experiments → runs + artifact sections). Clicking a
 *     node opens it as a left-pane viewer tab.
 *   - The project-details tab is the always-present landing surface;
 *     defaults open one for any study with no other tabs. It now renders
 *     the Find homepage (Experiments tree + inventory + artifacts).
 *
 * Phase 11's mode dispatcher (event-editor / protocols / browser /
 * literature) is gone. ProtocolsBody / BrowserBody / LiteratureBody no
 * longer mount inline here — those routes redirect to `/` (Phase 12.6).
 *
 * Left-pane dispatch on `activeTab.kind`:
 *   - 'project-details' → <FindTabPanel /> (Phase C — project homepage)
 *   - 'deck'            → DeckStage via <Viewer /> + EventEditorProvider
 *   - 'pdf'             → <PdfViewer /> + PdfStateProvider
 *   - 'document'        → <DocumentEditor /> + DocumentStateProvider
 */

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../shared/shell'
import {
  WorkspaceProvider,
  useWorkspace,
} from '../workspace/WorkspaceContext'
import { useOptionalOpenTabs } from '../../shared/shell/OpenTabsContext'
import { EventEditorProvider } from '../EventEditorContext'
import { FocusModalsProvider } from '../focus/FocusModalsProvider'
import { PdfStateProvider } from '../viewer/pdf/PdfViewerContext'
import { DocumentStateProvider } from '../viewer/document/DocumentEditorContext'
import { Viewer } from '../viewer/Viewer'
import { ViewerToolbar } from '../viewer/ViewerToolbar'
import { WorkspaceTabStrip } from '../../shared/shell/WorkspaceTabStrip'
import { FindTabPanel } from '../right-pane/find/FindTabPanel'
import { RecordCreatePanel } from '../create/RecordCreatePanel'
import { RecordEditPanel } from '../create/RecordEditPanel'
import { ExecutionTabShell } from '../execution/ExecutionTabShell'
import { RightPane } from '../right-pane/RightPane'
import { ProjectCollectionView } from '../../collections/ProjectCollectionView'
import { RunCollectionView } from '../../collections/RunCollectionView'
import { LabCollectionView } from '../../collections/LabCollectionView'
import { ProtocolSelectionProvider } from '../protocol/ProtocolSelectionContext'
import { ProtocolPreviewBridge } from '../protocol/ProtocolPreviewBridge'
import { apiClient } from '../../shared/api/client'
import type { WorkspaceTab } from '../workspace/types'
import { projectDetailsTabId, projectTabId } from '../workspace/types'
import '../viewer/viewer.css'
import '../styles/eventEditor.css'
import './ProjectWorkspacePage.css'

export function ProjectWorkspacePage() {
  const { studyId, eventGraphId } = useParams<{
    studyId: string
    eventGraphId?: string
  }>()

  if (!studyId || !/^STU-[A-Za-z0-9_-]+$/.test(studyId)) {
    return (
      <AppShell brand="Project workspace">
        <div className="project-workspace__error">
          <h1>Unknown study</h1>
          <p>
            <code>{studyId ?? '(missing)'}</code> is not a valid study id.
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <WorkspaceProvider studyId={studyId}>
      <WorkspaceShellHost
        studyId={studyId}
        autoOpenEventGraphId={eventGraphId ?? null}
      />
    </WorkspaceProvider>
  )
}

interface WorkspaceShellHostProps {
  studyId: string
  /** When the route is /project/:studyId/event-graph/:eventGraphId, the
   *  workspace opens a deck tab for that graph on mount. Used by the
   *  Phase 10 legacy redirect (`/event-editor/:eventGraphId`). */
  autoOpenEventGraphId?: string | null
}

function WorkspaceShellHost({
  studyId,
  autoOpenEventGraphId,
}: WorkspaceShellHostProps) {
  const ws = useWorkspace()
  const openTabs = useOptionalOpenTabs()
  const [studyTitle, setStudyTitle] = useState<string | null>(null)

  // Fetch the study title so the top-level project tab isn't a raw STU- id.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getRecord(studyId)
      .then((env) => {
        if (cancelled) return
        const payload = (env as { payload?: Record<string, unknown> })?.payload
        const t = typeof payload?.title === 'string' && payload.title.trim() ? payload.title : null
        if (t) setStudyTitle(t)
      })
      .catch(() => {
        /* title is a nicety — fall back to the id */
      })
    return () => {
      cancelled = true
    }
  }, [studyId])

  // Ensure the CURRENT project tab exists for this study (deep-links, direct
  // navigation, refresh) — in the current tab (browser model), never a separate
  // re-activated tab. Idempotent when the active tab is already this project.
  useEffect(() => {
    openTabs?.navigateActiveTab({ id: projectTabId(studyId), kind: 'project', studyId, title: studyTitle ?? studyId })
  }, [studyId, studyTitle, openTabs])

  // Phase 10 deep-link: open a deck tab for the named event graph.
  const openedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoOpenEventGraphId) return
    if (!ws.ready) return
    const key = `${studyId}::${autoOpenEventGraphId}`
    if (openedRef.current === key) return
    openedRef.current = key
    ws.openTab({
      id: `tab-deck-${autoOpenEventGraphId}`,
      kind: 'deck',
      eventGraphId: autoOpenEventGraphId,
      title: autoOpenEventGraphId,
    })
  })

  // Phase R: a bare /project/:id lands on the project homepage (project-details
  // tab showing find content: experiments/runs/artifacts). Deep links
  // (/project/:studyId/event-graph/:eventGraphId) open their own deck tab via
  // the effect above — this effect skips when one exists.
  //
  // IMPORTANT: this must run ONCE per mount (first ready), NOT on every tab
  // activation. The landing-homed guard prevents it from force-reopening the
  // homepage and yanking the user away when they open a run/artifact deck tab.
  const landedOnHomeRef = useRef(false)
  useEffect(() => {
    if (!ws.ready || landedOnHomeRef.current) return
    if (autoOpenEventGraphId) return   // deep link opens its own deck tab
    landedOnHomeRef.current = true
    const id = projectDetailsTabId(studyId)
    if (ws.state.activeTabId === id) return // already landed on the homepage
    ws.openTab({ id, kind: 'project-details', title: 'Project' }, true)
  }, [studyId, ws.ready, autoOpenEventGraphId, ws.openTab])

  // When the active tab becomes a deck tab with a runId, auto-switch the
  // right pane to Protocol mode so the user immediately sees protocol steps
  // alongside the event graph canvas. Only fire once per tab activation so
  // that the user can still manually switch the right pane (AI / Find etc.)
  // and their choice is respected.
  const deckWithRunRef = useRef<string | null>(null)
  useEffect(() => {
    if (!ws.ready) return
    const tab = findActiveTab(ws.state.tabs, ws.state.activeTabId)
    if (tab?.kind === 'deck' && tab.runId) {
      // Only auto-switch if this tab is newly active (not already handled).
      // When the user manually switches away from Protocol and back to
      // another tab, we still remember we auto-switched for this deck
      // tab — their manual choice wins until they switch to a different
      // left-pane tab.
      if (deckWithRunRef.current !== tab.id) {
        deckWithRunRef.current = tab.id
        ws.setRightPaneMode('protocol')
      }
    } else {
      // Reset when the active tab is no longer a deck+runId combo.
      if (tab) {
        deckWithRunRef.current = null
      }
    }
  }, [ws.ready, ws.state.activeTabId, ws.state.tabs, ws.setRightPaneMode])

  const activeTab = findActiveTab(ws.state.tabs, ws.state.activeTabId)

  const shellContent = (
    <ProtocolSelectionProvider>
      <AppShell
        brand="Project"
        topbarTabs={<WorkspaceTabStrip />}
        layout="workspace"
        panelAutoSaveId={`project:${studyId}`}
        viewerToolbar={<ViewerToolbar tab={activeTab} />}
        leftPane={<LeftPane activeTab={activeTab} studyId={studyId} />}
        rightPane={<RightPane />}
      />
    </ProtocolSelectionProvider>
  )

  if (activeTab?.kind === 'deck') {
    return (
      <EventEditorProvider
        // Key on the tab id (unique per tab, including fresh canvases) and
        // NOT on eventGraphId: a fresh canvas gains its eventGraphId when
        // the first Accept persists the graph (bind-deck-tab), and a
        // key change at that moment would remount the provider and wipe
        // the just-accepted deck plus the right-pane conversation.
        key={activeTab.id}
        {...(activeTab.eventGraphId
          ? { eventGraphId: activeTab.eventGraphId }
          : {})}
        {...(activeTab.runId ? { runId: activeTab.runId } : {})}
      >
        <FocusModalsProvider>
          {shellContent}
          <ProtocolPreviewBridge />
        </FocusModalsProvider>
      </EventEditorProvider>
    )
  }
  if (activeTab?.kind === 'execution') {
    return (
      <EventEditorProvider
        key={activeTab.id}
        eventGraphId={activeTab.eventGraphId}
        runId={activeTab.runId}
      >
        <FocusModalsProvider>
          {shellContent}
          <ProtocolPreviewBridge />
        </FocusModalsProvider>
      </EventEditorProvider>
    )
  }
  if (activeTab?.kind === 'pdf') {
    return (
      <PdfStateProvider
        key={activeTab.artifactId}
        artifactId={activeTab.artifactId}
        title={activeTab.title}
      >
        {shellContent}
      </PdfStateProvider>
    )
  }
  if (activeTab?.kind === 'document') {
    return (
      <DocumentStateProvider
        key={activeTab.artifactId}
        artifactId={activeTab.artifactId}
        title={activeTab.title}
      >
        {shellContent}
      </DocumentStateProvider>
    )
  }
  // project-details has no per-kind provider; renders as a pure view.
  return shellContent
}

function findActiveTab(
  tabs: WorkspaceTab[],
  activeTabId: string | null,
): WorkspaceTab | null {
  if (!activeTabId) return null
  return tabs.find((t) => t.id === activeTabId) ?? null
}

interface LeftPaneProps {
  activeTab: WorkspaceTab | null
  studyId: string
}

function LeftPane({ activeTab, studyId }: LeftPaneProps) {
  const ws = useWorkspace()
  const handleSendSelection = (text: string, pageNumber: number) => {
    // Switch right pane to AI mode
    ws.setRightPaneMode('ai')
    // Store the selection text in a custom data attribute so the AI panel can read it
    // This is a bridge between the PDF viewer and the AI chat
    const event = new CustomEvent('pdf-text-selection', {
      detail: { text, pageNumber },
    })
    window.dispatchEvent(event)
  }
  if (!activeTab) {
    // Falls through to a brief loading state — the workspace effect
    // above will open project-details on the next tick.
    return (
      <div className="viewer-empty">
        <div className="viewer-empty__inner">
          <h2>Loading project…</h2>
        </div>
      </div>
    )
  }
  if (activeTab.kind === 'project-details') {
    return (
      <div className="project-home" data-testid="project-home">
        <FindTabPanel />
      </div>
    )
  }
  if (activeTab.kind === 'record-create') {
    return (
      <RecordCreatePanel
        key={activeTab.id}
        nodeType={activeTab.nodeType}
        studyId={activeTab.studyId ?? studyId}
        experimentId={activeTab.experimentId}
        onCreated={() => ws.closeTab(activeTab.id)}
        onCancel={() => ws.closeTab(activeTab.id)}
      />
    )
  }
  if (activeTab.kind === 'record-edit') {
    return (
      <RecordEditPanel
        key={activeTab.id}
        recordId={activeTab.recordId}
        title={activeTab.title}
        recordKind={activeTab.recordKind}
        onClose={() => ws.closeTab(activeTab.id)}
      />
    )
  }
  if (activeTab.kind === 'execution') {
    return (
      <ExecutionTabShell
        key={activeTab.id}
        tab={activeTab}
      />
    )
  }
  if (activeTab.kind === 'collection') {
    switch (activeTab.collection) {
      case 'projects': return <ProjectCollectionView embedded />
      case 'runs': return <RunCollectionView embedded />
      case 'lab': return <LabCollectionView embedded />
      case 'claims': return <div className="workspace-empty">Claims collection — coming soon</div>
      default: return null
    }
  }
  return <Viewer tab={activeTab} onSendSelection={handleSendSelection} />
}
