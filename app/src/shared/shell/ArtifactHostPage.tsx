/**
 * ArtifactHostPage — standalone route component for /artifact/:kind/:artifactId.
 *
 * Renders a PDF or document artifact in its own top-level tab with a full
 * workspace shell (tab strip, right pane, viewers). The artifact record is
 * fetched on mount to resolve the owning studyId (needed by PdfStateProvider
 * for the blob URL).
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { RightPane } from '../../event-editor/right-pane/RightPane'
import { WorkspaceProvider } from '../../event-editor/workspace/WorkspaceContext'
import { PdfStateProvider } from '../../event-editor/viewer/pdf/PdfViewerContext'
import { PdfViewer } from '../../event-editor/viewer/pdf/PdfViewer'
import { DocumentStateProvider } from '../../event-editor/viewer/document/DocumentEditorContext'
import { DocumentEditor } from '../../event-editor/viewer/document/DocumentEditor'
import { ViewerToolbar } from '../../event-editor/viewer/ViewerToolbar'
import { apiClient } from '../../shared/api/client'
import type { Artifact } from '../../types/artifact'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

export function ArtifactHostPage() {
  const { kind, artifactId } = useParams<{ kind: string; artifactId: string }>()
  const openTabs = useOptionalOpenTabs()

  // Resolve the artifact record to get studyId + title (needed by the
  // WorkspaceProvider + viewer providers).
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!artifactId) return
    let cancelled = false
    void apiClient
      .getRecord(artifactId)
      .then((env) => {
        if (cancelled) return
        setArtifact(env.payload as unknown as Artifact)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [artifactId])

  // Register/refresh the top-level tab so a deep link or refresh keeps it in
  // the strip. openTab on an existing id replaces the tab but preserves the
  // breadcrumb (the opener, e.g. SearchTabPanel, seeds the origin trail).
  // Deps use the stable `navigateActiveTab` callback (not the context object,
  // which has a fresh identity every provider render → infinite update loop).
  const title = artifact?.title ?? artifactId ?? 'Artifact'
  const navigateActiveTab = openTabs?.navigateActiveTab
  useEffect(() => {
    if (!artifactId || !kind || !navigateActiveTab) return
    const tab: WorkspaceTab =
      kind === 'pdf'
        ? { id: `tab-pdf-${artifactId}`, kind: 'pdf', artifactId, title }
        : { id: `tab-doc-${artifactId}`, kind: 'document', artifactId, title }
    navigateActiveTab(tab)
  }, [kind, artifactId, title, navigateActiveTab])

  if (!artifactId || !kind) {
    return (
      <AppShell brand="Artifact">
        <p>Missing artifact parameters.</p>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell brand="Artifact">
        <p>Failed to load artifact: {error}</p>
      </AppShell>
    )
  }

  if (!artifact) {
    return (
      <AppShell brand="Artifact">
        <p>Loading artifact…</p>
      </AppShell>
    )
  }

  const studyId = artifact.studyId

  // Build the tab shape matching what tabForArtifact produces so the
  // WorkspaceTabStrip can render it and tabPath resolves the route.
  const tab: WorkspaceTab =
    kind === 'pdf'
      ? { id: `tab-pdf-${artifactId}`, kind: 'pdf', artifactId, title }
      : { id: `tab-doc-${artifactId}`, kind: 'document', artifactId, title }

  // Left-pane body: the appropriate viewer wrapped in its provider.
  const leftPane =
    kind === 'pdf' ? (
      <PdfStateProvider key={artifactId} artifactId={artifactId} title={title}>
        <PdfViewer artifactId={artifactId} title={title} />
      </PdfStateProvider>
    ) : (
      <DocumentStateProvider key={artifactId} artifactId={artifactId} title={title}>
        <DocumentEditor artifactId={artifactId} title={title} />
      </DocumentStateProvider>
    )

  return (
    <WorkspaceProvider studyId={studyId}>
      <AppShell
        brand={title}
        layout="workspace"
        topbarTabs={<WorkspaceTabStrip />}
        viewerToolbar={<ViewerToolbar tab={tab} />}
        leftPane={leftPane}
        rightPane={<RightPane />}
      />
    </WorkspaceProvider>
  )
}
