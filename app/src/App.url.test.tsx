/**
 * UCX-2 (RED) — router-level deep-link pins (d): a malformed ?ws= degrades to
 * the storage/default workspace WITH a visible banner (data-testid
 * "ws-param-diagnostic"), never a crash, and per-entry keep-valid/drop-bad.
 *
 * UCX2-D1 (RED) — the banner's PLACEMENT: the shell (.cl-app, AppShell.css) is
 * position:fixed inset:0, so a banner rendered into the bare body flow lands
 * UNDER the fixed navbar (orch adjudication l2t1330: rect [16,8,635,21],
 * elementFromPoint at its center returns .global-navbar__brand-text — the user
 * sees nothing). The placement post-condition pinned here: the banner carries
 * the fixed-position offset below the workspace header (navbar + tab strip,
 * via the layout tokens) and a z-index above the content layer yet below the
 * navbar menu's z-index 40 (GlobalNavbar.css). jsdom expresses this exactly
 * through the inline style declaration — no layout engine needed.
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

  // UCX2-D1 (orch adjudication l2t1330): the banner was DOM-present yet
  // OCCLUDED — the shell is position:fixed inset:0 and the workspace header
  // (GlobalNavbar + tab strip) paints over the body-flow strip the bare
  // <TabUrlSync/> sibling rendered into. Placement post-condition, expressible
  // in jsdom via the inline style declaration: the banner is position:fixed,
  // offset BELOW the workspace header via the layout tokens (navbar height +
  // tab strip height), spans the viewport width, and carries a z-index above
  // the content layer yet below the navbar menu's z-index 40.
  it('UCX2-D1: the malformed-ws banner is placed below the fixed navbar, not under it', async () => {
    visit('/registry?ws=%%nonsense%%&wsa=zzz')
    const banner = await screen.findByTestId('ws-param-diagnostic')
    expect(banner.style.position, 'banner must be position:fixed (shell is a fixed overlay grid — body-flow placement lands under the navbar)').toBe('fixed')
    expect(banner.style.top, 'banner top must offset below the workspace header via the layout tokens').toContain('var(--cl-globalnav-height')
    expect(banner.style.top).toContain('var(--cl-tabstrip-height')
    expect(banner.style.left).toBe('0px')
    expect(banner.style.right).toBe('0px')
    const z = Number(banner.style.zIndex)
    expect(Number.isFinite(z), 'banner must carry an explicit z-index').toBe(true)
    expect(z, 'banner must sit above content (topbar__surface chip z-index 5) and below the navbar menu (z-index 40)').toBeGreaterThan(5)
    expect(z).toBeLessThan(40)
    // Copy and dismissal semantics are FROZEN — the placement fix must not touch them.
    expect(banner.textContent).toContain('MALFORMED_WS_PARAM')
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy()
  })
})
