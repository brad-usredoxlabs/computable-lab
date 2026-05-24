/**
 * Phase 7 tests for the retired router.
 *
 * Asserts:
 *  - root `/` redirects to `/browser`,
 *  - each of the four endpoint URLs renders (we mock the page components
 *    to keep the assertion on routing behaviour, not page internals),
 *  - `/settings` renders as an off-nav brand-menu route,
 *  - every deleted legacy URL falls through to the `*` catch-all and
 *    renders a 404, not a redirect,
 *  - `/event-editor/fixit` and `/runs/:runId/event-editor` reach their
 *    expected components.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('./browser/BrowserPage', () => ({
  BrowserPage: () => <div data-testid="browser-page">browser</div>,
}))
vi.mock('./protocols/ProtocolsPage', () => ({
  ProtocolsPage: () => <div data-testid="protocols-page">protocols</div>,
}))
vi.mock('./literature/LiteraturePage', () => ({
  LiteraturePage: () => <div data-testid="literature-page">literature</div>,
}))
vi.mock('./event-editor/EventEditorPage', () => ({
  EventEditorPage: () => <div data-testid="event-editor-page">event-editor</div>,
}))
vi.mock('./event-editor/fixit-route/FixItRoute', () => ({
  FixItRoute: () => <div data-testid="fixit-route">fixit</div>,
}))
vi.mock('./settings/SettingsRoute', () => ({
  SettingsRoute: () => <div data-testid="settings-route">settings</div>,
}))

// Stub the ErrorBoundary because its production fallback would swallow
// test failures; we want them visible.
vi.mock('./shell/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// We need to control which URL the in-process BrowserRouter starts from,
// but the App's BrowserRouter is hard-coded. The trick: vi.mock the
// react-router-dom BrowserRouter to be MemoryRouter with initialEntries
// fed by a global `__START_URL__` we set before each test.
vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => {
      const url = (globalThis as unknown as { __START_URL__?: string }).__START_URL__ ?? '/'
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

describe('App router (Phase 7)', () => {
  it('redirects / to /browser', async () => {
    visit('/')
    await waitFor(() => expect(screen.getByTestId('browser-page')).toBeTruthy())
  })

  it('renders BrowserPage at /browser', async () => {
    visit('/browser')
    await waitFor(() => expect(screen.getByTestId('browser-page')).toBeTruthy())
  })

  it('renders EventEditorPage at /event-editor', async () => {
    visit('/event-editor')
    await waitFor(() => expect(screen.getByTestId('event-editor-page')).toBeTruthy())
  })

  it('renders EventEditorPage at /runs/:runId/event-editor', async () => {
    visit('/runs/RUN-123/event-editor')
    await waitFor(() => expect(screen.getByTestId('event-editor-page')).toBeTruthy())
  })

  it('renders FixItRoute at /event-editor/fixit', async () => {
    visit('/event-editor/fixit')
    await waitFor(() => expect(screen.getByTestId('fixit-route')).toBeTruthy())
  })

  it('renders ProtocolsPage at /protocols', async () => {
    visit('/protocols')
    await waitFor(() => expect(screen.getByTestId('protocols-page')).toBeTruthy())
  })

  it('renders LiteraturePage at /literature', async () => {
    visit('/literature')
    await waitFor(() => expect(screen.getByTestId('literature-page')).toBeTruthy())
  })

  it('renders SettingsRoute at /settings', async () => {
    visit('/settings')
    await waitFor(() => expect(screen.getByTestId('settings-route')).toBeTruthy())
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
      await waitFor(() => expect(screen.getByTestId('not-found-route')).toBeTruthy())
    })
  }
})
