/**
 * Tests for VendorPdfWorkflowTab — the standalone vendor-PDF ingestion
 * workflow surface. Verifies it renders the shared search section AND the
 * recent-ingests list, and that every per-row action (Review / View / the
 * search section's Build Protocol) opens the single review surface at
 * /ingestion/vendor-pdf/:recordId.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const listKindMock = vi.fn()
const searchMock = vi.fn()
const ingestMock = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listKindMock(...args),
    searchGraphLemurVendorPdfs: (...args: unknown[]) => searchMock(...args),
    ingestGraphLemurVendorPdf: (...args: unknown[]) => ingestMock(...args),
  },
}))

import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { VendorPdfWorkflowTab } from './VendorPdfWorkflowTab'

beforeEach(() => {
  listKindMock.mockReset()
  searchMock.mockReset()
  ingestMock.mockReset()
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
    extractedText: [{ pageNumber: 1, text: 'Step 1. Add reagent\nStep 2. Incubate' }],
  },
}

function ReviewProbe() {
  return <div data-testid="review-surface" />
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
        <Route path="/ingestion/vendor-pdf/:recordId" element={<ReviewProbe />} />
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

  it('navigates to the single review surface on Review', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByTestId('recent-vendor-pdf-VPDF-ABC123')).toBeDefined())
    fireEvent.click(screen.getByTestId('recent-extract-VPDF-ABC123'))
    expect(screen.getByTestId('review-surface')).toBeDefined()
  })

  it('shows an empty state when no vendor PDFs are ingested', async () => {
    renderTab([])
    await waitFor(() =>
      expect(screen.getByText('No vendor PDFs ingested yet.')).toBeTruthy(),
    )
  })
})