/**
 * LegacyModeRedirect tests — Phase 11 cutover.
 *
 *  - /protocols → /project/STU-scratch/protocols
 *  - /browser → /project/STU-scratch/browser
 *  - /literature → /project/STU-scratch/literature
 *  - query string is preserved (deep-link tokens like ?view=, ?type=)
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { LegacyModeRedirect } from './LegacyModeRedirect'

afterEach(() => cleanup())

function Probe() {
  const location = useLocation()
  const params = useParams()
  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
      <div data-testid="study">{params.studyId ?? ''}</div>
      <div data-testid="mode">{params.mode ?? ''}</div>
    </div>
  )
}

function renderAt(initial: string, mode: 'protocols' | 'browser' | 'literature') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path={`/${mode}`} element={<LegacyModeRedirect mode={mode} />} />
        <Route path="/project/:studyId/:mode" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LegacyModeRedirect', () => {
  it('/protocols → /project/STU-scratch/protocols', () => {
    renderAt('/protocols', 'protocols')
    expect(screen.getByTestId('study').textContent).toBe('STU-scratch')
    expect(screen.getByTestId('mode').textContent).toBe('protocols')
  })

  it('/browser → /project/STU-scratch/browser', () => {
    renderAt('/browser', 'browser')
    expect(screen.getByTestId('study').textContent).toBe('STU-scratch')
    expect(screen.getByTestId('mode').textContent).toBe('browser')
  })

  it('/literature → /project/STU-scratch/literature', () => {
    renderAt('/literature', 'literature')
    expect(screen.getByTestId('study').textContent).toBe('STU-scratch')
    expect(screen.getByTestId('mode').textContent).toBe('literature')
  })

  it('preserves the query string', () => {
    renderAt('/protocols?view=foundry&sessionId=PIS-X', 'protocols')
    expect(screen.getByTestId('mode').textContent).toBe('protocols')
    expect(screen.getByTestId('search').textContent).toBe(
      '?view=foundry&sessionId=PIS-X',
    )
  })
})
