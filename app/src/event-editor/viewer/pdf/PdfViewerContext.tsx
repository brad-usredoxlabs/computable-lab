/**
 * PdfViewerContext + PdfStateProvider — owns the per-tab PDF state and
 * makes it readable from both AppShell slots that need it:
 *
 *  - PdfToolbar (rendered into AppShell `viewerToolbar`)
 *  - PdfViewer  (rendered into AppShell `leftPane`)
 *
 * Both slots are in the same React tree (just different DOM positions), so
 * a context that wraps the entire AppShell reaches both. State that lives
 * inside PdfViewer alone would NOT be visible to the toolbar — that's why
 * ProjectWorkspacePage mounts this provider above the shell when the
 * active tab is `kind: 'pdf'`.
 *
 * The provider also handles the I/O: loads the artifact record and opens
 * the PDF document via pdfjs. This keeps PdfViewer/PdfToolbar focused on
 * rendering + UI, not lifecycle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { apiClient } from '../../../shared/api/client'
import type {
  Artifact,
  ArtifactExtractedPage,
} from '../../../types/artifact'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { usePdfDocument, type PdfLoadState } from './usePdfDocument'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

export interface PdfViewerCtxValue {
  artifactId: string | null
  title: string
  artifactError: string | null
  pdfState: PdfLoadState
  doc: PDFDocumentProxy | null
  pageCount: number
  activePage: number
  zoom: number
  search: string
  extractedText: ArtifactExtractedPage[]
  /** Page number to scroll into view in the extracted-text panel (or null). */
  scrollToPageInTextPanel: number | null
  goToPage: (n: number) => void
  setZoom: (z: number) => void
  zoomBy: (delta: number) => void
  findInDocument: (term: string) => void
  /** Called by PdfPage when a page finishes rendering. */
  reportExtractedText: (pageNumber: number, text: string) => void
  /** Imperative scroll target attachment — PdfViewer registers its scroller. */
  registerPagesContainer: (el: HTMLDivElement | null) => void
}

const DEFAULT_VALUE: PdfViewerCtxValue = {
  artifactId: null,
  title: '',
  artifactError: null,
  pdfState: { kind: 'idle' },
  doc: null,
  pageCount: 0,
  activePage: 1,
  zoom: 1,
  search: '',
  extractedText: [],
  scrollToPageInTextPanel: null,
  goToPage: () => undefined,
  setZoom: () => undefined,
  zoomBy: () => undefined,
  findInDocument: () => undefined,
  reportExtractedText: () => undefined,
  registerPagesContainer: () => undefined,
}

const PdfViewerCtx = createContext<PdfViewerCtxValue>(DEFAULT_VALUE)

export interface PdfStateProviderProps {
  artifactId: string
  title: string
  children: ReactNode
}

