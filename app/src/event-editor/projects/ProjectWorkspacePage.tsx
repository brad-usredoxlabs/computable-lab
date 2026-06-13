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
 *     defaults open one for any study with no other tabs.
 *
 * Phase 11's mode dispatcher (event-editor / protocols / browser /
 * literature) is gone. ProtocolsBody / BrowserBody / LiteratureBody no
 * longer mount inline here — those routes redirect to `/` (Phase 12.6).
 *
 * Left-pane dispatch on `activeTab.kind`:
 *   - 'project-details' → <ProjectDetailsView /> (Phase 12.5)
 *   - 'deck'            → DeckStage via <Viewer /> + EventEditorProvider
 *   - 'pdf'             → <PdfViewer /> + PdfStateProvider
 *   - 'document'        → <DocumentEditor /> + DocumentStateProvider
 */

import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../shared/shell'
import {
  WorkspaceProvider,
  useWorkspace,
} from '../workspace/WorkspaceContext'
import { useOpenStudies } from '../workspace/useOpenStudies'
import { EventEditorProvider } from '../EventEditorContext'
import { FocusModalsProvider } from '../focus/FocusModalsProvider'
import { PdfStateProvider } from '../viewer/pdf/PdfViewerContext'
import { DocumentStateProvider } from '../viewer/document/DocumentEditorContext'
import { Viewer } from '../viewer/Viewer'
import { ViewerToolbar } from '../viewer/ViewerToolbar'
import { ProjectTabStrip } from './ProjectTabStrip'
import { ProjectDetailsView } from './ProjectDetailsView'
import { RecordCreatePanel } from '../create/RecordCreatePanel'
import { RecordEditPanel } from '../create/RecordEditPanel'
import { RightPane } from '../right-pane/RightPane'
import type { WorkspaceTab } from '../workspace/types'
import { projectDetailsTabId } from '../workspace/types'
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
  const { openStudy } = useOpenStudies()

  // Deep-linked study → make sure the topbar tab strip shows it.
  useEffect(() => {
    openStudy(studyId)
  }, [studyId, openStudy])

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

  // Phase 12: when the workspace loads with no tabs (e.g. fresh study,
  // no workspace.yaml yet), make sure there's at least the canonical
  // project-details tab so the user lands somewhere. parseWorkspaceState
  // also inserts this on the server, but client-side defaultWorkspaceState
  // already does it too — this is the "loaded from server returned
  // partial state" safety net.
  useEffect(() => {
    if (!ws.ready) return
    if (ws.state.tabs.length > 0) return
    const id = projectDetailsTabId(studyId)
    ws.openTab({ id, kind: 'project-details', title: 'Project' })
  }, [studyId, ws.ready, ws.state.tabs.length, ws.openTab])

  const activeTab = findActiveTab(ws.state.tabs, ws.state.activeTabId)

  const shellContent = (
    <AppShell
      brand="Project"
      topbarTabs={<ProjectTabStrip />}
      layout="workspace"
      panelAutoSaveId={`project:${studyId}`}
      viewerToolbar={<ViewerToolbar tab={activeTab} />}
      leftPane={<LeftPane activeTab={activeTab} studyId={studyId} />}
      rightPane={<RightPane />}
    />
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
        <FocusModalsProvider>{shellContent}</FocusModalsProvider>
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
    return <ProjectDetailsView studyId={studyId} />
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
        onClose={() => ws.closeTab(activeTab.id)}
      />
    )
  }
  return <Viewer tab={activeTab} />
}
