/**
 * ExtractedTextPanel — read-only, cut-and-paste-friendly view of the
 * per-page extracted text below the PDF canvas. Mirrors the order of the
 * pages in the document so the user can scroll-and-grab arbitrary spans.
 *
 * Selection flow: select text by dragging → floating "Send to AI" button
 * appears → click sends the text to the AI chat in the right pane.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ArtifactExtractedPage } from '../../../types/artifact'

export interface ExtractedTextPanelProps {
  pages: ArtifactExtractedPage[]
  /** Page number to scroll into view when the toolbar's Search jumps to a hit. */
  scrollToPage?: number | null
  /** Substring to visually mark in the rendered text. Undefined → no marks. */
  highlight?: string
  /** Called when the user selects text and clicks "Send to AI". */
  onSendSelection?: (text: string, pageNumber: number) => void
}

export function ExtractedTextPanel({
  pages,
  scrollToPage,
  highlight,
  onSendSelection,
}: ExtractedTextPanelProps) {
  const [selection, setSelection] = useState<{
    text: string
    x: number
    y: number
    pageNumber: number
  } | null>(null)

  const handleSelection = useCallback(() => {
    if (!onSendSelection) return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 2) {
      setSelection(null)
      return
    }
    const range = sel?.getRangeAt(0)
    if (!range) return
    const rect = range.getBoundingClientRect()
    // Find the page number by walking up the DOM
    const startNode = range.startContainer as HTMLElement
    const pageEl = startNode.closest?.('[data-page-number]') as HTMLElement | null
      ?? startNode.parentElement?.closest?.('[data-page-number]')
    const pageNumber = pageEl
      ? parseInt(pageEl.dataset.pageNumber || '0', 10)
      : 1
    setSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      pageNumber,
    })
  }, [onSendSelection])

  const handleClickSend = useCallback(() => {
    if (selection && onSendSelection) {
      onSendSelection(selection.text, selection.pageNumber)
    }
    setSelection(null)
  }, [selection, onSendSelection])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [handleSelection])

  // Clear selection on mousedown outside the button
  useEffect(() => {
    const handler = () => setSelection(null)
    const handler2 = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler2)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler2)
    }
  }, [])

  if (pages.length === 0) {
    return (
      <div className="pdf-extracted-text pdf-extracted-text--empty">
        <p>No extracted text on this PDF yet.</p>
        <p className="pdf-extracted-text__hint">
          The PDF viewer renders the canvas + text layer above; that text is
          selectable in place. The extracted-text snapshot below is what
          cross-PDF search and AI-context assembly consume; it populates as
          pages are rendered.
        </p>
      </div>
    )
  }

  return (
    <div className="pdf-extracted-text">
      {pages.map((page) => (
        <ExtractedTextPage
          key={page.pageNumber}
          page={page}
          highlight={highlight}
          scrollIntoView={scrollToPage === page.pageNumber}
        />
      ))}
      {/* Floating Send to AI button */}
      {selection && (
        <button
          className="pdf-extracted-text__send-btn"
          style={{
            position: 'fixed',
            left: selection.x,
            top: selection.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
          }}
          onClick={handleClickSend}
        >
          Send to AI
        </button>
      )}
    </div>
  )
}

interface ExtractedTextPageProps {
  page: ArtifactExtractedPage
  highlight: string | undefined
  scrollIntoView: boolean
}

function ExtractedTextPage({
  page,
  highlight,
  scrollIntoView,
}: ExtractedTextPageProps) {
  return (
    <section
      className="pdf-extracted-text__page"
      data-page-number={page.pageNumber}
      ref={(el) => {
        // jsdom doesn't implement scrollIntoView; guard so the test env
        // doesn't crash when the search test triggers a scroll.
        if (el && scrollIntoView && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }}
    >
      <header className="pdf-extracted-text__header">
        Page {page.pageNumber}
      </header>
      <pre className="pdf-extracted-text__body">
        {highlight ? withHighlight(page.text, highlight) : page.text}
      </pre>
    </section>
  )
}

/**
 * Split `text` into runs alternating between plain and highlighted spans
 * around each case-insensitive occurrence of `term`. Returns React nodes
 * directly so the caller can drop them into a `<pre>`.
 */
function withHighlight(text: string, term: string): React.ReactNode[] {
  if (!term.trim()) return [text]
  const out: React.ReactNode[] = []
  const lower = text.toLowerCase()
  const needle = term.toLowerCase()
  let cursor = 0
  let key = 0
  while (cursor < text.length) {
    const idx = lower.indexOf(needle, cursor)
    if (idx === -1) {
      out.push(text.slice(cursor))
      break
    }
    if (idx > cursor) out.push(text.slice(cursor, idx))
    out.push(
      <mark key={key++} className="pdf-extracted-text__hit">
        {text.slice(idx, idx + needle.length)}
      </mark>,
    )
    cursor = idx + needle.length
  }
  return out
}
