/**
 * DeckHostPage — standalone route component for /deck/:eventGraphId/:runId?.
 *
 * Renders an event-graph deck (plate viewer) as its OWN top-level tab with a
 * full workspace shell (tab strip, deck toolbar, right pane, per-tab
 * breadcrumb). Mirrors ArtifactHostPage / RecordHostPage.
 *
 * The deck viewer requires the same provider stack that ProjectWorkspacePage
 * sets up for a `kind:'deck'` tab: EventEditorProvider (keyed on tab id so a
 * fresh canvas keeps its identity) wrapping FocusModalsProvider, with
 * ProtocolSelectionProvider around the shell and a ProtocolPreviewBridge
 * mounted inside. The run record is fetched on mount to resolve studyId +
 * title; a run-less (bare) deck falls back to the scratch study.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { RightPane } from '../../event-editor/right-pane/RightPane'
import { WorkspaceProvider } from '../../event-editor/workspace/WorkspaceContext'
import { EventEditorProvider } from '../../event-editor/EventEditorContext'
import { FocusModalsProvider } from '../../event-editor/focus/FocusModalsProvider'
import { ProtocolSelectionProvider } from '../../event-editor/protocol/ProtocolSelectionContext'
import { ProtocolPreviewBridge } from '../../event-editor/protocol/ProtocolPreviewBridge'
import { Viewer } from '../../event-editor/viewer/Viewer'
import { DeckToolbar } from '../../event-editor/viewer/deck/DeckToolbar'
import { apiClient } from '../../shared/api/client'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import { deckTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import '../../event-editor/viewer/viewer.css'
import '../../event-editor/styles/eventEditor.css'

interface DeckMeta {
  studyId: string
  title: string
}

export function DeckHostPage() {
  const { eventGraphId, runId } = useParams<{ eventGraphId: string; runId?: string }>()
  const openTabs = useOptionalOpenTabs()

  const [meta, setMeta] = useState<DeckMeta | null>(null)

  // Resolve the owning study + a human title. Run-bound decks fetch the run
  // record (studyId can come from payload.studyId or payload.links.studyId);
  // bare decks fall back to the scratch study and the graph id as the title.
  useEffect(() => {
    if (!eventGraphId) return
    let cancelled = false
    const setDefault = () => {
      if (!cancelled) setMeta({ studyId: SCRATCH_STUDY_ID, title: eventGraphId })
    }
    if (!runId) {
      setDefault()
      return
    }
    apiClient
      .getRecord(runId)
      .then((env) => {
        if (cancelled) return
        const p = env?.payload as
          | { studyId?: string; links?: { studyId?: string }; title?: string; projectIds?: string[] }
          | undefined
        const sid =
          p?.studyId ?? p?.links?.studyId ?? (p?.projectIds && p.projectIds[0]) ?? SCRATCH_STUDY_ID
        const t = typeof p?.title === 'string' && p.title.trim() ? p.title : eventGraphId
        setMeta({ studyId: sid, title: t })
      })
      .catch(() => setDefault())
    return () => {
      cancelled = true
    }
  }, [eventGraphId, runId])

  // Register/refresh the top-level tab so the strip shows it. openTab on an
  // existing id replaces the tab but preserves any seedBreadcrumb — the opener
  // (e.g. attachProtocolMethod) seeds the project origin, and a raw deep link
  // just lands with an empty trail.
  useEffect(() => {
    if (!eventGraphId || !meta || !openTabs) return
    const tab: WorkspaceTab = {
      id: deckTabId(eventGraphId),
      kind: 'deck',
      eventGraphId,
      ...(runId ? { runId } : {}),
      title: meta.title,
    }
    openTabs.navigateActiveTab(tab)
  }, [eventGraphId, runId, meta, openTabs])

  if (!eventGraphId) {
    return (
      <AppShell brand="Deck">
        <p>Missing deck parameters.</p>
      </AppShell>
    )
  }
  if (!meta) {
    return (
      <AppShell brand="Deck">
        <p>Loading deck…</p>
      </AppShell>
    )
  }

  const deckTab: WorkspaceTab = {
    id: deckTabId(eventGraphId),
    kind: 'deck',
    eventGraphId,
    ...(runId ? { runId } : {}),
    title: meta.title,
  }
  const breadcrumb =
    openTabs?.state.tabs.find((t) => t.tab.id === deckTab.id)?.breadcrumb ?? []

  const leftPane = <Viewer tab={deckTab} />

  return (
    <WorkspaceProvider studyId={meta.studyId}>
      <EventEditorProvider
        key={deckTab.id}
        eventGraphId={eventGraphId}
        {...(runId ? { runId } : {})}
      >
        <FocusModalsProvider>
          <ProtocolSelectionProvider>
            <AppShell
              brand={meta.title}
              layout="workspace"
              topbarTabs={<WorkspaceTabStrip />}
              viewerToolbar={<DeckToolbar tab={deckTab} breadcrumb={breadcrumb} />}
              leftPane={leftPane}
              rightPane={<RightPane />}
            />
          </ProtocolSelectionProvider>
          <ProtocolPreviewBridge />
        </FocusModalsProvider>
      </EventEditorProvider>
    </WorkspaceProvider>
  )
}
