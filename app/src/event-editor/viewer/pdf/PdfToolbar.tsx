/**
 * PdfToolbar — viewer toolbar for PDF tabs. Renders into AppShell's
 * `viewerToolbar` slot; reads + drives PdfViewer state through the
 * `usePdfViewer()` context that PdfStateProvider supplies.
 *
 * Controls:
 *   - prev / next page buttons + page-number input (1-indexed, clamped)
 *   - zoom out / in buttons + percentage display
 *   - search input that runs against the extracted-text snapshot and
 *     scrolls both the canvas and the extracted text panel to the hit
 *
 * The toolbar disables interactive controls until the PDF is `ready` so
 * users don't fire navigation against a document that hasn't loaded.
 */

import { useState, type FormEvent } from 'react'
import { usePdfViewer } from './PdfViewerContext'
import { ConvertToProtocolModal } from './ConvertToProtocolModal'

export interface PdfToolbarProps {
  /** Provided by the dispatcher; redundant with context but kept for symmetry. */
  artifactId: string
}

export function PdfToolbar({ artifactId }: PdfToolbarProps) {
  const v = usePdfViewer()
  // Local input state so the user can type a page number without us
  // clamping mid-keystroke; commits to v.goToPage on Enter / blur.
  const [pageInput, setPageInput] = useState('')
  // Same for search — only commit on Enter / blur so we don't run
  // findInDocument on every keystroke.
  const [searchInput, setSearchInput] = useState('')
  const [convertModalOpen, setConvertModalOpen] = useState(false)

  const isReady = v.pdfState.kind === 'ready'

  function commitPage(event?: FormEvent) {
    event?.preventDefault()
    const n = parseInt(pageInput, 10)
    if (!Number.isNaN(n)) v.goToPage(n)
    setPageInput('')
  }

  function commitSearch(event?: FormEvent) {
    event?.preventDefault()
    v.findInDocument(searchInput)
  }

  return (
    <>
      <div
      className="viewer-toolbar viewer-toolbar--pdf"
      data-testid="pdf-toolbar"
      data-artifact-id={artifactId}
    >
      <div className="pdf-toolbar__nav">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!isReady || v.activePage <= 1}
          onClick={() => v.goToPage(v.activePage - 1)}
          data-testid="pdf-toolbar-prev"
        >
          ◀
        </button>
        <form className="pdf-toolbar__page-form" onSubmit={commitPage}>
          <input
            type="text"
            inputMode="numeric"
            className="pdf-toolbar__page-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => pageInput && commitPage()}
            placeholder={String(v.activePage)}
            aria-label="Jump to page"
            data-testid="pdf-toolbar-page-input"
            disabled={!isReady}
          />
        </form>
        <span className="pdf-toolbar__page-count">
          / {v.pageCount || '–'}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={!isReady || v.activePage >= v.pageCount}
          onClick={() => v.goToPage(v.activePage + 1)}
          data-testid="pdf-toolbar-next"
        >
          ▶
        </button>
      </div>
      <span className="pdf-toolbar__divider" aria-hidden />
      <div className="pdf-toolbar__zoom">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!isReady}
          onClick={() => v.zoomBy(-0.1)}
          data-testid="pdf-toolbar-zoom-out"
        >
          −
        </button>
        <span className="pdf-toolbar__zoom-readout" data-testid="pdf-toolbar-zoom-readout">
          {Math.round(v.zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!isReady}
          onClick={() => v.zoomBy(0.1)}
          data-testid="pdf-toolbar-zoom-in"
        >
          +
        </button>
      </div>
      <span className="pdf-toolbar__divider" aria-hidden />
      <form className="pdf-toolbar__search" onSubmit={commitSearch}>
        <input
          type="search"
          className="pdf-toolbar__search-input"
          placeholder="Find in document"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Find in document"
          data-testid="pdf-toolbar-search-input"
          disabled={!isReady}
        />
        <button
          type="submit"
          aria-label="Find next"
          disabled={!isReady || !searchInput.trim()}
          data-testid="pdf-toolbar-search-submit"
        >
          Find
        </button>
      </form>
      <span className="pdf-toolbar__divider" aria-hidden />
      <button
        type="button"
        className="pdf-toolbar__convert-btn"
        onClick={() => setConvertModalOpen(true)}
        disabled={!isReady}
        data-testid="pdf-toolbar-convert-protocol"
        title="Extract a universal protocol from this PDF"
      >
        Convert to Protocol
      </button>
    </div>
    <ConvertToProtocolModal
      isOpen={convertModalOpen}
      onClose={() => setConvertModalOpen(false)}
      artifactId={artifactId}
      artifactTitle={v.title}
    />
    </>
  )
}
