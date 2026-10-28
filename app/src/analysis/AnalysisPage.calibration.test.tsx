/**
 * GC-11 [E] — the /analysis page wiring for the calibration review view:
 *  - D1 client-synthesis door: the rendered useMemo synthesizes ONE
 *    calibration-curve view when the manifest's artifacts STRUCTURALLY pair
 *    a calibration table with a calibration model (content gates, never name
 *    equality — a renamed pair still pairs; an unrelated table+table never
 *    synthesizes, bait #5);
 *  - D3 the ?run= deep-link consumer: the ONE getAnalysisRun fires ONLY when
 *    the param is present, seeds manifest + artifactRefs CLIENT-SIDE from the
 *    fetched payload.outputManifest (zero execute calls — the no-execute
 *    contract holds on a ?run= mount too), and strips the param (one-shot
 *    deepLinkRef, SequencesPage precedent);
 *  - D5 the results provenance badge: quantitative vs uncalibrated,
 *    data-derived (additive chrome — a DNA/generic manifest degrades to
 *    uncalibrated WITHOUT error, bait #13).
 *
 * Mount harness mirrors the no-execute suite (ThemeProvider +
 * OpenTabsProvider + MemoryRouter; the apiClient mock adds getAnalysisRun).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>
  )
}

// --- the structural pair (GC-8 shipped shapes; names deliberately
// calibration-shaped here — the RENAMED-pair leg below proves content
// classification is the authority) ------------------------------------------
const CAL_TABLE = {
  rows: [
    { level: 1, amount: 1, peak_source: 'level_1:row0', response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
    { level: 2, amount: 2, peak_source: 'level_2:row0', response_ratio: 5, fit_point: true, relative_residual: 0, flags: [] },
    { level: 3, amount: 3, peak_source: 'level_3:row0', response_ratio: 9.5, fit_point: true, relative_residual: 33.333333, flags: [] },
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
    { amount: 3, response: 9.5, relative_residual: 33.333333, source_input: 'level_3', source_point_ref: { input_name: 'level_3' } },
  ],
  x_min: 1,
  x_max: 3,
}
/** A plain peak table — the GC-7-shaped non-calibration artifact (bait #5:
 * an unrelated table+table pair must NEVER synthesize a curve). */
const PEAK_TABLE = {
  peaks: [
    { rt: 1.2, area: 100 },
    { rt: 2.4, area: 200 },
  ],
  columns: ['rt', 'area'],
}

const CAL_PARAMS = { model: 'linear', levels: [{ level: 1, fit: true }] }
const CAL_SCHEMA = {
  type: 'object',
  required: ['model'],
  properties: { model: { type: 'string', enum: ['linear', 'quadratic'] } },
}

const CAL_REV = { recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: CAL_SCHEMA } }
const CAL_RUN = { recordId: 'ANR-CAL-9', payload: { id: 'ANR-CAL-9', title: 'TEST calibration run', status: 'succeeded' } }

/** The ?run= landing payload: frozen inputs + parameters + the outputManifest
 * the D3 consumer seeds CLIENT-SIDE (the CompareTraces :103-104 channel). */
function landingPayload(artifacts: unknown[], artifactNames: string[]) {
  return {
    id: 'ANR-CAL-9',
    title: 'TEST calibration run',
    status: 'succeeded',
    revisionRef: { id: 'ANREV-CAL-1' },
    inputs: { level_1: { kind: 'record', id: 'AOUT-SRC-1', type: 'analysis-output-artifact' } },
    parameters: CAL_PARAMS,
    outputManifest: {
      artifacts,
      views: [],
      metrics: [],
      artifactRefs: Object.fromEntries(artifactNames.map((n) => [n, { artifactRecordId: `AOUT-${n}` }])),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [CAL_REV], total: 1 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [CAL_RUN], total: 1 })
})

describe('GC-11 D3 — the ?run= deep-link consumer (one-shot, client-side manifest seed)', () => {
  it('?run= present: ONE getAnalysisRun, the manifest seeds CLIENT-SIDE from payload.outputManifest, zero execute, param stripped', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['calibration_table', 'calibration_model'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))

    // The landed run's composite renders from the CLIENT-SIDE-seeded manifest.
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // Exactly ONE run fetch (the deep-link's own) — the lists are separate.
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith('ANR-CAL-9')
    // NO execute (the PB-CH-5 contract holds on a ?run= mount — the payload
    // already carries the manifest; CompareTraces :103-104 channel).
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    // The one-shot guard stripped the param (replace: back-navigable).
    await waitFor(() => expect(window.location.search).not.toContain('run='))
  })

  it('?run= absent: the mount fires ONLY the two list calls (no run fetch — byte-identical to the no-execute contract)', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()
    await waitFor(() => expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1))
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })
})

describe('GC-11 D1 — the client-synthesis door (structural pairing, never names)', () => {
  it('a calibration table + model pair synthesizes the composite with the equation VERBATIM', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['calibration_table', 'calibration_model'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // The equation string renders verbatim beside the plot (no TS math).
    expect(screen.getByTestId('calibration-equation').textContent).toBe('y = 2.000000x + 1.000000')
  })

  it('a RENAMED pair still pairs (content classification is the authority — bait #5)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'renamed_table_artifact', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'renamed_model_artifact', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['renamed_table_artifact', 'renamed_model_artifact'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
  })

  it('an unrelated table + table pair NEVER synthesizes a curve (bait #5)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'peak_table_a', dataKind: 'table', value: JSON.parse(JSON.stringify(PEAK_TABLE)) },
          { name: 'peak_table_b', dataKind: 'table', value: JSON.parse(JSON.stringify(PEAK_TABLE)) },
        ],
        ['peak_table_a', 'peak_table_b'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).toBeNull(), { timeout: 10000 })
  })
})

describe('GC-11 D5 — the results provenance badge (data-derived, additive chrome)', () => {
  it('a calibration-paired manifest badges QUANTITATIVE', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['calibration_table', 'calibration_model'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('results-provenance-quantitative')).not.toBeNull(), { timeout: 10000 })
    expect(screen.queryByTestId('results-provenance-uncalibrated')).toBeNull()
  })

  it('a plain peak-table manifest badges UNCALIBRATED WITHOUT error (bait #13: views are not blanked)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'peak_table', dataKind: 'table', value: JSON.parse(JSON.stringify(PEAK_TABLE)) },
          { name: 'peak_metric', dataKind: 'metric', value: 42.0 },
        ],
        ['peak_table', 'peak_metric'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('results-provenance-uncalibrated')).not.toBeNull(), { timeout: 10000 })
    expect(screen.queryByTestId('results-provenance-quantitative')).toBeNull()
    // No error arm: the results render (the metric view is present).
    expect(screen.queryByTestId('view-spec-error')).toBeNull()
  })
})
