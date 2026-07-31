/**
 * Tests for LabCollectionView.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { LabCollectionView } from './LabCollectionView'

afterEach(() => {
  cleanup()
})

function renderWithProviders(ui: React.ReactElement) {
  render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

describe('LabCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-collection-view')).toBeDefined()
  })

  it('renders all 6 category buttons', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-category-protocols')).toBeDefined()
    expect(screen.getByTestId('lab-category-materials')).toBeDefined()
    expect(screen.getByTestId('lab-category-labware')).toBeDefined()
    expect(screen.getByTestId('lab-category-equipment')).toBeDefined()
    expect(screen.getByTestId('lab-category-people')).toBeDefined()
    expect(screen.getByTestId('lab-category-documents')).toBeDefined()
  })
})
