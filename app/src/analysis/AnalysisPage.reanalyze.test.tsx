/**
 * FAME-2 FIX2 (gate ROUND-TRIP-GATE-1, verdict fix — criterion 3): the
 * generalized re-Analyze door on the /analysis surface.
 *
 * Orch ruling under test: any SUCCEEDED run whose frozen inputs resolve and
 * whose revision declares a parameterSchema gets a re-Analyze parameter-form
 * door (pre-filled from the run's frozen parameters) that creates a NEW run
 * carrying the SAME frozen inputs + the edited parameters, executes it, and
 * lands on it (the shipped recalc mechanism, generalized beyond the
 * calibration composite — capability gate on declared data, never an
 * artifact-kind branch).
 *
 * D1: the submit carries the source run's frozen inputs VERBATIM (the
 *      gate's defect 1 was the create form posting inputs:{} — the door's
 *      own POST must not).
 * D2: the door is reachable for a non-calibration (peak-table) manifest.
 * D3: eligibility is capability-only — no parameterSchema on the revision
 *      (declared data) => no door; empty frozen inputs => no door.
 *
 * Component-level: the apiClient is mocked (no server), per the lane rule
 * (test fixtures use TEST-scoped ids, never lane record ids).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
          {ui}
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

// --- fixtures (TEST-scoped ids; declared-data shapes only) ------------------

const PEAK_SCHEMA = {
  type: 'object',
  properties: {
    area_reject_pa_min: { type: 'number', default: 0 },
    height_reject_pa: { type: 'number', default: 0 },
    method_label: { type: 'string', default: 'integrate-peaks' },
  },
}

const PEAK_REV = { recordId: 'ANREV-TEST-PEAK-1', payload: { id: 'ANREV-TEST-PEAK-1', title: 'TEST peak revision', parameterSchema: PEAK_SCHEMA } }
const PEAK_REV_NOSCHEMA = { recordId: 'ANREV-TEST-NS-1', payload: { id: 'ANREV-TEST-NS-1', title: 'TEST no-schema revision' } }

const PEAK_INPUTS: Record<string, { kind: 'record'; id: string; type: string }> = {
  signal: { kind: 'record', id: 'DREF-TEST-1', type: 'data-reference' },
}

/** The declared {columns, rows} table shape (the FAME-2 C1 shape). */
function peakTableValue(rows: Record<string, unknown>[]) {
  return {
    columns: [{ name: 'peak' }, { name: 'rt_min' }, { name: 'area_pa_min' }, { name: 'saturated' }],
    rows,
  }
}
const PEAK_ROWS = [
  { peak: 1, rt_min: 1.2, area_pa_min: 500, saturated: false },
  { peak: 2, rt_min: 2.4, area_pa_min: 75, saturated: false },
]
const NEW_PEAK_ROWS = [{ peak: 1, rt_min: 1.2, area_pa_min: 1200, saturated: false }]

function peakLandingPayload(overrides?: { artifacts?: unknown[] }) {
  return {
    id: 'ANR-TEST-PEAK-1',
    title: 'TEST peak run',
    status: 'succeeded',
    revisionRef: { id: 'ANREV-TEST-PEAK-1' },
    inputs: JSON.parse(JSON.stringify(PEAK_INPUTS)),
    parameters: { area_reject_pa_min: 0, height_reject_pa: 0 },
    outputManifest: {
      artifacts: overrides?.artifacts ?? [{ name: 'peak_table', dataKind: 'table', value: JSON.parse(JSON.stringify(peakTableValue(PEAK_ROWS))) }],
      views: [{ name: 'Peak table', renderer: 'table', artifact: 'peak_table' }],
      metrics: [],
      artifactRefs: { peak_table: { artifactRecordId: 'AOUT-TEST-TABLE' } },
    },
  }
}

// --- the shared mutable run list (the refresh() after the submit re-lists) --
let runList: Array<{ recordId: string; payload: { id: string; title: string; status: string } }> = [
  { recordId: 'ANR-TEST-PEAK-1', payload: { id: 'ANR-TEST-PEAK-1', title: 'TEST peak run', status: 'succeeded' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  runList = [
    { recordId: 'ANR-TEST-PEAK-1', payload: { id: 'ANR-TEST-PEAK-1', title: 'TEST peak run', status: 'succeeded' } },
  ]
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [PEAK_REV], total: 1 })
  vi.mocked(apiClient.listAnalysisRuns).mockImplementation(async () => ({ runs: runList, total: runList.length }))
})

// --- D2 — the door is reachable for a non-calibration manifest --------------