export function PdfStateProvider({ artifactId, title, children }: PdfStateProviderProps) {
  const ws = useWorkspace()
  const studyId = ws.state.studyId

  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [artifactError, setArtifactError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<ArtifactExtractedPage[]>([])
  const [activePage, setActivePageState] = useState(1)
  const [zoom, setZoomState] = useState(1)
  const [search, setSearch] = useState('')
  const [scrollToPageInTextPanel, setScrollToPageInTextPanel] = useState<
    number | null
  >(null)
  const pagesContainerRef = useRef<HTMLDivElement | null>(null)

  // Load the artifact record. Falls back to a clear error message when the
  // artifact is missing, isn't a PDF, or has no stored_path.
  useEffect(() => {
    let cancelled = false
    setArtifact(null)
    setArtifactError(null)
    setExtractedText([])
    setActivePageState(1)
    setZoomState(1)
    setSearch('')
    setScrollToPageInTextPanel(null)
    void apiClient
      .getRecord(artifactId)
      .then((env) => {
        if (cancelled) return
        // RecordEnvelope.payload is typed `Record<string, unknown>` (the
        // generic envelope shape) but we know it's an artifact because
        // the URL is study-scoped and the dispatcher only opens this for
        // pdf-kind tabs. Two-step cast through `unknown` keeps TS happy.
        const payload = env.payload as unknown as Artifact
        if (payload.artifactKind !== 'pdf') {
          setArtifactError(
            `Artifact ${artifactId} has artifactKind=${payload.artifactKind ?? '?'}; expected pdf.`,
          )
          return
        }
        setArtifact(payload)
        if (payload.extractedText && payload.extractedText.length > 0) {
          setExtractedText(payload.extractedText)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setArtifactError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [artifactId])

  const pdfUrl = useMemo(() => {
    if (!artifact) return null
    return apiClient.artifactBlobUrl(studyId, artifactId)
  }, [artifact, artifactId, studyId])

  const { state: pdfState } = usePdfDocument(pdfUrl)
  const doc = pdfState.kind === 'ready' ? pdfState.doc : null
  const pageCount = doc?.numPages ?? 0

  useEffect(() => {
    if (pageCount === 0) return
    setActivePageState((p) => Math.max(1, Math.min(pageCount, p)))
  }, [pageCount])

  const goToPage = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(pageCount || 1, Math.floor(n)))
      setActivePageState(clamped)
      const target =
        pagesContainerRef.current?.querySelector<HTMLDivElement>(
          `.pdf-page[data-page-number="${clamped}"]`,
        )
      // jsdom test env doesn't ship scrollIntoView — guard to avoid crashes.
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [pageCount],
  )

  const setZoom = useCallback((z: number) => {
    setZoomState(clamp(z, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomBy = useCallback((delta: number) => {
    setZoomState((z) => clamp(z + delta, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const findInDocument = useCallback(
    (term: string) => {
      setSearch(term)
      if (!term.trim()) {
        setScrollToPageInTextPanel(null)
        return
      }
      const needle = term.toLowerCase()
      const hit = extractedText.find((p) =>
        p.text.toLowerCase().includes(needle),
      )
      if (!hit) {
        setScrollToPageInTextPanel(null)
        return
      }
      goToPage(hit.pageNumber)
      setScrollToPageInTextPanel(hit.pageNumber)
    },
    [extractedText, goToPage],
  )

  const reportExtractedText = useCallback(
    (pageNumber: number, text: string) => {
      setExtractedText((prev) => {
        // Prefer the artifact's stored extraction when present — it was
        // produced by the server-side extractor, which is more thorough
        // than pdfjs's flat join.
        const fromArtifact = artifact?.extractedText
        if (fromArtifact?.some((p) => p.pageNumber === pageNumber)) return prev
        const existingIdx = prev.findIndex((p) => p.pageNumber === pageNumber)
        const next: ArtifactExtractedPage = { pageNumber, text }
        if (existingIdx >= 0) {
          if (prev[existingIdx].text === text) return prev
          const updated = [...prev]
          updated[existingIdx] = next
          return updated
        }
        return [...prev, next].sort((a, b) => a.pageNumber - b.pageNumber)
      })
    },
    [artifact],
  )

  const registerPagesContainer = useCallback(
    (el: HTMLDivElement | null) => {
      pagesContainerRef.current = el
    },
    [],
  )

  const ctx = useMemo<PdfViewerCtxValue>(
    () => ({
      artifactId,
      title,
      artifactError,
      pdfState,
      doc,
      pageCount,
      activePage,
      zoom,
      search,
      extractedText,
      scrollToPageInTextPanel,
      goToPage,
      setZoom,
      zoomBy,
      findInDocument,
      reportExtractedText,
      registerPagesContainer,
    }),
    [
      artifactId,
      title,
      artifactError,
      pdfState,
      doc,
      pageCount,
      activePage,
      zoom,
      search,
      extractedText,
      scrollToPageInTextPanel,
      goToPage,
      setZoom,
      zoomBy,
      findInDocument,
      reportExtractedText,
      registerPagesContainer,
    ],
  )

  return <PdfViewerCtx.Provider value={ctx}>{children}</PdfViewerCtx.Provider>
}

export function usePdfViewer(): PdfViewerCtxValue {
  return useContext(PdfViewerCtx)
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
