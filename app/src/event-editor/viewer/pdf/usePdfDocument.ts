/**
 * usePdfDocument — load a PDF via pdfjs-dist and expose its PDFDocumentProxy.
 *
 * Concentrates the pdfjs-dist plumbing (workerSrc, getDocument loading
 * task lifecycle, cancellation on unmount/URL-change, error surfacing) so
 * the PdfViewer component stays focused on layout + interaction.
 *
 * Caller passes a `url` string (e.g. from `apiClient.artifactBlobUrl`).
 * On URL change the previous loading task is cancelled and the previous
 * document is destroyed before a new one is loaded — important because
 * pdfjs keeps a worker-side reference per document.
 */

import { useEffect, useState } from 'react'
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'
// Vite emits this worker file as a static asset and gives us a URL; pdfjs
// then spawns it as a Web Worker. Vendoring the worker URL through Vite
// avoids cross-origin issues in dev and production builds alike.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// d5attr repair (L2-DOC-INTAKE-1): pdfjs-dist touches DOM globals at module
// init (build/pdf.mjs → canvas.js:63 `new DOMMatrix()`), so a static import
// drags the whole pdf.js runtime into the RecordHostPage lazy chunk's static
// graph (App.tsx:67) and rejects the chunk at module evaluation — /record/<id>
// stays on the Suspense "Loading..." fallback forever. Load pdfjs on first
// real use instead, outside the chunk's static import graph.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist')
  return pdfjsPromise
}

let workerConfigured = false

export type PdfLoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; doc: PDFDocumentProxy }
  | { kind: 'error'; message: string }

export interface UsePdfDocumentResult {
  state: PdfLoadState
}

export function usePdfDocument(url: string | null): UsePdfDocumentResult {
  const [state, setState] = useState<PdfLoadState>({ kind: 'idle' })

  useEffect(() => {
    if (!url) {
      setState({ kind: 'idle' })
      return
    }
    setState({ kind: 'loading' })

    let cancelled = false
    let loadedDoc: PDFDocumentProxy | null = null
    let task: PDFDocumentLoadingTask | null = null

    void loadPdfjs().then((pdfjsLib) => {
      if (cancelled) return
      // Worker setup happens at first real use only (d5attr repair).
      if (!workerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        workerConfigured = true
      }
      task = pdfjsLib.getDocument({ url })
      task.promise
        .then((doc) => {
          if (cancelled) {
            // The effect cleanup ran before the document finished loading.
            // Drop the doc to free the worker-side reference.
            void doc.destroy()
            return
          }
          loadedDoc = doc
          setState({ kind: 'ready', doc })
        })
        .catch((err) => {
          if (cancelled) return
          const message = err instanceof Error ? err.message : String(err)
          setState({ kind: 'error', message })
        })
    }).catch((err) => {
      if (cancelled) return
      const message = err instanceof Error ? err.message : String(err)
      setState({ kind: 'error', message })
    })

    return () => {
      cancelled = true
      // `loadingTask.destroy()` is the documented way to abort a loading
      // task and release the worker resources; it also rejects the
      // pending `promise`, which we've already de-fanged via `cancelled`.
      if (task) void task.destroy()
      if (loadedDoc) void loadedDoc.destroy()
    }
  }, [url])

  return { state }
}
