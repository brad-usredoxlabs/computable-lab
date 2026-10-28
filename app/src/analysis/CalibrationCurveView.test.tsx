/**
 * GC-11 [A] RED — the calibration-curve composite view (view-spec renderer,
 * task "view-spec renderer" mandate). Renders the GC-8 calibration_table +
 * calibration_model artifacts as point plot + fit line with the equation
 * string (verbatim), the named correlation statistic (echoed verbatim; a null
 * value renders honestly as `null`), per-point residuals, included/excluded
 * markers, the two-way table<->point<->residual selection, the originating-run
 * link (frozen inputs -> AOUT runRef -> /analysis?run=), the honest dref arm,
 * and the recalc footer (OQ-6 door A: dedicated ParameterForm instance + own
 * createAnalysisRun carrying the source run's FROZEN inputs).
 *
 * No domain literals in this file outside calibrationModel's exported const
 * tables (bait #2 grep pin); the word that the frozen compat source-pin bans
 * in ViewRenderer.tsx lives in comments here, never in the dispatch file.
 *
 * Commits BEFORE CalibrationCurveView.tsx exists (RED: Cannot find module).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiClient } from '../shared/api/client'
import { CalibrationCurveView, type PageContext, sortedParamsJson } from './CalibrationCurveView'
import type { RenderableArtifact } from './ViewRenderer'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
  },
}))

interface MockFormProps {
  testIdPrefix: string
  value: Record<string, unknown>
  onChange(next: Record<string, unknown>): void
}

vi.mock('./ParameterForm', () => ({
  ParameterForm: (props: MockFormProps) => (
    <div data-testid={`${props.testIdPrefix}-mock`} data-value={JSON.stringify(props.value)}>
      <button type="button" onClick={() => {
        const levels = Array.isArray(props.value.levels) ? (props.value.levels as Record<string, unknown>[]) : []
        props.onChange({ ...props.value, levels: levels.map((r) => ({ ...r, fit: true })) })
      }}>
        flip-all-fit
      </button>
    </div>
  ),
}))

// --- fixtures (GC-8 shipped shapes, mirror calibrationModel.test.ts) ---------

const MODEL_PAYLOAD = {
  model_version: 1,
  model: 'linear',
  equation: 'y = 2.000000x + 1.000000',
  coefficients: { slope: 2, intercept: 1 },
  weighting: 'none',
  effective_weighting: 'none',
  origin_constraint: false,
  statistic_name: 'weighted_r_squared',
  statistic_value: 0.999999,
  statistic_definition: 'weighted R^2 over the fitted response quantity',
  residual_basis: 'relative residual on the fitted response quantity, percent',
  response_quantity: 'area_ratio',
  amount_unit: 'ng/uL',
  fit_points: [
    { amount: 1, response: 3, weight: 1, relative_residual: 0, source_input: 'level_1', source_peak_index: 0, source_point_ref: { input_name: 'level_1', peak_row_index: 0 } },
    { amount: 2, response: 5, weight: 1, relative_residual: 0, source_input: 'level_2', source_peak_index: 0, source_point_ref: { input_name: 'level_2', peak_row_index: 0 } },
    { amount: 3, response: 9.5, weight: 1, relative_residual: 33.333333, source_input: 'level_3', source_peak_index: 0, source_point_ref: { input_name: 'level_3', peak_row_index: 0 } },
    { amount: 4, response: 9, weight: 1, relative_residual: 0, source_input: 'level_4', source_peak_index: 0, source_point_ref: { input_name: 'level_4', peak_row_index: 0 } },
    { amount: 5, response: 11, weight: 1, relative_residual: 0, source_input: 'level_5', source_peak_index: 0, source_point_ref: { input_name: 'level_5', peak_row_index: 0 } },
  ],
  x_min: 1,
  x_max: 5,
  calibration_run_id: null,
  params_digest: 'TEST-DIGEST-1',
  calibration_scope: 'analytical',
}

const TABLE_PAYLOAD = {
  rows: [
    { level: 1, compound_label: 'TEST-CMPD-A', compound_ref: { id: 'LC-CMPD-1' }, amount: 1, rt_target_min: 1, rt_window_min: 0.25, peak_source: 'level_1:row0', response_raw_pa_min: 3000, response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
    { level: 2, compound_label: 'TEST-CMPD-B', compound_ref: { id: 'LC-CMPD-2' }, amount: 2, rt_target_min: 2, rt_window_min: 0.25, peak_source: 'level_2:row0', response_raw_pa_min: 5000, response_ratio: 5, fit_point: true, relative_residual: 0, flags: [] },
    { level: 3, compound_label: 'TEST-CMPD-C', compound_ref: { id: 'LC-CMPD-3' }, amount: 3, rt_target_min: 3, rt_window_min: 0.25, peak_source: 'level_3:row0', response_raw_pa_min: 9500, response_ratio: 9.5, fit_point: true, relative_residual: 33.333333, flags: [] },
    { level: 4, compound_label: 'TEST-CMPD-D', compound_ref: { id: 'LC-CMPD-4' }, amount: 4, rt_target_min: 4, rt_window_min: 0.25, peak_source: 'level_4:row0', response_raw_pa_min: 9000, response_ratio: 9, fit_point: true, relative_residual: 0, flags: [] },
    { level: 5, compound_label: 'TEST-CMPD-E', compound_ref: { id: 'LC-CMPD-5' }, amount: 5, rt_target_min: 5, rt_window_min: 0.25, peak_source: 'level_5:row0', response_raw_pa_min: 11000, response_ratio: 11, fit_point: false, relative_residual: null, flags: ['EXCLUDED_FROM_FIT'] },
  ],
  columns: ['level', 'compound_label', 'compound_ref', 'amount', 'rt_target_min', 'rt_window_min', 'peak_source', 'response_raw_pa_min', 'response_ratio', 'fit_point', 'relative_residual', 'flags'],
  amount_unit: 'ng/uL',
  istd: { role: 'none' },
  calibration_scope: 'analytical',
  params_digest: 'TEST-DIGEST-1',
}

const CAL_PARAMS = {
  model: 'linear',
  weighting: 'none',
  origin_constraint: false,
  correlation_statistic: 'weighted_r_squared',
  amount_unit: 'ng/uL',
  istd: { role: 'none' },
  extrapolation: 'reject',
  fail_on_out_of_range: true,
  allow_inline_inputs: true,
  levels: [
    { level: 1, compound_label: 'TEST-CMPD-A', compound_ref: { id: 'LC-CMPD-1' }, amount: 1, rt_target_min: 1, rt_window_min: 0.25, fit: true, required: true, input_names: ['level_1'] },
    { level: 2, compound_label: 'TEST-CMPD-B', compound_ref: { id: 'LC-CMPD-2' }, amount: 2, rt_target_min: 2, rt_window_min: 0.25, fit: true, required: true, input_names: ['level_2'] },
    { level: 3, compound_label: 'TEST-CMPD-C', compound_ref: { id: 'LC-CMPD-3' }, amount: 3, rt_target_min: 3, rt_window_min: 0.25, fit: true, required: true, input_names: ['level_3'] },
  ],
}
const CAL_SCHEMA = {
  type: 'object',
  required: ['model', 'weighting', 'origin_constraint', 'correlation_statistic', 'amount_unit', 'istd', 'extrapolation', 'fail_on_out_of_range', 'levels'],
  properties: {
    model: { type: 'string', enum: ['linear', 'linear_through_origin', 'quadratic'] },
    weighting: { type: 'string', enum: ['none', '1/x', '1/x^2', '1/y^2'] },
    origin_constraint: { type: 'boolean' },
    correlation_statistic: { type: 'string', enum: ['none', 'weighted_r_squared', 'plain_r_squared', 'spearman'] },
    amount_unit: { type: 'string' },
    istd: { type: 'object' },
    extrapolation: { type: 'string', enum: ['reject', 'allow_within_declared_extension'] },
    fail_on_out_of_range: { type: 'boolean' },
    allow_inline_inputs: { type: 'boolean' },
    levels: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['level', 'compound_label', 'amount', 'rt_target_min', 'rt_window_min', 'fit', 'required'],
        properties: {
          level: { type: 'integer' },
          compound_label: { type: 'string' },
          compound_ref: { type: ['object', 'string', 'null'] },
          amount: { type: 'number' },
          rt_target_min: { type: 'number' },
          rt_window_min: { type: 'number', exclusiveMinimum: 0 },
          fit: { type: 'boolean' },
          required: { type: 'boolean' },
          input_names: { type: 'array' },
          weight: { type: 'number' },
        },
      },
    },
  },
}

const SOURCE_INPUTS: Record<string, { kind: 'record'; id: string; type: string }> = {
  level_1: { kind: 'record', id: 'AOUT-SRC-1', type: 'analysis-output-artifact' },
  level_2: { kind: 'record', id: 'AOUT-SRC-2', type: 'analysis-output-artifact' },
  level_3: { kind: 'record', id: 'AOUT-SRC-3', type: 'analysis-output-artifact' },
}

const PAGE_CTX: PageContext = {
  activeRunId: 'ANR-CAL-1',
  revisions: [{ recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: CAL_SCHEMA } }],
  sourceRun: {
    recordId: 'ANR-CAL-1',
    payload: {
      id: 'ANR-CAL-1',
      title: 'TEST calibration run',
      status: 'succeeded',
      revisionRef: { id: 'ANREV-CAL-1' },
      inputs: SOURCE_INPUTS,
      parameters: CAL_PARAMS,
    },
  },
}

function renderView(pageCtx: PageContext = PAGE_CTX, bindings?: Record<string, unknown>) {
  const artifact: RenderableArtifact = { id: 'AOUT-CAL-TABLE', name: 'calibration_table', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
  const modelArtifact: RenderableArtifact = { id: 'AOUT-CAL-MODEL', name: 'calibration_model', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
  const onRecalcDone = vi.fn()
  const out = render(
    <CalibrationCurveView
      artifact={artifact}
      modelArtifact={modelArtifact}
      bindings={bindings}
      page={pageCtx}
      onRecalcDone={onRecalcDone}
    />,
  )
  return { ...out, onRecalcDone }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- D1: equation / statistic / points / line / residuals / markers ----------

describe('D1 — the composite renders the artifact numbers verbatim (no TS math)', () => {
  it('renders the equation string verbatim beside the plot', () => {
    renderView()
    expect(screen.getByTestId('calibration-equation').textContent).toBe('y = 2.000000x + 1.000000')
  })

  it('echoes the named statistic verbatim (name + value + definition)', () => {
    renderView()
    const stat = screen.getByTestId('calibration-statistic')
    expect(stat.textContent).toContain('weighted_r_squared')
    expect(stat.textContent).toContain('0.999999')
    expect(stat.textContent).toContain('weighted R^2 over the fitted response quantity')
  })

  it('renders one marker per table row; point count == row count', () => {
    const { container } = renderView()
    const points = container.querySelectorAll('[data-testid^="calibration-point-"]')
    expect(points.length).toBe(5)
  })

  it('samples the fit line from the structured coefficients over [x_min, x_max] (geometry only)', () => {
    // H=320, PAD=16 (the view's plot geometry). The fixture: y = 2x + 1 over
    // [x_min=1, x_max=5] -> y from 3 to 11; the y-domain of points + line is
    // exactly [3, 11], so the line runs from the plot bottom (yMin -> H-PAD)
    // to the plot top (yMax -> PAD).
    const { container } = renderView()
    const line = container.querySelector('[data-testid="calibration-fit-line"]') as SVGLineElement
    expect(line).not.toBeNull()
    const y1 = Number(line.getAttribute('y1'))
    const y2 = Number(line.getAttribute('y2'))
    const expectedBottom = 320 - 16 // 3  -> yMin -> bottom of plot
    const expectedTop = 16          // 11 -> yMax -> top of plot
    expect(Math.abs(y1 - expectedBottom)).toBeLessThan(0.5)
    expect(Math.abs(y2 - expectedTop)).toBeLessThan(0.5)
  })

  it('renders one residual bar per row with the artifact OWN relative_residual (verbatim, no recompute)', () => {
    const { container } = renderView()
    const bars = container.querySelectorAll('[data-testid^="calibration-residual-"]')
    expect(bars.length).toBe(5)
    // The outlier row's bar carries its own number; editing the artifact
    // residual would move the bar (the UI recomputes nothing).
    const outlierBar = container.querySelector('[data-testid="calibration-residual-level_3"]')
    expect(outlierBar?.textContent ?? '').toContain('33.333333')
  })

  it('labels the residual basis verbatim', () => {
    renderView()
    expect(screen.getByTestId('calibration-basis-label').textContent).toBe('relative residual on the fitted response quantity, percent')
  })

  it('renders a NAMED arm when the model payload lacks the response column mapping (no invented column)', () => {
    const modelBad = JSON.parse(JSON.stringify(MODEL_PAYLOAD))
    modelBad.response_quantity = 'mystery_quantity'
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: modelBad }
    const { container } = render(
      <CalibrationCurveView
        artifact={artifact}
        modelArtifact={modelArtifact}
        page={PAGE_CTX}
        onRecalcDone={() => {}}
      />,
    )
    expect(container.querySelector('[data-testid="calibration-unresolved"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="calibration-fit-line"]')).toBeNull()
  })
})

describe('D1 — included/excluded markers + outlier affordance (no threshold invented)', () => {
  it('excluded rows render a HOLLOW marker and their own flags reason stays visible', () => {
    const { container } = renderView()
    const excluded = container.querySelector('[data-testid="calibration-point-level_5"]') as SVGElement
    expect(excluded.getAttribute('fill')).toBe('none')
    expect(screen.getByTestId('calibration-row-level_5').textContent).toContain('EXCLUDED_FROM_FIT')
  })

  it('marks the outlier row(s) by max |relative_residual| over the artifact OWN residuals', () => {
    const { container } = renderView()
    expect(container.querySelector('[data-testid="calibration-point-level_3"]')?.getAttribute('data-outlier')).toBe('true')
    expect(container.querySelector('[data-testid="calibration-row-level_3"]')?.getAttribute('data-outlier')).toBe('true')
    expect(container.querySelector('[data-testid="calibration-point-level_1"]')?.getAttribute('data-outlier')).toBeNull()
  })
})

// --- D2: two-way selection ----------------------------------------------------

describe('D2 — row <-> point <-> residual selection is two-way', () => {
  it('selecting a table row highlights its point AND its residual', () => {
    renderView()
    fireEvent.click(screen.getByTestId('calibration-row-level_2'))
    expect(screen.getByTestId('calibration-point-level_2').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('calibration-residual-level_2').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('calibration-row-level_2').getAttribute('data-selected')).toBe('true')
  })

  it('selecting a curve marker highlights the table row (the other direction)', () => {
    const { container } = renderView()
    const marker = container.querySelector('[data-testid="calibration-point-level_4"]') as SVGElement
    fireEvent.click(marker)
    expect(screen.getByTestId('calibration-row-level_4').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('calibration-residual-level_4').getAttribute('data-selected')).toBe('true')
  })

  it('selecting the same point again clears the selection', () => {
    const { container } = renderView()
    const marker = container.querySelector('[data-testid="calibration-point-level_1"]') as SVGElement
    fireEvent.click(marker)
    fireEvent.click(marker)
    expect(screen.getByTestId('calibration-row-level_1').hasAttribute('data-selected')).toBe(false)
  })

  it('headers are the artifact column keys VERBATIM incl. a 24-char name (D6: wrap, never truncate)', () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: {
      ...JSON.parse(JSON.stringify(TABLE_PAYLOAD)),
      columns: ['level', 'fit_point', 'relative_residual', 'measurement_response_raw_pa_min_extended_test_name'],
      rows: JSON.parse(JSON.stringify(TABLE_PAYLOAD)).rows.map((r: Record<string, unknown>) => ({ ...r, measurement_response_raw_pa_min_extended_test_name: r.response_ratio })),
    } }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    const { container } = render(
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={PAGE_CTX} onRecalcDone={() => {}} />,
    )
    const header = container.querySelector('th[data-testid="calibration-header-measurement_response_raw_pa_min_extended_test_name"]')
    expect(header?.textContent).toBe('measurement_response_raw_pa_min_extended_test_name')
  })
})

// --- D2: the originating-run link (frozen inputs -> AOUT runRef -> ?run=) -----

describe('D2 — the source-run link resolves from the frozen inputs (click-gated fetch)', () => {
  it('shows the calibration-run line (zero fetch) and a disabled+named source link before the click', () => {
    renderView()
    const line = screen.getByTestId('calibration-run-line')
    expect(line.textContent).toContain('ANR-CAL-1')
    const link = screen.getByTestId('calibration-source-run') as HTMLButtonElement
    expect(link.disabled).toBe(true)
    expect(screen.getByTestId('calibration-source-run-unresolved').textContent).toContain('resolve')
    // Click-gated: ZERO record fetches before the click.
    expect(apiClient.getRecord).not.toHaveBeenCalled()
  })

  it('resolves inputs[input_name].id -> getRecord -> runRef.id -> /analysis?run= href', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue({
      payload: { runRef: { kind: 'record', id: 'ANR-SRC-3', type: 'analysis-run' }, id: 'AOUT-SRC-3' },
    } as never)
    renderView()
    fireEvent.click(screen.getByTestId('calibration-resolve-source-run'))
    const link = (await screen.findByTestId('calibration-source-run')) as HTMLAnchorElement
    expect(apiClient.getRecord).toHaveBeenCalledTimes(1)
    expect(apiClient.getRecord).toHaveBeenCalledWith('AOUT-SRC-3')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/analysis?run=ANR-SRC-3')
  })

  it('renders a NAMED disabled state for a dref-typed input (no dead # anchor, names the promote seam)', () => {
    const page = {
      ...PAGE_CTX,
      sourceRun: {
        recordId: 'ANR-CAL-1',
        payload: {
          id: 'ANR-CAL-1', title: 't', status: 'succeeded', revisionRef: { id: 'ANREV-CAL-1' },
          inputs: { level_1: { kind: 'record', id: 'DREF-000009', type: 'data-reference' } },
          parameters: CAL_PARAMS,
        },
      },
    }
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(
      <CalibrationCurveView
        artifact={artifact}
        modelArtifact={modelArtifact}
        page={page as object as never}
        onRecalcDone={() => {}}
      />,
    )
    const reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('promote')
    expect(screen.getByTestId('calibration-source-run')).toBeDisabled()
  })

  it('renders a NAMED disabled state when the input is not declared in the frozen inputs', () => {
    const page = {
      ...PAGE_CTX,
      sourceRun: {
        recordId: 'ANR-CAL-1',
        payload: { id: 'ANR-CAL-1', title: 't', status: 'succeeded', revisionRef: { id: 'ANREV-CAL-1' }, inputs: {}, parameters: CAL_PARAMS },
      },
    }
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page as object as never} onRecalcDone={() => {}} />,
    )
    const reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('level_1')
    expect(screen.getByTestId('calibration-source-run')).toBeDisabled()
  })
})

// --- D7: the honest dref arm ---------------------------------------------------

describe('D7 — a dref-backed calibration artifact renders the NAMED honest arm', () => {
  it('no inline value + dataReferenceRef -> named arm, no fake curve, no content-route call', () => {
    const artifact: RenderableArtifact = {
      id: 'AOUT-CAL-TABLE', name: 'calibration_table', dataKind: 'table',
      dataReferenceRef: { id: 'DREF-000006' },
    }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    const { container } = render(
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={PAGE_CTX} onRecalcDone={() => {}} />,
    )
    const arm = container.querySelector('[data-testid="calibration-dref-unsupported"]')
    expect(arm).not.toBeNull()
    expect(arm?.textContent).toContain('DREF-000006')
    expect(container.querySelector('[data-testid="calibration-svg"]')).toBeNull()
    expect(container.querySelector('[data-testid="calibration-fit-line"]')).toBeNull()
  })
})

// --- D1 (persisted door): the closed-shape bindings guard ----------------------

describe('bindings guard — malformed bindings render the named error arm', () => {
  it('unknown bindings keys -> view-spec__error naming the key', () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    const { container } = render(
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} bindings={{ bogus: true } as Record<string, unknown>} page={PAGE_CTX} onRecalcDone={() => {}} />,
    )
    const err = container.querySelector('[data-testid="view-spec-error"]')
    expect(err).not.toBeNull()
    expect(err?.textContent).toContain('bogus')
  })
})

// --- D4: the recalc footer (OQ-6 door A) ---------------------------------------

describe('D4 — changes spawn a NEW run; completed models are never mutated', () => {
  it('the recalc region opens prefilled with the source run FROZEN parameters (form value == frozen params)', () => {
    renderView()
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const form = screen.getByTestId('calibration-recalc-form')
    expect(form).not.toBeNull()
    const formMock = screen.getByTestId('calibration-recalc-mock')
    expect(JSON.parse(formMock.getAttribute('data-value') ?? '{}')).toEqual(CAL_PARAMS)
  })

  it('toggling a row fit checkbox arms a visible diff line and the form value picks up the new fit flag', () => {
    renderView()
    fireEvent.click(screen.getByTestId('calibration-fit-level_2'))
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toContain('level 2: fit true -> false')
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const formMock = screen.getByTestId('calibration-recalc-mock')
    const value = JSON.parse(formMock.getAttribute('data-value') ?? '{}')
    expect(value.levels[1].fit).toBe(false)
    expect(value.levels[0].fit).toBe(true)
  })

  it('submit calls createAnalysisRun ONCE with the diffed parameters + the FROZEN inputs verbatim, then executeAnalysisRun on the NEW id only', async () => {
    const newRunId = 'ANR-RECALC-9'
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId, run: {} } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId, status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} } as never)
    const { onRecalcDone } = renderView()
    fireEvent.click(screen.getByTestId('calibration-fit-level_2'))
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    await vi.waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(body.title).toBe('recalc of ANR-CAL-1')
    expect(body.revisionRef).toEqual({ kind: 'record', id: 'ANREV-CAL-1', type: 'analysis-revision' })
    expect(body.inputs).toEqual(SOURCE_INPUTS) // frozen inputs VERBATIM
    expect(body.parameters).toBeDefined()
    expect((body.parameters as { levels: Record<string, unknown>[] }).levels[1].fit).toBe(false)
    expect((body.parameters as { levels: Record<string, unknown>[] }).levels[0].fit).toBe(true)
    expect((body.parameters as { model: string }).model).toBe('linear')
    // execute fires on the NEW id ONLY — never the source run's id.
    await vi.waitFor(() => expect(apiClient.executeAnalysisRun).toHaveBeenCalledTimes(1))
    expect(apiClient.executeAnalysisRun).toHaveBeenCalledWith(newRunId)
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalledWith('ANR-CAL-1')
    expect(onRecalcDone).toHaveBeenCalledWith(newRunId)
  })

  it('the frozen preview shows the SAME sorted-keys JSON the submit will send', async () => {
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-RECALC-9', run: {} } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-RECALC-9', status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} } as never)
    renderView()
    fireEvent.click(screen.getByTestId('calibration-fit-level_2'))
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const preview = screen.getByTestId('calibration-recalc-preview').textContent ?? ''
    expect(preview).not.toBe('(no parameters)')
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    await vi.waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(sortedParamsJson(body.parameters as Record<string, unknown>)).toBe(preview)
  })

  it('the source run payload is byte-identical before/after the recalc (never mutated)', async () => {
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-RECALC-9', run: {} } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-RECALC-9', status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} } as never)
    const before = JSON.stringify(PAGE_CTX.sourceRun)
    renderView()
    fireEvent.click(screen.getByTestId('calibration-fit-level_2'))
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    await new Promise((r) => setTimeout(r, 0)) // let create/execute resolve
    expect(JSON.stringify(PAGE_CTX.sourceRun)).toBe(before)
  })

  it('no parameterSchema on the run revision -> NAMED disabled state (never a silent raw-JSON requirement)', () => {
    const page = { ...PAGE_CTX, revisions: [{ recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'legacy' } }] }
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page as object as never} onRecalcDone={() => {}} />,
    )
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    expect(screen.getByTestId('calibration-recalc-noschema').textContent).toContain('parameterSchema')
    expect(screen.queryByTestId('calibration-recalc-submit')).toBeNull()
  })
})
