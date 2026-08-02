/**
 * RunWorkspacePage - Main page for run workspace with Plan/Execute mode toggle.
 * Route: /project/:studyId/run/:runId?mode=plan|execute
 * 
 * - Plan Mode: Shows the Event Editor (LabwareEventEditor)
 * - Execute Mode: Shows the ExecutionView with step-by-step navigation
 * - Both modes read from the same EventGraph document
 * - Right rail adapts: Plan → AI tab; Execute → Chat tab with run conversation
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EventEditorProvider } from '../event-editor/EventEditorContext'
import { WorkspaceProvider } from '../event-editor/workspace/WorkspaceContext'
import { RightPane } from '../event-editor/right-pane/RightPane'
import { RunWorkspaceShell } from './RunWorkspaceShell'
import { useModeToggle } from './lib/mode-toggle'
import { ExecutionView } from '../graph/execution/ExecutionView'
import { DeckViewer } from '../event-editor/viewer/deck/DeckViewer'
import { apiClient } from '../shared/api/client'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { runTabId } from '../event-editor/workspace/types'
import { SCRATCH_STUDY_ID } from '../event-editor/legacyRouteResolution'
import type { PlateEvent } from '../types/events'
import './RunWorkspacePage.css'

export function RunWorkspacePage() {
  const { studyId: urlStudyId, runId } = useParams<{ studyId?: string; runId: string }>()
  const { mode } = useModeToggle()
  const [resolvedStudyId, setResolvedStudyId] = useState<string | null>(urlStudyId ?? null)
  const [resolvedEventGraphId, setResolvedEventGraphId] = useState<string | undefined>(undefined)
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
      })
      .catch(() => {
        if (!cancelled) setResolvedStudyId(SCRATCH_STUDY_ID)
      })
    return () => { cancelled = true }
  }, [urlStudyId, runId])

  // Open a run tab in the tab strip on mount
  useEffect(() => {
    if (!runId || !openTabs) return
    openTabs.openTab({
      id: runTabId(runId),
      kind: 'run',
      runId,
      title: `Run ${runId}`,
    }, true)
  }, [runId])

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

  return (
    <WorkspaceProvider studyId={resolvedStudyId}>
      <EventEditorProvider
        runId={runId}
        {...(resolvedEventGraphId ? { eventGraphId: resolvedEventGraphId } : {})}
      >
        <RunWorkspaceShell rightPane={<RightPane />}>
          <RunWorkspaceContent runId={runId} mode={mode} />
        </RunWorkspaceShell>
      </EventEditorProvider>
    </WorkspaceProvider>
  )
}

interface RunWorkspaceContentProps {
  runId: string
  mode: 'plan' | 'execute'
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