describe('D2 — the re-Analyze door mounts on the analysis surface for a peak-table manifest', () => {
  it('a landed peak-table run (no calibration pair anywhere) shows the re-Analyze door + the pre-filled threshold control', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-TEST-PEAK-1', payload: peakLandingPayload() },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-PEAK-1'))
    // The manifest seeded CLIENT-SIDE (the deep-link landing) renders the table.
    await waitFor(() => expect(screen.queryByTestId('reanalyze-open')).not.toBeNull(), { timeout: 4000 })
    // The declared-shape table rendered (the C1 arm): the frozen values show.
    expect(screen.getByText('500')).toBeDefined()
    expect(screen.getByText('75')).toBeDefined()
    // The door opens and the form is PRE-FILLED from the run's frozen parameters.
    fireEvent.click(screen.getByTestId('reanalyze-open'))
    const areaInput = screen.getByTestId('reanalyze-params-area_reject_pa_min') as HTMLInputElement
    expect(areaInput.value).toBe('0')
    const heightInput = screen.getByTestId('reanalyze-params-height_reject_pa') as HTMLInputElement
    expect(heightInput.value).toBe('0')
    // No error arm on this surface.
    expect(screen.queryByTestId('reanalyze-error')).toBeNull()
  })
})

// --- D1 — the submit carries the FROZEN inputs + edited parameters -----------

describe('D1 — the door submit creates a NEW run with the frozen inputs VERBATIM + edited parameters, executes it, and lands on it', () => {
  it('raising the threshold in the form -> create( inputs == frozen inputs, parameters edited ) + execute( NEW id ) + the resulting (changed) table renders', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
      if (id === 'ANR-TEST-PEAK-NEW') {
        return {
          record: {
            recordId: 'ANR-TEST-PEAK-NEW',
            payload: peakLandingPayload({ artifacts: [{ name: 'peak_table', dataKind: 'table', value: JSON.parse(JSON.stringify(peakTableValue(NEW_PEAK_ROWS))) }] }),
          },
        } as never
      }
      return { record: { recordId: id, payload: peakLandingPayload() } } as never
    })
    vi.mocked(apiClient.createAnalysisRun).mockImplementation(async () => {
      runList = [...runList, { recordId: 'ANR-TEST-PEAK-NEW', payload: { id: 'ANR-TEST-PEAK-NEW', title: 're-analyze of ANR-TEST-PEAK-1', status: 'succeeded' } }]
      return { success: true, recordId: 'ANR-TEST-PEAK-NEW', run: {} } as never
    })
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({
      success: true,
      recordId: 'ANR-TEST-PEAK-NEW',
      status: 'succeeded',
      manifest: { artifacts: [], views: [], metrics: [] },
      artifactRefs: {},
    } as never)

    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-PEAK-1'))
    await waitFor(() => expect(screen.queryByTestId('reanalyze-open')).not.toBeNull(), { timeout: 4000 })
    fireEvent.click(screen.getByTestId('reanalyze-open'))
    fireEvent.change(screen.getByTestId('reanalyze-params-area_reject_pa_min'), { target: { value: '75' } })
    fireEvent.click(screen.getByTestId('reanalyze-submit'))

    // The create POST carried the FROZEN inputs verbatim (the gate defect 1
    // was inputs:{} — the door must not reproduce it) + the edited threshold.
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as Record<string, unknown>
    expect(body.inputs).toEqual(PEAK_INPUTS)
    expect(body.revisionRef).toEqual({ kind: 'record', id: 'ANREV-TEST-PEAK-1', type: 'analysis-revision' })
    expect(body.parameters).toMatchObject({ area_reject_pa_min: 75, height_reject_pa: 0 })

    // Execute fired on the NEW id ONLY — the source run is never re-executed
    // (append-only: the source run's record + manifest are untouched).
    await waitFor(() => expect(apiClient.executeAnalysisRun).toHaveBeenCalledTimes(1))
    expect(apiClient.executeAnalysisRun).toHaveBeenCalledWith('ANR-TEST-PEAK-NEW')
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalledWith('ANR-TEST-PEAK-1')

    // The landing: the NEW run is selected (the shared landing fetch) and its
    // (changed) peak table renders — the visible table change the criterion
    // asks for.
    await waitFor(() => expect(apiClient.getAnalysisRun).toHaveBeenCalledWith('ANR-TEST-PEAK-NEW'), { timeout: 4000 })
    await waitFor(() => expect(screen.getByText('1200')).toBeDefined(), { timeout: 4000 })
    expect(screen.queryByText('500')).toBeNull()
  })
})

// --- D3 — capability gating on DECLARED data, never artifact kind ------------

