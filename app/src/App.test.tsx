/**
 * App router tests — Phase 12.
 *
 * Asserts:
 *  - root `/` renders the WelcomePage (no more redirect to /browser),
 *  - legacy `/browser`, `/protocols`, `/literature` redirect to `/`,
 *  - `/event-editor`, `/event-editor/:eventGraphId`, `/runs/:runId/event-editor`
 *    reach EventEditorPage,
 *  - `/event-editor/fixit` reaches the fix-it slot route,
 *  - `/settings` renders as an off-nav brand-menu route,
 *  - every deleted legacy URL falls through to the `*` catch-all and
 *    renders a 404, not a redirect.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('./extensions', () => ({
  Slot: ({ name }: { name: string }) =>
    name === 'event-editor.fix-it-route' ? (
      <div data-testid="fixit-route">fixit</div>
    ) : (
      <div data-testid={`slot-${name}`} />
    ),
}))

vi.mock('./welcome/WelcomePage', () => ({
  WelcomePage: () => <div data-testid="welcome-page">welcome</div>,
}))
vi.mock('./event-editor/EventEditorPage', () => ({
  EventEditorPage: () => <div data-testid="event-editor-page">event-editor</div>,
}))
vi.mock('./event-editor/projects/ProjectWorkspacePage', () => ({
  ProjectWorkspacePage: () => (
    <div data-testid="project-workspace-page">workspace</div>
  ),
}))
vi.mock('./settings/SettingsRoute', () => ({
  SettingsRoute: () => <div data-testid="settings-route">settings</div>,
}))

vi.mock('./shell/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => {
      const url =
        (globalThis as unknown as { __START_URL__?: string }).__START_URL__ ?? '/'
      return <real.MemoryRouter initialEntries={[url]}>{children}</real.MemoryRouter>
    },
  }
})

import { App } from './App'

function visit(url: string) {
  ;(globalThis as unknown as { __START_URL__?: string }).__START_URL__ = url
  return render(<App />)
}

afterEach(() => {
  cleanup()
})

describe('App router (Phase 12)', () => {
  it('renders WelcomePage at /', async () => {
    visit('/')
    await waitFor(() => expect(screen.getByTestId('welcome-page')).toBeTruthy())
  })

  it('renders ProjectWorkspacePage at /project/:studyId', async () => {
    visit('/project/STU-000001')
    await waitFor(() =>
      expect(screen.getByTestId('project-workspace-page')).toBeTruthy(),
    )
  })

  it('renders EventEditorPage at /event-editor', async () => {
    visit('/event-editor')
    await waitFor(() =>
      expect(screen.getByTestId('event-editor-page')).toBeTruthy(),
    )
  })

  it('renders EventEditorPage at /event-editor/:eventGraphId', async () => {
    visit('/event-editor/EVG-123')
    await waitFor(() =>
      expect(screen.getByTestId('event-editor-page')).toBeTruthy(),
    )
  })

  it('renders EventEditorPage at /runs/:runId/event-editor', async () => {
    visit('/runs/RUN-123/event-editor')
    await waitFor(() =>
      expect(screen.getByTestId('event-editor-page')).toBeTruthy(),
    )
  })

  it('renders FixItRoute at /event-editor/fixit', async () => {
    visit('/event-editor/fixit')
    await waitFor(() => expect(screen.getByTestId('fixit-route')).toBeTruthy())
  })

  it('redirects /browser to / (Welcome)', async () => {
    visit('/browser')
    await waitFor(() => expect(screen.getByTestId('welcome-page')).toBeTruthy())
  })

  it('redirects /protocols to / (Welcome)', async () => {
    visit('/protocols')
    await waitFor(() => expect(screen.getByTestId('welcome-page')).toBeTruthy())
  })

  it('redirects /literature to / (Welcome)', async () => {
    visit('/literature')
    await waitFor(() => expect(screen.getByTestId('welcome-page')).toBeTruthy())
  })

  it('renders SettingsRoute at /settings', async () => {
    visit('/settings')
    await waitFor(() =>
      expect(screen.getByTestId('settings-route')).toBeTruthy(),
    )
  })

  // ---- Retired legacy routes render 404 ---------------------------------

  for (const url of [
    '/schemas',
    '/schemas/material/records',
    '/records/MAT-1',
    '/records/MAT-1/edit',
    '/new',
    '/labware-editor',
    '/labware-test',
    '/runs/RUN-1',
    '/runs/RUN-1/editor',
    '/runs/RUN-1/editor/canvas',
    '/registry',
    '/component-library',
    '/formulations',
    '/materials',
    '/ingestion',
    '/extraction',
    '/extraction/review/DRA-1',
    '/protocol-ide',
    '/protocol-ide/SESS-1',
    '/protocol-ide/foundry/status',
    '/protocol-ide/foundry/jobs',
    '/browser-legacy',
  ]) {
    it(`renders 404 for retired legacy URL ${url}`, async () => {
      visit(url)
      await waitFor(() =>
        expect(screen.getByTestId('not-found-route')).toBeTruthy(),
      )
    })
  }
})
