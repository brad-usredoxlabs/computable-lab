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
import './search.css'

type VendorPdfResult = GraphLemurPdfSearchResult

export interface VendorPdfSearchSectionProps {
  /**
   * Optional parent study. When provided, the ingest call supplies it and the
   * server records `links.studyId` on the first-class vendor-pdf (in-study
   * "+ Add source" context). When omitted (standalone / Ingestion workflow),
   * the PDF is ingested as a free-floating first-class vendor-pdf record.
   */
  studyId?: string
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
  // The hit that hit the vendor-blocked-download path. Its row shows an
  // "Open source URL" remediation so the user can download the PDF themselves.
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)
  // "Bring the file back": uploading a PDF the user downloaded themselves when
  // the vendor blocked our server-side download.
  const [bringingBack, setBringingBack] = useState(false)
  const [bringBackError, setBringBackError] = useState<string | null>(null)

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
          ...(studyId ? { studyId } : {}),
          query,
        })
        // The vendor blocked the binary download and the server fell back to
        // saving the document text via Exa. The artifact is durable but has no
        // original PDF and no tables/layout — flag that so the user knows.
        const exaTextFallback = (response.extraction?.diagnostics ?? []).some(
          (d) => d.code === 'EXA_TEXT_FALLBACK',
        )
        if (exaTextFallback) {
          setBlockedUrl(result.url)
          setIngestNotice(
            'This vendor blocks our automatic download — follow the steps below to download it yourself and bring the file back.',
          )
        } else {
          setBlockedUrl(null)
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
          // Server didn't write a record — most likely the workspace root
          // isn't configured (no store). Surface so the user knows the PDF
          // wasn't persisted as a durable first-class record.
          setIngestError(
            'Ingested but no durable record was written — check that the server workspace is configured.',
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

  // "Bring the file back": the user downloaded the PDF themselves (the vendor
  // blocked us), and now uploads it so it becomes a durable vendor-pdf record.
  const handleBringBack = useCallback(
    async (result: VendorPdfResult, file: File) => {
      setBringingBack(true)
      setBringBackError(null)
      try {
        const contentBase64 = await fileToBase64(file)
        const response = await apiClient.uploadGraphLemurVendorPdf({
          url: result.url,
          ...(result.title ? { title: result.title } : {}),
          ...(result.vendor ? { vendor: result.vendor } : {}),
          ...(studyId ? { studyId } : {}),
          query,
          fileName: file.name,
          contentBase64,
        })
        if (response.recordedArtifact) {
          setBlockedUrl(null)
          setLastIngested(response.recordedArtifact.recordId)
          onIngested(response.recordedArtifact.recordId, {
            ...(result.title ? { title: result.title } : {}),
            sourceUrl: result.url,
            ...(result.vendor ? { vendor: result.vendor } : {}),
          })
        } else {
          setBringBackError(
            'Uploaded but no durable record was written — check that the server workspace is configured.',
          )
        }
      } catch (err) {
        setBringBackError(err instanceof Error ? err.message : String(err))
      } finally {
        setBringingBack(false)
      }
    },
    [studyId, query, onIngested],
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
            <div key={r.url} className="vendor-pdf-search__result-wrap">
              <div className="vendor-pdf-search__result-row">
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
                      {[r.vendor, baseUrlOf(r.url), r.documentType].filter(Boolean).join(' · ')}
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
              {blockedUrl === r.url ? (
                <div className="vendor-pdf-search__blocked" data-testid={`blocked-${hashKey(r.url)}`}>
                  <p className="vendor-pdf-search__blocked-text">
                    <strong>Step 1:</strong> Open the source URL in a new tab — your browser
                    downloads the PDF automatically to its <em>Downloads</em> folder (no need to
                    choose where to save).
                  </p>
                  <p className="vendor-pdf-search__blocked-text">
                    <strong>Step 2:</strong> Once it&apos;s saved, use &quot;Bring the file back&quot; to
                    <em>select that downloaded PDF</em> from your Downloads folder (look for the
                    filename of this document) and upload it here.
                  </p>
                  <span className="vendor-pdf-search__blocked-actions">
                    <button
                      type="button"
                      className="vendor-pdf-search__blocked-open"
                      onClick={() => window.open(r.url, '_blank', 'noopener,noreferrer')}
                    >
                      Step 1 — Open source URL
                    </button>
                    <label
                      className="vendor-pdf-search__blocked-bring"
                      title="Select the PDF your browser downloaded to its Downloads folder"
                    >
                      {bringingBack ? 'Uploading…' : 'Step 2 — Bring the file back'}
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        data-testid="vendor-pdf-bring-back"
                        disabled={bringingBack}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleBringBack(r, file)
                          e.currentTarget.value = ''
                        }}
                      />
                    </label>
                  </span>
                </div>
              ) : null}
              {bringBackError ? (
                <p className="vendor-pdf-search__blocked-error" data-testid="vendor-pdf-bring-back-error">
                  {bringBackError}
                </p>
              ) : null}
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

/** Extract the hostname (base url) from a full URL, e.g. "neb.example". */
export function baseUrlOf(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return host || null
  } catch {
    return null
  }
}

/** Read a File into a base64 data string for upload. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  }
  return btoa(binary)
}