describe('D3 — eligibility is capability-only (declared data)', () => {
  it('NO door when the run revision declares no parameterSchema (declared-data gate, not a kind name)', async () => {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [PEAK_REV_NOSCHEMA], total: 1 })
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-PEAK-1',
        payload: { ...peakLandingPayload(), revisionRef: { id: 'ANREV-TEST-NS-1' } },
      },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-PEAK-1'))
    // Wait for the manifest landing (the table proves it landed), then the door must be absent.
    await waitFor(() => expect(screen.queryByText('500')).not.toBeNull(), { timeout: 4000 })
    await waitFor(() => expect(screen.queryByTestId('reanalyze-open')).toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('reanalyze')).toBeNull()
  })

  it('NO door when the run carries no frozen inputs (a re-Analyze cannot pin inputs it does not have)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-PEAK-1',
        payload: { ...peakLandingPayload(), inputs: {} },
      },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-PEAK-1'))
    await waitFor(() => expect(screen.queryByText('500')).not.toBeNull(), { timeout: 4000 })
    await waitFor(() => expect(screen.queryByTestId('reanalyze-open')).toBeNull(), { timeout: 4000 })
  })

  it('a calibration manifest STILL gets the door (generalization, not replacement) — the composite footer and the surface door coexist', async () => {
    // The GC-8 shipped calibration pair (compact shapes from the page's own
    // calibration suite — content gates, never names).
    const CAL_TABLE = {
      rows: [
        { level: 1, amount: 1, peak_source: 'level_1:row0', response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
        { level: 2, amount: 2, peak_source: 'level_2:row0', response_ratio: 5, fit_point: true, relative_residual: 0, flags: [] },
      ],
      columns: ['level', 'amount', 'peak_source', 'response_ratio', 'fit_point', 'relative_residual', 'flags'],
      amount_unit: 'ng/uL',
    }
    const CAL_MODEL = {
      model: 'linear',
      equation: 'y = 2.000000x + 1.000000',
      coefficients: { slope: 2, intercept: 1 },
      statistic_name: 'weighted_r_squared',
      statistic_value: 0.999999,
      statistic_definition: 'weighted R^2 over the fitted response quantity',
      residual_basis: 'relative residual on the fitted response quantity, percent',
      response_quantity: 'area_ratio',
      fit_points: [
        { amount: 1, response: 3, relative_residual: 0, source_input: 'level_1', source_point_ref: { input_name: 'level_1' } },
        { amount: 2, response: 5, relative_residual: 0, source_input: 'level_2', source_point_ref: { input_name: 'level_2' } },
      ],
      x_min: 1,
      x_max: 2,
    }
    const CAL_SCHEMA = { type: 'object', properties: { model: { type: 'string', default: 'linear' } } }
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({
      revisions: [{ recordId: 'ANREV-TEST-CAL-1', payload: { id: 'ANREV-TEST-CAL-1', title: 'TEST cal revision', parameterSchema: CAL_SCHEMA } }],
      total: 1,
    })
    runList = [{ recordId: 'ANR-TEST-CAL-1', payload: { id: 'ANR-TEST-CAL-1', title: 'TEST calibration run', status: 'succeeded' } }]
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-TEST-CAL-1',
        payload: {
          id: 'ANR-TEST-CAL-1',
          title: 'TEST calibration run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-TEST-CAL-1' },
          inputs: { level_1: { kind: 'record', id: 'AOUT-TEST-1', type: 'analysis-output-artifact' } },
          parameters: { model: 'linear' },
          outputManifest: {
            artifacts: [
              { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
              { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
            ],
            views: [],
            metrics: [],
            artifactRefs: { calibration_table: { artifactRecordId: 'AOUT-TEST-CALT' }, calibration_model: { artifactRecordId: 'AOUT-TEST-CALM' } },
          },
        },
      },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-TEST-CAL-1'))
    // Both the synthesized composite (shipped behavior) and the generalized
    // surface door are present — the door is capability-gated, kind-agnostic.
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('reanalyze-open')).not.toBeNull()
  })
})

// --- reviewer-bait pre-emption: no hardcoded ids / artifact-kind names -------

describe('hardcode grep pin — zero record ids or artifact-kind names in the new product files', () => {
  it('reanalyze.ts + ReanalyzeDoor.tsx name no record ids, lane ids, or artifact property names', () => {
    for (const f of ['src/analysis/reanalyze.ts', 'src/analysis/ReanalyzeDoor.tsx']) {
      const source = readFileSync(f, 'utf8')
      for (const banned of ['ANR-', 'ANREV-', 'AOUT-', 'DREF-', 'USR-', 'ENG-', 'RES35077', 'COUNTRYSIDE', 'peak_table', 'calibration_table', 'signal_view', 'FAME']) {
        expect(source, `${f} must not contain ${banned}`).not.toContain(banned)
      }
    }
  })
})
