/**
 * Tests for ClaimCollectionView.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { ClaimCollectionView } from './ClaimCollectionView'

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

describe('ClaimCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<ClaimCollectionView />)
    expect(screen.getByTestId('claim-collection-view')).toBeDefined()
  })

  it('renders the Claims title', () => {
    renderWithProviders(<ClaimCollectionView />)
    expect(screen.getAllByText('Claims').length).toBeGreaterThan(0)
  })
})
