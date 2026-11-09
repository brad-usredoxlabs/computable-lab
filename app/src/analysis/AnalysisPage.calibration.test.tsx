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
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

/** FIX1 O1: a tiny probe that renders the ROUTER's own `run` search param
 * (via useSearchParams inside the MemoryRouter) — the only way to assert the
 * param strip (window.location is jsdom's default and never moves under
 * MemoryRouter; the O1 vacuous-assertion defect). Empty textContent = the
 * param is absent (stripped). */
function RunParamProbe() {
  const [sp] = useSearchParams()
  return <span data-testid="run-param-probe">{sp.get('run') ?? ''}</span>
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
    // The one-shot guard stripped the param (replace: back-navigable) —
    // asserted against the ROUTER'S OWN location via the probe (FIX1 O1:
    // MemoryRouter keeps the URL in memory; window.location is jsdom's
    // default and is EMPTY regardless, so the shipped assertion proved
    // nothing). The probe is empty ONLY when the router location no longer
    // carries ?run=.
    await waitFor(() => expect(screen.getByTestId('run-param-probe').textContent).toBe(''))
    expect(screen.queryByTestId('run-param-probe')).not.toHaveTextContent('ANR-CAL-9')
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

/** A manifest that ALREADY carries a persisted `calibration-curve` view
 * (the persisted-record door) — for the O3 duplicate-composite RED leg. */
function landingPayloadWithPersistedCurve(artifacts: unknown[], artifactNames: string[]) {
  const base = landingPayload(artifacts, artifactNames)
  const firstArtifactName = artifactNames[0]
  return {
    ...base,
    outputManifest: {
      ...base.outputManifest,
      views: [
        { name: 'Persisted calibration curve', renderer: 'calibration-curve', artifact: firstArtifactName, bindings: { modelArtifact: artifactNames[1] } },
      ],
    },
  }
}

describe('GC-11 FIX1 D3 — a run executed FROM the page synthesizes the composite (no two empty tables)', () => {
  it('execute a run from the list -> the calibration-curve composite renders (the shipped execute set activeRunId + manifest but NEVER activeRun, so the synthesis door stayed closed and the results were two raw "No rows" tables)', async () => {
    // The run list already holds a succeeded cal run (the Run button is
    // enabled). Clicking it drives the REAL execute -> selectRun -> activeRun
    // -> `rendered` synthesis path.
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [{ recordId: 'ANR-CAL-9', payload: { id: 'ANR-CAL-9', title: 'TEST calibration run', status: 'succeeded' } }],
      total: 1,
    })
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({
      success: true,
      recordId: 'ANR-CAL-9',
      status: 'succeeded',
      manifest: {
        artifacts: [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        views: [],
        metrics: [],
      },
      artifactRefs: { calibration_table: { artifactRecordId: 'AOUT-calibration_table' }, calibration_model: { artifactRecordId: 'AOUT-calibration_model' } },
    } as never)
    // The FIX1 selectRun(runId) inside execute fetches the run's OWN payload
    // (revisionRef + frozen inputs + parameters) to set activeRun — the
    // composite's footer needs it. (In the shipped code this fetch never
    // fired from execute, so activeRun stayed null and the synthesis gated.)
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayload(
        [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['calibration_table', 'calibration_model'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />))
    const executeBtn = await screen.findByTestId('analysis-run-execute-ANR-CAL-9')
    fireEvent.click(executeBtn)
    // The composite renders (the D1 synthesis door fires for a run executed
    // from the page) — the equation verbatim, never two empty tables.
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    expect(screen.getByTestId('calibration-equation').textContent).toBe('y = 2.000000x + 1.000000')
    // execute fired once; the selectRun fetch (the FIX1 wiring) fired too.
    expect(apiClient.executeAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith('ANR-CAL-9')
  })
})

describe('GC-11 FIX1 D2 — the recalc completion is wired (onRecalcDone -> selectRun + refresh)', () => {
  it('a completed recalc SELECTS the new run + refreshes the runs list (not just a fired callback)', async () => {
    // Mount on a landed calibration run (the deep-link channel seeds the
    // manifest + activeRun — the composite's footer is live).
    vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
      if (id === 'ANR-CAL-9') {
        return { record: { recordId: 'ANR-CAL-9', payload: landingPayload(
          [
            { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
            { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
          ],
          ['calibration_table', 'calibration_model'],
        ) } } as never
      }
      // The recalc's own selectRun fetch (the WIRING under test).
      return { record: { recordId: 'ANR-RECALC-1', payload: { id: 'ANR-RECALC-1', title: 'recalc of ANR-CAL-9', status: 'succeeded', revisionRef: { id: 'ANREV-CAL-1' }, inputs: {}, parameters: {} } } } as never
    })
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ recordId: 'ANR-RECALC-1' } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({
      success: true,
      recordId: 'ANR-RECALC-1',
      status: 'succeeded',
      manifest: { artifacts: [], views: [], metrics: [] },
      artifactRefs: {},
    } as never)
    // The runs list gains the new run AFTER the recalc completes (the
    // refresh() under test — the list re-fetch must return it).
    vi.mocked(apiClient.listAnalysisRuns)
      .mockResolvedValueOnce({ runs: [CAL_RUN], total: 1 })
      .mockResolvedValueOnce({ runs: [CAL_RUN, { recordId: 'ANR-RECALC-1', payload: { id: 'ANR-RECALC-1', title: 'recalc of ANR-CAL-9', status: 'succeeded' } }], total: 2 })
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // Open the recalc region and submit (the view's D7-gated submit — the
    // page-level fixture's CAL_PARAMS satisfy the page's own schema gate).
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    // The new run is SELECTED (activeRun set -> the run title renders in the
    // results header) AND the runs list was REFRESHED (the new run is in the
    // list — the selectRun + refresh wiring, not just an injected mock).
    await waitFor(() => expect(screen.getByTestId('analysis-run-execute-ANR-RECALC-1')).toBeDefined(), { timeout: 10000 })
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith('ANR-RECALC-1')
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(2)
  })
})

// --- FIX2 M1 RED — the recalc completion LANDS like the ?run= deep-link ----
// (cycle-2 M1: onRecalcDone = selectRun(newId) + refresh, and selectRun set
// ONLY activeRunId + activeRun — setManifest existed ONLY in the deep-link
// effect and execute(). The results pane therefore kept the SOURCE run's
// figures (equation/residuals) rendered under the NEW run's id — a provenance
// lie. Spec D4: the completion must land like the deep-link path: the new
// run's manifest/artifactRefs are seeded CLIENT-SIDE from the fetched
// payload.outputManifest (the CompareTraces :103-104 channel).)

/** The NEW run's OWN output manifest: the recalc's artifacts (new equation,
 * the level-3 point EXCLUDED with the shipped flag, new residuals). */
const RECALC_TABLE = {
  rows: [
    { level: 1, amount: 1, peak_source: 'level_1:row0', response_ratio: 3.5, fit_point: true, relative_residual: 0, flags: [] },
    { level: 2, amount: 2, peak_source: 'level_2:row0', response_ratio: 6.5, fit_point: true, relative_residual: 0, flags: [] },
    { level: 3, amount: 3, peak_source: 'level_3:row0', response_ratio: 9.5, fit_point: false, relative_residual: null, flags: ['EXCLUDED_FROM_FIT'] },
  ],
  columns: ['level', 'amount', 'peak_source', 'response_ratio', 'fit_point', 'relative_residual', 'flags'],
  amount_unit: 'ng/uL',
}
const RECALC_MODEL = {
  model: 'linear',
  equation: 'y = 3.000000x + 0.500000',
  coefficients: { slope: 3, intercept: 0.5 },
  statistic_name: 'weighted_r_squared',
  statistic_value: 0.999,
  statistic_definition: 'weighted R^2 over the fitted response quantity',
  residual_basis: 'relative residual on the fitted response quantity, percent',
  response_quantity: 'area_ratio',
  fit_points: [
    { amount: 1, response: 3.5, relative_residual: 0, source_input: 'level_1', source_point_ref: { input_name: 'level_1' } },
    { amount: 2, response: 6.5, relative_residual: 0, source_input: 'level_2', source_point_ref: { input_name: 'level_2' } },
  ],
  x_min: 1,
  x_max: 2,
}
function recalcPayload() {
  return {
    id: 'ANR-RECALC-1',
    title: 'recalc of ANR-CAL-9',
    status: 'succeeded',
    revisionRef: { id: 'ANREV-CAL-1' },
    inputs: { level_1: { kind: 'record', id: 'AOUT-SRC-1', type: 'analysis-output-artifact' } },
    parameters: CAL_PARAMS,
    outputManifest: {
      artifacts: [
        { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(RECALC_TABLE)) },
        { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(RECALC_MODEL)) },
      ],
      views: [],
      metrics: [],
      artifactRefs: { calibration_table: { artifactRecordId: 'AOUT-RECALC-T' }, calibration_model: { artifactRecordId: 'AOUT-RECALC-M' } },
    },
  }
}

