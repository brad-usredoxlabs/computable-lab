/**
 * Tests for VendorPdfWorkflowTab — the standalone vendor-PDF ingestion
 * workflow surface. Verifies it renders the shared search section AND the
 * recent-ingests list, and that View / Open-in-Protocol-Builder navigate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const listKindMock = vi.fn()
const searchMock = vi.fn()
const ingestMock = vi.fn()
const createDraftMock = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listKindMock(...args),
    searchGraphLemurVendorPdfs: (...args: unknown[]) => searchMock(...args),
    ingestGraphLemurVendorPdf: (...args: unknown[]) => ingestMock(...args),
    createVendorPdfExtractionDraft: (...args: unknown[]) => createDraftMock(...args),
  },
}))

import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { VendorPdfWorkflowTab } from './VendorPdfWorkflowTab'

beforeEach(() => {
  listKindMock.mockReset()
  searchMock.mockReset()
  ingestMock.mockReset()
  createDraftMock.mockReset()
})

afterEach(() => cleanup())

const sampleRecord = {
  recordId: 'VPDF-ABC123',
  payload: {
    kind: 'vendor-pdf',
    recordId: 'VPDF-ABC123',
    title: 'NEBNext Ultra II',
    state: 'ingested',
    source: { engine: 'exa', vendor: 'NEB' },
  },
}

function renderTab(records = [sampleRecord]) {
  listKindMock.mockResolvedValue({ records })
  return render(
    <MemoryRouter initialEntries={['/ingestion/vendor-pdf']}>
      <Routes>
        <Route
          path="/ingestion/vendor-pdf"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <VendorPdfWorkflowTab />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
        <Route path="/lab/vendor-pdfs/:recordId" element={<div data-testid="lab-viewer" />} />
        <Route path="/protocol-builder" element={<div data-testid="protocol-builder" />} />
        <Route path="/extraction/review/:draftId" element={<div data-testid="extraction-review" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('VendorPdfWorkflowTab', () => {
  it('renders the search section and the recent-ingests list', async () => {
    renderTab()
    expect(screen.getByTestId('vendor-pdf-workflow')).toBeDefined()
    expect(screen.getByTestId('vendor-pdf-search-input')).toBeDefined()
    await waitFor(() =>
      expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined(),
    )
    expect(screen.getByText('NEBNext Ultra II')).toBeTruthy()
  })

  it('lists known vendor-pdf kind when loading recent ingests', async () => {
    renderTab()
    await waitFor(() => expect(listKindMock).toHaveBeenCalledWith('vendor-pdf', 100))
  })

  it('navigates to the first-class record viewer on View', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined())
    fireEvent.click(screen.getByTestId('recent-view-VPDF-ABC123'))
    expect(screen.getByTestId('lab-viewer')).toBeDefined()
  })

  it('navigates to the protocol builder on Open in Protocol Builder', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined())
    fireEvent.click(screen.getByTestId('recent-build-VPDF-ABC123'))
    expect(screen.getByTestId('protocol-builder')).toBeDefined()
  })

  it('extracts a protocol draft and routes to the review page', async () => {
    createDraftMock.mockResolvedValue({ success: true, draftId: 'XDR-000042', candidateCount: 1 })
    renderTab()
    await waitFor(() => expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined())
    fireEvent.click(screen.getByTestId('recent-extract-VPDF-ABC123'))
    await waitFor(() => expect(createDraftMock).toHaveBeenCalledWith('VPDF-ABC123'))
    expect(screen.getByTestId('extraction-review')).toBeDefined()
  })

  it('surfaces an error when extracting a draft fails', async () => {
    createDraftMock.mockRejectedValue(new Error('draft failed'))
    renderTab()
    await waitFor(() => expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined())
    fireEvent.click(screen.getByTestId('recent-extract-VPDF-ABC123'))
    await waitFor(() =>
      expect(screen.getByTestId('vendor-pdf-extract-error').textContent).toContain('draft failed'),
    )
  })

  it('shows an empty state when no vendor PDFs are ingested', async () => {
    renderTab([])
    await waitFor(() =>
      expect(screen.getByText('No vendor PDFs ingested yet.')).toBeTruthy(),
    )
  })
})
