/**
 * VendorPdfWorkflowTab — the Vendor PDFs ingestion workflow surface shown in
 * the Ingestion page. Composes the shared VendorPdfSearchSection (Exa search
 * → ingest → extract) in its standalone, studyId-free form, plus a list of
 * recently ingested first-class `vendor-pdf` records.
 *
 * Ingest here writes a free-floating first-class vendor-pdf record (Phase 2),
 * so no studyId is required. Every per-row action and the search section's
 * "Build Protocol" action open the single review surface
 * (/ingestion/vendor-pdf/:recordId) — PDF on the left, extracted protocol on
 * the right — there is no separate builder routing anymore.
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

  // Every action opens the single vendor-PDF review surface.
  const openReview = useCallback(
    (recordId: string) => {
      navigate(`/ingestion/vendor-pdf/${encodeURIComponent(recordId)}`)
    },
    [navigate],
  )

  return (
    <div className="vendor-pdf-workflow" data-testid="vendor-pdf-workflow">
      <VendorPdfSearchSection
        onIngested={() => {
          void loadRecent()
        }}
        onBuildProtocol={(artifactId) => {
          openReview(artifactId)
        }}
      />

      <section className="vendor-pdf-workflow__recent" data-testid="vendor-pdf-recent">
        <h3 className="vendor-pdf-workflow__heading">Recent ingests</h3>
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
                    onClick={() => openReview(r.recordId)}
                  >
                    Review
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