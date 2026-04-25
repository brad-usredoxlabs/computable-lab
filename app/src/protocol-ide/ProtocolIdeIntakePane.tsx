/**
 * Protocol IDE Intake Pane — the unified intake surface for the Protocol IDE.
 *
 * Combines three source modes into one coherent panel:
 *   1. Curated vendor search — pick from curated vendor PDFs
 *   2. Paste PDF URL — enter a direct PDF URL
 *   3. Upload PDF — upload a local PDF file
 *
 * The same surface also captures the initial directive text so the user can
 * submit `source PDF + directive` in one action.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Protocol IDE Intake                                       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  [Curated Vendor] [Paste URL] [Upload]   ← mode tabs       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  (mode-specific form fields)                               │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Directive: [________________________________]             │
 *   │  [Launch Session]                                          │
 *   └─────────────────────────────────────────────────────────────┘
 */

import { useState, useCallback, useRef } from 'react'
import type {
  ProtocolIdeSourceMode,
  ProtocolIdeSession,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A document result from curated vendor search */
export interface CuratedDocumentResult {
  vendor: string
  title: string
  pdfUrl?: string
  landingUrl: string
  snippet?: string
  documentType: string
  sessionIdHint?: string
}

/** The validated intake payload sent to the session bootstrap API */
export interface IntakePayload {
  directiveText: string
  source:
    | { sourceKind: 'vendor_document' } & CuratedDocumentResult
    | { sourceKind: 'pasted_url'; url: string }
    | { sourceKind: 'uploaded_pdf'; uploadId: string; fileName: string; mediaType: string }
}

/** Callback invoked when the user submits the intake form */
export interface IntakeCallbacks {
  /** Called with the validated intake payload on submit */
  onSubmit: (payload: IntakePayload) => void
  /** Called when the user selects a curated vendor document */
  onVendorSelect?: (doc: CuratedDocumentResult) => void
  /** Called when the user pastes a PDF URL */
  onUrlPaste?: (url: string) => void
  /** Called when the user uploads a PDF file */
  onFileUpload?: (file: File) => void
}

/** Props for the intake pane component */
export interface ProtocolIdeIntakePaneProps extends IntakeCallbacks {
  /** Optional title override */
  title?: string
  /** Optional description text */
  description?: string
  /** Whether the pane is in a loading/disabled state */
  isLoading?: boolean
  /** Error message to display */
  error?: string | null
  /** Curated vendor search results (for vendor search mode) */
  searchResults?: CuratedDocumentResult[]
  /** Whether search is in progress */
  isSearching?: boolean
  /** Curated vendor list for display */
  curatedVendors?: Array<{ vendor: string; label: string }>
}

// ---------------------------------------------------------------------------
// Source mode constants
// ---------------------------------------------------------------------------

const SOURCE_MODES: Array<{
  key: ProtocolIdeSourceMode
  label: string
  icon: string
}> = [
  { key: 'vendor_search', label: 'Curated Vendor', icon: '📚' },
  { key: 'pdf_url', label: 'Paste URL', icon: '🔗' },
  { key: 'upload', label: 'Upload PDF', icon: '📄' },
]

// ---------------------------------------------------------------------------
// Curated vendor config
// ---------------------------------------------------------------------------

const CURATED_VENDORS: Array<{ vendor: string; label: string }> = [
  { vendor: 'fisher', label: 'Fisher Scientific' },
  { vendor: 'vwr', label: 'VWR' },
  { vendor: 'cayman', label: 'Cayman Chemical' },
  { vendor: 'thomas', label: 'Thomas Scientific' },
  { vendor: 'thermo', label: 'Thermo Fisher' },
  { vendor: 'sigma', label: 'Sigma-Aldrich' },
]

// ---------------------------------------------------------------------------
// Vendor search results (seed data for the UI)
// ---------------------------------------------------------------------------

const SEED_SEARCH_RESULTS: CuratedDocumentResult[] = [
  {
    vendor: 'fisher',
    title: 'DNA Extraction Protocol — Standard 96-Well',
    pdfUrl: 'https://example.com/fisher/dna-extraction-96.pdf',
    landingUrl: 'https://www.fishersci.com/dna-extraction',
    snippet: 'Standard DNA extraction protocol optimized for 96-well plate format.',
    documentType: 'protocol',
  },
  {
    vendor: 'cayman',
    title: 'FIRE Cellular Redox Assay — User Guide',
    pdfUrl: 'https://example.com/cayman/fire-assay-guide.pdf',
    landingUrl: 'https://www.caymanchem.com/fire-assay',
    snippet: 'Complete user guide for the FIRE cellular redox assay kit.',
    documentType: 'protocol',
  },
  {
    vendor: 'vwr',
    title: 'Zymo Research DNA Clean & Concentrate — Protocol',
    pdfUrl: 'https://example.com/vwr/zymo-clean-concentrate.pdf',
    landingUrl: 'https://www.vwr.com/zymo',
    snippet: 'DNA clean-up and concentration protocol using Zymo spin columns.',
    documentType: 'protocol',
  },
  {
    vendor: 'sigma',
    title: 'HepG2 Viability Assay — Application Note',
    pdfUrl: 'https://example.com/sigma/hepg2-viability.pdf',
    landingUrl: 'https://www.sigmaaldrich.com/hepg2',
    snippet: 'Application note for HepG2 cell viability testing.',
    documentType: 'application_note',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolIdeIntakePane({
  title = 'Protocol IDE Intake',
  description = 'Choose a source document and write a directive to begin building a protocol.',
  isLoading = false,
  error = null,
  searchResults = SEED_SEARCH_RESULTS,
  isSearching = false,
  curatedVendors = CURATED_VENDORS,
  onSubmit,
  onVendorSelect,
  onUrlPaste,
  onFileUpload,
}: ProtocolIdeIntakePaneProps): JSX.Element {
  const [activeMode, setActiveMode] = useState<ProtocolIdeSourceMode>('vendor_search')
  const [directiveText, setDirectiveText] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<CuratedDocumentResult | null>(null)
  const [pastedUrl, setPastedUrl] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<string>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter search results based on query and vendor filter
  const filteredResults = searchResults.filter(doc => {
    const matchesQuery =
      !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.snippet?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesVendor =
      searchFilter === 'all' || doc.vendor === searchFilter
    return matchesQuery && matchesVendor
  })

  // Handle vendor document selection
  const handleSelectDocument = useCallback(
    (doc: CuratedDocumentResult) => {
      setSelectedDoc(doc)
      onVendorSelect?.(doc)
    },
    [onVendorSelect],
  )

  // Handle file upload
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        setUploadedFile(file)
        onFileUpload?.(file)
      }
    },
    [onFileUpload],
  )

  // Trigger file input click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Build the intake payload and submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      if (!directiveText.trim()) {
        return
      }

      let source: IntakePayload['source']

      switch (activeMode) {
        case 'vendor_search': {
          if (!selectedDoc) return
          source = {
            sourceKind: 'vendor_document',
            vendor: selectedDoc.vendor,
            title: selectedDoc.title,
            pdfUrl: selectedDoc.pdfUrl,
            landingUrl: selectedDoc.landingUrl,
            snippet: selectedDoc.snippet,
            documentType: selectedDoc.documentType,
            sessionIdHint: selectedDoc.sessionIdHint,
          }
          break
        }

        case 'pdf_url': {
          if (!pastedUrl.trim()) return
          source = {
            sourceKind: 'pasted_url',
            url: pastedUrl.trim(),
          }
          break
        }

        case 'upload': {
          if (!uploadedFile) return
          // In a real implementation, this would first upload the file
          // and get an uploadId back. For now, we use the file name as a placeholder.
          source = {
            sourceKind: 'uploaded_pdf',
            uploadId: `upload-${Date.now()}`,
            fileName: uploadedFile.name,
            mediaType: uploadedFile.type || 'application/pdf',
          }
          break
        }

        default:
          return
      }

      onSubmit({
        directiveText: directiveText.trim(),
        source,
      })
    },
    [activeMode, directiveText, selectedDoc, pastedUrl, uploadedFile, onSubmit],
  )

  // Reset the form
  const handleReset = useCallback(() => {
    setActiveMode('vendor_search')
    setDirectiveText('')
    setSelectedDoc(null)
    setPastedUrl('')
    setUploadedFile(null)
    setSearchQuery('')
    setSearchFilter('all')
  }, [])

  return (
    <aside
      className="protocol-ide-intake"
      role="complementary"
      aria-label="Protocol IDE intake"
      data-testid="protocol-ide-intake-pane"
    >
      {/* Header */}
      <h2 className="protocol-ide-intake-title">{title}</h2>
      <p className="protocol-ide-intake-description">{description}</p>

      {/* Error display */}
      {error && (
        <div
          className="protocol-ide-intake-error"
          data-testid="protocol-ide-intake-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Source mode tabs */}
      <div
        className="protocol-ide-intake-modes"
        role="tablist"
        aria-label="Source selection mode"
        data-testid="protocol-ide-intake-modes"
      >
        {SOURCE_MODES.map(mode => (
          <button
            key={mode.key}
            className={`protocol-ide-intake-mode-btn ${
              activeMode === mode.key
                ? 'protocol-ide-intake-mode-btn-active'
                : ''
            }`}
            role="tab"
            aria-selected={activeMode === mode.key}
            aria-controls={`panel-${mode.key}`}
            onClick={() => setActiveMode(mode.key)}
            data-testid={`protocol-ide-intake-mode-${mode.key}`}
            disabled={isLoading}
          >
            <span className="protocol-ide-intake-mode-icon">{mode.icon}</span>
            <span className="protocol-ide-intake-mode-label">{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Mode-specific forms */}
      <form onSubmit={handleSubmit}>
        {/* ── Vendor Search Mode ── */}
        {activeMode === 'vendor_search' && (
          <div
            className="protocol-ide-intake-panel"
            id="panel-vendor_search"
            role="tabpanel"
            data-testid="protocol-ide-intake-panel-vendor"
          >
            {/* Curated vendor identity */}
            <div className="protocol-ide-intake-vendor-identity" data-testid="protocol-ide-intake-vendor-identity">
              <span className="protocol-ide-intake-vendor-label">Curated vendors:</span>
              <div className="protocol-ide-intake-vendor-list">
                {curatedVendors.map(v => (
                  <span
                    key={v.vendor}
                    className="protocol-ide-intake-vendor-tag"
                    data-testid={`protocol-ide-vendor-tag-${v.vendor}`}
                  >
                    {v.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Search controls */}
            <div className="protocol-ide-intake-search" data-testid="protocol-ide-intake-search">
              <input
                type="text"
                className="protocol-ide-intake-search-input"
                placeholder="Search documents…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search documents"
                data-testid="protocol-ide-intake-search-input"
              />
              <select
                className="protocol-ide-intake-vendor-filter"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                aria-label="Filter by vendor"
                data-testid="protocol-ide-intake-vendor-filter"
              >
                <option value="all">All vendors</option>
                {curatedVendors.map(v => (
                  <option key={v.vendor} value={v.vendor}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search results */}
            {isSearching ? (
              <div className="protocol-ide-intake-searching" data-testid="protocol-ide-intake-searching">
                Searching…
              </div>
            ) : (
              <div className="protocol-ide-intake-results" data-testid="protocol-ide-intake-results">
                {filteredResults.length === 0 ? (
                  <p className="protocol-ide-intake-no-results">No documents match your search.</p>
                ) : (
                  <ul className="protocol-ide-intake-result-list">
                    {filteredResults.map((doc, i) => {
                      const isSelected = selectedDoc?.title === doc.title
                      return (
                        <li
                          key={i}
                          className={`protocol-ide-intake-result-item ${
                            isSelected ? 'protocol-ide-intake-result-item-selected' : ''
                          }`}
                          data-testid={`protocol-ide-intake-result-${i}`}
                          onClick={() => handleSelectDocument(doc)}
                          role="button"
                          tabIndex={0}
                          aria-label={`Select ${doc.title}`}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleSelectDocument(doc)
                            }
                          }}
                        >
                          <div className="protocol-ide-intake-result-header">
                            <span
                              className="protocol-ide-intake-result-vendor"
                              data-testid={`protocol-ide-intake-result-vendor-${i}`}
                            >
                              {doc.vendor}
                            </span>
                            {doc.documentType && (
                              <span
                                className="protocol-ide-intake-result-type"
                                data-testid={`protocol-ide-intake-result-type-${i}`}
                              >
                                {doc.documentType}
                              </span>
                            )}
                          </div>
                          <div
                            className="protocol-ide-intake-result-title"
                            data-testid={`protocol-ide-intake-result-title-${i}`}
                          >
                            {doc.title}
                          </div>
                          {doc.snippet && (
                            <div
                              className="protocol-ide-intake-result-snippet"
                              data-testid={`protocol-ide-intake-result-snippet-${i}`}
                            >
                              {doc.snippet}
                            </div>
                          )}
                          {doc.pdfUrl && (
                            <a
                              href={doc.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="protocol-ide-intake-result-pdf-link"
                              data-testid={`protocol-ide-intake-result-pdf-link-${i}`}
                              onClick={e => e.stopPropagation()}
                            >
                              View PDF ↗
                            </a>
                          )}
                          {isSelected && (
                            <div
                              className="protocol-ide-intake-result-selected-badge"
                              data-testid={`protocol-ide-intake-result-selected-badge-${i}`}
                            >
                              ✓ Selected
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Paste URL Mode ── */}
        {activeMode === 'pdf_url' && (
          <div
            className="protocol-ide-intake-panel"
            id="panel-pdf_url"
            role="tabpanel"
            data-testid="protocol-ide-intake-panel-url"
          >
            <label
              htmlFor="pdf-url-input"
              className="protocol-ide-intake-label"
              data-testid="protocol-ide-intake-url-label"
            >
              PDF URL
            </label>
            <input
              id="pdf-url-input"
              type="url"
              className="protocol-ide-intake-url-input"
              placeholder="https://example.com/protocol.pdf"
              value={pastedUrl}
              onChange={e => {
                setPastedUrl(e.target.value)
                onUrlPaste?.(e.target.value)
              }}
              aria-label="Paste PDF URL"
              data-testid="protocol-ide-intake-url-input"
            />
            {pastedUrl && (
              <div
                className="protocol-ide-intake-url-preview"
                data-testid="protocol-ide-intake-url-preview"
              >
                <span className="protocol-ide-intake-url-preview-label">Preview:</span>
                <code className="protocol-ide-intake-url-preview-url">
                  {pastedUrl}
                </code>
              </div>
            )}
          </div>
        )}

        {/* ── Upload Mode ── */}
        {activeMode === 'upload' && (
          <div
            className="protocol-ide-intake-panel"
            id="panel-upload"
            role="tabpanel"
            data-testid="protocol-ide-intake-panel-upload"
          >
            <button
              type="button"
              className="protocol-ide-intake-upload-btn"
              onClick={handleUploadClick}
              data-testid="protocol-ide-intake-upload-btn"
              disabled={isLoading}
            >
              {uploadedFile ? 'Change File' : 'Choose PDF File'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="protocol-ide-intake-file-input"
              onChange={handleFileChange}
              aria-label="Upload PDF file"
              data-testid="protocol-ide-intake-file-input"
              style={{ display: 'none' }}
            />
            {uploadedFile && (
              <div
                className="protocol-ide-intake-file-info"
                data-testid="protocol-ide-intake-file-info"
              >
                <span className="protocol-ide-intake-file-name">
                  {uploadedFile.name}
                </span>
                <span className="protocol-ide-intake-file-size">
                  ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Directive (always visible) ── */}
        <div
          className="protocol-ide-intake-directive"
          data-testid="protocol-ide-intake-directive"
        >
          <label
            htmlFor="directive-input"
            className="protocol-ide-intake-label"
            data-testid="protocol-ide-intake-directive-label"
          >
            Directive
          </label>
          <textarea
            id="directive-input"
            className="protocol-ide-intake-directive-input"
            placeholder="Describe what you want the protocol to do…"
            value={directiveText}
            onChange={e => setDirectiveText(e.target.value)}
            rows={3}
            aria-label="Protocol directive"
            data-testid="protocol-ide-intake-directive-input"
            disabled={isLoading}
          />
        </div>

        {/* ── Action buttons ── */}
        <div
          className="protocol-ide-intake-actions"
          data-testid="protocol-ide-intake-actions"
        >
          <button
            type="submit"
            className="protocol-ide-btn protocol-ide-btn-primary protocol-ide-intake-submit"
            data-testid="protocol-ide-intake-submit"
            disabled={
              isLoading ||
              !directiveText.trim() ||
              (activeMode === 'vendor_search' && !selectedDoc) ||
              (activeMode === 'pdf_url' && !pastedUrl.trim()) ||
              (activeMode === 'upload' && !uploadedFile)
            }
          >
            {isLoading ? 'Launching…' : 'Launch Session'}
          </button>
          <button
            type="button"
            className="protocol-ide-btn protocol-ide-btn-secondary protocol-ide-intake-reset"
            data-testid="protocol-ide-intake-reset"
            onClick={handleReset}
            disabled={isLoading}
          >
            Reset
          </button>
        </div>
      </form>
    </aside>
  )
}