describe('GC-11 FIX2 M1 — the recalc completion lands like the deep-link (the NEW run manifest seeds client-side)', () => {
  it('after a completed recalc the results pane renders the NEW run equation + its excluded point (never the SOURCE figures under the NEW id)', async () => {
    // (test timeout raised: the RED proof waits out the broken landing — the
    // new run line appears while the equation STAYS the source's.)
    vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
      if (id === 'ANR-CAL-9') {
        return { record: { recordId: 'ANR-CAL-9', payload: landingPayload(
          [
            { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
            { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
          ],
          ['calibration_table', 'calibration_model'],
        ) } } as never
      }
      // The recalc's OWN landing fetch: the new run's payload carries its OWN
      // outputManifest (the client-side seed channel — zero execute calls).
      return { record: { recordId: 'ANR-RECALC-1', payload: recalcPayload() } } as never
    })
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ recordId: 'ANR-RECALC-1' } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({
      success: true,
      recordId: 'ANR-RECALC-1',
      status: 'succeeded',
      manifest: { artifacts: [], views: [], metrics: [] },
      artifactRefs: {},
    } as never)
    // The runs list gains the new run AFTER the recalc completes (the
    // refresh() — activeProcessed needs the list entry to be 'succeeded').
    vi.mocked(apiClient.listAnalysisRuns)
      .mockResolvedValueOnce({ runs: [CAL_RUN], total: 1 })
      .mockResolvedValueOnce({ runs: [CAL_RUN, { recordId: 'ANR-RECALC-1', payload: { id: 'ANR-RECALC-1', title: 'recalc of ANR-CAL-9', status: 'succeeded' } }], total: 2 })
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // The SOURCE run's equation before the recalc.
    expect(screen.getByTestId('calibration-equation').textContent).toBe('y = 2.000000x + 1.000000')
    // Submit the recalc (the view's gated submit; the page fixture's schema
    // gate passes over the frozen parameters).
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    // FIX2 M1 RED (selectRun seeded NO manifest): the run line says the new
    // run's id while the equation is STILL the source run's.
    await waitFor(
      () => expect(screen.getByTestId('calibration-equation').textContent).toBe('y = 3.000000x + 0.500000'),
      { timeout: 10000 },
    )
    // The header run line names the NEW run (the landing is complete — not
    // just selected) and the NEW point set renders (level 3 excluded ->
    // hollow marker, its residual the new run's null+flag, not the source's).
    expect(screen.getByTestId('calibration-run-line').textContent).toContain('ANR-RECALC-1')
    expect((screen.getByTestId('calibration-point-level_3') as unknown as SVGElement).getAttribute('fill')).toBe('none')
    expect(screen.getByTestId('calibration-residual-level_3').textContent).toContain('EXCLUDED_FROM_FIT')
    // The landing fetched the new run's OWN payload (the seed channel).
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith('ANR-RECALC-1')
  }, 20000)
})

