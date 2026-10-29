/**
 * GC-13 gate-fix2 (adversarial review cycle-1, defect 4) — APP-ROUTE-LEVEL
 * pin: /gc-run/:runId resolves to GcEvidenceRunPage, NOT the Run·Design
 * workspace (/runs/:runId — RunWorkspacePage, the plate-design canvas).
 *
 * Why this file exists (the defect): GcEvidenceRunPage.test.tsx's isolated
 * render could pin the presence of the GC evidence section, but its two
 * text-absence pins ('Click to choose labware' / 'No protocol attached'
 * ABSENT) were VACUOUS — the isolated page cannot render the
 * RunWorkspacePage markup under ANY input, so the assertions could never
 * fail. The D5 claim — the reciprocal claim -> run link no longer lands on
 * the plate canvas — is a ROUTING property, and it is pinned HERE, at the
 * App-route level, mounting the REAL router (App.tsx's /gc-run/:runId
 * route, real DeferredRoute, real GcEvidenceRunPage):
 *
 *  - /gc-run/<ANR> mounts the GC evidence landing (page root testid
 *    PRESENT, kind chip PRESENT, the evidence section IS the landing);
 *    the Run·Design workspace is NOT the landing — the route module's
 *    run-workspace marker testid is ABSENT by NAME (not by a text string
 *    that only that page could render);
 *  - /runs/<ANR> still lands the Run·Design workspace (the routes are
 *    DISTINCT — the GC landing did not swallow the run route, and the
 *    run route did not swallow the GC landing).
 *
 * The only mocked module is the Run·Design page itself (a stub that
 * renders the page's OWN nav-pane testid — run-nav-pane, the real
 * RunNavPane testid the page renders): the run-workspace stack (deck,
 * event editor, surface chat, protocol loader) is out of scope for a
 * routing pin and its mount fetches are not this pin's subject. The
 * routing decision under test — which route element the URL resolves to —
 * runs on the REAL router with the REAL route table.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// The Slot import pulls the cla-ai-overlay VIRTUAL module (a pre-existing
// trunk suite-load debt: 'virtual:cla-ai-overlay' is not resolvable in the
// vitest transform). Mock the extensions module the same way App.test.tsx
// does — the Slot route (/event-editor/fixit) is not this pin's subject,
// and the routing table under test (App.tsx) keeps its real Slot usage in
// production.
vi.mock('../../extensions', () => ({
  Slot: () => null,
}))

// House pattern from App.test.tsx, in the stateless form: App's
// BrowserRouter reads window.location, which in jsdom is the vitest
// environment URL ('/' at localhost:5174) — that would route to
// HomeRedirect -> /splash before this pin could visit anything. Swap
// BrowserRouter for a MemoryRouter seeded from window.location.pathname
// at mount. The factory is deliberately STATELESS (no globalThis
// __START_URL__): vitest's threads pool runs several files in one
// worker process, where a file-scoped global would leak across files —
// a stateless factory reads only this file's own jsdom URL, which
// visit() seeds with history.replaceState before each render. EVERYTHING
// else in the router (Routes/Route/useNavigate — the actual routing
// decision under test) stays REAL.
vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => {
      const url = window.location.pathname
      return <real.MemoryRouter initialEntries={[url]}>{children}</real.MemoryRouter>
    },
  }
})

vi.mock('../RunWorkspacePage', () => ({
  // The Run·Design workspace (the plate canvas — the D5 defect's landing
  // target). Stubbed to its OWN identity markers: run-nav-pane — the
  // real RunNavPane testid the page renders inside RunWorkspaceShell
  // (the absence pin is BY NAME from the route module, not a text string
  // only that page could render) — plus a stub marker so the /runs/ pin
  // below can positively assert the route landed. The deck / event-
  // editor / surface-chat stack is out of scope for this routing pin.
  RunWorkspacePage: () => (
    <div data-testid="run-workspace-stub">
      <div data-testid="run-nav-pane" />
    </div>
  ),
}))
vi.mock('../RunProtocolStepsLoader', () => ({
  RunProtocolStepsLoader: () => null,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // GcEvidenceRunPage's kind gate (the page's one mount read).
    getAnalysisRun: vi.fn().mockResolvedValue({
      record: { recordId: 'ANR-GATEFIX2', payload: { kind: 'analysis-run', id: 'ANR-GATEFIX2', title: 't', status: 'succeeded' } },
    }),
    // App providers' mount reads (session sync / surface indicator) —
    // inert resolutions; the routing decision under test needs none of
    // their data.
    getSession: vi.fn().mockResolvedValue({ session: { tabs: [], activeTabId: null, updatedAt: new Date(0).toISOString() } }),
    // the session sync's debounced PUSH (the App's OpenTabs/SessionSync
    // pair pushes the tab doc after any tab mutation — inert here; the
    // routing decision under test needs no session data).
    putSession: vi.fn().mockResolvedValue({ session: { tabs: [], activeTabId: null, updatedAt: new Date(0).toISOString() } }),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

import { App } from '../../App'

const ANR = 'ANR-GATEFIX2'

function visit(url: string) {
  // Seed the jsdom URL (the stateless mock factory above reads
  // window.location.pathname at mount — see the react-router-dom mock).
  window.history.replaceState({}, '', url)
  return render(<App />)
}

afterEach(() => {
  cleanup()
})

describe('GC-13 (gate-fix2, defect 4) — /gc-run/:runId at the App-route level (the real router)', () => {
  it('/gc-run/<ANR> lands the GC evidence surface — the Run·Design workspace is NOT the landing', async () => {
    visit(`/gc-run/${ANR}`)
    // The REAL /gc-run/:runId route resolved to GcEvidenceRunPage: the
    // page root testid is PRESENT (the GC evidence surface IS the
    // landing), and the verified kind chip renders (defect 1's positive
    // side, pinned through the real route). findBy (not a synchronous
    // getBy): the page is behind App's lazy() boundary — the read and
    // its re-render settle across task boundaries after the mount.
    const page = await screen.findByTestId('gc-evidence-run-page')
    expect(page).toBeDefined()
    expect(await screen.findByTestId('gc-evidence-run-kind')).toHaveTextContent('analysis-run')
    // The D5 claim, by NAME from the route module: the Run·Design
    // workspace (RunWorkspacePage — the plate-design canvas) is NOT the
    // landing for an analysis-run id on /gc-run/. Its nav-pane marker
    // (run-nav-pane — the real RunNavPane testid the page renders) is
    // absent: the route table handed this URL to the GC evidence route,
    // not to /runs/:runId.
    expect(screen.queryByTestId('run-nav-pane')).toBeNull()
    expect(screen.queryByTestId('run-workspace-stub')).toBeNull()
    // And it is not the 404 catch-all either — the route exists.
    expect(screen.queryByTestId('not-found-route')).toBeNull()
  })

  it('/runs/<ANR> still lands the Run·Design workspace — the routes are distinct (the GC landing did not swallow the run route)', async () => {
    visit(`/runs/${ANR}`)
    // The real /runs/:runId route still resolves to RunWorkspacePage —
    // the stub renders its marker (the run route is intact), and the GC
    // evidence landing is NOT what the run route serves.
    expect(await screen.findByTestId('run-workspace-stub')).toBeDefined()
    expect(screen.queryByTestId('gc-evidence-run-page')).toBeNull()
  })
})
