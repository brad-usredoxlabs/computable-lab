/**
 * UCX-2 (RED) — router-level deep-link pins (d): a malformed ?ws= degrades to
 * the storage/default workspace WITH a visible banner (data-testid
 * "ws-param-diagnostic"), never a crash, and per-entry keep-valid/drop-bad.
 *
 * Harness mirrors App.test.tsx (BrowserRouter → MemoryRouter via __START_URL__)
 * plus window.history.replaceState so the provider's hydration read of
 * window.location.search sees the same search the router mounts with.
 * App.test.tsx itself is NOT touched (baseline-pin ruling OQ1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('./extensions', () => ({
  Slot: ({ name }: { name: string }) =>
    name === 'event-editor.fix-it-route' ? (
      <div data-testid="fixit-route">fixit</div>
    ) : (
      <div data-testid={`slot-${name}`} />
    ),
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
vi.mock('./shared/shell/RegistryHostPage', () => ({
  RegistryHostPage: () => <div data-testid="record-registry-page">registry</div>,
}))
vi.mock('./shared/shell/RecordHostPage', () => ({
  RecordHostPage: () => <div data-testid="record-host-page">record</div>,
}))
vi.mock('./literature/LiteraturePage', () => ({
  LiteraturePage: () => <div data-testid="literature-page">literature</div>,
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

const STORAGE_KEY = 'cl-open-tabs'
const STORED = {
  tabs: [
    {
      tab: { id: 'run:RUN-OLD', kind: 'run', runId: 'RUN-OLD', title: 'Stale session' },
      activeRightPaneMode: 'protocol',
      breadcrumb: [],
      contentHistory: [{ id: 'run:RUN-OLD', kind: 'run', runId: 'RUN-OLD', title: 'Stale session' }],
      contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-OLD',
  history: ['run:RUN-OLD'],
  historyCursor: 0,
}

function visit(url: string) {
  window.history.replaceState({}, '', url)
  ;(globalThis as unknown as { __START_URL__?: string }).__START_URL__ = url
  return render(<App />)
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(STORED))
})

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('App deep-link hydration (UCX-2)', () => {
  it('a malformed ws renders the diagnostic banner and the page, never a crash', async () => {
    visit('/registry?ws=%%nonsense%%&wsa=zzz')
    const banner = await screen.findByTestId('ws-param-diagnostic')
    expect(banner.textContent).toContain('MALFORMED_WS_PARAM')
    await waitFor(() => expect(screen.getByTestId('record-registry-page')).toBeTruthy())
  })

  it('per-entry keep-valid/drop-bad: registry survives a bad sibling entry', async () => {
    visit('/registry?ws=registry,notakind!&wsa=registry')
    const banner = await screen.findByTestId('ws-param-diagnostic')
    expect(banner).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('record-registry-page')).toBeTruthy())
  })

  it('a valid deep link renders no banner', async () => {
    visit('/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9')
    await waitFor(() => expect(screen.getByTestId('record-host-page')).toBeTruthy())
    expect(screen.queryByTestId('ws-param-diagnostic')).toBeNull()
  })

  it('malformed ws degrades to the storage workspace (storage untouched)', async () => {
    visit('/registry?ws=%%nonsense%%&wsa=zzz')
    await screen.findByTestId('ws-param-diagnostic')
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(JSON.parse(raw!).activeTabId).toBe('run:RUN-OLD')
  })

  it('/literature?view=build stays inert: no ws param, no banner', async () => {
    visit('/literature?view=build')
    await waitFor(() => expect(screen.getByTestId('literature-page')).toBeTruthy())
    expect(screen.queryByTestId('ws-param-diagnostic')).toBeNull()
    expect(window.location.search).toBe('?view=build')
  })
})
