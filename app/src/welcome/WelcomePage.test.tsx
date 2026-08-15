/**
 * WelcomePage tests — root-route landing surface (Phase 12.6).
 *
 *  - empty open-studies → renders the welcome-page-empty hint
 *  - non-empty → renders one welcome-card per recent study
 *  - clicking a card navigates to `/project/<studyId>`
 *  - "Search Projects" toggles the StudyPickerPopover
 *
 * The picker's keyboard/search behavior has its own focused test file;
 * here we just verify it MOUNTS when "Search Projects" is clicked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import {
  clearOpenStudies,
  openStudy,
} from '../event-editor/workspace/openStudiesStorage'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(async () => ({ records: [], total: 0 })),
    searchProjects: vi.fn(async () => ({ studies: [], total: 0 })),
  },
}))

import { WelcomePage } from './WelcomePage'

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

function renderWelcome() {
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <WelcomePage />
                  <LocationRecorder />
                </>
              }
            />
            <Route path="/project/:studyId" element={<LocationRecorder />} />
          </Routes>
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>,
  )
}

describe('WelcomePage', () => {
  it('renders the empty hint when no open studies', () => {
    renderWelcome()
    expect(screen.getByTestId('welcome-page-empty')).toBeTruthy()
    expect(screen.getByTestId('welcome-page-search')).toBeTruthy()
  })

  it('renders a card per open study', () => {
    openStudy('STU-000001', 'Hepatocyte study')
    openStudy('STU-000002', 'Cell viability')
    renderWelcome()
    expect(screen.getByTestId('welcome-card-STU-000001')).toBeTruthy()
    expect(screen.getByTestId('welcome-card-STU-000002')).toBeTruthy()
    expect(screen.queryByTestId('welcome-page-empty')).toBeNull()
  })

  it('clicking a card navigates to /project/<studyId>', () => {
    openStudy('STU-000001', 'Hepatocyte study')
    renderWelcome()
    fireEvent.click(screen.getByTestId('welcome-card-STU-000001'))
    expect(screen.getByTestId('current-location').textContent).toBe(
      '/project/STU-000001',
    )
  })

  it('"Search Projects" mounts the StudyPickerPopover', () => {
    renderWelcome()
    expect(screen.queryByTestId('study-picker-popover')).toBeNull()
    fireEvent.click(screen.getByTestId('welcome-page-search'))
    expect(screen.getByTestId('study-picker-popover')).toBeTruthy()
  })
})
