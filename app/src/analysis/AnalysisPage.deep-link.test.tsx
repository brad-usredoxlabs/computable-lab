/**
 * Reachability fix — the `?run=` deep link resolves by FETCHING the run by id.
 *
 * The live defect (measured in the browser gate): the deep-link effect
 * gated on LIST MEMBERSHIP — a run past the old 50-run cap was silently
 * dropped (no-op, empty state) even though `GET /api/analysis-runs/:id`
 * returns 200 for any run. The fix resolves `?run=` by fetching the run by
 * id (the SHARED landing — selectRun, FIX2 M1), independent of whether the
 * run appears in the loaded list page.
 *
 * Pinned here (RED-first):
 *  - a `?run=` id ABSENT from the list page still lands: exactly ONE
 *    getAnalysisRun(id), the run's title renders, the param is stripped
 *    (one-shot deepLinkDoneRef discipline, SequencesPage precedent);
 *  - an id PRESENT in the list page still lands the same way (the shared
 *    landing is unchanged — no new fetch path);
 *  - the mount with NO `?run=` param still fires ZERO getAnalysisRun calls
 *    (the no-execute/mount-accounting contract holds).
 *
 * Generic fixture ids only (no live run ids); harness mirrors
 * AnalysisPage.calibration.test.tsx (ThemeProvider +
 * OpenTabsProvider + MemoryRouter; the RunParamProbe asserts the param
 * strip against the router's own location).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listAnalysisRevisions: vi.fn(),
    listAnalysisRuns: vi.fn(),
    createAnalysisRevision: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getAnalysisRun: vi.fn(),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    draftAnalysisRevision: vi.fn(),
    promoteAnalysisArtifact: vi.fn(),
  },
}))

function wrap(ui: React.ReactNode, initialPath = '/analysis') {
  return (
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <RunParamProbe />
          {ui}
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

/** The ROUTER's own `run` param — the only honest way to assert the strip
 * (MemoryRouter never touches window.location). Empty = stripped. */
function RunParamProbe() {
  const [sp] = useSearchParams()
  return <span data-testid="run-param-probe">{sp.get('run') ?? ''}</span>
}

// Two runs IN the list page (newest-first, the post-fix server order),
// and one run BEYOND the list page (the deep-link case the defect killed).
// Generic fixture ids — the page resolves by string equality (fetch-by-id),
// so no id shape is assumed; the deep id is deliberately NOT in the list.
const DEEP_ID = 'ANR-DEEP-A'
const IN_LIST_A = 'ANR-LIST-A'
const IN_LIST_B = 'ANR-LIST-B'

const listRuns = [
  { recordId: IN_LIST_B, payload: { id: IN_LIST_B, title: 'List run B', status: 'succeeded' } },
  { recordId: IN_LIST_A, payload: { id: IN_LIST_A, title: 'List run A', status: 'succeeded' } },
]

function runRecord(id: string, title: string) {
  return {
    record: {
      recordId: id,
      payload: {
        id,
        title,
        status: 'succeeded',
        revisionRef: { id: 'ANREV-000001' },
        inputs: {},
      },
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: listRuns, total: 3 })
  vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
    const titles: Record<string, string> = {
      [DEEP_ID]: 'Deep link run beyond the page',
      [IN_LIST_A]: 'List run A',
      [IN_LIST_B]: 'List run B',
    }
    return runRecord(id, titles[id] ?? id)
  })
})

describe('the ?run= deep link fetches the run by id (reachability)', () => {
  it('?run= an id ABSENT from the list page still lands: ONE getAnalysisRun(id), title renders, param stripped', async () => {
    render(wrap(<AnalysisPage />, `/analysis?run=${DEEP_ID}`))

    await waitFor(() => expect(screen.getByText('Deep link run beyond the page')).toBeDefined(), { timeout: 10000 })
    // The fetch IS the resolution — exactly once, by the deep-link id.
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith(DEEP_ID)
    // No execute (the landed run's stored manifest is the channel).
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    // One-shot: the param is stripped.
    await waitFor(() => expect(screen.getByTestId('run-param-probe').textContent).toBe(''))
  })

  it('?run= an id PRESENT in the list page lands through the SAME shared landing (unchanged behaviour)', async () => {
    render(wrap(<AnalysisPage />, `/analysis?run=${IN_LIST_A}`))

    // The landed title renders (the right pane title — the list button also
    // carries it, so match by presence, not uniqueness).
    await waitFor(() => expect(screen.getAllByText('List run A').length).toBeGreaterThanOrEqual(1), { timeout: 10000 })
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith(IN_LIST_A)
    await waitFor(() => expect(screen.getByTestId('run-param-probe').textContent).toBe(''))
  })

  it('no ?run= param: the mount fires ZERO getAnalysisRun (mount accounting holds)', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1)
  })

  // FAME-8 B5: a ?run= landing seeds the Run-method select from the landed
  // run's revisionRef (the shared selectRun door). The fixture run's revision
  // (ANREV-000001) is ABSENT from the (empty) fetched revision list — the
  // select must still show a selected option with the revision id, never
  // "Select method…".
  it('?run= landing seeds the method select with the run revision (B5 label retention)', async () => {
    render(wrap(<AnalysisPage />, `/analysis?run=${DEEP_ID}`))
    const select = (await screen.findByTestId('analysis-run-rev')) as HTMLSelectElement
    await waitFor(() => expect(screen.getByText('Deep link run beyond the page')).toBeDefined(), { timeout: 10000 })
    expect(select.value).toBe('ANREV-000001')
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }))
    expect(options).toContainEqual({ value: 'ANREV-000001', label: 'ANREV-000001' })
  })
})
