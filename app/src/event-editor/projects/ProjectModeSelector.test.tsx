/**
 * ProjectModeSelector tests.
 *
 *  - renders one tab per known mode
 *  - active tab matches the :mode URL param
 *  - each tab is a link to /project/:studyId/<mode>
 *  - aria-selected reflects the active mode
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectModeSelector } from './ProjectModeSelector'
import { PROJECT_MODES } from './projectMode'

afterEach(() => cleanup())

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/project/:studyId/:mode"
          element={<ProjectModeSelector studyId="STU-000001" />}
        />
        <Route
          path="/project/:studyId"
          element={<ProjectModeSelector studyId="STU-000001" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectModeSelector', () => {
  it('renders one link per known project mode', () => {
    renderAt('/project/STU-000001')
    for (const mode of PROJECT_MODES) {
      expect(screen.getByTestId(`project-mode-${mode}`)).toBeTruthy()
    }
  })

  it('marks event-editor active when the mode param is missing', () => {
    renderAt('/project/STU-000001')
    expect(
      screen
        .getByTestId('project-mode-event-editor')
        .getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('marks the matching mode active', () => {
    renderAt('/project/STU-000001/protocols')
    expect(
      screen
        .getByTestId('project-mode-protocols')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen
        .getByTestId('project-mode-event-editor')
        .getAttribute('aria-selected'),
    ).toBe('false')
  })

  it('each tab links to /project/<studyId>/<mode>', () => {
    renderAt('/project/STU-000001/browser')
    for (const mode of PROJECT_MODES) {
      const link = screen.getByTestId(`project-mode-${mode}`)
      expect(link.getAttribute('href')).toBe(`/project/STU-000001/${mode}`)
    }
  })

  it('falls back to event-editor active when mode param is unknown', () => {
    renderAt('/project/STU-000001/nonsense')
    expect(
      screen
        .getByTestId('project-mode-event-editor')
        .getAttribute('aria-selected'),
    ).toBe('true')
  })
})
