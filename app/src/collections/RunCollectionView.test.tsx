/**
 * Tests for RunCollectionView.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { RunCollectionView } from './RunCollectionView'

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

describe('RunCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<RunCollectionView />)
    expect(screen.getByTestId('run-collection-view')).toBeDefined()
  })

  it('renders the Runs title', () => {
    renderWithProviders(<RunCollectionView />)
    expect(screen.getAllByText('Runs').length).toBeGreaterThan(0)
  })
})
