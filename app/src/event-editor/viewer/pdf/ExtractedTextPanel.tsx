/**
 * ExtractedTextPanel — read-only, cut-and-paste-friendly view of the
 * per-page extracted text below the PDF canvas. Mirrors the order of the
 * pages in the document so the user can scroll-and-grab arbitrary spans.
 *
 * The plan calls for a `RichTextField (read-only)` here. In practice the
 * extracted text has no formatting to preserve — pdfjs's TextLayer flattens
 * paragraphs to whitespace-separated runs — so a TipTap editor would add
 * weight without value. A plain selectable block per page is what makes
 * cross-PDF search and "send to AI as context" work; the TipTap-shaped
 * upgrade can come if we ever want inline editing of the extracted text
 * (which would diverge from the canonical PDF anyway).
 */

import type { ArtifactExtractedPage } from '../../../types/artifact'

export interface ExtractedTextPanelProps {
  pages: ArtifactExtractedPage[]
  /** Page number to scroll into view when the toolbar's Search jumps to a hit. */
  scrollToPage?: number | null
  /** Substring to visually mark in the rendered text. Undefined → no marks. */
  highlight?: string
}

export function ExtractedTextPanel({
  pages,
  scrollToPage,
  highlight,
}: ExtractedTextPanelProps) {
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
