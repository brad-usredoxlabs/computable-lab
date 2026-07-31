/**
 * Tests for GlobalNavbar — verifies the 4 primary destinations
 * and the global search bar are rendered.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalNavbar } from './GlobalNavbar'

afterEach(() => {
  cleanup()
})

describe('GlobalNavbar', () => {
  it('renders all 4 primary destinations', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('global-nav-projects')).toBeDefined()
    expect(screen.getByTestId('global-nav-runs')).toBeDefined()
    expect(screen.getByTestId('global-nav-claims')).toBeDefined()
    expect(screen.getByTestId('global-nav-lab')).toBeDefined()
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
})
