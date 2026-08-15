/**
 * Tests for LabCollectionView.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabCollectionView } from './LabCollectionView'

afterEach(() => {
  cleanup()
})

function renderWithProviders(ui: React.ReactElement) {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <OpenTabsProvider>{ui}</OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('LabCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-collection-view')).toBeDefined()
  })

  it('renders all 7 category buttons', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-category-protocols')).toBeDefined()
    expect(screen.getByTestId('lab-category-materials')).toBeDefined()
    expect(screen.getByTestId('lab-category-labware')).toBeDefined()
    expect(screen.getByTestId('lab-category-equipment')).toBeDefined()
    expect(screen.getByTestId('lab-category-people')).toBeDefined()
    expect(screen.getByTestId('lab-category-documents')).toBeDefined()
    expect(screen.getByTestId('lab-category-vendor-pdfs')).toBeDefined()
  })

  it('shows "+ New PDF" on the vendor-pdfs category only, routing to the Ingestion pipeline', () => {
    render(
      <MemoryRouter initialEntries={['/lab/vendor-pdfs']}>
        <Routes>
          <Route
            path="/lab/:category"
            element={
              <ThemeProvider>
                <OpenTabsProvider>
                  <LabCollectionView />
                </OpenTabsProvider>
              </ThemeProvider>
            }
          />
          <Route path="/ingestion/vendor-pdf" element={<div data-testid="ingestion-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button is present on the vendor-pdfs tab.
    const btn = screen.getByTestId('lab-category-new-vendor-pdf')
    expect(btn).toBeDefined()
    // Clicking routes to the Ingestion pipeline.
    fireEvent.click(btn)
    expect(screen.getByTestId('ingestion-target')).toBeDefined()
  })
})
