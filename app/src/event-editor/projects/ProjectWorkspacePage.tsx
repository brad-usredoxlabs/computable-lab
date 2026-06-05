/**
 * ProjectWorkspacePage — route component for `/project/:studyId/:mode?`.
 *
 * Project tab strip in row 1 of the topbar switches studies. The mode
 * selector inline in the chrome row switches *within* a project (event-
 * editor vs protocols vs browser vs literature). When mode is the
 * default (`event-editor`), the page renders the full workspace shell:
 * viewer toolbar + viewer pane on the left + AI/Search/Browse on the
 * right. For other modes, the body of each legacy page (extracted into
 * `XxxBody.tsx`) is embedded inline as the leftPane, and the right
 * pane / viewer toolbar collapse so the mode can use the full width.
 *
 * Global `<NavLinks />` is gone from this shell — mode switching IS the
 * navigation. The legacy `/protocols`, `/browser`, `/literature` URLs
 * redirect into this dispatcher (see legacyRouteResolution).
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
import { ProjectModeSelector } from './ProjectModeSelector'
import { projectModeFromParam, type ProjectMode } from './projectMode'
import { RightPane } from '../right-pane/RightPane'
import { ProtocolsBody } from '../../protocols/ProtocolsBody'
import { BrowserBody } from '../../browser/BrowserBody'
import { LiteratureBody } from '../../literature/LiteratureBody'
import type { WorkspaceTab } from '../workspace/types'
import '../viewer/viewer.css'
import '../styles/eventEditor.css'
import './ProjectWorkspacePage.css'

export function ProjectWorkspacePage() {
  const { studyId, eventGraphId, mode: rawMode } = useParams<{
    studyId: string
    eventGraphId?: string
    mode?: string
  }>()
  const mode = projectModeFromParam(rawMode)

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
        mode={mode}
        autoOpenEventGraphId={eventGraphId ?? null}
      />
    </WorkspaceProvider>
  )
}

interface WorkspaceShellHostProps {
  studyId: string
  mode: ProjectMode
  /** When the route is /project/:studyId/event-graph/:eventGraphId, the
   *  workspace opens a deck tab for that graph on mount. Used by the
   *  Phase 10 legacy redirect (`/event-editor/:eventGraphId`). */
  autoOpenEventGraphId?: string | null
}

function WorkspaceShellHost({
  studyId,
  mode,
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
  // the workspace state has loaded.
  const openedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoOpenEventGraphId) return
    if (!ws.ready) return
    if (mode !== 'event-editor') return
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

  // Mode selector + brand-menu live in the chrome row of the topbar.
  // NavLinks is gone — modes are the navigation now.
  const topbarMiddle = <ProjectModeSelector studyId={studyId} />

  if (mode !== 'event-editor') {
    // Non-deck modes (protocols / browser / literature) take over the full
    // workspace body: the leftPane carries their body, the rightPane and
    // viewer toolbar are unused. The mode bodies own their own internal
    // sub-tabs, AI provider, and chrome row.
    return (
      <AppShell
        brand="Project"
        topbarTabs={<ProjectTabStrip />}
        topbarMiddle={topbarMiddle}
        layout="workspace"
        panelAutoSaveId={`project:${studyId}:${mode}`}
        leftPane={<ModeBody mode={mode} />}
      />
    )
  }

  const activeTab = findActiveTab(ws.state.tabs, ws.state.activeTabId)

  const shellContent = (
    <AppShell
      brand="Project"
      topbarTabs={<ProjectTabStrip />}
      topbarMiddle={topbarMiddle}
      layout="workspace"
      panelAutoSaveId={`project:${studyId}`}
      viewerToolbar={<ViewerToolbar tab={activeTab} />}
      leftPane={<LeftPane activeTab={activeTab} />}
      rightPane={<RightPane />}
    />
  )

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
  return shellContent
}

function findActiveTab(
  tabs: WorkspaceTab[],
  activeTabId: string | null,
): WorkspaceTab | null {
  if (!activeTabId) return null
  return tabs.find((t) => t.id === activeTabId) ?? null
}

interface ModeBodyProps {
  mode: Exclude<ProjectMode, 'event-editor'>
}

function ModeBody({ mode }: ModeBodyProps) {
  switch (mode) {
    case 'protocols':
      return <ProtocolsBody />
    case 'browser':
      return <BrowserBody />
    case 'literature':
      return <LiteratureBody />
    default: {
      const _exhaustive: never = mode
      return _exhaustive ?? null
    }
  }
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
