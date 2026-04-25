/**
 * Focused tests for ProtocolIdeIntakePane — verifies all three source modes,
 * directive entry, and session bootstrap submission.
 *
 * Covers:
 * - renders all three source mode tabs
 * - directive entry is part of the same surface
 * - vendor search mode shows curated vendor identity and document results
 * - paste URL mode shows URL input
 * - upload mode shows file upload button
 * - submitting the pane calls the onSubmit callback with the correct payload
 * - vendor document selection marks the result as selected
 * - reset clears all form state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ProtocolIdeIntakePane } from './ProtocolIdeIntakePane'
import type { CuratedDocumentResult } from './ProtocolIdeIntakePane'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOnSubmit = vi.fn()
const mockOnVendorSelect = vi.fn()
const mockOnUrlPaste = vi.fn()
const mockOnFileUpload = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderIntakePane(props: Partial<Parameters<typeof ProtocolIdeIntakePane>[0]> = {}) {
  return render(
    <ProtocolIdeIntakePane
      onSubmit={mockOnSubmit}
      onVendorSelect={mockOnVendorSelect}
      onUrlPaste={mockOnUrlPaste}
      onFileUpload={mockOnFileUpload}
      {...props}
    />
  )
}

const SEED_RESULTS: CuratedDocumentResult[] = [
  {
    vendor: 'fisher',
    title: 'DNA Extraction Protocol',
    pdfUrl: 'https://example.com/fisher/dna.pdf',
    landingUrl: 'https://www.fishersci.com/dna',
    snippet: 'Standard DNA extraction protocol.',
    documentType: 'protocol',
  },
  {
    vendor: 'cayman',
    title: 'FIRE Cellular Redox Assay',
    pdfUrl: 'https://example.com/cayman/fire.pdf',
    landingUrl: 'https://www.caymanchem.com/fire',
    snippet: 'FIRE assay user guide.',
    documentType: 'protocol',
  },
]

// ---------------------------------------------------------------------------
// Tests — rendering all three source modes
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — renders all three source modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the pane container', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-pane')).toBeTruthy()
  })

  it('renders the title', () => {
    renderIntakePane()
    expect(screen.getByText('Protocol IDE Intake')).toBeInTheDocument()
  })

  it('renders the description', () => {
    renderIntakePane()
    expect(
      screen.getByText(/Choose a source document and write a directive/i)
    ).toBeInTheDocument()
  })

  it('renders the Curated Vendor tab', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-mode-vendor_search')).toBeTruthy()
  })

  it('renders the Paste URL tab', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-mode-pdf_url')).toBeTruthy()
  })

  it('renders the Upload PDF tab', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-mode-upload')).toBeTruthy()
  })

  it('renders the directive textarea', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-directive-input')).toBeTruthy()
  })

  it('renders the submit button', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-submit')).toBeTruthy()
  })

  it('renders the reset button', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-reset')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests — vendor search mode
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — vendor search mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows curated vendor identity', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-vendor-identity')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-vendor-tag-fisher')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-vendor-tag-cayman')).toBeTruthy()
  })

  it('shows search results by default', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    expect(screen.getByTestId('protocol-ide-intake-results')).toBeTruthy()
  })

  it('shows document titles in results', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    expect(screen.getByTestId('protocol-ide-intake-result-title-0')).toHaveTextContent(
      'DNA Extraction Protocol'
    )
    expect(screen.getByTestId('protocol-ide-intake-result-title-1')).toHaveTextContent(
      'FIRE Cellular Redox Assay'
    )
  })

  it('shows vendor name on each result', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    expect(screen.getByTestId('protocol-ide-intake-result-vendor-0')).toHaveTextContent('fisher')
    expect(screen.getByTestId('protocol-ide-intake-result-vendor-1')).toHaveTextContent('cayman')
  })

  it('shows document type on each result', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    expect(screen.getByTestId('protocol-ide-intake-result-type-0')).toHaveTextContent('protocol')
  })

  it('shows PDF link on results that have one', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    expect(screen.getByTestId('protocol-ide-intake-result-pdf-link-0')).toHaveTextContent('View PDF ↗')
  })

  it('marks a selected document with a badge', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const firstResult = screen.getByTestId('protocol-ide-intake-result-0')
    fireEvent.click(firstResult)
    expect(screen.getByTestId('protocol-ide-intake-result-selected-badge-0')).toBeTruthy()
  })

  it('calls onVendorSelect when a document is clicked', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const firstResult = screen.getByTestId('protocol-ide-intake-result-0')
    fireEvent.click(firstResult)
    expect(mockOnVendorSelect).toHaveBeenCalledTimes(1)
  })

  it('filters results by search query', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const searchInput = screen.getByTestId('protocol-ide-intake-search-input')
    fireEvent.change(searchInput, { target: { value: 'FIRE' } })
    expect(screen.getByTestId('protocol-ide-intake-result-title-0')).toHaveTextContent(
      'FIRE Cellular Redox Assay'
    )
  })

  it('filters results by vendor', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const vendorFilter = screen.getByTestId('protocol-ide-intake-vendor-filter')
    fireEvent.change(vendorFilter, { target: { value: 'cayman' } })
    expect(screen.getByTestId('protocol-ide-intake-result-title-0')).toHaveTextContent(
      'FIRE Cellular Redox Assay'
    )
  })
})

// ---------------------------------------------------------------------------
// Tests — paste URL mode
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — paste URL mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('switches to paste URL mode when the tab is clicked', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    expect(screen.getByTestId('protocol-ide-intake-panel-url')).toBeTruthy()
  })

  it('renders the URL input field', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    expect(screen.getByTestId('protocol-ide-intake-url-input')).toBeTruthy()
  })

  it('shows a URL preview when a URL is entered', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    const urlInput = screen.getByTestId('protocol-ide-intake-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/test.pdf' } })
    expect(screen.getByTestId('protocol-ide-intake-url-preview')).toBeTruthy()
  })

  it('calls onUrlPaste when a URL is entered', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    const urlInput = screen.getByTestId('protocol-ide-intake-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/test.pdf' } })
    expect(mockOnUrlPaste).toHaveBeenCalledWith('https://example.com/test.pdf')
  })
})

// ---------------------------------------------------------------------------
// Tests — upload mode
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — upload mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('switches to upload mode when the tab is clicked', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    expect(screen.getByTestId('protocol-ide-intake-panel-upload')).toBeTruthy()
  })

  it('renders the upload button', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    expect(screen.getByTestId('protocol-ide-intake-upload-btn')).toBeTruthy()
  })

  it('renders a hidden file input', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    expect(screen.getByTestId('protocol-ide-intake-file-input')).toBeTruthy()
  })

  it('shows file info when a file is selected', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    const fileInput = screen.getByTestId('protocol-ide-intake-file-input')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(screen.getByTestId('protocol-ide-intake-file-info')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-intake-file-info')).toHaveTextContent('test.pdf')
  })

  it('calls onFileUpload when a file is selected', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    const fileInput = screen.getByTestId('protocol-ide-intake-file-input')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(mockOnFileUpload).toHaveBeenCalledWith(file)
  })
})

// ---------------------------------------------------------------------------
// Tests — directive entry
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — directive entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the directive label', () => {
    renderIntakePane()
    expect(screen.getByTestId('protocol-ide-intake-directive-label')).toHaveTextContent('Directive')
  })

  it('allows typing in the directive textarea', () => {
    renderIntakePane()
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the DNA protocol' } })
    expect(directiveInput).toHaveValue('Extract the DNA protocol')
  })
})

// ---------------------------------------------------------------------------
// Tests — submission
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls onSubmit with vendor_document payload when vendor is selected and directive is entered', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const firstResult = screen.getByTestId('protocol-ide-intake-result-0')
    fireEvent.click(firstResult)
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    const payload = mockOnSubmit.mock.calls[0][0]
    expect(payload.directiveText).toBe('Extract the protocol')
    expect(payload.source.sourceKind).toBe('vendor_document')
    expect(payload.source.vendor).toBe('fisher')
    expect(payload.source.title).toBe('DNA Extraction Protocol')
    expect(payload.source.landingUrl).toBe('https://www.fishersci.com/dna')
  })

  it('calls onSubmit with pasted_url payload when URL is entered and directive is entered', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const urlInput = screen.getByTestId('protocol-ide-intake-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/test.pdf' } })
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    const payload = mockOnSubmit.mock.calls[0][0]
    expect(payload.directiveText).toBe('Extract the protocol')
    expect(payload.source.sourceKind).toBe('pasted_url')
    expect(payload.source.url).toBe('https://example.com/test.pdf')
  })

  it('calls onSubmit with uploaded_pdf payload when file is selected and directive is entered', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const fileInput = screen.getByTestId('protocol-ide-intake-file-input')
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    const payload = mockOnSubmit.mock.calls[0][0]
    expect(payload.directiveText).toBe('Extract the protocol')
    expect(payload.source.sourceKind).toBe('uploaded_pdf')
    expect(payload.source.fileName).toBe('test.pdf')
    expect(payload.source.mediaType).toBe('application/pdf')
  })

  it('does NOT submit when directive is empty', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const firstResult = screen.getByTestId('protocol-ide-intake-result-0')
    fireEvent.click(firstResult)
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('does NOT submit when no vendor is selected in vendor mode', () => {
    renderIntakePane({ searchResults: SEED_RESULTS })
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('does NOT submit when no URL is entered in URL mode', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('does NOT submit when no file is uploaded in upload mode', () => {
    renderIntakePane()
    const uploadTab = screen.getByTestId('protocol-ide-intake-mode-upload')
    fireEvent.click(uploadTab)
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Extract the protocol' } })
    const submitBtn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(submitBtn)

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — reset
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('resets directive text', () => {
    renderIntakePane()
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Some directive' } })
    const resetBtn = screen.getByTestId('protocol-ide-intake-reset')
    fireEvent.click(resetBtn)
    expect(directiveInput).toHaveValue('')
  })

  it('resets to vendor_search mode', () => {
    renderIntakePane()
    const urlTab = screen.getByTestId('protocol-ide-intake-mode-pdf_url')
    fireEvent.click(urlTab)
    const resetBtn = screen.getByTestId('protocol-ide-intake-reset')
    fireEvent.click(resetBtn)
    // Should be back on vendor_search (the default)
    expect(screen.getByTestId('protocol-ide-intake-panel-vendor')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests — loading state
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows loading text on submit button', () => {
    renderIntakePane({ isLoading: true })
    expect(screen.getByTestId('protocol-ide-intake-submit')).toHaveTextContent('Launching…')
  })

  it('disables the submit button when loading', () => {
    renderIntakePane({ isLoading: true })
    expect(screen.getByTestId('protocol-ide-intake-submit')).toBeDisabled()
  })

  it('disables the reset button when loading', () => {
    renderIntakePane({ isLoading: true })
    expect(screen.getByTestId('protocol-ide-intake-reset')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Tests — error display
// ---------------------------------------------------------------------------

describe('ProtocolIdeIntakePane — error display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('displays an error message when provided', () => {
    renderIntakePane({ error: 'Something went wrong' })
    expect(screen.getByTestId('protocol-ide-intake-error')).toHaveTextContent(
      'Something went wrong'
    )
  })

  it('does not display an error when no error is provided', () => {
    renderIntakePane()
    expect(screen.queryByTestId('protocol-ide-intake-error')).toBeNull()
  })
})
