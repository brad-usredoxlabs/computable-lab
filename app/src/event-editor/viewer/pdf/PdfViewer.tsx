/**
 * PdfViewer — workspace viewer for `kind: 'pdf'` tabs.
 *
 * Pure renderer. All state ownership lives in PdfStateProvider (which
 * ProjectWorkspacePage mounts above AppShell when the active tab is pdf)
 * so the toolbar — rendered into a sibling AppShell slot — can share the
 * same artifact / page / zoom / search state.
 *
 * Layout: canvas pages stacked vertically inside a scroll container, with
 * the ExtractedTextPanel rendered below. Browser-native Ctrl-F works on
 * the text layer; the toolbar's Search box drives extracted-text search
 * and scrolls both panes to the hit.
 */

import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ExtractedTextPanel } from './ExtractedTextPanel'
import { PdfPage } from './PdfPage'
import { usePdfViewer } from './PdfViewerContext'
import './pdf.css'

export interface PdfViewerProps {
  /** Kept for symmetry with the dispatcher's other viewer kinds. Used as
   *  a sanity-check guard against tab/state desync. */
  artifactId: string
  title: string
  /** Called when the user selects text from the extracted text panel. */
  onSendSelection?: (text: string, pageNumber: number) => void
}

export function PdfViewer({ artifactId, title, onSendSelection }: PdfViewerProps) {
  const v = usePdfViewer()

  // Guard against the rare desync where a stale leftPane render asks for
  // a different artifact than the provider currently owns. The provider
  // is keyed on artifactId at the page level so this should be rare —
  // surface explicitly rather than render the wrong PDF.
  if (v.artifactId !== null && v.artifactId !== artifactId) {
    return (
      <div className="pdf-viewer pdf-viewer--mismatch">
        Viewer state mismatch: tab is {artifactId}, provider has {v.artifactId}.
      </div>
    )
  }

  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
      <div className="pdf-viewer__header">
        <h2>{title}</h2>
        <span className="pdf-viewer__id">{artifactId}</span>
      </div>
      {v.artifactError ? (
        <div className="pdf-viewer__error">{v.artifactError}</div>
      ) : null}
      <PanelGroup
        direction="vertical"
        className="pdf-viewer__panels"
        autoSaveId="pdf-viewer:split"
      >
        <Panel
          defaultSize={65}
          minSize={20}
          collapsible
          collapsedSize={0}
          className="pdf-viewer__panel pdf-viewer__panel--pages"
        >
          <PagesScroller />
        </Panel>
        <PanelResizeHandle className="pdf-viewer__handle" />
        <Panel
          defaultSize={35}
          minSize={10}
          collapsible
          collapsedSize={0}
          className="pdf-viewer__panel pdf-viewer__panel--text"
        >
          <ExtractedTextPanel
            pages={v.extractedText}
            scrollToPage={v.scrollToPageInTextPanel}
            highlight={v.search.trim() ? v.search : undefined}
            onSendSelection={onSendSelection}
          />
        </Panel>
      </PanelGroup>
    </div>
  )
}

function PagesScroller() {
  const v = usePdfViewer()
  // Use a callback ref so the provider can call goToPage() and scroll the
  // matching canvas into view without crossing render boundaries.
  const setRef = (el: HTMLDivElement | null) => v.registerPagesContainer(el)

  useEffect(() => {
    // Clean up the registered container on unmount.
    return () => v.registerPagesContainer(null)
  }, [v])

  return (
    <div className="pdf-viewer__pages" ref={setRef}>
      {v.pdfState.kind === 'idle' && !v.artifactError ? (
        <p className="pdf-viewer__hint">Resolving PDF…</p>
      ) : null}
      {v.pdfState.kind === 'loading' ? (
        <p className="pdf-viewer__hint">Loading PDF…</p>
      ) : null}
      {v.pdfState.kind === 'error' ? (
        <p className="pdf-viewer__error">
          PDF load failed: {v.pdfState.message}
        </p>
      ) : null}
      {v.pdfState.kind === 'ready' && v.doc
        ? Array.from({ length: v.pageCount }, (_, i) => i + 1).map((n) => (
            <PdfPage
              key={`${v.doc!.fingerprints[0] ?? 'doc'}-${n}-${v.zoom}`}
              doc={v.doc!}
              pageNumber={n}
              zoom={v.zoom}
              onTextExtracted={v.reportExtractedText}
            />
          ))
        : null}
    </div>
  )
}
