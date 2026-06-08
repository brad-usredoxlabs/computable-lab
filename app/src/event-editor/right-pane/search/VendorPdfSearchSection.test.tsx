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

import { VendorPdfSearchSection } from './VendorPdfSearchSection'

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

describe('VendorPdfSearchSection', () => {
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
