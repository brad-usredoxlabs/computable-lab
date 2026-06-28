/**
 * VendorPdfSearchSection — search Exa for vendor PDFs and ingest the
 * chosen one as a study-scoped artifact (Phase 9). The ingest call passes
 * the active workspace `studyId`, which is what tells the server to
 * additionally persist a kind=artifact record under
 * `records/studies/<studyId>/artifacts/`.
 *
 * After a successful ingest, the parent's `onIngested` callback fires so
 * the artifact list above (local Browse / Search) can refresh and surface
 * the new row without a manual reload.
 *
 * Errors are surfaced inline; ingest is best-effort.
 */

import { useCallback, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { GraphLemurPdfSearchResult } from '../../../shared/api/client'

type VendorPdfResult = GraphLemurPdfSearchResult

export interface VendorPdfSearchSectionProps {
  studyId: string
  /**
   * Called after the server confirms the artifact was written. The
   * second arg carries enough metadata that callers can show a chip /
   * tab title without a follow-up record fetch — the AI tab's "+ Add
   * source" flow uses it that way; the Search tab ignores it.
   */
  onIngested: (
    artifactId: string,
    info: { title?: string; sourceUrl: string; vendor?: string },
  ) => void
  /**
   * Called when the user wants to "Build Protocol" from a search result.
   * The component ingests the PDF first, then calls this with the artifact
   * info so the parent can open a PDF viewer tab and switch to AI mode.
   */
  onBuildProtocol?: (
    artifactId: string,
    info: { title?: string; sourceUrl: string; vendor?: string },
  ) => void
}

export function VendorPdfSearchSection({
  studyId,
  onIngested,
  onBuildProtocol,
}: VendorPdfSearchSectionProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<VendorPdfResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [ingestingUrl, setIngestingUrl] = useState<string | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)
  const [ingestNotice, setIngestNotice] = useState<string | null>(null)
  const [lastIngested, setLastIngested] = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setSearchError(null)
    setResults([])
    try {
      const response = await apiClient.searchGraphLemurVendorPdfs({
        q: trimmed,
        limit: 12,
      })
      setResults(response.items ?? [])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }, [query])

  const runIngest = useCallback(
    async (result: VendorPdfResult, buildProtocol: boolean = false) => {
      setIngestingUrl(result.url)
      setIngestError(null)
      setIngestNotice(null)
      try {
        const response = await apiClient.ingestGraphLemurVendorPdf({
          url: result.url,
          ...(result.title ? { title: result.title } : {}),
          ...(result.vendor ? { vendor: result.vendor } : {}),
          studyId,
          query,
        })
        // The vendor blocked the binary download and the server fell back to
        // saving the document text via Exa. The artifact is durable but has no
        // original PDF and no tables/layout — flag that so the user knows.
        const exaTextFallback = (response.extraction?.diagnostics ?? []).some(
          (d) => d.code === 'EXA_TEXT_FALLBACK',
        )
        if (exaTextFallback) {
          setIngestNotice(
            'Vendor blocked the PDF download — saved the document text via web search instead. ' +
              'No original PDF or table/layout extraction.',
          )
        }
        const info = {
          ...(result.title ? { title: result.title } : {}),
          sourceUrl: result.url,
          ...(result.vendor ? { vendor: result.vendor } : {}),
        }
        if (response.recordedArtifact) {
          setLastIngested(response.recordedArtifact.recordId)
          onIngested(response.recordedArtifact.recordId, info)
          // If this was a "Build Protocol" ingest, notify the parent so it can
          // open a PDF viewer tab and switch to AI mode.
          if (buildProtocol) {
            onBuildProtocol?.(response.recordedArtifact.recordId, info)
          }
        } else {
          // Server didn't write a record — most likely the studyId wasn't
          // accepted (e.g. workspace root not configured). Surface so the
          // user knows the chip isn't durable.
          setIngestError(
            'Ingested in legacy chat-draft mode — no durable artifact written. Check server workspace config.',
          )
        }
      } catch (err) {
        setIngestError(err instanceof Error ? err.message : String(err))
      } finally {
        setIngestingUrl(null)
      }
    },
    [studyId, query, onIngested, onBuildProtocol],
  )

  return (
    <section className="vendor-pdf-search" data-testid="vendor-pdf-search">
      <h4 className="right-panel__heading">Vendor PDF search (Exa)</h4>
      <form
        className="vendor-pdf-search__form"
        onSubmit={(e) => {
          e.preventDefault()
          void runSearch()
        }}
      >
        <input
          type="search"
          className="vendor-pdf-search__input"
          placeholder="e.g. NEBNext Ultra II workflow"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="vendor-pdf-search-input"
        />
        <button
          type="submit"
          className="vendor-pdf-search__submit"
          disabled={!query.trim() || searching}
          data-testid="vendor-pdf-search-submit"
        >
          {searching ? '…' : 'Search'}
        </button>
      </form>
      {searchError ? (
        <p className="right-panel__error" data-testid="vendor-pdf-search-error">
          {searchError}
        </p>
      ) : null}
      {ingestError ? (
        <p className="right-panel__error" data-testid="vendor-pdf-ingest-error">
          {ingestError}
        </p>
      ) : null}
      {ingestNotice ? (
        <p className="vendor-pdf-search__notice" data-testid="vendor-pdf-ingest-notice">
          ⚠ {ingestNotice}
        </p>
      ) : null}
      {lastIngested ? (
        <p
          className="vendor-pdf-search__success"
          data-testid="vendor-pdf-ingest-success"
        >
          Wrote artifact {lastIngested}
        </p>
      ) : null}
      {!searching && results.length === 0 && query.trim() && !searchError ? (
        <p className="right-panel__hint">No results.</p>
      ) : null}
      {results.length > 0 ? (
        <div className="vendor-pdf-search__results">
          {results.map((r) => (
            <div key={r.url} className="vendor-pdf-search__result-row">
              <button
                type="button"
                className="vendor-pdf-search__result"
                disabled={ingestingUrl !== null}
                onClick={() => void runIngest(r)}
                data-testid={`vendor-pdf-result-${hashKey(r.url)}`}
                title={r.url}
              >
                <span className="vendor-pdf-search__result-title">
                  {r.title ?? r.url}
                </span>
                {r.vendor || r.documentType ? (
                  <span className="vendor-pdf-search__result-meta">
                    {[r.vendor, r.documentType].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
                {r.snippet ? (
                  <span className="vendor-pdf-search__result-snippet">
                    {r.snippet}
                  </span>
                ) : null}
                <span className="vendor-pdf-search__result-cta">
                  {ingestingUrl === r.url ? 'Ingesting…' : 'Ingest as artifact'}
                </span>
              </button>
              <button
                type="button"
                className="vendor-pdf-search__result-build"
                disabled={ingestingUrl !== null}
                onClick={() => void runIngest(r, true)}
                title="Open PDF viewer and start building a protocol"
              >
                Build Protocol
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** Tiny stable hash so test-ids don't break on URL punctuation. */
function hashKey(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}
