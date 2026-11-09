/**
 * RegistryHostPage — /registry hosted in the unified workspace shell (QMS7-1).
 *
 * Mirrors RecordHostPage/ArtifactHostPage: the registry's list+editor two-pane
 * interaction stays as MAIN-PANE (leftPane) content, wrapped in the same shell
 * chrome — GlobalNavbar + WorkspaceTabStrip + the universal RightPane — so the
 * registry is a first-class workspace surface instead of a bare route.
 *
 * Unlike RecordHostPage there is no study to resolve: the registry is not
 * study-scoped, so it mounts the WorkspaceProvider on the scratch study
 * (STU-scratch), the same fallback every /record/:id visit already uses. The
 * selection→AI-context wiring lives inside RecordRegistryPage itself (it reads
 * the SAME WorkspaceContext via useOptionalWorkspace), not here.
 */
import { useEffect, useMemo } from 'react'
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { RightPane } from '../../event-editor/right-pane/RightPane'
import { WorkspaceProvider, useOptionalWorkspace } from '../../event-editor/workspace/WorkspaceContext'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import { registryTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import { SurfaceChatBridge } from './SurfaceChatBridge'
import type { AiContext } from '../../types/aiContext'
import RecordRegistryPage from '../../pages/RecordRegistryPage'

/**
 * L2-CHAT-UI-1 LEG C1: the registry's universal chat. Lives INSIDE the
 * WorkspaceProvider so it can read the live selection pointer —
 * RecordRegistryPage re-targets the workspace's active tab on selection
 * (QMS7-1), so the context follows the record the user is looking at
 * without any new wiring. Renders nothing (SurfaceChatBridge); RightPane's
 * panelSlot?.chat arm shows HarnessChatPane from here.
 */
function RegistrySurfaceChat() {
  const ws = useOptionalWorkspace()
  const activeTab = ws?.state.activeTabId
    ? ws.state.tabs.find((t) => t.id === ws.state.activeTabId) ?? null
    : null
  const aiContext = useMemo<AiContext>(() => ({
    surface: 'analysis',
    summary: `Record registry${activeTab?.kind === 'record-edit' && activeTab.recordId ? `, editing ${activeTab.recordId}` : ' (no record selected)'}`,
    surfaceContext: {
      studyId: ws?.state.studyId ?? SCRATCH_STUDY_ID,
      activeTabKind: activeTab?.kind ?? null,
      ...(activeTab?.kind === 'record-edit' ? { activeRecordId: activeTab.recordId } : {}),
    },
  }), [ws?.state.studyId, activeTab])
  // No scope: the registry is not instance-scoped (it rides the scratch
  // study), so its thread lives under the server's reserved "_" scope.
  return <SurfaceChatBridge host="registry-host" base={{ context: aiContext }} />
}

export function RegistryHostPage() {
  const openTabs = useOptionalOpenTabs()

  // Register/refresh the top-level tab so a deep link or refresh keeps it in
  // the strip (deep-link restore, Phase 4.3). openTab on an existing id
  // replaces the tab but preserves the breadcrumb seeded by the opener.
  // Deps use the stable `navigateActiveTab` callback (not the context object,
  // which has a fresh identity every provider render → infinite update loop).
  const navigateActiveTab = openTabs?.navigateActiveTab
  useEffect(() => {
    if (!navigateActiveTab) return
    const tab: WorkspaceTab = {
      id: registryTabId(),
      kind: 'registry',
      title: 'Registry',
    }
    navigateActiveTab(tab)
  }, [navigateActiveTab])

  // The registry edits wide diagnostic/QMS records: the record pane gets a
  // wider default split than the prose-oriented 60/40.
  return (
    <WorkspaceProvider studyId={SCRATCH_STUDY_ID}>
      <RegistrySurfaceChat />
      <AppShell
        brand="Registry"
        layout="workspace"
        mainPaneDefaultSize={74}
        topbarTabs={<WorkspaceTabStrip />}
        leftPane={<RecordRegistryPage />}
        rightPane={<RightPane />}
      />
    </WorkspaceProvider>
  )
}
