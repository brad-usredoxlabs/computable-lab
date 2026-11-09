/**
 * RunWorkspacePage - Main page for run workspace with Plan/Execute mode toggle.
 * Route: /project/:studyId/run/:runId?mode=plan|execute
 * 
 * - Plan Mode: Shows the Event Editor (LabwareEventEditor)
 * - Execute Mode: Shows the ExecutionView with step-by-step navigation
 * - Both modes read from the same EventGraph document
 * - Right rail adapts: Plan → AI tab; Execute → Chat tab with run conversation
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EventEditorProvider } from '../event-editor/EventEditorContext'
import { WorkspaceProvider } from '../event-editor/workspace/WorkspaceContext'
import { HarnessChatPane } from '../agent/HarnessChatPane'
import { DeckChatSlice } from '../event-editor/deck/DeckChatSlice'
import { SurfaceChatBridge } from '../shared/shell/SurfaceChatBridge'
import type { AiContext } from '../types/aiContext'
import { RunWorkspaceShell } from './RunWorkspaceShell'
import { useModeToggle, ModeToggle, type RunMode } from './lib/mode-toggle'
import { ExecutionView } from '../graph/execution/ExecutionView'
import { DeckViewer } from '../event-editor/viewer/deck/DeckViewer'
import { DeckToolbar } from '../event-editor/viewer/deck/DeckToolbar'
import { FocusModalsProvider } from '../event-editor/focus/FocusModalsProvider'
import { ProtocolSelectionProvider } from '../event-editor/protocol/ProtocolSelectionContext'
import { ChatFocusProvider } from '../agent/ChatFocusContext'
import { ProtocolPreviewBridge } from '../event-editor/protocol/ProtocolPreviewBridge'
import { RunNavPane } from './RunNavPane'
import { RunProtocolStepsLoader } from './RunProtocolStepsLoader'
import { GcRunSheetSection } from './gc/GcRunSheetSection'
import { apiClient } from '../shared/api/client'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { runTabId, type WorkspaceTab } from '../event-editor/workspace/types'
import { SCRATCH_STUDY_ID } from '../event-editor/legacyRouteResolution'
import type { PlateEvent } from '../types/events'
import './RunWorkspacePage.css'
import '../event-editor/viewer/viewer.css'
import '../event-editor/styles/eventEditor.css'

export function RunWorkspacePage() {
  const { studyId: urlStudyId, runId } = useParams<{ studyId?: string; runId: string }>()
  const { mode, setMode } = useModeToggle()
  const [resolvedStudyId, setResolvedStudyId] = useState<string | null>(urlStudyId ?? null)
  const [resolvedEventGraphId, setResolvedEventGraphId] = useState<string | undefined>(undefined)
  const [runTitle, setRunTitle] = useState<string | null>(null)
  // GC-12 (D1): the run record's `kind`, resolved by the existing mount
  // getRecord below. The GC run-sheet section mounts ONLY when the record is
  // a `run` (the /runs/:runId surface is a RUN-record id — GC-D1). A non-run
  // record (or an unresolved record) never mounts the section — the DNA case
  // stays byte-identical (bait #2). No SECOND getRecord is fired here; this
  // reuses the page's single mount fetch.
  const [runKind, setRunKind] = useState<string | null>(null)
  const openTabs = useOptionalOpenTabs()

  // When studyId is not in the URL (route /runs/:runId), fetch it from
  // the run record's payload. Also fetch the methodEventGraphId so the
  // EventEditorProvider can load the run's method deck. Fall back to
  // scratch study if not found.
  useEffect(() => {
    if (urlStudyId) {
      setResolvedStudyId(urlStudyId)
      return
    }
    if (!runId) return
    let cancelled = false
    apiClient.getRecord(runId)
      .then((env) => {
        const payload = env.payload as Record<string, unknown>
        const sid = typeof payload.studyId === 'string' ? payload.studyId : null
        if (!cancelled) setResolvedStudyId(sid ?? SCRATCH_STUDY_ID)
        const egId = typeof payload.methodEventGraphId === 'string' ? payload.methodEventGraphId : undefined
        if (!cancelled) setResolvedEventGraphId(egId)
        const t = typeof payload.title === 'string' && payload.title.trim() ? payload.title : null
        if (!cancelled) setRunTitle(t)
        const k = typeof payload.kind === 'string' ? payload.kind : null
        if (!cancelled) setRunKind(k)
      })
      .catch(() => {
        if (!cancelled) setResolvedStudyId(SCRATCH_STUDY_ID)
      })
    return () => { cancelled = true }
  }, [urlStudyId, runId])

  // Open a run tab on mount (deep-links, direct navigation, refresh) — but
  // IN THE CURRENT TAB (browser model), not a separate/duplicate top-level tab.
  // Deps: the stable `navigateActiveTab` callback (memoized inside
  // OpenTabsProvider), NOT the context object itself — that object gets a
  // fresh identity on every provider render, and depending on it here made
  // this effect re-fire on every dispatch it caused (infinite update loop).
  const navigateActiveTab = openTabs?.navigateActiveTab
  useEffect(() => {
    if (!runId || !navigateActiveTab) return
    const title = runTitle ?? `Run ${runId}`
    navigateActiveTab({ id: runTabId(runId), kind: 'run', runId, title })
  }, [runId, runTitle, navigateActiveTab])

  // Reflect an instant run rename (dispatched by DeckToolbar on commit) in the
  // displayed title and the top-level run tab without waiting for a refetch.
  useEffect(() => {
    if (!runId) return
    const onRenamed = (event: Event) => {
      const detail = (event as CustomEvent<{ runId?: string; title?: string }>).detail
      if (detail?.runId === runId && typeof detail.title === 'string') {
        setRunTitle(detail.title)
      }
    }
    window.addEventListener('cl:run-renamed', onRenamed)
    return () => window.removeEventListener('cl:run-renamed', onRenamed)
  }, [runId])

  const aiContext = useMemo((): AiContext => ({
    surface: 'run-workspace',
    summary: `Run workspace: ${runId}${runTitle ? ` — ${runTitle}` : ''}`,
    surfaceContext: {
      runId,
      studyId: resolvedStudyId,
      runTitle: runTitle ?? null,
      mode,
      ...(resolvedEventGraphId ? { eventGraphId: resolvedEventGraphId } : {}),
    },
    editorMode: mode,
  }), [runId, resolvedStudyId, runTitle, mode, resolvedEventGraphId])

  // CHATHOST-CONSOLIDATE-1: the universal chat is registered by the ONE
  // registrar (host="run-workspace") INSIDE the EventEditorProvider below
  // (the page's top-level call used to sit above the provider and therefore
  // could never wire onAcceptEvent or the ghost seam — the spec §1 defect).
  // The pane consumes the chat through the app-level AiPanelContext, so the
  // call's position in the tree does not
  // change what the pane sees.

  if (!runId) {
    return (
      <div className="run-workspace-page__error">
        <h1>Missing run</h1>
        <p>Run ID is missing from the URL.</p>
      </div>
    )
  }

  if (!resolvedStudyId) {
    return (
      <div className="run-workspace-page__error">
        <p>Loading run…</p>
      </div>
    )
  }

  const title = runTitle ?? `Run ${runId}`

  const deckTab: WorkspaceTab = {
    id: runTabId(runId),
    kind: 'deck',
    eventGraphId: resolvedEventGraphId ?? '',
    ...(runId ? { runId } : {}),
    title,
  }

  const runBreadcrumb = openTabs?.state.tabs.find((t) => t.tab.id === runTabId(runId))?.breadcrumb ?? []

  return (
    <ProtocolSelectionProvider>
      <RunProtocolStepsLoader runId={runId} />
      <WorkspaceProvider studyId={resolvedStudyId}>
        <EventEditorProvider
          runId={runId}
          {...(resolvedEventGraphId ? { eventGraphId: resolvedEventGraphId } : {})}
        >
          <ProtocolPreviewBridge />
          <FocusModalsProvider>
            {/* LEG E / E-α: the pane's working-focus carrier. The bridge
                (below) PUBLISHES the run's resolved working focus — the
                focused step from ProtocolSelectionContext — and the
                HarnessChatPane's SurfaceFocusHeader (the rightPane slot)
                RENDERS it; both live inside this provider so the run chat
                keeps its "what are we looking at" header after LEG D deleted
                the legacy ChatContextHeader. Deck precedent:
                DeckHostPage.tsx:138 wraps the deck subtree the same way. */}
            <ChatFocusProvider>
              {/* CHATHOST-CONSOLIDATE-1: the ONE registrar (host
                  "run-workspace" — the YAML door registry id). The deck slice is
                  PUBLISHED by DeckChatSlice (inside EventEditorProvider, INSIDE
                  the provider where it reads the real editor state) and the
                  registrar collects it through the store. The run door passes its
                  own base context (surface 'run-workspace', the run title, the
                  plan/execute mode) — the collector keeps the run surface/summary/
                  editorMode and merges the deck slice's endpoint/scope/handlers +
                  the well-selection context (the J1 selectedWells channel, which
                  the old top-level page call could never see). The deck slice is
                  REQUIRED for this host (config/chat/chat-hosts.yaml
                  required_providers: [deck]); a missing publisher is a loud
                  error, never a silent empty pane. */}
              <DeckChatSlice />
              <SurfaceChatBridge host="run-workspace" base={{ context: aiContext }} />
              <RunWorkspaceShell
                navPane={<RunNavPane title={title} runId={runId} studyId={resolvedStudyId} />}
                rightPane={<HarnessChatPane />}
                viewerToolbar={
                  <div className="run-workspace-toolbar">
                    <ModeToggle mode={mode} onChange={setMode} />
                    <DeckToolbar tab={deckTab} breadcrumb={runBreadcrumb} />
                  </div>
                }
              >
                {/* GC-12 (D1/D2): the additive GC run-sheet section — mounts
                    ONLY when the record resolved as kind 'run' (the /runs/:runId
                    surface is a RUN-record id). The section renders NOTHING
                    when no instrument-sequence links the run (the DNA case is
                    byte-identical — bait #2) and owns its own single probe. */}
                {runKind === 'run' ? <GcRunSheetSection runId={runId} /> : null}
                <RunWorkspaceContent runId={runId} mode={mode} />
              </RunWorkspaceShell>
            </ChatFocusProvider>

          </FocusModalsProvider>
        </EventEditorProvider>
      </WorkspaceProvider>
    </ProtocolSelectionProvider>
  )
}

/**
 * RunWorkspaceContent - renders the action pane by mode: Execute = ExecutionView,
 * Plan = DeckViewer.
 */
interface RunWorkspaceContentProps {
  runId: string
  mode: RunMode
}

function RunWorkspaceContent({ runId, mode }: RunWorkspaceContentProps) {
  // Mock data - in production, fetch from API
  const [events] = useState<PlateEvent[]>([])
  const [executionStates, setExecutionStates] = useState<
    Record<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }>
  >({})

  const handleExecutionStateChange = async (
    eventId: string,
    state: { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }
  ) => {
    setExecutionStates((prev) => ({ ...prev, [eventId]: state }))
    // TODO: Persist to API
  }

  const handleDeviationCaptured = (deviationId: string) => {
    console.log('Deviation captured:', deviationId)
    // TODO: Handle deviation
  }

  if (mode === 'execute') {
    return (
      <ExecutionView
        runId={runId}
        events={events}
        executionStates={executionStates}
        onExecutionStateChange={handleExecutionStateChange}
        onDeviationCaptured={handleDeviationCaptured}
      />
    )
  }

  // Plan mode — render the DeckViewer (deck stage + event graph editor).
  // EventEditorProvider is already wrapping the entire shell one level up.
  return <DeckViewer />
}
