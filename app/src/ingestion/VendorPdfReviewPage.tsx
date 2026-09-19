/**
 * VendorPdfReviewPage — the single review surface for an ingested vendor PDF.
 *
 * Left: the stored PDF (pdfjs canvas pages) with a plain-text fallback when
 * the blob is unavailable. Right: the extracted protocol rendered with
 * ProtocolCandidatePreview, with an "Extract Protocol" button that calls the
 * same /protocol-builder/extract endpoint the builder uses. Per-step "Page N"
 * provenance jumps the left PDF pane to that page via onGotoPage.
 *
 * Route: /ingestion/vendor-pdf/:recordId
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import type { AiProtocolCandidateSummary } from '../types/ai'
import type { EditorProjectionResponse } from '../types/uiSpec'
import { ProtocolCandidatePreview, type StepOverride } from '../event-editor/protocol-builder/ProtocolCandidatePreview'
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor'
import type { ExtractionOptions, ExtractionStreamEvent, IntakeReviewDetailResponse } from '../shared/api/client'
import ExtractionProgressPanel, { type ExtractionLogLine } from './protocol-review/ExtractionProgressPanel'
import { clampZoom, fitWidthScale, MIN_ZOOM, MAX_ZOOM, steppedZoom } from './pdfZoom'
import {
  DEFAULT_SPLIT_PCT,
  MAX_SPLIT_PCT,
  MIN_SPLIT_PCT,
  nudgeSplitPct,
  splitPctFromDrag,
} from './splitGeometry'
import BranchQuestionsPanel, { type ResolvedReviewBranch } from './protocol-review/BranchQuestionsPanel'
import {
  reviewCandidateToProtocolPayload,
  treeAxesToBranchAxes,
  type MappedBranchAxis,
} from './candidateToProtocolPayload'
import { candidateToProtocolPayload, normalizeProtocolPayload, type MappedProtocolPayload } from './candidateToProtocolPayload'
import './VendorPdfReviewPage.css'

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

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
   * the page drops its own back button and heading. The save actions and the
   * PDF|text toggle stay — they are the page's job.
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

  const [candidate, setCandidate] = useState<AiProtocolCandidateSummary | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  // Live extraction progress: the reviewer must be able to tell a long run from
  // a dead one, and to choose how hard the model thinks before starting.
  const [extractOptions, setExtractOptions] = useState<ExtractionOptions | null>(null)
  const [thinkingLevel, setThinkingLevel] = useState('')
  const [extractStage, setExtractStage] = useState<string | null>(null)
  const [extractLog, setExtractLog] = useState<ExtractionLogLine[]>([])
  const [extractElapsedMs, setExtractElapsedMs] = useState(0)
  const [extractNote, setExtractNote] = useState<string | null>(null)
  const [sinceLastEventMs, setSinceLastEventMs] = useState<number | null>(null)
  const lastEventAtRef = useRef<number | null>(null)
  const extractAbortRef = useRef<AbortController | null>(null)
  const [skippedSteps, setSkippedSteps] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<StepOverride[]>([])

  // TapTab protocol-surface state (Phase 3).
  const [protocolPayload, setProtocolPayload] = useState<MappedProtocolPayload | null>(null)
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)
  // The document's if/then questions, answered by the reviewer (branch panel).
  const [reviewBranch, setReviewBranch] = useState<ResolvedReviewBranch | null>(null)
  // The intake read model for this artifact: which questions the document asks,
  // and the candidate whose step ids they gate. Loaded ONCE here (not per
  // panel) so the questions and the step list cannot drift or double-fetch.
  const [review, setReview] = useState<IntakeReviewDetailResponse | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewToken, setReviewToken] = useState(0)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  // Save As modal: prompts the user to confirm/overwrite the protocol title.
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsTitle, setSaveAsTitle] = useState('')
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
        // projection unavailable — fall back to ProtocolCandidatePreview below
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

  // Load the intake review for THIS artifact (questions + the gated steps).
  // A 404 (no attributable tree) is a gap, not an error: the panel says so.
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

  // Which thinking levels this deployment offers for an extraction (config).
  useEffect(() => {
    let cancelled = false
    apiClient
      .getExtractionOptions()
      .then((opts) => {
        if (cancelled) return
        setExtractOptions(opts)
        setThinkingLevel((current) => current || (opts?.defaultThinkingLevel ?? ''))
      })
      .catch(() => {
        // The picker simply does not render; extraction still works at the
        // endpoint's own default.
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber)
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
        await page.render({ canvas, canvasContext: context, viewport }).promise
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}:`, err)
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

  const handleGotoPage = useCallback((pageNumber: number) => {
    document
      .querySelector(`[data-vpdf-page="${pageNumber}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /**
   * Run the AI extraction as a live stream: the panel shows the server's stage,
   * the model's reasoning as it arrives, and a liveness clock. Cancelling
   * aborts the request rather than leaving a run going in the background.
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

    const applyCandidate = (raw: Record<string, unknown> | null): void => {
      const c = (raw ?? null) as AiProtocolCandidateSummary | null
      setCandidate(c)
      if (c) {
        setProtocolPayload(candidateToProtocolPayload(c, 'DRAFT-' + recordId, sourceText))
        setSavedRecordId(null)
        setSaveError(null)
        setSaveNote(null)
      }
    }

    try {
      await apiClient.extractProtocolStream(
        {
          text: sourceText,
          ...(recordId ? { documentId: recordId } : {}),
          ...(typeof vendor === 'string' && vendor.trim() ? { vendor: vendor.trim() } : {}),
          ...(thinkingLevel ? { thinkingLevel } : {}),
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
                    text: `${event.model} · ${event.chunks} chunk(s) · thinking: ${event.thinkingLevel || 'endpoint default'}\n`,
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
                applyCandidate(event.candidate as Record<string, unknown>)
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
  }, [extractedText, recordId, thinkingLevel, vendor])

  const handleCancelExtraction = useCallback(() => {
    extractAbortRef.current?.abort()
  }, [])

  /**
   * Build the editable protocol from the extraction the QUESTIONS gate (the
   * vendor candidate), instead of asking the AI for a second candidate of the
   * same PDF. Step ids then match the tree's then_stepIds, so "this branch runs
   * step-001, step-004" and the editor show the same rows. No AI round trip.
   */
  const handleUseExtractedProtocol = useCallback(() => {
    const extracted = review?.candidate
    if (!extracted) return
    setCandidate(null)
    setProtocolPayload(reviewCandidateToProtocolPayload(extracted, 'DRAFT-' + recordId))
    setSavedRecordId(null)
    setSaveError(null)
    setSaveNote(null)
  }, [review, recordId])

  const handleToggleStep = useCallback((key: string, enabled: boolean) => {
    setSkippedSteps((prev) => {
      const next = new Set(prev)
      if (enabled) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleOverrideChange = useCallback((key: string, field: keyof StepOverride, value: string | null) => {
    setOverrides((prev) => {
      const existing = prev.find((o) => o.stepKey === key)
      const next = { ...existing, stepKey: key, [field]: value } as StepOverride
      return existing ? prev.map((o) => (o.stepKey === key ? next : o)) : [...prev, next]
    })
  }, [])

  const handleReviewResolved = useCallback((resolved: ResolvedReviewBranch | null) => {
    setReviewBranch(resolved)
  }, [])

  // The promoted protocol carries the document's questions as `branch_axes`:
  // the global recipe keeps every step AND asks which branch applies, so the
  // lab realization can answer it (protocol-worldview: recipes carry questions,
  // localizations carry answers).
  const branchAxesForSave = useCallback((): MappedBranchAxis[] | undefined => {
    if (!reviewBranch) return undefined
    const axes = treeAxesToBranchAxes(reviewBranch.axes)
    return axes.length > 0 ? axes : undefined
  }, [reviewBranch])

  // Save = accept the current version of the protocol, promoted to a usable
  // protocol: state approved + the real (current) title. Reuses the stable id
  // on subsequent saves.
  const handleSave = useCallback(async () => {
    if (!protocolPayload) return
    setSaving(true)
    setSaveError(null)
    setSaveNote(null)
    try {
      const axes = branchAxesForSave()
      const payload = normalizeProtocolPayload({
        ...(protocolPayload as unknown as Record<string, unknown>),
        ...(axes ? { branch_axes: axes } : {}),
      })
      if (savedRecordId) {
        await apiClient.updateRecord(savedRecordId, { ...payload, recordId: savedRecordId, state: 'approved' })
        setSaveNote('Saved.')
      } else {
        const recId = `PRT-${shortId()}`
        await apiClient.createRecord(PROTOCOL_SCHEMA_ID, { ...payload, recordId: recId, state: 'approved' })
        setSavedRecordId(recId)
        setProtocolPayload({ ...(payload as unknown as MappedProtocolPayload), recordId: recId })
        setSaveNote('Saved.')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [protocolPayload, savedRecordId, branchAxesForSave])

  // Save As — open a modal pre-loaded with the real protocol title so the
  // user can overwrite it, then save as a fresh approved copy.
  const handleSaveAs = useCallback(async () => {
    if (!protocolPayload) return
    setSaveAsTitle(protocolPayload.title)
    setSaveAsOpen(true)
  }, [protocolPayload])

  const handleSaveAsConfirm = useCallback(async () => {
    if (!protocolPayload) return
    setSaveAsOpen(false)
    setSaving(true)
    setSaveError(null)
    setSaveNote(null)
    try {
      const axes = branchAxesForSave()
      const payload = normalizeProtocolPayload({
        ...protocolPayload,
        title: saveAsTitle.trim() ? saveAsTitle.trim() : protocolPayload.title,
        ...(axes ? { branch_axes: axes } : {}),
      } as unknown as Record<string, unknown>)
      const recId = `PRT-${shortId()}`
      await apiClient.createRecord(PROTOCOL_SCHEMA_ID, { ...payload, recordId: recId, state: 'approved' })
      setSavedRecordId(recId)
      setSaveNote('Saved as copy.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save As failed')
    } finally {
      setSaving(false)
    }
  }, [protocolPayload, saveAsTitle, branchAxesForSave])

  // TapTab onUpdate: keep the edited payload when dirty.
  const handleTapTabUpdate = useCallback((serialized: Record<string, unknown>, dirty?: boolean) => {
    if (dirty === false) return
    setProtocolPayload((prev) => (prev ? ({ ...prev, ...serialized } as MappedProtocolPayload) : prev))
  }, [])

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
        {protocolPayload ? (
          <div className="vpdf-review__save-actions" data-testid="vpdf-save-actions">
            <button
              type="button"
              className="vpdf-review__save"
              onClick={() => void handleSave()}
              disabled={saving}
              data-testid="vpdf-save"
            >
              {saving ? 'Saving…' : savedRecordId ? 'Save' : 'Save protocol'}
            </button>
            <button
              type="button"
              className="vpdf-review__save vpdf-review__save--secondary"
              onClick={() => void handleSaveAs()}
              disabled={saving}
              data-testid="vpdf-save-as"
            >
              Save As
            </button>
          </div>
        ) : null}
        {saveNote ? <span className="vpdf-review__save-note">{saveNote}</span> : null}
        {saveError ? <span className="vpdf-review__save-error">{saveError}</span> : null}
      </header>

      <div className="vpdf-review__panels" ref={(el) => {
        // The split handle drag measures its parent (this panels container) width.
        splitPanelRef.current = el
      }}>
        {/* Left: PDF (or plain-text fallback) */}
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

        {/* Right: extracted protocol */}
        <div className="vpdf-review__right" style={{ flex: 1 }}>
          {!protocolPayload ? (
            <>
              {review?.candidate ? (
                <button
                  type="button"
                  className="vpdf-review__extract"
                  onClick={handleUseExtractedProtocol}
                  data-testid="vpdf-use-extracted"
                >
                  Use the extracted protocol ({review.candidate.steps.length} steps)
                </button>
              ) : null}
              <ExtractionProgressPanel
                options={extractOptions}
                level={thinkingLevel}
                onLevelChange={setThinkingLevel}
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
            </>
          ) : null}
          {recordId ? (
            <div className="vpdf-review__questions">
              {reviewLoading ? (
                <p className="vpdf-review__hint">Reading the document’s questions…</p>
              ) : reviewError ? (
                <p className="vpdf-review__error" role="alert">
                  {reviewError}
                </p>
              ) : (
                <BranchQuestionsPanel
                  axes={review?.tree.axes ?? []}
                  proposals={review?.proposals ?? []}
                  gap={
                    review
                      ? 'This document states no if/then questions that the intake engine could derive (its steps carry no branches and no table its steps point at).'
                      : 'No decision tree is attributable to this PDF yet — run intake on it first.'
                  }
                  onResolved={handleReviewResolved}
                  onRedrafted={() => setReviewToken((n) => n + 1)}
                />
              )}
            </div>
          ) : null}
          {/* TapTab protocol surface once we have a candidate + projection. */}
          {protocolPayload && projection ? (
            <div className="vpdf-review__taptab" data-testid="vpdf-taptab">
              <ProjectionTapTabEditor
                blocks={projection.blocks}
                slots={projection.slots}
                data={protocolPayload as unknown as Record<string, unknown>}
                onUpdate={handleTapTabUpdate}
              />
            </div>
          ) : candidate ? (
            <ProtocolCandidatePreview
              candidate={candidate}
              skippedSteps={skippedSteps}
              overrides={overrides}
              onToggleStep={handleToggleStep}
              onOverrideChange={handleOverrideChange}
              onGotoPage={handleGotoPage}
            />
          ) : null}
        </div>
      </div>

      {/* Save As modal — pre-loaded with the real protocol title. */}
      {saveAsOpen ? (
        <div className="vpdf-review__modal-overlay" data-testid="vpdf-saveas-modal">
          <form
            className="vpdf-review__modal"
            role="dialog"
            aria-modal="true"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSaveAsConfirm()
            }}
          >
            <h3 className="vpdf-review__modal-title">Save Protocol As</h3>
            <label className="vpdf-review__modal-label">
              Protocol title
              <input
                data-testid="vpdf-saveas-title"
                className="vpdf-review__modal-input"
                value={saveAsTitle}
                onChange={(e) => setSaveAsTitle(e.target.value)}
                autoFocus
              />
            </label>
            <div className="vpdf-review__modal-actions">
              <button type="button" className="vpdf-review__save vpdf-review__save--secondary" onClick={() => setSaveAsOpen(false)} data-testid="vpdf-saveas-cancel">
                Cancel
              </button>
              <button type="submit" className="vpdf-review__save" disabled={saving} data-testid="vpdf-saveas-confirm">
                Save As
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}