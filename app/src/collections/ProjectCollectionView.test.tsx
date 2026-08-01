/**
 * Tests for ProjectCollectionView.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { ProjectCollectionView } from './ProjectCollectionView'

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

describe('ProjectCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<ProjectCollectionView />)
    expect(screen.getByTestId('project-collection-view')).toBeDefined()
  })

  it('renders the + New Project button', () => {
    renderWithProviders(<ProjectCollectionView />)
    expect(screen.getByTestId('project-collection-new')).toBeDefined()
  })

  it('renders the Projects title', () => {
    renderWithProviders(<ProjectCollectionView />)
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
  })
})