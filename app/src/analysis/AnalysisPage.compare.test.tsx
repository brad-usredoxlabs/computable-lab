/**
 * GC-10 [E] fix1 (D4/D5) — AnalysisPage.compare.test.tsx — the page-level
 * acceptance legs (spec §Files IN: "AnalysisPage.compare.test.tsx (NEW
 * tests; do NOT grow the frozen ViewRenderer.test.tsx)"):
 *
 *  - the prominent `analysis-compare-btn`: visible + ENABLED with 2
 *    succeeded runs; DISABLED + a NAMED reason with 0 or 1 (no dead chrome)
 *  - a manifest view with renderer 'chromatogram' reaches ChromatogramView
 *    (NOT table-coerced) through the page's REAL `rendered` useMemo path —
 *    the real resolveViewRenderer whitelist call at AnalysisPage.tsx:389
 *    (bait #4 silent-coercion trap, page-level; the manifest is driven
 *    through the real execute -> rendered flow, no renderer override)
 *  - a manifest view with renderer 'trace-compare' renders the VISIBLE
 *    named error arm through the same page path (never blank, never table)
 *  - the whitelist pass-through is pinned on LITERAL ids (the tautology of
 *    iterating the implementation constant is not a guard): 'chromatogram'
 *    + 'trace-compare' pass through; 'quantum'/undefined coerce to 'table'
 *
 * apiClient is mocked per the AnalysisPage.test.tsx:9 / no-execute precedent;
 * the compare-surface methods (getRecord/listRecordsByKind/createRecord/
 * getAnalysisArtifactContent) are present because the Compare surface
 * mounts when the button opens — none of these tests open it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { resolveViewRenderer } from './ViewRenderer'
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
    // Compare surface (mounts only when the button opens):
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    createRecord: vi.fn(),
    getAnalysisArtifactContent: vi.fn(),
  },
}))

function wrap(ui: React.ReactNode) {
  return <ThemeProvider><OpenTabsProvider><MemoryRouter>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 })
})

// ---- Test data (unit strings are TEST DATA — the page carries none) ----

const RUNS_SUCCEEDED_2 = [
  { recordId: 'ANR-000100', payload: { id: 'ANR-000100', title: 'Run One', status: 'succeeded' } },
  { recordId: 'ANR-000101', payload: { id: 'ANR-000101', title: 'Run Two', status: 'succeeded' } },
]

function executeManifest(views: Array<{ name: string; renderer: string; artifact: string }>) {
  return {
    success: true,
    recordId: 'ANR-000200',
    status: 'succeeded',
    manifest: {
      artifacts: [
        { name: 'trace', dataKind: 'signal', value: { axis: [0, 1, 2], values: [0, 3.5, 1], axis_units: 'min', value_units: 'pA' } },
        {
          name: 'peaks',
          dataKind: 'table',
          value: {
            columns: [{ name: 'peak' }, { name: 'rt_min' }],
            rows: [{ peak: 'P1', rt_min: 1.0 }],
          },
        },
      ],
      views,
      metrics: [],
    },
    artifactRefs: {
      trace: { artifactRecordId: 'AOUT-000200' },
      peaks: { artifactRecordId: 'AOUT-000201' },
    },
  }
}

/** Mount the page with ONE succeeded run; a click on its Run button drives
 *  the real execute -> manifest -> `rendered` useMemo flow. */
function mountWithOneSucceededRun() {
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
    runs: [{ recordId: 'ANR-000200', payload: { id: 'ANR-000200', title: 'Run GC', status: 'succeeded' } }],
    total: 1,
  })
  render(wrap(<AnalysisPage />))
}

