/**
 * RecordHostPage — standalone route for a record editor in its own top-level tab.
 *
 * Two modes:
 *  - edit:   /record/:recordId            → RecordEditPanel
 *  - create: /record/new/:nodeType/:parentId? → RecordCreatePanel
 *
 * Mirrors ArtifactHostPage: wraps the panel in the workspace shell (tab strip +
 * right pane) so the two-pane layout and the per-tab breadcrumb are preserved.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { RightPane } from '../../event-editor/right-pane/RightPane'
import { WorkspaceProvider } from '../../event-editor/workspace/WorkspaceContext'
import { RecordCreatePanel, type CreateNodeType } from '../../event-editor/create/RecordCreatePanel'
import { RecordEditPanel } from '../../event-editor/create/RecordEditPanel'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import { recordCreateTabId, recordEditTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import { apiClient } from '../../shared/api/client'

export function RecordHostPage() {
  const { recordId, nodeType, parentId } = useParams<{
    recordId?: string
    nodeType?: string
    parentId?: string
  }>()
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()

  // Resolve the owning study for the right-pane context (best-effort).
  const [studyId, setStudyId] = useState<string>(SCRATCH_STUDY_ID)
  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    void apiClient
      .getRecord(recordId)
      .then((env) => {
        if (cancelled) return
        const p = env?.payload as { studyId?: string; links?: { studyId?: string } } | undefined
        const sid = p?.studyId ?? p?.links?.studyId
        if (sid) setStudyId(sid)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [recordId])

  // Register/refresh the top-level tab so a deep link or refresh keeps it in
  // the strip (deep-link restore, Phase 4.3). openTab on an existing id
  // replaces the tab but preserves the breadcrumb seeded by the opener.
  useEffect(() => {
    if (!openTabs) return
    if (!nodeType && recordId) {
      const tab: WorkspaceTab = {
        id: recordEditTabId(recordId),
        kind: 'record-edit',
        recordId,
        title: recordId,
      }
      openTabs.openTab(tab, true)
    } else if (nodeType) {
      const nt = nodeType as CreateNodeType
      const tab: WorkspaceTab = {
        id: recordCreateTabId(nt, parentId),
        kind: 'record-create',
        nodeType: nt,
        title: 'New record',
        ...(nt === 'run' && parentId ? { experimentId: parentId } : {}),
        ...(nt === 'experiment' && parentId ? { studyId: parentId } : {}),
      }
      openTabs.openTab(tab, true)
    }
  }, [recordId, nodeType, parentId, openTabs])

  const isCreate = !!nodeType

  const handleClose = () => navigate('/projects')

  const leftPane = isCreate ? (
    <RecordCreatePanel
      key={`create:${nodeType}:${parentId ?? ''}`}
      nodeType={(nodeType as CreateNodeType)}
      studyId={parentId ?? studyId}
      onCreated={() => navigate('/projects')}
      onCancel={handleClose}
    />
  ) : (
    <RecordEditPanel
      key={`edit:${recordId}`}
      recordId={recordId ?? ''}
      title={recordId ?? 'Record'}
      onClose={handleClose}
    />
  )

  return (
    <WorkspaceProvider studyId={studyId}>
      <AppShell
        brand={isCreate ? 'New record' : 'Record'}
        layout="workspace"
        topbarTabs={<WorkspaceTabStrip />}
        leftPane={leftPane}
        rightPane={<RightPane />}
      />
    </WorkspaceProvider>
  )
}
