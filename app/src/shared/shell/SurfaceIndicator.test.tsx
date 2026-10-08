/**
 * SurfaceIndicator — renders the "where am I" surface chip from the route.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { OpenTabsProvider, tabsStorageKey } from './OpenTabsContext'
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

  afterEach(() => {
    window.localStorage.removeItem(tabsStorageKey(undefined))
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

  it('names the project being worked in when the route is not a project', async () => {
    // The provider hydrates from localStorage in an effect that runs AFTER a
    // child's openTab, so seeding the stored session is the reliable way to
    // establish "the project tab is open".
    seedStoredSession()

    render(
      <MemoryRouter initialEntries={['/claims']}>
        <OpenTabsProvider>
          <SurfaceIndicator />
        </OpenTabsProvider>
      </MemoryRouter>,
    )

    const chip = await screen.findByTestId('surface-indicator-project')
    expect(chip).toHaveTextContent('PPARa_ROS_project')
    expect(chip.getAttribute('title')).toBe('Project STU-1')
    // /claims is the knowledge surface — the pill used to report "project".
    expect((await screen.findByTestId('surface-indicator')).getAttribute('data-surface')).toBe('knowledge')
  })
})

/** Write one open, active project tab into the provider's stored session. */
function seedStoredSession() {
  window.localStorage.setItem(
    tabsStorageKey(undefined),
    JSON.stringify({
      tabs: [
        {
          tab: { id: 'tab-project', kind: 'project', studyId: 'STU-1', title: 'PPARa_ROS_project' },
          activeRightPaneMode: 'ai',
        },
      ],
      activeTabId: 'tab-project',
      history: ['tab-project'],
      historyCursor: 0,
      updatedAt: new Date().toISOString(),
    }),
  )
}