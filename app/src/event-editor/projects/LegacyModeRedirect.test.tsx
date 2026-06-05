/**
 * LegacyModeRedirect tests — Phase 12.
 *
 *  - /protocols → /
 *  - /browser → /
 *  - /literature → /
 *  - query strings are dropped (mode-specific params have no meaning in
 *    the Phase-12 workspace)
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { LegacyModeRedirect } from './LegacyModeRedirect'

afterEach(() => cleanup())

function Probe() {
  const location = useLocation()
  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
    </div>
  )
}

function renderAt(
  initial: string,
  mode: 'protocols' | 'browser' | 'literature',
) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path={`/${mode}`} element={<LegacyModeRedirect mode={mode} />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LegacyModeRedirect', () => {
  it('/protocols → /', () => {
    renderAt('/protocols', 'protocols')
    expect(screen.getByTestId('pathname').textContent).toBe('/')
  })

  it('/browser → /', () => {
    renderAt('/browser', 'browser')
    expect(screen.getByTestId('pathname').textContent).toBe('/')
  })

  it('/literature → /', () => {
    renderAt('/literature', 'literature')
    expect(screen.getByTestId('pathname').textContent).toBe('/')
  })

  it('drops the query string (mode-specific params no longer apply)', () => {
    renderAt('/protocols?view=foundry&sessionId=PIS-X', 'protocols')
    expect(screen.getByTestId('pathname').textContent).toBe('/')
    expect(screen.getByTestId('search').textContent).toBe('')
  })
})
