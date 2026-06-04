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
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
// Vite emits this worker file as a static asset and gives us a URL; pdfjs
// then spawns it as a Web Worker. Vendoring the worker URL through Vite
// avoids cross-origin issues in dev and production builds alike.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let workerConfigured = false
function configureWorker(): void {
  if (workerConfigured) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

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
    configureWorker()
    setState({ kind: 'loading' })

    const task = pdfjsLib.getDocument({ url })
    let cancelled = false
    let loadedDoc: PDFDocumentProxy | null = null

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

    return () => {
      cancelled = true
      // `loadingTask.destroy()` is the documented way to abort a loading
      // task and release the worker resources; it also rejects the
      // pending `promise`, which we've already de-fanged via `cancelled`.
      void task.destroy()
      if (loadedDoc) void loadedDoc.destroy()
    }
  }, [url])

  return { state }
}
