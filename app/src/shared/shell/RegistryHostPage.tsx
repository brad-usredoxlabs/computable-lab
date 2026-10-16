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
import { useEffect } from 'react'
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { RightPane } from '../../event-editor/right-pane/RightPane'
import { WorkspaceProvider } from '../../event-editor/workspace/WorkspaceContext'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import { registryTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import RecordRegistryPage from '../../pages/RecordRegistryPage'

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

  return (
    <WorkspaceProvider studyId={SCRATCH_STUDY_ID}>
      <AppShell
        brand="Registry"
        layout="workspace"
        topbarTabs={<WorkspaceTabStrip />}
        leftPane={<RecordRegistryPage />}
        rightPane={<RightPane />}
      />
    </WorkspaceProvider>
  )
}
