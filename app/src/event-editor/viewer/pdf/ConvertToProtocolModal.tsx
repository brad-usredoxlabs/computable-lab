/**
 * ConvertToProtocolModal — extracts a universal protocol from a PDF artifact.
 *
 * Flow:
 *   idle → extracting → preview → saving → done
 *
 * Reads extracted text from PdfViewerContext, calls the backend extraction
 * API, shows a preview of the AI candidate, then creates a protocol record.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePdfViewer } from './PdfViewerContext'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { recordEditTabId } from '../../workspace/types'
import { apiClient } from '../../../shared/api/client'
import type { AiProtocolCandidateSummary } from '../../../types/ai'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConvertToProtocolModalProps {
  isOpen: boolean
  onClose: () => void
  /** The PDF artifact ID (for provenance) */
  artifactId: string
  /** The artifact title (for default protocol name) */
  artifactTitle: string
}

type Phase = 'idle' | 'extracting' | 'preview' | 'saving' | 'done'

interface ExtractionResult {
  candidate: AiProtocolCandidateSummary
  recordId?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Map an AI-extracted candidate to a protocol record payload conforming
 * to the universal protocol schema.
 */
function buildProtocolPayload(
  candidate: AiProtocolCandidateSummary,
  artifactId: string,
): Record<string, unknown> {
  const recordId = `PRT-${Date.now()}`
  const steps = (candidate.steps ?? []).map((step, i) => ({
    stepId: `step-${i + 1}`,
    label: step.title ?? `Step ${step.stepNumber ?? i + 1}`,
    description: step.text,
    ordinal: i + 1,
    kind: 'other' as const,
    ...(step.notes?.length ? { notes: step.notes.join('; ') } : {}),
  }))

  return {
    kind: 'protocol',
    recordId,
    title: candidate.title ?? 'Untitled Protocol',
    protocolLayer: 'universal',
    state: 'draft',
    lifecycleId: 'document-control',
    source: {
      type: 'vendor' as const,
      ref: { kind: 'record' as const, type: 'artifact', id: artifactId },
    },
    steps,
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConvertToProtocolModal({
  isOpen,
  onClose,
  artifactId,
}: ConvertToProtocolModalProps) {
  const v = usePdfViewer()
  const ws = useWorkspace()

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* Reset state when the modal is opened */
  useEffect(() => {
    if (isOpen) {
      setPhase('idle')
      setResult(null)
      setError(null)
    }
  }, [isOpen])

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  /* ---- Actions ---- */

  const handleExtract = useCallback(async () => {
    const text = v.extractedText.map((p) => p.text).join('\n')

    if (!text.trim()) {
      setError('No extracted text available. Make sure the PDF has been processed.')
      return
    }

    setPhase('extracting')
    setError(null)

    try {
      const res = await fetch('/api/protocol-builder/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, documentId: artifactId }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Extraction failed (${res.status}): ${body || res.statusText}`)
      }

      const data = await res.json()
      const candidate: AiProtocolCandidateSummary = data.candidate ?? data
      setResult({ candidate })
      setPhase('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }, [v.extractedText, artifactId])

  const handleCreateProtocol = useCallback(async () => {
    if (!result?.candidate) return

    setPhase('saving')
    setError(null)

    try {
      const payload = buildProtocolPayload(result.candidate, artifactId)
      const writeResponse = await apiClient.createRecord(
        'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload,
      )

      const createdId = writeResponse.record.recordId
      setResult((prev) => (prev ? { ...prev, recordId: createdId } : null))
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('preview')
    }
  }, [result, artifactId])

  const handleOpenProtocol = useCallback(() => {
    if (!result?.candidate || !result.recordId) return

    ws.openTab({
      id: recordEditTabId(result.recordId),
      kind: 'record-edit',
      recordId: result.recordId,
      recordKind: 'protocol',
      title: result.candidate.title ?? 'Protocol',
    })
    ws.setRightPaneMode('find')
    onClose()
  }, [result, ws, onClose])

  /* ---- Guard: return null when closed ---- */
  if (!isOpen) return null

  /* ---- Render ---- */

  return (
    <div className="convert-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="convert-modal-title">
      <div className="convert-modal-overlay__backdrop" onClick={onClose} aria-hidden />
      <div className="convert-modal">
        <div className="convert-modal__header">
          <h2 id="convert-modal-title" className="convert-modal__title">
            Convert to Protocol
          </h2>
          <button
            type="button"
            className="convert-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* IDLE */}
        {phase === 'idle' && (
          <div className="convert-modal__body">
            <p className="convert-modal__info">
              This will extract a universal protocol from the PDF text using AI analysis.
              {v.extractedText.length === 0 && (
                <span className="convert-modal__warning">
                  {' '}No extracted text detected — the result may be empty.
                </span>
              )}
            </p>
            {error && <div className="convert-modal__error">{error}</div>}
            <div className="convert-modal__actions">
              <button type="button" className="convert-modal__btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="convert-modal__btn--primary"
                onClick={handleExtract}
              >
                Extract Protocol
              </button>
            </div>
          </div>
        )}

        {/* EXTRACTING */}
        {phase === 'extracting' && (
          <div className="convert-modal__body convert-modal__body--center">
            <div className="convert-modal__spinner" aria-hidden />
            <p className="convert-modal__label">Extracting protocol from PDF…</p>
          </div>
        )}

        {/* PREVIEW */}
        {phase === 'preview' && result?.candidate && (
          <div className="convert-modal__body">
            <PreviewCandidate candidate={result.candidate} error={error} />
            <div className="convert-modal__actions">
              <button
                type="button"
                className="convert-modal__btn--secondary"
                onClick={() => {
                  setPhase('idle')
                  setResult(null)
                  setError(null)
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="convert-modal__btn--primary"
                onClick={handleCreateProtocol}
                disabled={!result.candidate.steps?.length}
              >
                Create Protocol
              </button>
            </div>
          </div>
        )}

        {/* SAVING */}
        {phase === 'saving' && (
          <div className="convert-modal__body convert-modal__body--center">
            <div className="convert-modal__spinner" aria-hidden />
            <p className="convert-modal__label">Creating protocol record…</p>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && result?.candidate && (
          <div className="convert-modal__body convert-modal__body--center">
            <div className="convert-modal__done-icon" aria-hidden>✓</div>
            <p className="convert-modal__done-title">Protocol created</p>
            <p className="convert-modal__done-id">
              <code>{result.recordId}</code>
            </p>
            <div className="convert-modal__actions">
              <button type="button" className="convert-modal__btn--secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="convert-modal__btn--primary" onClick={handleOpenProtocol}>
                Open Protocol
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PreviewCandidate sub-component                                     */
/* ------------------------------------------------------------------ */

function PreviewCandidate({
  candidate,
  error,
}: {
  candidate: AiProtocolCandidateSummary
  error: string | null
}) {
  const steps = candidate.steps ?? []
  const materials = candidate.materials ?? []
  const labware = candidate.labware ?? []
  const diagnostics = candidate.diagnostics ?? []
  const warnings = diagnostics.filter((d) => d.severity === 'warning')
  const errors = diagnostics.filter((d) => d.severity === 'error')

  return (
    <div className="convert-modal__preview">
      <h3 className="convert-modal__preview-title">{candidate.title ?? 'Untitled Protocol'}</h3>

      {candidate.scope && (
        <p className="convert-modal__preview-scope">{candidate.scope}</p>
      )}

      {/* Summary stats */}
      <div className="convert-modal__stats">
        <div className="convert-modal__stat">
          <span className="convert-modal__stat-value">{steps.length}</span>
          <span className="convert-modal__stat-label">Steps</span>
        </div>
        <div className="convert-modal__stat">
          <span className="convert-modal__stat-value">{materials.length}</span>
          <span className="convert-modal__stat-label">Materials</span>
        </div>
        <div className="convert-modal__stat">
          <span className="convert-modal__stat-value">{labware.length}</span>
          <span className="convert-modal__stat-label">Labware</span>
        </div>
      </div>

      {/* Steps list */}
      {steps.length > 0 && (
        <div className="convert-modal__steps">
          {steps.map((step, i) => {
            const num = step.stepNumber ?? i + 1
            const label = step.title ?? `Step ${num}`
            const truncated = step.text.length > 100 ? step.text.slice(0, 100) + '…' : step.text
            return (
              <div key={i} className="convert-modal__step">
                <span className="convert-modal__step-num">{num}.</span>
                <span className="convert-modal__step-label">{label}</span>
                <p className="convert-modal__step-text">{truncated}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Diagnostics */}
      {warnings.length > 0 && (
        <div className="convert-modal__diagnostics convert-modal__diagnostics--warning">
          {warnings.map((d, i) => (
            <div key={`w-${i}`} className="convert-modal__diagnostic">
              <span className="convert-modal__diagnostic-code">{d.code}</span>
              {d.message}
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="convert-modal__diagnostics convert-modal__diagnostics--error">
          {errors.map((d, i) => (
            <div key={`e-${i}`} className="convert-modal__diagnostic">
              <span className="convert-modal__diagnostic-code">{d.code}</span>
              {d.message}
            </div>
          ))}
        </div>
      )}

      {/* Creation error (if saving failed and we returned to preview) */}
      {error && <div className="convert-modal__error">{error}</div>}
    </div>
  )
}
