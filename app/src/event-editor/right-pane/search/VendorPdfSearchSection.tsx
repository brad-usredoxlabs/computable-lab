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
 *
 * QMS7-9: in the STANDALONE form (the studyId-free render used by the
 * Ingestion workflow /ingestion/vendor-pdf) the section also offers a
 * first-class "Upload a document" control — a peer of search. It rides the
 * already-generalized upload arm (fileName + contentBase64, no url); the
 * server's config gate (document-extraction.yaml `formats:`) refuses
 * unsupported types with 415 UNSUPPORTED_DOCUMENT before any write, and the
 * honest refusal text surfaces inline. The in-study "+ Add source" context
 * (studyId supplied) stays search-only.
 */

import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { GraphLemurPdfSearchResult } from '../../../shared/api/client'
import './search.css'

type VendorPdfResult = GraphLemurPdfSearchResult

/**
 * The ONE accept list for every document picker in this section (upload +
 * bring-back). It mirrors config/ingestion/document-extraction.yaml
 * `formats:` + `images.formats` exactly — a UI accepting an extension the
 * server gate 415s on (or vice versa) is split-brain (bait 18). Do not
 * author a second literal.
 */
const DOCUMENT_ACCEPT =
  '.pdf,.docx,.doc,.rtf,.md,.markdown,.txt,.html,.htm,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.tif,.tiff,.webp,application/pdf'

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
  // QMS7-9: the standalone "Upload a document" affordance (peer of search).
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

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

  // QMS7-9: "Upload a document" — the standalone surface's first-class upload,
  // a peer of search. Rides the already-generalized upload arm: fileName +
  // contentBase64, NO url. The server's config gate (document-extraction.yaml
  // `formats:`) refuses unsupported types with 415 UNSUPPORTED_DOCUMENT
  // BEFORE any write; that honest text surfaces inline and no record fires.
  const runUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadError(null)
      setIngestError(null)
      setIngestNotice(null)
      try {
        const contentBase64 = await fileToBase64(file)
        const response = await apiClient.uploadGraphLemurVendorPdf({
          ...(studyId ? { studyId } : {}),
          ...(query.trim() ? { query } : {}),
          fileName: file.name,
          contentBase64,
        })
        if (response.recordedArtifact) {
          setLastIngested(response.recordedArtifact.recordId)
          // Same info shape the ingest-success paths supply (:125/:168). An
          // upload has no source URL — the server stamps sourcePdf.url as ''
          // and titles the artifact from the file name.
          onIngested(response.recordedArtifact.recordId, {
            title: response.sourcePdf.title ?? file.name,
            sourceUrl: response.sourcePdf.url ?? '',
            ...(response.sourcePdf.vendor ? { vendor: response.sourcePdf.vendor } : {}),
          })
        } else {
          // Server didn't write a record — most likely the workspace root
          // isn't configured (no store). Surface so the user knows.
          setUploadError(
            'Uploaded but no durable record was written — check that the server workspace is configured.',
          )
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err))
      } finally {
        setUploading(false)
      }
    },
    [studyId, query, onIngested],
  )

  return (
    <section className="vendor-pdf-search" data-testid="vendor-pdf-search">
      <h4 className="right-panel__heading">Vendor PDF search (Exa)</h4>
      <p className="vendor-pdf-search__doc-hint" data-testid="vendor-pdf-search-doc-hint">
        Add a protocol document (PDF, Word, Markdown, text, or spreadsheet).
      </p>
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
      {studyId ? null : (
        // STANDALONE ingestion surface: upload is a PEER of search, not a
        // buried fallback. The button opens the file picker; the picker is
        // the control of record (same accept const as bring-back).
        <div className="vendor-pdf-search__upload" data-testid="vendor-pdf-upload">
          <button
            type="button"
            className="vendor-pdf-search__submit"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
            data-testid="vendor-pdf-upload-button"
            title="Pick a document from your machine and ingest it as a vendor-pdf record"
          >
            {uploading ? 'Uploading…' : 'Upload a document'}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            data-testid="vendor-pdf-upload-input"
            disabled={uploading}
            aria-label="Upload a document"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void runUpload(file)
              e.currentTarget.value = ''
            }}
          />
        </div>
      )}
      {uploadError ? (
        <p className="right-panel__error" data-testid="vendor-pdf-upload-error">
          {uploadError}
        </p>
      ) : null}
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
                    downloads the document automatically to its <em>Downloads</em> folder (no need to
                    choose where to save).
                  </p>
                  <p className="vendor-pdf-search__blocked-text">
                    <strong>Step 2:</strong> Once it&apos;s saved, use &quot;Bring the file back&quot; to
                    <em>select that downloaded document</em> from your Downloads folder (look for the
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
                      title="Select the document your browser downloaded to its Downloads folder"
                    >
                      {bringingBack ? 'Uploading…' : 'Step 2 — Bring the file back'}
                      <input
                        type="file"
                        accept={DOCUMENT_ACCEPT}
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
