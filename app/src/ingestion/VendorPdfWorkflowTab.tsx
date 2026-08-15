/**
 * VendorPdfWorkflowTab — the Vendor PDFs ingestion workflow surface shown in
 * the Ingestion page. Composes the shared VendorPdfSearchSection (Exa search
 * → ingest → extract) in its standalone, studyId-free form, plus a list of
 * recently ingested first-class `vendor-pdf` records.
 *
 * Ingest here writes a free-floating first-class vendor-pdf record (Phase 2),
 * so no studyId is required. "Open in Protocol Builder" routes to the
 * standalone /protocol-builder to promote the extracted candidate.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { VendorPdfSearchSection } from '../event-editor/right-pane/search/VendorPdfSearchSection'
import type { RecordEnvelope } from '../types/kernel'
import './VendorPdfWorkflowTab.css'

interface VendorPdfRecord {
  recordId: string
  title: string
  vendor?: string
  state?: string
}

function toVendorPdfRecord(record: RecordEnvelope): VendorPdfRecord {
  const p = record.payload as Record<string, unknown>
  const src = p.source as { vendor?: string } | undefined
  return {
    recordId: record.recordId,
    title: typeof p.title === 'string' ? p.title : record.recordId,
    vendor: src?.vendor,
    state: typeof p.state === 'string' ? p.state : undefined,
  }
}

export function VendorPdfWorkflowTab() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<VendorPdfRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  const loadRecent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listRecordsByKind('vendor-pdf', 100)
      setRecent(result.records.map(toVendorPdfRecord))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const handleExtractProtocol = useCallback(
    async (r: VendorPdfRecord) => {
      setExtractError(null)
      setDraftingId(r.recordId)
      try {
        const res = await apiClient.createVendorPdfExtractionDraft(r.recordId)
        if (!res.success || !res.draftId) {
          throw new Error('No extraction draft was returned.')
        }
        navigate(`/extraction/review/${res.draftId}`)
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : String(err))
      } finally {
        setDraftingId(null)
      }
    },
    [navigate],
  )

  return (
    <div className="vendor-pdf-workflow" data-testid="vendor-pdf-workflow">
      <VendorPdfSearchSection
        onIngested={() => {
          void loadRecent()
        }}
        onBuildProtocol={() => {
          navigate('/protocol-builder')
        }}
      />

      <section className="vendor-pdf-workflow__recent" data-testid="vendor-pdf-recent">
        <h3 className="vendor-pdf-workflow__heading">Recent ingests</h3>
        {extractError ? (
          <p className="vendor-pdf-workflow__error" data-testid="vendor-pdf-extract-error">
            {extractError}
          </p>
        ) : null}
        {error ? (
          <p className="vendor-pdf-workflow__error" data-testid="vendor-pdf-recent-error">
            {error}
          </p>
        ) : loading ? (
          <p className="vendor-pdf-workflow__hint">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="vendor-pdf-workflow__hint">No vendor PDFs ingested yet.</p>
        ) : (
          <div className="vendor-pdf-workflow__list">
            {recent.map((r) => (
              <div
                key={r.recordId}
                className="vendor-pdf-workflow__item"
                data-testid={`recent-vendor-pdf-${r.recordId}`}
              >
                <div className="vendor-pdf-workflow__item-info">
                  <span className="vendor-pdf-workflow__item-title">{r.title}</span>
                  <span className="vendor-pdf-workflow__item-meta">
                    {r.recordId}
                    {r.vendor ? ` · ${r.vendor}` : ''}
                    {r.state ? ` · ${r.state}` : ''}
                  </span>
                </div>
                <div className="vendor-pdf-workflow__item-actions">
                  <button
                    type="button"
                    className="vendor-pdf-workflow__item-btn vendor-pdf-workflow__item-btn--primary"
                    data-testid={`recent-extract-${r.recordId}`}
                    disabled={draftingId !== null}
                    onClick={() => void handleExtractProtocol(r)}
                  >
                    {draftingId === r.recordId ? 'Drafting…' : 'Extract Protocol'}
                  </button>
                  <button
                    type="button"
                    className="vendor-pdf-workflow__item-btn"
                    data-testid={`recent-view-${r.recordId}`}
                    onClick={() => navigate(`/lab/vendor-pdfs/${r.recordId}`)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="vendor-pdf-workflow__item-btn"
                    data-testid={`recent-build-${r.recordId}`}
                    onClick={() => navigate('/protocol-builder')}
                  >
                    Open in Protocol Builder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
