/**
 * ProjectWorkspacePage — route component for `/project/:studyId`.
 *
 * Phase 3 stood up the chrome (topbar tabs, workspace layout, persistence).
 * Phase 4 wired the polymorphic Viewer + ViewerToolbar dispatchers into the
 * left pane and toolbar slots, with `EventEditorProvider` (deck tabs) /
 * `PdfStateProvider` (pdf tabs) / `DocumentStateProvider` (document tabs)
 * wrapping the shell conditionally — required so the per-kind toolbar and
 * viewer share state across AppShell's separate slots.
 *
 * Phase 7 replaces the right-pane mode placeholder with `RightPane` — three
 * sibling panels (AI / Search / Browse) switched by the workspace-state
 * mode. Browse is now the canonical way to open viewer tabs, so the
 * prompt-based CTAs from earlier phases are gone.
 */

import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell, NavLinks } from '../../shared/shell'
import {
  WorkspaceProvider,
  useWorkspace,
} from '../workspace/WorkspaceContext'
import { useOpenStudies } from '../workspace/useOpenStudies'
import { EventEditorProvider } from '../EventEditorContext'
import { PdfStateProvider } from '../viewer/pdf/PdfViewerContext'
import { DocumentStateProvider } from '../viewer/document/DocumentEditorContext'
import { Viewer } from '../viewer/Viewer'
import { ViewerToolbar } from '../viewer/ViewerToolbar'
import { ProjectTabStrip } from './ProjectTabStrip'
import { RightPane } from '../right-pane/RightPane'
import type { WorkspaceTab } from '../workspace/types'
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
      <AppShell brand="Project workspace" topbarRight={<NavLinks />}>
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

  // Deep-linked study → make sure the topbar tab strip shows it. Paste /
  // back / fresh-bookmark all skip the picker that would normally do this.
  useEffect(() => {
    openStudy(studyId)
  }, [studyId, openStudy])

  // Phase 10 deep-link: open a deck tab for the named event graph once
  // the workspace state has loaded. We only do this once per
  // (studyId, eventGraphId) pair — `openTab` is a fresh function each
  // render and would otherwise refire the effect on every state change.
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

  const activeTab = findActiveTab(ws.state.tabs, ws.state.activeTabId)

  const shellContent = (
    <AppShell
      brand="Project"
      topbarTabs={<ProjectTabStrip />}
      topbarRight={<NavLinks />}
      layout="workspace"
      panelAutoSaveId={`project:${studyId}`}
      viewerToolbar={<ViewerToolbar tab={activeTab} />}
      leftPane={<LeftPane activeTab={activeTab} />}
      rightPane={<RightPane />}
    />
  )

  // Deck viewers need `EventEditorProvider` in scope for both the toolbar
  // chips AND the DeckStage. AppShell renders those into separate slots, so
  // the provider has to wrap the whole shell. `key` forces a clean remount
  // when the user switches between deck tabs (different eventGraphIds).
  if (activeTab?.kind === 'deck') {
    return (
      <EventEditorProvider
        key={activeTab.eventGraphId}
        eventGraphId={activeTab.eventGraphId}
      >
        {shellContent}
      </EventEditorProvider>
    )
  }
  // PDF tabs likewise: the toolbar (page nav / zoom / search) and the
  // viewer (canvas pages + extracted text) share PdfStateProvider so both
  // AppShell slots see the same artifact / state.
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
  // Document tabs: the toolbar (mark / heading / list buttons) and the
  // EditorContent share the same TipTap Editor through
  // DocumentStateProvider. Same shape as the deck + pdf providers above.
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
}

function LeftPane({ activeTab }: LeftPaneProps) {
  if (!activeTab) {
    return (
      <div className="viewer-empty">
        <div className="viewer-empty__inner">
          <h2>No viewer open</h2>
          <p>
            Switch the right pane to <strong>Browse</strong> to pick an
            artifact (PDFs, protocols, write-ups, training records,
            conclusions). Clicking a row opens it here.
          </p>
        </div>
      </div>
    )
  }
  return <Viewer tab={activeTab} />
}
