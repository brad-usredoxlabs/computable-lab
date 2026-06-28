/**
 * PdfProtocolBuilder — protocol-builder workspace for the 'build' view.
 *
 * Two-panel layout:
 * - Left: PDF viewer with text selection + "Send Selection" to AI
 * - Right: LiteratureRightPanel with Search + AI Chat tabs
 *
 * The AI uses a 'protocol-builder' surface with a system prompt that
 * instructs it to adapt vendor protocols to the lab's specific hardware.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'
import { LiteratureRightPanel } from './LiteratureRightPanel'

// Configure the pdfjs worker once
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
}

export function PdfProtocolBuilder() {
  const [searchParams] = useSearchParams()
  // PDF state
  const [pdfUrl, setPdfUrl] = useState<string>(
    () => searchParams.get('pdfUrl') || ''
  )
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState<string>('')
  const [pages, setPages] = useState<number[]>([])
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())

  // Load PDF from URL
  const loadPdf = useCallback(async (url: string) => {
    if (!url.trim()) return
    setPdfLoading(true)
    setPdfError(null)
    setPdfDoc(null)
    setPages([])

    try {
      const loadingTask = pdfjsLib.getDocument({ url })
      const doc = await loadingTask.promise
      setPdfDoc(doc)
      // Create page numbers array (1-indexed)
      const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1)
      setPages(pageNumbers)
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to load PDF')
    } finally {
      setPdfLoading(false)
    }
  }, [])

  // Auto-load PDF when mounted with a pdfUrl from search params
  useEffect(() => {
    if (pdfUrl && !pdfDoc && !pdfLoading && !pdfError) {
      loadPdf(pdfUrl)
    }
  }, [pdfUrl, pdfDoc, pdfLoading, pdfError, loadPdf])

  // Handle text selection from PDF
  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim())
    }
  }, [])

  // Render a single PDF page
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber)
        const canvas = canvasRefs.current.get(pageNumber)
        if (!canvas) return

        const context = canvas.getContext('2d')
        if (!context) return

        const viewport = page.getViewport({ scale: 1.5 })
        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}:`, err)
      }
    },
    [pdfDoc],
  )

  // Render pages when PDF loads
  useMemo(() => {
    if (!pdfDoc || pages.length === 0) return
    pages.forEach((pageNum) => {
      renderPage(pageNum)
    })
  }, [pdfDoc, pages, renderPage])

  // AI context for protocol-builder surface
  const aiContext = useMemo<AiContext>(
    () => ({
      surface: 'protocol-builder',
      summary: `Protocol builder${pdfUrl ? ` for PDF: ${pdfUrl}` : ''}`,
      surfaceContext: {
        pdfUrl: pdfUrl || null,
        pageCount: pdfDoc?.numPages ?? 0,
        selectedText: selectedText || null,
      },
    }),
    [pdfUrl, pdfDoc, selectedText],
  )

  // Use the literature endpoint for thread persistence
  const aiChat = useAiChat({ aiContext, endpoint: 'literature' })

  return (
    <div className="pdf-protocol-builder">
      {/* URL input bar */}
      <div className="pdf-protocol-builder__url-bar">
        <input
          type="url"
          className="pdf-protocol-builder__url-input"
          placeholder="Enter PDF URL (e.g., https://files.zymoresearch.com/protocols/...)"
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadPdf(pdfUrl)
          }}
        />
        <button
          className="pdf-protocol-builder__load-btn"
          onClick={() => loadPdf(pdfUrl)}
          disabled={pdfLoading || !pdfUrl.trim()}
        >
          {pdfLoading ? 'Loading...' : 'Load PDF'}
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="pdf-protocol-builder__panels">
        {/* Left: PDF viewer */}
        <div className="pdf-protocol-builder__viewer">
          {pdfError && (
            <div className="pdf-protocol-builder__error">
              {pdfError}
            </div>
          )}

          {!pdfDoc && !pdfError && !pdfLoading && (
            <div className="pdf-protocol-builder__hint">
              <p>Load a vendor PDF to get started.</p>
              <p className="pdf-protocol-builder__hint-url">
                Example: Zymo Quick-DNA 96 Kit
              </p>
            </div>
          )}

          {pdfDoc && (
            <div
              className="pdf-protocol-builder__pages"
              onMouseUp={handleTextSelect}
            >
              {pages.map((pageNum) => (
                <div
                  key={pageNum}
                  className="pdf-protocol-builder__page"
                  data-page={pageNum}
                >
                  <canvas
                    ref={(el) => {
                      if (el) {
                        canvasRefs.current.set(pageNum, el)
                        renderPage(pageNum)
                      } else {
                        canvasRefs.current.delete(pageNum)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Send selection button */}
          {selectedText && (
            <div className="pdf-protocol-builder__selection-bar">
              <span className="pdf-protocol-builder__selection-text">
                {selectedText.slice(0, 100)}
                {selectedText.length > 100 ? '...' : ''}
              </span>
              <button
                className="pdf-protocol-builder__send-btn"
                onClick={() => {
                  aiChat.sendPrompt(
                    `Here is the text I selected from the vendor protocol:\n\n"${selectedText}"\n\nPlease help me understand or adapt this for our lab setup.`
                  )
                  setSelectedText('')
                }}
              >
                Send to AI
              </button>
            </div>
          )}
        </div>

        {/* Right: Search + AI tabs */}
        <div className="pdf-protocol-builder__right-panel">
          <LiteratureRightPanel aiChat={aiChat} />
        </div>
      </div>

      <style>{styles}</style>
    </div>
  )
}

const styles = `
.pdf-protocol-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cl-bg);
}

.pdf-protocol-builder__url-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}

.pdf-protocol-builder__url-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--cl-border);
  border-radius: 6px;
  font-size: 0.9em;
  outline: none;
}

.pdf-protocol-builder__url-input:focus {
  border-color: var(--cl-accent);
}

.pdf-protocol-builder__load-btn {
  padding: 8px 16px;
  background: var(--cl-accent);
  color: var(--cl-on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.pdf-protocol-builder__load-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pdf-protocol-builder__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.pdf-protocol-builder__viewer {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.pdf-protocol-builder__pages {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.pdf-protocol-builder__page {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.pdf-protocol-builder__right-panel {
  width: 400px;
  border-left: 1px solid var(--cl-border);
  display: flex;
  flex-direction: column;
}

.pdf-protocol-builder__hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 32px;
  color: var(--cl-text-dim);
  text-align: center;
}

.pdf-protocol-builder__hint-url {
  font-size: 0.85em;
  margin-top: 8px;
  font-style: italic;
}

.pdf-protocol-builder__error {
  padding: 16px;
  color: #c92a2a;
  background: #fff5f5;
  border-radius: 6px;
  margin: 16px;
}

.pdf-protocol-builder__selection-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}

.pdf-protocol-builder__selection-text {
  flex: 1;
  font-size: 0.85em;
  color: var(--cl-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-protocol-builder__send-btn {
  padding: 6px 12px;
  background: var(--cl-accent);
  color: var(--cl-on-accent);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  white-space: nowrap;
}
`
