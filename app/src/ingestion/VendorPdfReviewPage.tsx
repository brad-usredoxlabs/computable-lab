/**
 * VendorPdfReviewPage — the single review surface for an ingested vendor PDF.
 *
 * W2-8 SAID/MEANT composition (spec §3 W1): the LEFT pane is the immutable
 * SAID — the stored PDF (pdfjs canvas pages) with a plain-text fallback, plus
 * the read-only SaidFactsPane (the vendor-protocol-candidate's facts with page
 * anchors). The RIGHT pane is the MEANT — the extraction-draft's
 * candidates[0].draft edited via TapTab, saved through PUT /records/:XDR +
 * expectedSha. Wave-2 vs legacy is a DATA state (a semantic draft exists for
 * this artifact?), never a URL fork.
 *
 * What is GONE on this route (acceptance: no visible action produces a
 * literal-step protocol): the Save / Save As buttons + modal, the
 * "Use the extracted protocol" button, the editable ProtocolCandidatePreview
 * overrides path, and every candidateToProtocolPayload call site. The legacy
 * extraction stream + the intake questions panel remain ONLY in the no-draft
 * (pre-wave-2) state; once a semantic draft exists, question-asking lives at
 * the realization entry (ProtocolLocalizationThread), not here.
 *
 * Route: /ingestion/vendor-pdf/:recordId
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import type { EditorProjectionResponse } from '../types/uiSpec'
import type { ExtractionStreamEvent, IntakeReviewDetailResponse } from '../shared/api/client'
import ExtractionProgressPanel, { type ExtractionLogLine } from './protocol-review/ExtractionProgressPanel'
import { clampZoom, fitWidthScale, MIN_ZOOM, MAX_ZOOM, steppedZoom } from './pdfZoom'
import { isCancelledRender } from './pdfRenderCancellation'
import {
  DEFAULT_SPLIT_PCT,
  MAX_SPLIT_PCT,
  MIN_SPLIT_PCT,
  nudgeSplitPct,
  splitPctFromDrag,
} from './splitGeometry'
import BranchQuestionsPanel from './protocol-review/BranchQuestionsPanel'
import { SemanticDraftPanel } from './protocol-review/SemanticDraftPanel'
import { SaidFactsPane } from './protocol-review/SaidFactsPane'
import {
  describeWriteRejection,
  findSaidCandidate,
  findSemanticDraft,
  type SemanticDraftEnvelope,
  type SemanticDraftView,
} from './protocol-review/semanticDraft'
import './VendorPdfReviewPage.css'

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
}

interface ExtractedPage {
  pageNumber: number
  text?: string
}

export interface VendorPdfReviewPageProps {
  /**
   * Rendered inside a workspace tab (ProtocolReviewHostPage) rather than as a
   * bare route: the shell already provides the brand/title and the tab strip, so
   * the page drops its own back button and heading. The PDF|text toggle stays —
   * it is the page's job. (The save actions are gone: the wave-2 route saves
   * the MEANT draft from its own panel, never a literal protocol.)
   */
  embedded?: boolean
}

