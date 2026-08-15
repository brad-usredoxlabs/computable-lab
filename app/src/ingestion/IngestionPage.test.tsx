/**
 * Tests for IngestionPage — verifies the tabbed shell renders both
 * workflow tabs and switches the active body via routing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
import { IngestionPage } from './IngestionPage'

afterEach(() => {
  cleanup()
})

listKindMock.mockResolvedValue({ records: [] })

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/ingestion/:tab"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <IngestionPage />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('IngestionPage', () => {
  it('renders the ingestion page with both workflow tabs', () => {
    renderAt('/ingestion/vendor-pdf')
    expect(screen.getByTestId('ingestion-page')).toBeDefined()
    expect(screen.getByTestId('ingestion-tab-vendor-pdf')).toBeDefined()
    expect(screen.getByTestId('ingestion-tab-pubmed')).toBeDefined()
  })

  it('defaults to the vendor-pdf tab and renders its workflow', () => {
    renderAt('/ingestion/vendor-pdf')
    expect(screen.getByTestId('ingestion-body-vendor-pdf')).toBeDefined()
    expect(screen.getByTestId('vendor-pdf-workflow')).toBeDefined()
  })

  it('switches to the PubMed tab on click', () => {
    renderAt('/ingestion/vendor-pdf')
    fireEvent.click(screen.getByTestId('ingestion-tab-pubmed'))
    expect(screen.getByTestId('ingestion-body-pubmed')).toBeDefined()
  })
})
