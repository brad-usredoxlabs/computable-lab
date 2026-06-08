/**
 * AddSourceModal — overlay launched from the AI tab's SourcesStrip
 * "+ Add source" button. Wraps the existing VendorPdfSearchSection so
 * the GraphLemur Exa search + ingest flow renders the same way it does
 * in the right-pane Search tab — single source of truth, same wire
 * format, same error handling. The only difference is the surrounding
 * chrome (scrim + close button) and the fact that a successful ingest
 * propagates back to AiTabPanel via `onIngested` so the strip can
 * append a chip and the user can immediately open the PDF in the
 * viewer.
 */

import { useEffect } from 'react'
import { VendorPdfSearchSection } from '../search/VendorPdfSearchSection'

export interface AddSourceModalProps {
  isOpen: boolean
  studyId: string
  onIngested: (
    artifactId: string,
    info: { title?: string; sourceUrl: string; vendor?: string },
  ) => void
  onClose: () => void
}

export function AddSourceModal({
  isOpen,
  studyId,
  onIngested,
  onClose,
}: AddSourceModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="add-source-scrim"
      data-testid="add-source-scrim"
      onClick={onClose}
    >
      <div
        className="add-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add source"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-source-header">
          <h3 className="add-source-title">Add a source</h3>
          <button
            type="button"
            className="add-source-close"
            onClick={onClose}
            aria-label="Close"
            data-testid="add-source-close"
          >
            ×
          </button>
        </header>
        <div className="add-source-body">
          <VendorPdfSearchSection
            studyId={studyId}
            onIngested={(artifactId, info) => {
              onIngested(artifactId, info)
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
