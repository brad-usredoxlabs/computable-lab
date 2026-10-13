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
    // The workspace shell renders SurfaceIndicator, which loads the registry.
    getSurfaces: async () => ({ surfaces: [] }),
  },
}))

// The Literature tab mounts the bio-source explorer; stub it so this suite
// stays focused on the tab shell (the explorer has its own coverage).
vi.mock('../knowledge/LiteratureExplorer', () => ({
  LiteratureExplorer: () => <div data-testid="literature-explorer">literature-explorer</div>,
}))

// The Sequences tab mounts SequenceSearch (ISEQ-1); stub it the same way —
// the search surface has its own coverage in SequenceSearch.test.tsx.
vi.mock('../sequences/SequenceSearch', () => ({
  SequenceSearch: () => <div data-testid="sequence-search">sequence-search</div>,
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
    expect(screen.getByTestId('ingestion-tab-literature')).toBeDefined()
  })

  it('defaults to the vendor-pdf tab and renders its workflow', () => {
    renderAt('/ingestion/vendor-pdf')
    expect(screen.getByTestId('ingestion-body-vendor-pdf')).toBeDefined()
    expect(screen.getByTestId('vendor-pdf-workflow')).toBeDefined()
  })

  it('switches to the Literature tab on click', async () => {
    renderAt('/ingestion/vendor-pdf')
    fireEvent.click(screen.getByTestId('ingestion-tab-literature'))
    expect(screen.getByTestId('ingestion-body-literature')).toBeDefined()
    expect(await screen.findByTestId('literature-explorer')).toBeDefined()
  })

  // ISEQ-1: the Sequences tab sits between Literature and Primer/probe orders
  // and mounts SequenceSearch under its own body testid.
  it('shows the Sequences tab between Literature and Primer/probe orders', () => {
    renderAt('/ingestion/vendor-pdf')
    const tabIds = screen
      .getAllByTestId(/^ingestion-tab-/)
      .map((el) => el.getAttribute('data-testid'))
    expect(tabIds).toEqual([
      'ingestion-tab-vendor-pdf',
      'ingestion-tab-literature',
      'ingestion-tab-sequences',
      'ingestion-tab-oligo-orders',
    ])
  })

  it('renders the Sequences tab body with the SequenceSearch surface', async () => {
    renderAt('/ingestion/sequences')
    expect(screen.getByTestId('ingestion-body-sequences')).toBeDefined()
    expect(await screen.findByTestId('sequence-search')).toBeDefined()
  })
})
