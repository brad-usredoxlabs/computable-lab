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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { apiClient } from '../shared/api/client'
import { API_BASE } from '../shared/api/base'
import type { RecordEnvelope } from '../types/kernel'
import type { AiProtocolCandidateSummary } from '../types/ai'
import type { EditorProjectionResponse } from '../types/uiSpec'
import { ProtocolCandidatePreview, type StepOverride } from '../event-editor/protocol-builder/ProtocolCandidatePreview'
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor'
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

export function VendorPdfReviewPage() {
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
  const [skippedSteps, setSkippedSteps] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<StepOverride[]>([])

  // TapTab protocol-surface state (Phase 3).
  const [protocolPayload, setProtocolPayload] = useState<MappedProtocolPayload | null>(null)
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  // Save As modal: prompts the user to confirm/overwrite the protocol title.
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsTitle, setSaveAsTitle] = useState('')
  // Resizable split — default 40:60 (PDF : editor).
  const [leftPct, setLeftPct] = useState(40)
  const splitDragRef = useRef<{ startX: number; startPct: number } | null>(null)
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

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber)
        const canvas = canvasRefs.current.get(pageNumber)
        if (!canvas) return
        const context = canvas.getContext('2d')
        if (!context) return
        const viewport = page.getViewport({ scale: 1.4 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvas, canvasContext: context, viewport }).promise
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}:`, err)
      }
    },
    [pdfDoc],
  )

  useMemo(() => {
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

  const handleExtract = useCallback(async () => {
    if (!extractedText) return
    setExtracting(true)
    setExtractError(null)
    try {
      const sourceText = extractedText
        .map((pg) => (typeof pg?.text === 'string' ? pg.text : ''))
        .filter(Boolean)
        .join('\n\n')
      const response = await fetch(`${API_BASE}/protocol-builder/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
        }),
      })
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message || `Server returned ${response.status}`)
      }
      const data = (await response.json()) as { candidate?: AiProtocolCandidateSummary }
      const c = data.candidate ?? null
      setCandidate(c)
      if (c) {
        setProtocolPayload(candidateToProtocolPayload(c, 'DRAFT-' + recordId, sourceText))
        setSavedRecordId(null)
        setSaveError(null)
        setSaveNote(null)
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }, [extractedText, title])

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

  // Save = accept the current version of the protocol, promoted to a usable
  // protocol: state approved + the real (current) title. Reuses the stable id
  // on subsequent saves.
  const handleSave = useCallback(async () => {
    if (!protocolPayload) return
    setSaving(true)
    setSaveError(null)
    setSaveNote(null)
    try {
      const payload = normalizeProtocolPayload(protocolPayload as unknown as Record<string, unknown>)
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
  }, [protocolPayload, savedRecordId])

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
      const payload = normalizeProtocolPayload({
        ...protocolPayload,
        title: saveAsTitle.trim() ? saveAsTitle.trim() : protocolPayload.title,
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
  }, [protocolPayload, saveAsTitle])

  // TapTab onUpdate: keep the edited payload when dirty.
  const handleTapTabUpdate = useCallback((serialized: Record<string, unknown>, dirty?: boolean) => {
    if (dirty === false) return
    setProtocolPayload((prev) => (prev ? ({ ...prev, ...serialized } as MappedProtocolPayload) : prev))
  }, [])

  // Split-drag handlers.
  const handleSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    splitDragRef.current = { startX: e.clientX, startPct: leftPct }
  }, [leftPct])

  const handleSplitPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = splitDragRef.current
    if (!drag) return
    const panel = splitPanelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    if (rect.width === 0) return
    const deltaPct = ((e.clientX - drag.startX) / rect.width) * 100
    setLeftPct(Math.min(70, Math.max(20, drag.startPct + deltaPct)))
  }, [])

  const handleSplitPointerUp = useCallback(() => {
    splitDragRef.current = null
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
    <div className="vpdf-review" data-testid="vpdf-review">
      <header className="vpdf-review__header">
        <button
          type="button"
          className="vpdf-review__back"
          onClick={() => navigate('/ingestion/vendor-pdf')}
          data-testid="vpdf-review-back"
        >
          ← Ingestion
        </button>
        <h1 className="vpdf-review__title" data-testid="vpdf-review-title">
          {typeof title === 'string' ? title : recordId}
        </h1>
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
            <div className="vpdf-review__pages">
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
          className="vpdf-review__split"
          data-testid="vpdf-split-handle"
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          onPointerCancel={handleSplitPointerUp}
        >
          <span>PDF · Editor</span>
        </div>

        {/* Right: extracted protocol */}
        <div className="vpdf-review__right" style={{ flex: 1 }}>
          {!candidate && !extracting && (
            <button
              type="button"
              className="vpdf-review__extract"
              onClick={() => void handleExtract()}
              disabled={!extractedText || extractedText.length === 0}
              data-testid="vpdf-extract"
            >
              Extract Protocol
            </button>
          )}
          {extracting && (
            <p className="vpdf-review__hint" data-testid="vpdf-extracting">
              Extracting…
            </p>
          )}
          {extractError && (
            <p className="vpdf-review__error" data-testid="vpdf-extract-error">
              {extractError}
            </p>
          )}
          {/* TapTab protocol surface once we have a candidate + projection. */}
          {candidate && protocolPayload && projection ? (
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