/**
 * SurfaceIndicator — renders the "where am I" surface chip from the route.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { SurfaceIndicator } from './SurfaceIndicator'

const MOCK_SURFACES = {
  surfaces: [
    { id: 'find', label: 'Find / Search', path: '/find', objectTypes: ['well'], selectableKinds: ['well'], aiRole: 'search selection → AI context' },
    { id: 'run-design', label: 'Run · Design', path: '/runs/:id', objectTypes: ['run'], selectableKinds: ['event'], aiRole: 'event-graph editing' },
  ],
}

describe('SurfaceIndicator', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getSurfaces').mockResolvedValue(MOCK_SURFACES as never)
  })

  it('renders the find surface label on /find', async () => {
    render(
      <MemoryRouter initialEntries={['/find']}>
        <SurfaceIndicator />
      </MemoryRouter>,
    )
    const chip = await screen.findByTestId('surface-indicator')
    expect(chip.getAttribute('data-surface')).toBe('find')
    expect(chip.textContent).toContain('Find / Search')
  })

  it('shows the selected-node count when provided', async () => {
    render(
      <MemoryRouter initialEntries={['/find']}>
        <SurfaceIndicator selectionCount={3} />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('surface-indicator-sel')).toHaveTextContent('3 selected')
  })

  it('refines a run surface to the execute mode label', async () => {
    render(
      <MemoryRouter initialEntries={['/runs/run-42']}>
        <SurfaceIndicator runMode="execute" />
      </MemoryRouter>,
    )
    const chip = await screen.findByTestId('surface-indicator')
    expect(chip.getAttribute('data-surface')).toBe('run-execute')
  })
})