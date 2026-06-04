/**
 * PdfPage — render one PDF page as a canvas with the native pdfjs
 * TextLayer overlaid on top. The text layer is what makes
 * select / copy / Ctrl-F work like a real PDF reader.
 *
 * The component renders synchronously on every `zoom` change; for a
 * snappier UX on multi-hundred-page documents the page render task is
 * cancelled when zoom changes mid-render. Pages render lazily — the
 * canvas is sized to the expected viewport before render begins so the
 * scroll-position doesn't jump when render completes.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist'

export interface PdfPageProps {
  doc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  /**
   * Called once the page renders. The flattened text is what cross-PDF
   * search / AI-context assembly consume — we surface it from the same
   * pdfjs `getTextContent()` call rather than running our own pass.
   */
  onTextExtracted?: (pageNumber: number, text: string) => void
}

export function PdfPage({ doc, pageNumber, zoom, onTextExtracted }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cache the page proxy so a zoom change doesn't re-fetch the page.
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  // Fetch the page proxy on mount / page-number change.
  useEffect(() => {
    let cancelled = false
    void doc.getPage(pageNumber).then((p) => {
      if (cancelled) return
      setPage(p)
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber])

  // Track the viewport at the current zoom so the canvas+text layer get
  // sized BEFORE rendering — keeps the scroll position stable.
  const viewport = useMemo(() => {
    if (!page) return null
    return page.getViewport({ scale: zoom })
  }, [page, zoom])

  // Render the canvas + text layer when page/viewport/zoom changes.
  useEffect(() => {
    if (!page || !viewport || !canvasRef.current || !textLayerRef.current) return
    const canvas = canvasRef.current
    const textLayerEl = textLayerRef.current

    // Match the canvas backing store to the device pixel ratio so the
    // rendered page is crisp on high-DPI displays. CSS dimensions follow
    // the viewport (1:1 in CSS pixels at the current zoom).
    const outputScale = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Could not get canvas 2D context.')
      return
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Render the page.
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null
    let cancelled = false

    try {
      // pdfjs-dist 5 prefers `canvas`; `canvasContext` is kept for back-
      // compat but only with `canvas: null`. We pass the canvas itself so
      // pdfjs can pick the context from the element on its own.
      renderTask = page.render({
        canvas,
        viewport,
        // Hi-DPI scaling: pdfjs multiplies its draw calls by the transform.
        ...(outputScale !== 1
          ? { transform: [outputScale, 0, 0, outputScale, 0, 0] }
          : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    void renderTask.promise
      .then(() => {
        if (cancelled) return
        // Render the text layer on top so the user can select/copy.
        // Empty the prior pass first; on zoom change we re-render.
        textLayerEl.replaceChildren()
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textLayerEl,
          viewport,
        })
        return textLayer.render()
      })
      .then(() => {
        if (cancelled) return
        // Collect plain text once per render and surface it to the parent
        // for the extracted-text panel + onTextExtracted callback.
        if (onTextExtracted) {
          void page.getTextContent().then((tc) => {
            if (cancelled) return
            const text = tc.items
              .map((it) => ('str' in it ? it.str : ''))
              .join(' ')
            onTextExtracted(pageNumber, text)
          })
        }
      })
      .catch((err) => {
        // pdfjs throws RenderingCancelledException on cancel; treat as no-op.
        if (cancelled) return
        const name = (err as { name?: string }).name
        if (name === 'RenderingCancelledException') return
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
      if (renderTask) renderTask.cancel()
      // The textLayer's resources are released by replaceChildren() above
      // (it removes all DOM nodes pdfjs added) and the next render pass.
    }
  }, [page, viewport, pageNumber, onTextExtracted])

  if (error) {
    return (
      <div className="pdf-page pdf-page--error">
        <p>Failed to render page {pageNumber}: {error}</p>
      </div>
    )
  }

  // Container is positioned `relative` so the absolutely-positioned text
  // layer aligns with the canvas. The fixed CSS dimensions below match
  // the viewport size when known; otherwise we use a sensible default to
  // avoid layout shift while the page is fetching.
  const widthPx = viewport ? Math.floor(viewport.width) : 600
  const heightPx = viewport ? Math.floor(viewport.height) : 800

  return (
    <div
      className="pdf-page"
      data-page-number={pageNumber}
      style={{ width: widthPx, height: heightPx }}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" />
      <div ref={textLayerRef} className="pdf-page__text-layer textLayer" />
    </div>
  )
}
