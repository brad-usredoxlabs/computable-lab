// @vitest-environment jsdom
/**
 * L2-ED-RESULTS-MODE-UNREACHABLE-1 unit u1resultsroute — RED/GREEN pin for the
 * run editor results route.
 *
 * The editor's own mode switcher (LabwareEventEditor.tsx:6267) navigates to
 * `/runs/<runId>/editor/<mode>` for every mode, but App.tsx declared no such
 * route, so `/runs/<id>/editor/results` fell through to the `path="*"` 404
 * catch-all (NotFoundRoute). This unit registers the ONE missing route and the
 * editor's results mode becomes reachable from the run surface.
 *
 * This test renders the REAL App route table (the whole <App/>, with the heavy
 * page chunk mocked to a trivial marker so only the ROUTE DECLARATION is under
 * test) and asserts that the editor modes land on the SAME component that
 * already wraps LabwareEventEditor (LabwareEditorRoutePage), NOT the 404
 * catch-all. The Attach tab itself is already written and is NOT touched here
 * (Presentation != execution — the route is the reachability half, not a copy
 * of the capability).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// The fix-it slot route (not this pin); not resolvable in the vitest transform.
vi.mock('../extensions', () => ({ Slot: () => null }))

// The editor's results/readouts/biology all resolve to the SAME third mount
// point of LabwareEventEditor (App.tsx's /labware-editor precedent). Mock the
// page chunk to a marker so only the route table is asserted — the real page
// stays the SAME component, no new copy is introduced.
vi.mock('../graph/LabwareEditorRoutePage', () => ({
  LabwareEditorRoutePage: () => (
    <div data-testid="labware-editor-route-page">editor-page</div>
  ),
}))

// Trunk idiom (App.test.tsx:58): BrowserRouter -> MemoryRouter seeded from a
// per-test start URL, so we can drive the real route table at an exact path.
vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: ReactNode }) => {
      const url = (globalThis as unknown as { __START_URL__?: string }).__START_URL__ ?? '/'
      return <real.MemoryRouter initialEntries={[url]}>{children}</real.MemoryRouter>
    },
  }
})

vi.mock('../shell/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Inert 404 for every fetch (the App's SessionSync BOOT pull) so the test is
// hermetic and never touches a live server.
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: 'no stub' }), { status: 404, headers: { 'content-type': 'application/json' } }))
vi.stubGlobal('fetch', fetchMock)

import { App } from '../App'

function visit(url: string) {
  ;(globalThis as unknown as { __START_URL__?: string }).__START_URL__ = url
  return render(<App />)
}

afterEach(() => {
  cleanup()
})

describe('u1resultsroute — /runs/:runId/editor/:mode reaches the editor, not the 404 catch-all', () => {
  // The one URL Brad hit (no attach control for run data): the editor results
  // mode must render the SAME editor page, never the not-found route.
  it('lands on the editor page, not NotFoundRoute, at /runs/RUN-1/editor/results', async () => {
    visit('/runs/RUN-1/editor/results')
    await screen.findByTestId('labware-editor-route-page', undefined, { timeout: 3000 })
    expect(screen.queryByTestId('not-found-route')).toBeNull()
  })

  // AC2: no mode in the switcher may dead-end on the catch-all.
  for (const mode of ['readouts', 'biology', 'plan', 'execution', 'run']) {
    it(`lands on the editor page, not NotFoundRoute, at /runs/RUN-1/editor/${mode}`, async () => {
      visit(`/runs/RUN-1/editor/${mode}`)
      await screen.findByTestId('labware-editor-route-page', undefined, { timeout: 3000 })
      expect(screen.queryByTestId('not-found-route')).toBeNull()
    })
  }

  // AC4: a cold load carrying ?id=<eventGraphId> must survive (the search
  // string is preserved on navigation) and still reach the editor, not 404.
  it('lands on the editor page, not NotFoundRoute, at /runs/RUN-1/editor/results?id=EG-1', async () => {
    visit('/runs/RUN-1/editor/results?id=EG-1')
    await screen.findByTestId('labware-editor-route-page', undefined, { timeout: 3000 })
    expect(screen.queryByTestId('not-found-route')).toBeNull()
  })
})
