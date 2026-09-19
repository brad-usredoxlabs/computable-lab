/**
 * ProtocolReviewHostPage — the vendor-PDF protocol review surface AS A TAB.
 *
 * The review surface (PDF | extracted editable protocol) used to render as a
 * bare route: opening a source document replaced the whole app surface and the
 * tab strip disappeared. Hosting it in the workspace shell makes it a tab like
 * the artifact and deck hosts:
 *
 *   - `/ingestion/vendor-pdf/:recordId` registers a `protocol-review` tab, so a
 *     deep link, a refresh and a second source document all behave like tabs;
 *   - the run workspace's rail "Open" affordance opens it in a NEW tab, so a run
 *     and an extraction can be on screen together.
 *
 * Full-width single pane on purpose: this surface is a document and its
 * extraction, not a chat page (the AI panel that used to live here is what made
 * it feel like an AI tab — see specifications/protocol-worldview.md D2).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { protocolReviewTabId } from '../event-editor/workspace/types'
import { VendorPdfReviewPage } from './VendorPdfReviewPage'

export function ProtocolReviewHostPage() {
  const { recordId } = useParams<{ recordId: string }>()
  const openTabs = useOptionalOpenTabs()
  const [title, setTitle] = useState<string | null>(null)

  // Title for the tab label + brand (falls back to the record id).
  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    apiClient
      .getRecord(recordId)
      .then((env) => {
        if (cancelled) return
        const payload = env?.payload as Record<string, unknown> | undefined
        const t = typeof payload?.title === 'string' && payload.title.trim() ? payload.title : null
        if (t) setTitle(t)
      })
      .catch(() => {
        /* the title is a nicety — the id is the fallback */
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  // Register/refresh this tab (deep links, refresh, reopen). Stable callback in
  // the deps, never the context object (that identity churns every render).
  const navigateActiveTab = openTabs?.navigateActiveTab
  useEffect(() => {
    if (!recordId || !navigateActiveTab) return
    navigateActiveTab({
      id: protocolReviewTabId(recordId),
      kind: 'protocol-review',
      recordId,
      title: title ?? recordId,
    })
  }, [recordId, title, navigateActiveTab])

  return (
    <AppShell
      brand={title ?? 'Protocol review'}
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={<VendorPdfReviewPage embedded />}
    />
  )
}
