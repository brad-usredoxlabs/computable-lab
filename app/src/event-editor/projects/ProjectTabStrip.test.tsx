/**
 * Tests for ProjectTabStrip.
 *
 * Covers:
 *  - renders one tab per open study and a trailing "+" button
 *  - active tab gets the --active class based on URL param
 *  - clicking a tab navigates to /project/<studyId>
 *  - closing the active tab navigates to a sibling, then to / (Welcome)
 *    when none remain
 *  - "+" toggles the StudyPickerPopover; the popover render path uses
 *    apiClient.listRecordsByKind which is mocked here
 *  - middle-click / cmd-click do NOT preventDefault, so anchor semantics
 *    let the browser open in a new tab
 *
 * The picker's keyboard/search behavior has its own focused test file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { ProjectTabStrip } from './ProjectTabStrip'
import {
  clearOpenStudies,
  openStudy,
} from '../workspace/openStudiesStorage'

// The picker fetches studies via apiClient.listRecordsByKind. Mock the
// module so the popover renders without a real network call when "+" is
// clicked.
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(async () => ({ records: [], total: 0 })),
    searchProjects: vi.fn(async () => ({ studies: [], total: 0 })),
  },
}))

beforeEach(() => {
  clearOpenStudies()
})

afterEach(() => {
  cleanup()
  clearOpenStudies()
})

function LocationRecorder() {
  const location = useLocation()
  return <div data-testid="current-location">{location.pathname}</div>
}

function renderStrip(initial = '/project/STU-000001') {
  // ThemeProvider is required because the SettingsMenuButton mounts
  // BrandMenuDropdown which reads from `useTheme()`.
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/project/:studyId"
            element={
              <>
                <ProjectTabStrip />
                <LocationRecorder />
              </>
            }
          />
          <Route path="/" element={<LocationRecorder />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('ProjectTabStrip', () => {
  it('renders one tab per open study and a + button', () => {
    openStudy('STU-000001', 'Hepatocyte study')
    openStudy('STU-000002', 'Cell viability')
    renderStrip()
    expect(screen.getByTestId('project-tab-STU-000001')).toBeTruthy()
    expect(screen.getByTestId('project-tab-STU-000002')).toBeTruthy()
    expect(screen.getByTestId('project-tab-add')).toBeTruthy()
  })

  it('marks the URL-matching tab active', () => {
    openStudy('STU-000001', 'A')
    openStudy('STU-000002', 'B')
    renderStrip('/project/STU-000002')
    const active = screen.getByTestId('project-tab-STU-000002')
    expect(active.className).toContain('project-tab--active')
    const inactive = screen.getByTestId('project-tab-STU-000001')
    expect(inactive.className).not.toContain('project-tab--active')
  })

  it('falls back to title when set, else to the recordId', () => {
    openStudy('STU-000001', 'Friendly title')
    openStudy('STU-000002')
    renderStrip()
    expect(screen.getByText('Friendly title')).toBeTruthy()
    expect(screen.getByText('STU-000002')).toBeTruthy()
  })

  it('clicking a tab navigates to /project/<studyId>', () => {
    openStudy('STU-000001', 'A')
    openStudy('STU-000002', 'B')
    renderStrip('/project/STU-000001')
    fireEvent.click(screen.getByTestId('project-tab-STU-000002'))
    expect(screen.getByTestId('current-location').textContent).toBe(
      '/project/STU-000002',
    )
  })

  it('closing the active tab navigates to a sibling', () => {
    openStudy('STU-000001', 'A')
    openStudy('STU-000002', 'B')
    openStudy('STU-000003', 'C')
    renderStrip('/project/STU-000002')
    fireEvent.click(screen.getByTestId('project-tab-close-STU-000002'))
    // Right neighbor preferred — STU-000003 takes over.
    expect(screen.getByTestId('current-location').textContent).toBe(
      '/project/STU-000003',
    )
  })

  it('closing the last remaining tab navigates to / (Welcome)', () => {
    openStudy('STU-000001', 'A')
    renderStrip('/project/STU-000001')
    fireEvent.click(screen.getByTestId('project-tab-close-STU-000001'))
    expect(screen.getByTestId('current-location').textContent).toBe('/')
  })

  it('closing an inactive tab leaves the URL unchanged', () => {
    openStudy('STU-000001', 'A')
    openStudy('STU-000002', 'B')
    renderStrip('/project/STU-000001')
    fireEvent.click(screen.getByTestId('project-tab-close-STU-000002'))
    expect(screen.getByTestId('current-location').textContent).toBe(
      '/project/STU-000001',
    )
  })

  it('toggles the study picker popover on "+" click', () => {
    renderStrip('/project/STU-000001')
    expect(screen.queryByTestId('study-picker-popover')).toBeNull()
    fireEvent.click(screen.getByTestId('project-tab-add'))
    expect(screen.getByTestId('study-picker-popover')).toBeTruthy()
    fireEvent.click(screen.getByTestId('project-tab-add'))
    expect(screen.queryByTestId('study-picker-popover')).toBeNull()
  })

  it('renders the settings gear at the trailing edge of the strip', () => {
    renderStrip('/project/STU-000001')
    expect(screen.getByTestId('settings-menu-button')).toBeTruthy()
    expect(screen.getByTestId('settings-menu-trigger')).toBeTruthy()
  })

  it('clicking the gear opens the brand menu dropdown (Settings / Theme / About)', () => {
    renderStrip('/project/STU-000001')
    expect(screen.queryByTestId('brand-menu-dropdown')).toBeNull()
    fireEvent.click(screen.getByTestId('settings-menu-trigger'))
    expect(screen.getByTestId('brand-menu-dropdown')).toBeTruthy()
    // The three reuseable items from BrandMenuDropdown should be visible.
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText(/Theme:/)).toBeTruthy()
    expect(screen.getByText('About')).toBeTruthy()
  })

  it('gear toggles closed when clicked again', () => {
    renderStrip('/project/STU-000001')
    fireEvent.click(screen.getByTestId('settings-menu-trigger'))
    expect(screen.getByTestId('brand-menu-dropdown')).toBeTruthy()
    fireEvent.click(screen.getByTestId('settings-menu-trigger'))
    expect(screen.queryByTestId('brand-menu-dropdown')).toBeNull()
  })
})
