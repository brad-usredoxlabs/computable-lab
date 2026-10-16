/**
 * VendorPdfSearchSection tests — verifies the search + ingest flow with
 * the apiClient mocked.
 *
 *  - search button calls apiClient.searchGraphLemurVendorPdfs and renders
 *    a row per result
 *  - clicking a result calls apiClient.ingestGraphLemurVendorPdf with the
 *    active studyId and query string
 *  - on success, onIngested fires with the new artifactId
 *  - server returns no recordedArtifact (legacy server) → inline warning
 *  - ingest error surfaces inline without crashing the section
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const searchMock = vi.fn()
const ingestMock = vi.fn()
const uploadMock = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    searchGraphLemurVendorPdfs: (...args: unknown[]) => searchMock(...args),
    ingestGraphLemurVendorPdf: (...args: unknown[]) => ingestMock(...args),
    uploadGraphLemurVendorPdf: (...args: unknown[]) => uploadMock(...args),
  },
}))

import { VendorPdfSearchSection, baseUrlOf } from './VendorPdfSearchSection'

beforeEach(() => {
  searchMock.mockReset()
  ingestMock.mockReset()
  uploadMock.mockReset()
})

afterEach(() => cleanup())

const sampleResults = [
  {
    id: 'r1',
    title: 'NEBNext Ultra II',
    url: 'https://neb.example/ultra.pdf',
    vendor: 'neb',
    snippet: 'workflow description',
    source: 'exa',
    documentType: 'protocol',
    sourcePdf: {},
    sourceProtocolCandidate: {},
  },
]

function renderSection(onIngested = vi.fn()) {
  return {
    onIngested,
    ...render(
      <VendorPdfSearchSection
        studyId="STU-000001"
        onIngested={onIngested}
      />,
    ),
  }
}

function renderSectionNoStudy(onIngested = vi.fn()) {
  return {
    onIngested,
    ...render(<VendorPdfSearchSection onIngested={onIngested} />),
  }
}

describe('VendorPdfSearchSection', () => {
  it('shows the vendor and base url in the hit meta', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    // Meta renders vendor + hostname + documentType.
    await screen.findByText(/neb\.example/)
    expect(screen.getByText(/neb · neb\.example · protocol/)).toBeTruthy()
  })

  it('baseUrlOf extracts the hostname and tolerates garbage input', () => {
    expect(baseUrlOf('https://neb.example/ultra.pdf')).toBe('neb.example')
    expect(baseUrlOf('not a url')).toBeNull()
  })

  it('shows an "Open source URL" remediation when the vendor blocks the PDF download', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: {
        diagnostics: [{ code: 'EXA_TEXT_FALLBACK', severity: 'warning', message: 'blocked' }],
      },
      // recordedArtifact omitted — nothing durable written
    })
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    // Remediation appears on the failed hit.
    await waitFor(() => expect(screen.getByText(/Step 1 — Open source URL/)).toBeTruthy())
  })

  it('opens the source URL in a new tab from the blocked remediation', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: {
        diagnostics: [{ code: 'EXA_TEXT_FALLBACK', severity: 'warning', message: 'blocked' }],
      },
    })
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(screen.getByText(/Step 1 — Open source URL/)).toBeTruthy())
    fireEvent.click(screen.getByText(/Step 1 — Open source URL/))
    expect(openSpy).toHaveBeenCalledWith('https://neb.example/ultra.pdf', '_blank', expect.stringContaining('noopener'))
  })

  it('does not show the open-source remediation on a clean ingest', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'ART-1234', studyId: 'STU-000001', extractedTextPageCount: 1 },
    })
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    // Successful ingest → no remediation button appears.
    await waitFor(() => expect(screen.getByTestId('vendor-pdf-ingest-success')).toBeTruthy())
    expect(screen.queryAllByText(/Step 1 — Open source URL/)).toHaveLength(0)
  })

  it('brings the downloaded file back by uploading it', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    uploadMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'VPDF-UPLOADED' },
    })

    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    // Force the blocked state (EXA_TEXT_FALLBACK) so the bring-back button shows.
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [{ code: 'EXA_TEXT_FALLBACK', severity: 'warning', message: 'blocked' }] },
    })
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(screen.getByText(/Step 1 — Open source URL/)).toBeTruthy())

    // Simulate picking a downloaded PDF file.
    const file = new File(['%PDF-1.4 brought back'], 'protocol.pdf', { type: 'application/pdf' })
    const input = screen.getByTestId('vendor-pdf-bring-back') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    const args = uploadMock.mock.calls[0][0]
    expect(args.fileName).toBe('protocol.pdf')
    expect(args.contentBase64).toBeTruthy()
    expect(args.url).toBe('https://neb.example/ultra.pdf')
  })

  it('runs a search and renders rows', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('NEBNext Ultra II')).toBeTruthy(),
    )
    expect(searchMock).toHaveBeenCalledWith({ q: 'ultra', limit: 12 })
  })

  it('clicking a result calls ingest with studyId + query and fires onIngested', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: {},
      recordedArtifact: {
        recordId: 'ART-ABCDEF123456',
        studyId: 'STU-000001',
        extractedTextPageCount: 5,
      },
    })
    const { onIngested } = renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('NEBNext Ultra II')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(ingestMock).toHaveBeenCalled())
    const ingestArgs = ingestMock.mock.calls[0][0]
    expect(ingestArgs.studyId).toBe('STU-000001')
    expect(ingestArgs.query).toBe('ultra')
    expect(ingestArgs.url).toBe('https://neb.example/ultra.pdf')
    await waitFor(() =>
      expect(onIngested).toHaveBeenCalledWith(
        'ART-ABCDEF123456',
        expect.objectContaining({
          sourceUrl: 'https://neb.example/ultra.pdf',
          title: 'NEBNext Ultra II',
        }),
      ),
    )
    expect(
      screen.getByTestId('vendor-pdf-ingest-success').textContent,
    ).toContain('ART-ABCDEF123456')
  })

  it('omits studyId from the ingest call when not provided (free-floating)', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: {},
      recordedArtifact: { recordId: 'VPDF-ABCDEF123456', extractedTextPageCount: 1 },
    })
    renderSectionNoStudy()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('NEBNext Ultra II')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(ingestMock).toHaveBeenCalled())
    const ingestArgs = ingestMock.mock.calls[0][0]
    expect(ingestArgs).not.toHaveProperty('studyId')
    expect(ingestArgs.url).toBe('https://neb.example/ultra.pdf')
  })

  it('surfaces an inline warning when the server returns no recordedArtifact', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: {},
      // recordedArtifact intentionally omitted
    })
    const { onIngested } = renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('NEBNext Ultra II')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() =>
      expect(screen.getByTestId('vendor-pdf-ingest-error')).toBeTruthy(),
    )
    expect(onIngested).not.toHaveBeenCalled()
  })

  it('surfaces ingest API errors inline', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockRejectedValue(new Error('download timed out'))
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('NEBNext Ultra II')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() =>
      expect(screen.getByText('download timed out')).toBeTruthy(),
    )
  })

  it('surfaces search errors inline', async () => {
    searchMock.mockRejectedValue(new Error('Exa is down'))
    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), {
      target: { value: 'ultra' },
    })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() =>
      expect(screen.getByText('Exa is down')).toBeTruthy(),
    )
  })
})

// DOCINGEST-A A6 — the picker accepts what a lab actually has.
// DOCINGEST-B B1 — Stage B's upload arm landed: the picker now ALSO accepts
// the config-declared page-image extensions. This deliberately INVERTS
// Stage A's "NO image types" pin (same contract-inversion pattern as A5's
// engine pin): the accept list mirrors config `images.formats` exactly —
// a UI accepting an extension the handler 415s on (or vice versa) is
// split-brain (bait 18).
describe('document picker accepts lab documents', () => {
  it('the bring-back input accepts lab document types AND the config-declared page images (Stage B arm landed)', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    uploadMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'VPDF-UPLOADED' },
    })

    renderSection()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [{ code: 'EXA_TEXT_FALLBACK', severity: 'warning', message: 'blocked' }] },
    })
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(screen.getByText(/Step 1 — Open source URL/)).toBeTruthy())

    const input = screen.getByTestId('vendor-pdf-bring-back') as HTMLInputElement
    const accept = input.accept
    expect(accept).toContain('.pdf')
    expect(accept).toContain('.docx')
    expect(accept).toContain('.md')
    expect(accept).toContain('.markdown')
    expect(accept).toContain('.txt')
    expect(accept).toContain('.html')
    expect(accept).toContain('.xlsx')
    expect(accept).toContain('.csv')
    // DOCINGEST-B: exactly the config `images.formats` extensions — no more,
    // no less (bait 18: the handler gate and this list must never drift).
    for (const imageExt of ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp']) {
      expect(accept, `config-declared image type ${imageExt} must be pickable`).toContain(imageExt)
    }
  })
})

// QMS7-9 — first-class upload affordance on the STANDALONE ingestion surface
// (/ingestion/vendor-pdf). Brad's demand: the multi-file-type ingestion surface
// lacked an upload button; hint-without-control is dead chrome. The upload rides
// the ALREADY-generalized POST /vendors/graph-lemur/pdfs/upload (fileName +
// contentBase64, NO url) — the server's config-gate 415 UNSUPPORTED_DOCUMENT
// refusal is the honest refusal path.
//
// STANDALONE discriminator (verified at trunk): VendorPdfWorkflowTab renders
// the section WITHOUT studyId (its own doc: "standalone, studyId-free form");
// AddSourceModal (the AI-tab "+ Add source" context) renders it WITH studyId.
// The upload affordance is standalone-only (spec OQ2); the AI-tab modal stays
// search-only.
//
// RED-FIRST INVERSIONS (each asserted ABSENT at base, present at tip):
//   T1: standalone render shows NO "Upload a document" control at base.
//   T2: picking a supported file calls uploadGraphLemurVendorPdf with
//       fileName + contentBase64 and NO url, then fires onIngested.
//   T3: server refusal surfaces the honest error text and does NOT fire
//       onIngested (no record is written server-side on refusal).
//   T4: the upload picker and the bring-back picker share ONE module-level
//       accept const (no second literal — bait 18 anti-split-brain).
describe('QMS7-9 standalone upload affordance', () => {
  /** The accept string as it exists at base on the bring-back input (:310),
   *  i.e. exactly the config-declared extension set. T4 pins BOTH pickers to
   *  this one string so the single UI source cannot drift from the server gate. */
  const CONFIG_DECLARED_ACCEPT =
    '.pdf,.docx,.doc,.rtf,.md,.markdown,.txt,.html,.htm,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.tif,.tiff,.webp,application/pdf'

  /** Mirrors VendorPdfWorkflowTab's exact prop shape: no studyId, onBuildProtocol present. */
  function renderStandalone(onIngested = vi.fn()) {
    return {
      onIngested,
      ...render(
        <VendorPdfSearchSection
          onIngested={onIngested}
          onBuildProtocol={vi.fn()}
        />,
      ),
    }
  }

  it('T1: standalone render shows the "Upload a document" control (ABSENT at base)', () => {
    renderStandalone()
    const button = screen.getByTestId('vendor-pdf-upload-button')
    expect(button.textContent).toBe('Upload a document')
    // The hidden picker it opens exists and is reachable.
    const input = screen.getByTestId('vendor-pdf-upload-input') as HTMLInputElement
    expect(input.type).toBe('file')
  })

  it('T1b: the AI-tab (+Add source) prop shape stays search-only — no upload control there', () => {
    // AddSourceModal's exact prop shape: studyId present, no onBuildProtocol.
    render(
      <VendorPdfSearchSection
        studyId="STU-000001"
        onIngested={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('vendor-pdf-upload-button')).toBeNull()
    expect(screen.queryByTestId('vendor-pdf-upload-input')).toBeNull()
  })

  it('T2: picking a supported file uploads fileName + contentBase64 (no url) and fires onIngested', async () => {
    uploadMock.mockResolvedValue({
      sourcePdf: { title: 'neb-next.md', artifactPath: 'artifacts/x.md', sha256: 'abc' },
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'VPDF-UPLOAD123', extractedTextPageCount: 1 },
    })
    const { onIngested } = renderStandalone()

    const file = new File(['# NEBNext Ultra II\nStep 1. Add reagent'], 'neb-next.md', {
      type: 'text/markdown',
    })
    const input = screen.getByTestId('vendor-pdf-upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    const args = uploadMock.mock.calls[0][0]
    expect(args.fileName).toBe('neb-next.md')
    expect(args.contentBase64).toBe(btoa('# NEBNext Ultra II\nStep 1. Add reagent'))
    expect(args).not.toHaveProperty('url')
    // Standalone = free-floating: no studyId supplied.
    expect(args).not.toHaveProperty('studyId')
    await waitFor(() =>
      expect(onIngested).toHaveBeenCalledWith(
        'VPDF-UPLOAD123',
        expect.objectContaining({ title: 'neb-next.md' }),
      ),
    )
    // OQ1: upload has no source URL — sourceUrl is the response's (empty) one,
    // consistent with what VendorPdfWorkflowTab does with it today (it ignores
    // info and reloads Recent via onIngested).
    expect(onIngested.mock.calls[0][1].sourceUrl).toBe('')
    expect(screen.getByTestId('vendor-pdf-ingest-success').textContent).toContain('VPDF-UPLOAD123')
  })

  it('T2b: upload carries the provenance query when one is typed (mirrors bring-back)', async () => {
    uploadMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'VPDF-UP-QUERY', extractedTextPageCount: 1 },
    })
    renderStandalone()
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    const input = screen.getByTestId('vendor-pdf-upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    const args = uploadMock.mock.calls[0][0]
    expect(args.query).toBe('ultra')
    expect(args.fileName).toBe('notes.txt')
    expect(args).not.toHaveProperty('url')
    expect(args).not.toHaveProperty('studyId')
  })

  it('T3: server refusal (415 UNSUPPORTED_DOCUMENT) surfaces honest text and does NOT fire onIngested', async () => {
    const { ApiError } = await import('../../../shared/api/errors')
    uploadMock.mockRejectedValue(
      new ApiError({
        status: 415,
        code: 'HTTP_415',
        message:
          'UNSUPPORTED_DOCUMENT: Unsupported document type "mystery.xyz". Supported: the extensions declared in config/ingestion/document-extraction.yaml.',
      }),
    )
    const { onIngested } = renderStandalone()
    const input = screen.getByTestId('vendor-pdf-upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'mystery.xyz')] } })
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('vendor-pdf-upload-error')).toBeTruthy())
    expect(screen.getByTestId('vendor-pdf-upload-error').textContent).toContain('UNSUPPORTED_DOCUMENT')
    expect(onIngested).not.toHaveBeenCalled()
    expect(screen.queryByTestId('vendor-pdf-ingest-success')).toBeNull()
  })

  it('T4: both file pickers share ONE accept const — no second literal (bait 18 anti-split-brain)', async () => {
    searchMock.mockResolvedValue({ items: sampleResults, configured: true, query: 'ultra', vendors: [] })
    ingestMock.mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [{ code: 'EXA_TEXT_FALLBACK', severity: 'warning', message: 'blocked' }] },
    })
    renderStandalone()

    // Upload picker (new standalone control).
    const uploadInput = screen.getByTestId('vendor-pdf-upload-input') as HTMLInputElement
    expect(uploadInput.accept).toBe(CONFIG_DECLARED_ACCEPT)

    // Bring-back picker (existing control) — same string, same const.
    fireEvent.change(screen.getByTestId('vendor-pdf-search-input'), { target: { value: 'ultra' } })
    fireEvent.click(screen.getByTestId('vendor-pdf-search-submit'))
    await waitFor(() => expect(screen.getByText('NEBNext Ultra II')).toBeTruthy())
    fireEvent.click(screen.getByText('NEBNext Ultra II'))
    await waitFor(() => expect(screen.getByText(/Step 1 — Open source URL/)).toBeTruthy())
    const bringBackInput = screen.getByTestId('vendor-pdf-bring-back') as HTMLInputElement
    expect(bringBackInput.accept).toBe(CONFIG_DECLARED_ACCEPT)
    expect(bringBackInput.accept).toBe(uploadInput.accept)
  })
})