describe('GC-11 FIX1 O3 — a persisted calibration-curve view is never duplicated by the synthesis', () => {
  it('a manifest that ALREADY carries a calibration-curve view renders ONE composite (synthesize only if absent)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: { recordId: 'ANR-CAL-9', payload: landingPayloadWithPersistedCurve(
        [
          { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
          { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
        ],
        ['calibration_table', 'calibration_model'],
      ) },
    } as never)
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // The persisted view renders (ONE composite) — the client-synthesis
    // door must NOT append a second (the shipped code always appended).
    expect(screen.getAllByTestId('calibration-curve').length).toBe(1)
  })
})

// --- RGF D3 (page level) — the gate probe2 flow through the REAL selectRun --
// path (list click, not rerender): a pending edit made while run A is
// displayed must NOT survive onto run B's display or back onto A's. Both
// runs are calibration runs (the gate's ANR-000013 -> ANR-000014 -> back
// flow): the synthesized composite keeps the SAME view id across runs
// ('synthesized-calibration-curve'), so React preserves the component
// INSTANCE across the switch — only the page context (run id + frozen
// params) changes. (A switch onto a non-calibration run unmounts the
// composite and re-mounts it fresh — the defect only bites cal->cal.)
describe('RGF D3 — a run switch clears the composite pending edits (gate probe2 flow, real selectRun)', () => {
  /** Run B (ANR-CAL-2): its OWN stored parameters differ from run A's —
   * level 1 stored fit = false (a real recalc run's stored shape). */
  const RUN_B_PARAMS = { model: 'linear', levels: [{ level: 1, fit: false }] }
  function landingPayloadWithParams(parameters: Record<string, unknown>) {
    const base = landingPayload(
      [
        { name: 'calibration_table', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_TABLE)) },
        { name: 'calibration_model', dataKind: 'table', value: JSON.parse(JSON.stringify(CAL_MODEL)) },
      ],
      ['calibration_table', 'calibration_model'],
    )
    return { ...base, parameters }
  }

  it('toggle fit -> select the other cal run -> select the first back: checkbox == the run OWN stored fit, diff (no pending changes)', async () => {
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [CAL_RUN, { recordId: 'ANR-CAL-2', payload: { id: 'ANR-CAL-2', title: 'TEST recalc run', status: 'succeeded' } }],
      total: 2,
    })
    vi.mocked(apiClient.getAnalysisRun).mockImplementation(async (id: string) => {
      if (id === 'ANR-CAL-9') {
        return { record: { recordId: 'ANR-CAL-9', payload: landingPayloadWithParams(CAL_PARAMS) } } as never
      }
      return { record: { recordId: 'ANR-CAL-2', payload: { ...landingPayloadWithParams(RUN_B_PARAMS), id: 'ANR-CAL-2', title: 'TEST recalc run' } } } as never
    })
    render(wrap(<AnalysisPage />, '/analysis?run=ANR-CAL-9'))
    await waitFor(() => expect(screen.queryByTestId('calibration-curve')).not.toBeNull(), { timeout: 10000 })
    // Run A's own stored state (params level 1 fit true; the row's own
    // fit_point true agree — no pending change).
    expect((screen.getByTestId('calibration-fit-level_1') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toBe('(no pending changes)')
    // A PENDING edit (toggled, never submitted) — the gate's toggle step.
    fireEvent.click(screen.getByTestId('calibration-fit-level_1'))
    expect((screen.getByTestId('calibration-fit-level_1') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toContain('level 1: fit true -> false')
    // Switch to the OTHER calibration run via the list (the real selectRun).
    fireEvent.click(screen.getByRole('button', { name: 'TEST recalc run' }))
    await waitFor(() => expect(screen.getByTestId('calibration-run-line').textContent).toContain('ANR-CAL-2'), { timeout: 10000 })
    // Switch BACK to run A via the list. RED (unkeyed state): the pending
    // edit survives — the checkbox shows run A's OLD edit and the diff claims
    // a change the run never had. GREEN: the state re-keys to run A's OWN
    // frozen parameters.
    fireEvent.click(screen.getByRole('button', { name: 'TEST calibration run' }))
    await waitFor(() => expect(screen.getByTestId('calibration-run-line').textContent).toContain('ANR-CAL-9'), { timeout: 10000 })
    expect((screen.getByTestId('calibration-fit-level_1') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toBe('(no pending changes)')
  }, 30000)
})
