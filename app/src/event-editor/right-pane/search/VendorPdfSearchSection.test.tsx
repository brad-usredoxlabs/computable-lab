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
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    searchGraphLemurVendorPdfs: (...args: unknown[]) => searchMock(...args),
    ingestGraphLemurVendorPdf: (...args: unknown[]) => ingestMock(...args),
  },
}))

import { VendorPdfSearchSection, baseUrlOf } from './VendorPdfSearchSection'

beforeEach(() => {
  searchMock.mockReset()
  ingestMock.mockReset()
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
    const uploadMock = vi.fn().mockResolvedValue({
      sourcePdf: {},
      sourceProtocolCandidate: {},
      extraction: { diagnostics: [] },
      recordedArtifact: { recordId: 'VPDF-UPLOADED' },
    })
    const { apiClient } = await import('../../../shared/api/client')
    ;(apiClient as unknown as { uploadGraphLemurVendorPdf: typeof uploadMock }).uploadGraphLemurVendorPdf = uploadMock

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