export function VendorPdfReviewPage({ embedded = false }: VendorPdfReviewPageProps = {}) {
  const { recordId } = useParams<{ recordId: string }>()
  const navigate = useNavigate()

  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pages, setPages] = useState<number[]>([])
  const [pdfView, setPdfView] = useState<'pdf' | 'text'>('pdf')
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())

  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  // Live extraction progress: the reviewer must be able to tell a long run from
  // a dead one. WHICH model (and how hard it thinks) is a deployment setting
  // (settings → AI), not a per-extraction choice, so this page holds no
  // thinking/model control.
  const [extractStage, setExtractStage] = useState<string | null>(null)
  const [extractLog, setExtractLog] = useState<ExtractionLogLine[]>([])
  const [extractElapsedMs, setExtractElapsedMs] = useState(0)
  const [extractNote, setExtractNote] = useState<string | null>(null)
  const [sinceLastEventMs, setSinceLastEventMs] = useState<number | null>(null)
  const lastEventAtRef = useRef<number | null>(null)
  const extractAbortRef = useRef<AbortController | null>(null)

  // TapTab protocol-surface projection (create mode), fetched once.
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)

  // W2-8 wave-2 data state: the MEANT draft + the SAID candidate for THIS artifact.
  const [semanticView, setSemanticView] = useState<SemanticDraftView | null>(null)
  const [saidCandidate, setSaidCandidate] = useState<SemanticDraftEnvelope | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftToken, setDraftToken] = useState(0)

  // The document's if/then questions (legacy no-draft review only).
  const [review, setReview] = useState<IntakeReviewDetailResponse | null>(null)
  // Handbook artifacts back several trees (one per protocol section, same
  // sha256). The reviewer picks which protocol to work through; singular
  // review fields then mirror that choice.
  const [reviewTreeIndex, setReviewTreeIndex] = useState(0)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewToken, setReviewToken] = useState(0)

  // Resizable split — default 40:60 (PDF : editor).
  const [leftPct, setLeftPct] = useState(DEFAULT_SPLIT_PCT)
  const [splitDragging, setSplitDragging] = useState(false)
  // PDF zoom. Default is FIT: the preview used to render at a fixed 1.4 scale,
  // which is wider than this pane on a laptop, so the document scrolled off the
  // window sideways with no way back out.
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit')
  const [manualScale, setManualScale] = useState(1)
  const [paneWidth, setPaneWidth] = useState(0)
  const [basePageWidth, setBasePageWidth] = useState(0)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const splitDragRef = useRef<{ pointerId: number; startX: number; startPct: number; panelWidth: number } | null>(null)
  const splitPanelRef = useRef<HTMLDivElement | null>(null)

  // Fetch the protocol editor projection once (create mode) so TapTab can render.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getEditorDraftProjection(PROTOCOL_SCHEMA_ID)
      .then((p) => {
        if (!cancelled) setProjection(p)
      })
      .catch(() => {
        // projection unavailable — the MEANT panel still renders evidence + save
      })
    return () => {
      cancelled = true
    }
  }, [])

  const title = record ? (record.payload as Record<string, unknown>).title : recordId
  // The vendor label the extraction prompt uses, derived from the record's own
  // source URL when the artifact carries one (never guessed from the file name).
  const vendor = (() => {
    const file = (record?.payload as Record<string, unknown> | undefined)?.file as { source_url?: string } | undefined
    if (!file?.source_url) return undefined
    try {
      return new URL(file.source_url).hostname
    } catch {
      return undefined
    }
  })()
  const extractedText = (record?.payload as Record<string, unknown> | undefined)?.extractedText as
    | ExtractedPage[]
    | undefined

  const pdfUrl = recordId ? apiClient.vendorPdfBlobUrl(recordId) : ''

  // Load the vendor-pdf record.
  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    setLoadError(null)
    apiClient
      .getRecord(recordId)
      .then((env) => {
        if (!cancelled) setRecord(env)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load record')
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  /**
   * The CAN-* candidate id the semantic-draft affordance rides (M1: the merged
   * endpoint validates ^CAN-[A-Za-z0-9_-]+$ — the param is the CANDIDATE id,
   * never the route's VPDF-* id). Resolution order: the joined candidate record
   * (source.documentId === this VPDF), else the VPDF record's own
   * vendorProtocolCandidateRef when it names a CAN-*.
   */
  const candidateRefId = useMemo(() => {
    const ref = (record?.payload as Record<string, unknown> | undefined)?.vendorProtocolCandidateRef as
      | { kind?: string; type?: string; id?: string }
      | undefined
    if (ref?.kind === 'record' && typeof ref.id === 'string' && /^CAN-[A-Za-z0-9_-]+$/.test(ref.id)) {
      return ref.id
    }
    return null
  }, [record])

  const canCandidateId =
    saidCandidate && /^CAN-[A-Za-z0-9_-]+$/.test(saidCandidate.recordId) ? saidCandidate.recordId : candidateRefId

  // Load the wave-2 data state: the MEANT draft (extraction-drafts joined on
  // source_artifact.id === this VPDF, M2) and the SAID candidate. A missing
  // list endpoint or an empty result is a gap, not an error: the page stays in
  // the legacy no-draft review.
  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    const load = async () => {
      let drafts: unknown[] = []
      let candidates: unknown[] = []
      try {
        drafts = (await apiClient.listRecordsByKind('extraction-draft', 200)).records
      } catch {
        drafts = []
      }
      try {
        candidates = (await apiClient.listRecordsByKind('vendor-protocol-candidate', 200)).records
      } catch {
        candidates = []
      }
      let joined = findSaidCandidate(candidates, recordId)
      if (!joined && candidateRefId) {
        try {
          const env = await apiClient.getRecord(candidateRefId)
          if (env && (env.payload as Record<string, unknown>).kind === 'vendor-protocol-candidate') {
            joined = { recordId: env.recordId, schemaId: env.schemaId, payload: env.payload as Record<string, unknown> }
          }
        } catch {
          /* the ref names nothing readable — the pane degrades honestly */
        }
      }
      if (cancelled) return
      setSemanticView(findSemanticDraft(drafts, recordId))
      setSaidCandidate(joined)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [recordId, draftToken, candidateRefId])

  // Load the intake review for THIS artifact (questions + the gated steps).
  // A 404 (no attributable tree) is a gap, not an error: the panel says so.
  // This read model drives the LEGACY no-draft questions block only — once a
  // semantic draft exists, asking lives at the realization entry.
  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    setReviewLoading(true)
    setReviewError(null)
    apiClient
      .getIntakeReview(recordId)
      .then((res) => {
        if (!cancelled) setReview(res)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setReview(null)
        setReviewError(err instanceof Error ? err.message : 'Could not load the document’s questions')
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [recordId, reviewToken])

  /**
   * The tree the reviewer is working through. A handbook artifact backs one
   * tree per protocol section (`review.trees`, same sha256); the index selects
   * one, and this derived view presents the chosen tree with the SAME shape as
   * the singular compat fields, so every consumer below is tree-agnostic.
   * Single-tree documents are exactly trees[0] — no behavior change.
   */
  const activeReview = useMemo(() => {
    if (!review) return null
    const entry = review.trees?.[reviewTreeIndex]
    if (!entry) return review
    return {
      ...review,
      tree: entry.tree,
      candidate: entry.candidate,
      proposals: entry.proposals,
    } satisfies IntakeReviewDetailResponse
  }, [review, reviewTreeIndex])

  // Build the branch the reviewer answered, when the eager pass never
  // enumerated it (the branch product is capped). The draft happens on the
  // server; the reload brings the new realization in through the normal
  // review payload, so the panel needs no special case.
  const buildBranchForChoices = useCallback(
    async (choices: Record<string, string>) => {
      // The tree the reviewer is LOOKING at (a handbook may back several).
      const treeId = activeReview?.tree?.recordId
      if (!treeId) {
        throw new Error('This document has no decision tree to build from yet.')
      }
      await apiClient.realizeIntakeBranch(treeId, { choices })
      setReviewToken((n) => n + 1)
    },
    [activeReview],
  )

  // Liveness clock: "last event Ns ago" is what separates a thinking model
  // from a dead connection, so it must tick even when no event arrives.
  useEffect(() => {
    if (!extracting) {
      setSinceLastEventMs(null)
      return
    }
    const timer = setInterval(() => {
      const at = lastEventAtRef.current
      setSinceLastEventMs(at === null ? null : Date.now() - at)
    }, 1000)
    return () => clearInterval(timer)
  }, [extracting])

  // Load the stored PDF once we have a blob URL. If it fails (no stored file
  // / 404), fall back to the extracted-text pane.
  useEffect(() => {
    if (!pdfUrl) return
    setPdfDoc(null)
    setPdfError(null)
    setPages([])
    setPdfView('pdf')
    let cancelled = false
    pdfjsLib
      .getDocument({ url: pdfUrl })
      .promise.then((doc) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        setPdfDoc(doc)
        setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1))
      })
      .catch((err) => {
        if (cancelled) return
        // No renderable PDF — switch to the extracted-text view.
        setPdfError(err instanceof Error ? err.message : 'Failed to load PDF')
        setPdfView('text')
      })
    return () => {
      cancelled = true
    }
  }, [pdfUrl])

  const measurePane = useCallback(() => {
    const el = pagesRef.current
    if (!el) return
    setPaneWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth))
  }, [])

  // The pane is resizable (split drag) AND responsive; measure it rather than
  // assuming a fraction, and debounce so a drag doesn't repaint every page.
  // The ref callback measures on ATTACH (it always has the element, and an
  // effect can run before the container exists — that is how the first version
  // silently measured 0 and never fit the page), the observer tracks resizes.
  useEffect(() => {
    if (pdfView !== 'pdf' || !pdfDoc) return
    measurePane()
    const el = pagesRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setPaneWidth((prev) => (prev === width ? prev : width)), 120)
    })
    observer.observe(el)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [pdfView, pdfDoc, leftPct, measurePane])

  // The page's own width at scale 1 — the denominator of "fit".
  useEffect(() => {
    let cancelled = false
    if (!pdfDoc || pages.length === 0) {
      setBasePageWidth(0)
      return
    }
    pdfDoc
      .getPage(pages[0]!)
      .then((page: PDFPageProxy) => {
        if (!cancelled) setBasePageWidth(page.getViewport({ scale: 1 }).width)
      })
      .catch(() => {
        if (!cancelled) setBasePageWidth(0)
      })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, pages])

  const scale =
    zoomMode === 'fit' && basePageWidth > 0 && paneWidth > 0
      ? fitWidthScale(paneWidth, basePageWidth, 16)
      : clampZoom(manualScale)

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      setZoomMode('manual')
      setManualScale((current) => steppedZoom(current === scale ? current : scale, direction))
    },
    [scale],
  )
  const fitToWidth = useCallback(() => setZoomMode('fit'), [])

  // pdf.js paints by applying the viewport transform to the context. For these
  // pages that transform is [1, 0, 0, -1, 0, H] — a pure y-flip — so a page
  // painted TWICE overlaps into an upside-down page. Two renders overlap
  // whenever a new scale arrives while the previous pass is still painting
  // (69 pages in a loop, then the pane measures, the split moves, or the
  // extraction payload lands and re-triggers the effect), which is why the
  // preview flips at the END of an ingestion and not on a first quiet load.
  const renderTasks = useRef<Map<number, { promise: Promise<void>; cancel: () => void }>>(new Map())
  // W2-8-FIX2 D3: per-page claim. The old discipline only registered the
  // render task AFTER `await pdfDoc.getPage()`, so two passes starting in the
  // same tick (StrictMode's double effect run, a scale change landing mid-loop,
  // the extraction payload re-triggering the effect) both saw an empty
  // `previous` and called page.render() on the SAME canvas — pdf.js rejects
  // that with "Cannot use the same canvas during multiple render() operations"
  // (the console errors the orchestrator's probes captured on pages 1-2).
  // A claim is written SYNCHRONOUSLY before the first await, and every await
  // point re-checks it: at most one render per page is ever live, and a
  // superseded pass bows out instead of racing onto the canvas.
  const renderClaims = useRef<Map<number, number>>(new Map())
  const claimSeq = useRef(0)

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return
      const myClaim = ++claimSeq.current
      renderClaims.current.set(pageNumber, myClaim)
      const ownsPage = () => renderClaims.current.get(pageNumber) === myClaim
      const previous = renderTasks.current.get(pageNumber)
      if (previous) {
        // A newer paint supersedes the old one: stop it, then wait for it to
        // unwind so two renders never touch the same canvas at once.
        try {
          previous.cancel()
        } catch {
          // Already finished — nothing to stop.
        }
        await previous.promise.catch(() => undefined)
      }
      if (!ownsPage()) return
      let task: { promise: Promise<void>; cancel: () => void } | undefined
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber)
        // getPage is an await: a newer request may have claimed this page
        // meanwhile. It owns the next paint — do not race it onto the canvas.
        if (!ownsPage()) return
        const canvas = canvasRefs.current.get(pageNumber)
        if (!canvas) return
        const context = canvas.getContext('2d')
        if (!context) return
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        // Keep the element's CSS box in step with the pixel buffer so the page
        // is drawn at the zoom the reviewer chose (and stays crisp).
        canvas.style.width = `${Math.round(viewport.width)}px`
        canvas.style.height = `${Math.round(viewport.height)}px`
        // A cancelled paint can stop mid-page; start from the identity so this
        // page is never drawn on top of a half-finished one.
        context.setTransform(1, 0, 0, 1, 0, 0)
        task = page.render({ canvas, canvasContext: context, viewport })
        renderTasks.current.set(pageNumber, task)
        await task.promise
      } catch (err) {
        if (!isCancelledRender(err)) {
          console.error(`Failed to render page ${pageNumber}:`, err)
        }
      } finally {
        // Only clear the entries if nobody newer claimed this page meanwhile.
        if (task && renderTasks.current.get(pageNumber) === task) {
          renderTasks.current.delete(pageNumber)
        }
        if (ownsPage()) renderClaims.current.delete(pageNumber)
      }
    },
    [pdfDoc, scale],
  )

  // Painting canvases is a SIDE EFFECT, so it belongs in an effect (a memo runs
  // during render and double-runs under StrictMode).
  useEffect(() => {
    if (!pdfDoc || pages.length === 0) return
    pages.forEach((pageNum) => {
      void renderPage(pageNum)
    })
  }, [pdfDoc, pages, renderPage])

  // The anchor-jump machinery: every PDF canvas page AND every text-fallback
  // page carries data-vpdf-page; the MEANT panel's semantic-evidence chips jump
  // here (acceptance A2).
  const handleGotoPage = useCallback((pageNumber: number) => {
    document
      .querySelector(`[data-vpdf-page="${pageNumber}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /**
   * Run the AI extraction as a live stream: the panel shows the server's stage,
   * the model's reasoning as it arrives, and a liveness clock. Cancelling
   * aborts the request rather than leaving a run going in the background.
   *
   * W2-8: the stream is progress ONLY. Its `done` event no longer maps a
   * candidate into an editable protocol payload (the literal-completion path is
   * retired on this route — spec §8 bait 7: stream events never clobber MEANT
   * state).
   */
  const handleExtract = useCallback(async () => {
    if (!extractedText) return
    const controller = new AbortController()
    extractAbortRef.current = controller
    lastEventAtRef.current = Date.now()
    setExtracting(true)
    setExtractError(null)
    setExtractNote(null)
    setExtractStage(null)
    setExtractLog([])
    setExtractElapsedMs(0)
    setSinceLastEventMs(0)

    const sourceText = extractedText
      .map((pg) => (typeof pg?.text === 'string' ? pg.text : ''))
      .filter(Boolean)
      .join('\n\n')

    try {
      await apiClient.extractProtocolStream(
        {
          text: sourceText,
          ...(recordId ? { documentId: recordId } : {}),
          ...(typeof vendor === 'string' && vendor.trim() ? { vendor: vendor.trim() } : {}),
        },
        {
          signal: controller.signal,
          onEvent: (event: ExtractionStreamEvent) => {
            lastEventAtRef.current = Date.now()
            setSinceLastEventMs(0)
            switch (event.type) {
              case 'start':
                setExtractStage('Preparing the extraction…')
                setExtractLog((log) => [
                  ...log,
                  {
                    kind: 'note',
                    text: `${event.model} · ${event.chunks} chunk(s)\n`,
                  },
                ])
                break
              case 'stage':
                setExtractStage(event.message)
                setExtractLog((log) => [...log, { kind: 'note', text: `${event.message}\n` }])
                break
              case 'reasoning':
                setExtractLog((log) => [...log, { kind: 'reasoning', text: event.text }])
                break
              case 'progress':
                setExtractElapsedMs(event.elapsedMs)
                break
              case 'chunk-done':
                setExtractLog((log) => [
                  ...log,
                  {
                    kind: 'note',
                    text: `\nchunk ${event.index}: ${event.parsed ? `${event.steps} step(s) parsed` : 'no JSON parsed'} in ${Math.round(event.elapsedMs / 1000)}s\n`,
                  },
                ])
                break
              case 'done':
                setExtractElapsedMs(event.elapsedMs)
                setExtractStage('Extraction complete')
                setExtractNote('Extraction finished. The semantic pass drafts the protocol from the stored candidate — this route never completes a literal protocol.')
                break
              case 'error':
                setExtractError(event.message)
                break
              default:
                break
            }
          },
        },
      )
    } catch (err) {
      if (controller.signal.aborted) {
        setExtractNote('Extraction cancelled.')
      } else {
        setExtractError(err instanceof Error ? err.message : 'Extraction failed')
      }
    } finally {
      setExtracting(false)
      extractAbortRef.current = null
    }
  }, [extractedText, recordId, vendor])

  const handleCancelExtraction = useCallback(() => {
    extractAbortRef.current?.abort()
  }, [])

  /**
   * The no-draft affordance (OQ1 (a) / M1): run the merged W2-6 semantic pass
   * over the CAN-* candidate. Success lands an extraction-draft; the data-state
   * reload then renders the MEANT editor — no URL fork, no literal completion.
   */
  const handleSemanticDraft = useCallback(async () => {
    if (!canCandidateId) return
    setDrafting(true)
    setDraftError(null)
    try {
      await apiClient.semanticDraft(canCandidateId)
      setDraftToken((n) => n + 1)
    } catch (err) {
      setDraftError(describeWriteRejection(err))
    } finally {
      setDrafting(false)
    }
  }, [canCandidateId])

  // Split-drag handlers.
  /**
   * Drag the divider. The pointer is CAPTURED on pointerdown: without that the
   * drag dies the moment the pointer leaves the handle (it is a few pixels
   * wide), which is why the split felt broken rather than merely fiddly.
   */
  const handleSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const panel = splitPanelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      if (rect.width === 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      splitDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startPct: leftPct, panelWidth: rect.width }
      setSplitDragging(true)
    },
    [leftPct],
  )

  const handleSplitPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = splitDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setLeftPct(
      splitPctFromDrag({
        startPct: drag.startPct,
        startX: drag.startX,
        clientX: e.clientX,
        panelWidth: drag.panelWidth,
      }),
    )
  }, [])

  const handleSplitPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = splitDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    splitDragRef.current = null
    setSplitDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // Keyboard path for the same control (a divider you can only drag with a
  // mouse is unusable on a trackpad with a tired hand, and untestable).
  const handleSplitKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setLeftPct((pct) => nudgeSplitPct(pct, -1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setLeftPct((pct) => nudgeSplitPct(pct, 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setLeftPct(MIN_SPLIT_PCT)
    } else if (e.key === 'End') {
      e.preventDefault()
      setLeftPct(MAX_SPLIT_PCT)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setLeftPct(DEFAULT_SPLIT_PCT)
    }
  }, [])

  const sourcePageCount = (() => {
    const source = saidCandidate?.payload?.source as { pageCount?: number } | undefined
    return typeof source?.pageCount === 'number' ? source.pageCount : undefined
  })()

  if (loadError) {
    return (
      <div className="vpdf-review vpdf-review--centered" data-testid="vpdf-review">
        <p className="vpdf-review__error">{loadError}</p>
        <button type="button" className="vpdf-review__back" onClick={() => navigate('/ingestion/vendor-pdf')}>
          Back to Ingestion
        </button>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="vpdf-review vpdf-review--centered" data-testid="vpdf-review">
        <p className="vpdf-review__hint">Loading vendor PDF…</p>
      </div>
    )
  }

  const showText = pdfView === 'text' || (pdfView === 'pdf' && !pdfDoc)

  return (
    <div
      className={`vpdf-review${splitDragging ? ' vpdf-review--split-dragging' : ''}`}
      data-testid="vpdf-review"
    >
      <header className="vpdf-review__header">
        {embedded ? null : (
          <button
            type="button"
            className="vpdf-review__back"
            onClick={() => navigate('/ingestion/vendor-pdf')}
            data-testid="vpdf-review-back"
          >
            ← Ingestion
          </button>
        )}
        {embedded ? null : (
          <h1 className="vpdf-review__title" data-testid="vpdf-review-title">
            {typeof title === 'string' ? title : recordId}
          </h1>
        )}
        <span className="vpdf-review__meta">
          {recordId} · Vendor PDF · {pdfDoc?.numPages ?? extractedText?.length ?? 0} page(s)
        </span>
        {extractedText && extractedText.length > 0 && (
          <div className="vpdf-review__view-toggle">
            <button
              type="button"
              className={pdfView === 'pdf' ? 'vpdf-review__toggle vpdf-review__toggle--active' : 'vpdf-review__toggle'}
              onClick={() => setPdfView('pdf')}
              disabled={Boolean(pdfError || !pdfUrl)}
            >
              PDF
            </button>
            <button
              type="button"
              className={pdfView === 'text' ? 'vpdf-review__toggle vpdf-review__toggle--active' : 'vpdf-review__toggle'}
              onClick={() => setPdfView('text')}
            >
              Plain text
            </button>
          </div>
        )}
      </header>

      <div className="vpdf-review__panels" ref={(el) => {
        // The split handle drag measures its parent (this panels container) width.
        splitPanelRef.current = el
      }}>
        {/* Left: the SAID — PDF (or plain-text fallback) + read-only candidate facts */}
        <div className="vpdf-review__left" style={{ flex: `0 0 ${leftPct}%`, maxWidth: `${leftPct}%` }}>
          {pdfView === 'pdf' && pdfDoc && (
            <div className="vpdf-review__zoom" data-testid="vpdf-zoom">
              <button
                type="button"
                onClick={() => zoomBy(-1)}
                disabled={scale <= MIN_ZOOM}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <span className="vpdf-review__zoom-value" data-testid="vpdf-zoom-value">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(1)}
                disabled={scale >= MAX_ZOOM}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="vpdf-review__zoom-fit"
                onClick={fitToWidth}
                disabled={zoomMode === 'fit'}
                data-testid="vpdf-zoom-fit"
              >
                Fit width
              </button>
            </div>
          )}
          {pdfView === 'pdf' && pdfDoc && (
            <div
              className="vpdf-review__pages"
              ref={(el) => {
                pagesRef.current = el
                if (el) measurePane()
              }}
            >
              {pages.map((pageNum) => (
                <div key={pageNum} data-vpdf-page={pageNum} className="vpdf-review__page">
                  <canvas
                    ref={(el) => {
                      if (el) {
                        canvasRefs.current.set(pageNum, el)
                        void renderPage(pageNum)
                      } else {
                        canvasRefs.current.delete(pageNum)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {showText ? (
            <div className="vpdf-review__text" data-testid="vpdf-review-text">
              {extractedText && extractedText.length > 0 ? (
                extractedText.map((pg) => (
                  <div key={pg.pageNumber} data-vpdf-page={pg.pageNumber} className="vpdf-review__text-page">
                    <div className="vpdf-review__text-page-header">Page {pg.pageNumber}</div>
                    <pre className="vpdf-review__text-pre">{pg.text ?? ''}</pre>
                  </div>
                ))
              ) : (
                <p className="vpdf-review__hint">No extracted text available.</p>
              )}
            </div>
          ) : null}
          {saidCandidate ? (
            <SaidFactsPane
              candidate={saidCandidate}
              {...(canCandidateId ? { candidateRecordId: canCandidateId } : {})}
              onGotoPage={handleGotoPage}
            />
          ) : null}
        </div>

        {/* Split handle */}
        <div
          className={`vpdf-review__split${splitDragging ? ' vpdf-review__split--dragging' : ''}`}
          data-testid="vpdf-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the PDF pane"
          aria-valuenow={Math.round(leftPct)}
          aria-valuemin={MIN_SPLIT_PCT}
          aria-valuemax={MAX_SPLIT_PCT}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          onPointerCancel={handleSplitPointerUp}
          onKeyDown={handleSplitKeyDown}
          onDoubleClick={() => setLeftPct(DEFAULT_SPLIT_PCT)}
        >
          <span>PDF · Editor</span>
        </div>

        {/* Right: the MEANT (semantic draft present) or the no-draft affordance */}
        <div className="vpdf-review__right" style={{ flex: 1 }}>
          {semanticView ? (
            <SemanticDraftPanel
              xdrRecordId={semanticView.xdr.recordId}
              candidateIndex={semanticView.candidateIndex}
              draft={semanticView.draft}
              {...(sourcePageCount !== undefined ? { sourcePageCount } : {})}
              projection={projection}
              onGotoPage={handleGotoPage}
            />
          ) : (
            <>
              {canCandidateId ? (
                <div className="vpdf-review__affordance" data-testid="vpdf-semantic-draft-block">
                  <button
                    type="button"
                    className="vpdf-review__extract"
                    data-testid="vpdf-semantic-draft"
                    disabled={drafting}
                    onClick={() => void handleSemanticDraft()}
                  >
                    {drafting ? 'Drafting the semantic protocol…' : 'Draft the semantic protocol'}
                  </button>
                  <p className="vpdf-review__hint">
                    Runs the semantic pass over {canCandidateId} and lands an extraction-draft — the review
                    then edits the draft, never a literal protocol.
                  </p>
                  {draftError ? (
                    <p className="vpdf-review__error" data-testid="vpdf-semantic-draft-error" role="alert">
                      {draftError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ExtractionProgressPanel
                running={extracting}
                stage={extractStage}
                log={extractLog}
                elapsedMs={extractElapsedMs}
                sinceLastEventMs={sinceLastEventMs}
                canStart={Boolean(extractedText && extractedText.length > 0)}
                onStart={() => void handleExtract()}
                onCancel={handleCancelExtraction}
                error={extractError}
                note={extractNote}
              />
              {recordId ? (
                <div className="vpdf-review__questions">
                  {reviewLoading ? (
                    <p className="vpdf-review__hint">Reading the document’s questions…</p>
                  ) : reviewError ? (
                    <p className="vpdf-review__error" role="alert">
                      {reviewError}
                    </p>
                  ) : (
                    <>
                      {/* Handbook artifacts back one tree per protocol section —
                          pick the protocol to review before answering its
                          questions. Single-tree documents render no selector. */}
                      {review && (review.count ?? 1) > 1 ? (
                        <label className="vpdf-review__tree-select">
                          <span>Protocol </span>
                          <select
                            value={reviewTreeIndex}
                            onChange={(e) => setReviewTreeIndex(Number(e.target.value))}
                            data-testid="vpdf-tree-select"
                          >
                            {(review.trees ?? []).map((entry, i) => (
                              <option key={entry.tree.recordId} value={i}>
                                {entry.tree.documentId.split('__').pop() ?? entry.tree.recordId}
                                {' '}({entry.proposals.length} proposal{entry.proposals.length === 1 ? '' : 's'})
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <BranchQuestionsPanel
                        axes={activeReview?.tree.axes ?? []}
                        proposals={activeReview?.proposals ?? []}
                        gap={
                          activeReview
                            ? 'This document states no if/then questions that the intake engine could derive (its steps carry no branches and no table its steps point at).'
                            : 'No decision tree is attributable to this PDF yet — run intake on it first.'
                        }
                        onRedrafted={() => setReviewToken((n) => n + 1)}
                        {...(activeReview?.tree ? { onBuildBranch: buildBranchForChoices } : {})}
                      />
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
