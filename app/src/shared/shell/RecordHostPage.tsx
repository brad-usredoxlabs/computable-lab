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
import { apiClient, type AccessPolicyResponse } from '../../shared/api/client'
import { ShareRecordDialog } from '../sharing/ShareRecordDialog'

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

  // In create mode a run's :parentId is the EXPERIMENT it hangs under (the
  // route is /record/new/run/:experimentId). Resolve that experiment's study
  // so the run is stamped with the correct studyId (a run belongs to a study
  // through its experiment, not through the experiment's own id). Without this
  // the run gets studyId=<experimentId> and no experimentId, orphaning it from
  // the study tree (invisible on the project homepage and /runs).
  useEffect(() => {
    if (nodeType !== 'run' || !parentId) return
    let cancelled = false
    void apiClient
      .getRecord(parentId)
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
  }, [nodeType, parentId])

  // Register/refresh the top-level tab so a deep link or refresh keeps it in
  // the strip (deep-link restore, Phase 4.3). openTab on an existing id
  // replaces the tab but preserves the breadcrumb seeded by the opener.
  // Deps use the stable `navigateActiveTab` callback (not the context object,
  // which has a fresh identity every provider render → infinite update loop).
  const navigateActiveTab = openTabs?.navigateActiveTab
  useEffect(() => {
    if (!navigateActiveTab) return
    if (!nodeType && recordId) {
      const tab: WorkspaceTab = {
        id: recordEditTabId(recordId),
        kind: 'record-edit',
        recordId,
        title: recordId,
      }
      navigateActiveTab(tab)
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
      navigateActiveTab(tab)
    }
  }, [recordId, nodeType, parentId, navigateActiveTab])

  const isCreate = !!nodeType

  // OWN-14: the Share control's visibility is the ONE server-declared fact —
  // the (isPolicyRoot, canAdmin) pair from getAccessPolicy(recordId). No
  // client-side kind list, no payload.kind scan. Nothing renders while the
  // policy is loading, when the pair says no, on a failed read, or in create
  // mode (where no fetch happens at all).
  const [sharePolicy, setSharePolicy] = useState<AccessPolicyResponse | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  useEffect(() => {
    setSharePolicy(null)
    setShareOpen(false)
    if (nodeType || !recordId) return
    let cancelled = false
    void apiClient
      .getAccessPolicy(recordId)
      .then((policy) => {
        if (!cancelled) setSharePolicy(policy)
      })
      .catch(() => {
        // A record whose policy cannot be read shows NO share control — the
        // server fact is unavailable, so nothing is declared shareable.
        if (!cancelled) setSharePolicy(null)
      })
    return () => {
      cancelled = true
    }
  }, [recordId, nodeType])
  const canShare =
    !isCreate && Boolean(recordId) && Boolean(sharePolicy?.isPolicyRoot && sharePolicy.canAdmin)

  const handleClose = () => navigate('/projects')

  const leftPane = isCreate ? (
    <RecordCreatePanel
      key={`create:${nodeType}:${parentId ?? ''}`}
      nodeType={(nodeType as CreateNodeType)}
      studyId={nodeType === 'run' ? studyId : (parentId ?? studyId)}
      experimentId={nodeType === 'run' && parentId ? parentId : undefined}
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
        viewerToolbar={
          canShare ? (
            // AppShell's `.cl-workspace__toolbar` slot supplies the row layout;
            // the button reuses the record panel's existing button styling
            // (RecordCreatePanel.css is loaded by the panel in this pane).
            <button
              type="button"
              className="record-create-panel__btn record-share-button"
              data-testid="record-share-trigger"
              aria-label={`Share record ${recordId}`}
              onClick={() => setShareOpen(true)}
            >
              Share
            </button>
          ) : undefined
        }
        leftPane={leftPane}
        rightPane={<RightPane />}
      />
      {/* The dialog is a fixed-position overlay; it belongs at page level,
          not inside the toolbar row. */}
      {shareOpen && recordId ? (
        <ShareRecordDialog recordId={recordId} onClose={() => setShareOpen(false)} />
      ) : null}
    </WorkspaceProvider>
  )
}