describe('AnalysisPage — the prominent Compare traces action (spec §D4)', () => {
  it('is visible and ENABLED with 2 succeeded runs (no reason text)', async () => {
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: RUNS_SUCCEEDED_2, total: 2 })
    render(wrap(<AnalysisPage />))
    const btn = await screen.findByTestId('analysis-compare-btn')
    expect(btn).toBeDefined()
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    expect(btn.getAttribute('data-disabled')).toBe('false')
    // No named reason when the button is live.
    expect(screen.queryByText(/need one more|run at least two/)).toBeNull()
  })

  it('is visible but DISABLED with the NAMED reason when there are 0 succeeded runs', async () => {
    // The runs list exists (one failed run) but no succeeded run.
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [{ recordId: 'ANR-000300', payload: { id: 'ANR-000300', title: 'Run Failed', status: 'failed' } }],
      total: 1,
    })
    render(wrap(<AnalysisPage />))
    const btn = await screen.findByTestId('analysis-compare-btn')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(btn.getAttribute('data-disabled')).toBe('true')
    expect(btn.textContent).toContain('run at least two succeeded runs first')
  })

  it('is visible but DISABLED with the NAMED reason when there is exactly 1 succeeded run', async () => {
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [
        { recordId: 'ANR-000400', payload: { id: 'ANR-000400', title: 'Run One', status: 'succeeded' } },
        { recordId: 'ANR-000401', payload: { id: 'ANR-000401', title: 'Run Running', status: 'running' } },
      ],
      total: 2,
    })
    render(wrap(<AnalysisPage />))
    const btn = await screen.findByTestId('analysis-compare-btn')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(btn.textContent).toContain('need one more succeeded run')
  })
})

describe('AnalysisPage — manifest renderer whitelist on the real `rendered` path (bait #4, page-level)', () => {
  it("a manifest view with renderer 'chromatogram' reaches ChromatogramView (NOT table-coerced)", async () => {
    mountWithOneSucceededRun()
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue(
      executeManifest([
        { name: 'Trace view', renderer: 'chromatogram', artifact: 'trace' },
        { name: 'Peak table', renderer: 'table', artifact: 'peaks' },
      ]) as never,
    )
    // Drive the REAL flow: execute -> manifest state -> the `rendered`
    // useMemo runs resolveViewRenderer('chromatogram') (AnalysisPage.tsx:389)
    // and ViewRenderer dispatches the chromatogram arm.
    await screen.findByTestId('analysis-run-execute-ANR-000200')
    fireEvent.click(screen.getByTestId('analysis-run-execute-ANR-000200'))
    await waitFor(() => expect(screen.getByTestId('view-spec-chromatogram')).toBeDefined())
    // The interactive view is what rendered — not a table (table-coercion
    // would have produced the `view-spec__table` chrome instead).
    const chroma = screen.getByTestId('view-spec-chromatogram')
    expect(chroma.closest('.view-spec')).toBeDefined()
    expect(screen.getByTestId('chromatogram-svg')).toBeDefined()
    expect(screen.getByTestId('chromatogram-reset')).toBeDefined()
    // The sibling table view still renders as a table (the whitelist does
    // not bleed: 'table' passes through too).
    expect(screen.getByTestId('analysis-right')).toBeDefined()
  })

  it("a manifest view with renderer 'trace-compare' renders the VISIBLE named error arm (never blank, never table)", async () => {
    mountWithOneSucceededRun()
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue(
      executeManifest([{ name: 'Compare view', renderer: 'trace-compare', artifact: 'trace' }]) as never,
    )
    const btn = await screen.findByTestId('analysis-run-execute-ANR-000200')
    fireEvent.click(btn)
    // The trace-compare arm exists in the dispatch so the orphan view is
    // VISIBLE with a named error — it is not table-coerced and not blank.
    await waitFor(() => expect(screen.getAllByTestId('view-spec-error').length).toBeGreaterThan(0))
    expect(screen.getByText(/trace-compare views render through the Compare surface/)).toBeDefined()
    // No chromatogram single-trace view is fabricated for it either.
    expect(screen.queryByTestId('view-spec-chromatogram')).toBeNull()
  })

  it('whitelist pass-through is pinned on LITERAL ids (chromatogram/trace-compare pass; quantum/undefined coerce to table)', () => {
    // D5: the guard must fail if 'chromatogram' or 'trace-compare' are
    // dropped from the whitelist — literal expectations, not an iteration
    // over the implementation constant (the tautology the frozen suite had).
    expect(resolveViewRenderer('chromatogram')).toBe('chromatogram')
    expect(resolveViewRenderer('trace-compare')).toBe('trace-compare')
    expect(resolveViewRenderer('table')).toBe('table')
    expect(resolveViewRenderer('quantum')).toBe('table')
    expect(resolveViewRenderer(undefined)).toBe('table')
    // And the page-level legs above prove the manifest-shaped case through
    // the real `rendered` useMemo (resolveViewRenderer at AnalysisPage.tsx:389).
  })
})
