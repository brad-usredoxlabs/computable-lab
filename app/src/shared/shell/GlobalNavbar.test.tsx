/**
 * Tests for GlobalNavbar — verifies the primary destinations
 * and the global search bar are rendered.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalNavbar } from './GlobalNavbar'

afterEach(() => {
  cleanup()
})

/** Force the mobile viewport branch by mocking window.matchMedia to match. */
function installMobileViewport() {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

describe('GlobalNavbar', () => {
  it('renders all primary destinations', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('global-nav-projects')).toBeDefined()
    expect(screen.getByTestId('global-nav-runs')).toBeDefined()
    expect(screen.getByTestId('global-nav-claims')).toBeDefined()
    expect(screen.getByTestId('global-nav-lab')).toBeDefined()
    expect(screen.getByTestId('global-nav-ingestion')).toBeDefined()
  })

  it('renders global search bar', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('global-search-bar')).toBeDefined()
  })

  it('renders create menu', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('create-menu')).toBeDefined()
  })

  it('collapses destinations into the hamburger slide-down on mobile', () => {
    const restore = installMobileViewport()
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )

    // Only brand + hamburger are visible; dests are tucked away.
    const hamburger = screen.getByLabelText('Open menu')
    expect(hamburger).toBeDefined()
    expect(screen.queryByTestId('global-nav-ingestion')).toBeNull()

    // Opening the menu reveals all destinations plus search/create.
    fireEvent.click(hamburger)
    expect(screen.getByTestId('global-nav-projects')).toBeDefined()
    expect(screen.getByTestId('global-nav-runs')).toBeDefined()
    expect(screen.getByTestId('global-nav-claims')).toBeDefined()
    expect(screen.getByTestId('global-nav-lab')).toBeDefined()
    expect(screen.getByTestId('global-nav-ingestion')).toBeDefined()
    expect(screen.getByTestId('global-search-bar')).toBeDefined()
    expect(screen.getByTestId('create-menu')).toBeDefined()

    restore()
  })
})
