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
import { readFileSync } from 'node:fs'
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

// The './ParameterForm' mock: the form COMPONENT is a mock (value visible
// via data-value; no real controls needed to drive the view), but the GATE
// FUNCTIONS are RE-EXPORTED (a FIX1 D7 addition to this mock surface — the
// recalc submit must ride the SHIPPED gate, spec D4) so the view's
// collectGateIssues/pruneEmpty imports resolve to REAL implementations
// (importActual, spy-able) instead of undefined.
const pfHolder = vi.hoisted(() => ({ gate: null as null | ((schema: Record<string, unknown> | undefined, values: Record<string, unknown>) => unknown), prune: null as null | ((obj: Record<string, unknown>) => Record<string, unknown>) }))
vi.mock('./ParameterForm', async () => {
  const real = await vi.importActual<typeof import('./ParameterForm')>('./ParameterForm')
  return {
    ...real,
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
    collectGateIssues: (schema: Record<string, unknown> | undefined, values: Record<string, unknown>) => pfHolder.gate?.(schema, values),
    pruneEmpty: (obj: Record<string, unknown>) => pfHolder.prune?.(obj),
  }
})

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

// --- the verif-6 hardcode grep pin, CI-owned (bait #2/#3 pre-emption) ------

describe('hardcode grep pin — zero domain literals in prod TS (verif 6)', () => {
  it("the VIEW file names no artifact property (all live in calibrationModel's const tables)", () => {
    const source = readFileSync('src/analysis/CalibrationCurveView.tsx', 'utf8')
    // The property-name literals (and the banned `scatter` renderer word,
    // F1) must be ABSENT from the view file — a wrong pick or a widened
    // renderer set is a defect the reviewer hunts for.
    for (const banned of ['response_ratio', 'fit_point', 'relative_residual', 'equation', 'EXCLUDED_FROM_FIT', 'FAME', 'ChemStation', 'ng/uL', 'scatter']) {
      expect(source, `banned literal ${banned} in the view file`).not.toContain(banned)
    }
  })

  it('the MODEL file carries no instrument/vendor/unit domain literals', () => {
    const source = readFileSync('src/analysis/calibrationModel.ts', 'utf8')
    for (const banned of ['FAME', 'ChemStation', 'ng/uL', 'scatter']) {
      expect(source, `banned literal ${banned} in the model file`).not.toContain(banned)
    }
  })

  it('the composite CSS has no truncation rules (D6: wrap, never truncate)', () => {
    const css = readFileSync('src/analysis/CalibrationCurveView.css', 'utf8')
    expect(css).not.toContain('text-overflow')
    expect(css).not.toContain('ellipsis')
  })
})

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

  it('renders one residual bar per row with the artifact OWN relative_residual (the bar shows the display precision; FULL precision stays in the table cell)', () => {
    const { container } = renderView()
    const bars = container.querySelectorAll('[data-testid^="calibration-residual-"]')
    expect(bars.length).toBe(5)
    // The outlier row's bar carries its own number (display precision —
    // RGF D5: a stable bounded display; the bar is the strip, not the
    // precision record). Editing the artifact residual would move the bar
    // (the UI recomputes nothing).
    const outlierBar = container.querySelector('[data-testid="calibration-residual-level_3"]')
    expect(outlierBar?.textContent ?? '').toBe('33.3333')
    // Full precision stays in the TABLE (the row cell renders the artifact
    // number verbatim — the strip's bounded display never replaces it).
    expect(screen.getByTestId('calibration-row-level_3').textContent).toContain('33.333333')
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

// --- RGF D5 — residual-strip labels are STABLE AND READABLE ---------------
// (RUNGATE1 DEFECT-5: the fixed 24px bars held the FULL-precision numbers —
// `7.0000000000000435` rendered as `7.000`, `-16.15…` as `-16.1`, the text
// overflowing the bar and touching its neighbours; with a zero residual the
// bar collapsed to 2px and the label was unreadable. The rendered number
// must be STABLE and READABLE (a fixed-decimal display, the precision const
// is display-only); full precision stays in the table + the artifact.)

describe('RGF D5 — residual-strip labels: fixed-decimal display (stable, readable)', () => {
  it('a residual label renders as a BOUNDED fixed-decimal display (the float literal is never the label)', () => {
    const { container } = renderView()
    // The outlier row's own residual (33.333333) renders as a bounded
    // fixed-decimal display — RED (full-precision String(n)): the bar's
    // text was the float literal (8+ digits after the point), wider than
    // any 24px bar and touching its neighbours.
    const bar = container.querySelector('[data-testid="calibration-residual-level_3"]') as HTMLElement
    const label = bar.textContent ?? ''
    expect(label).not.toContain('33.333333333')
    // Bounded: one decimal point, a limited fraction (the display-precision
    // const) — a float's 17 significant digits never render.
    expect(label).toMatch(/^-?\d+\.\d{1,4}$/)
    expect(label.length).toBeLessThanOrEqual(12)
    // The zero-residual bars still carry a READABLE label (not a 2px gap of
    // nothing) — the fixture's level_1 residual is 0.
    const zeroBar = container.querySelector('[data-testid="calibration-residual-level_1"]') as HTMLElement
    expect(zeroBar.textContent ?? '').toMatch(/^-?\d+\.\d{1,4}$/)
    // RGF2 (D5 half-closure): the zero-residual bar's rendered HEIGHT is also
    // readable — not just its string. The component writes height:0 for a
    // zero residual; the legible floor is the CSS rule (asserted below), so
    // the jsdom-assertable claim is that the bar does NOT pin itself to a
    // sub-label inline height.
    expect((zeroBar.style.height ?? '0px'), 'the zero bar writes height 0 (the CSS floor controls, not a 2px pin)').toBe('0px')
    // Full precision STAYS in the table (the table cell is verbatim data).
    expect(screen.getByTestId('calibration-row-level_3').textContent).toContain('33.333333')
  })

  it('a zero/low-residual bar has a legible height FLOOR written by the component (the label does not spill a 2px bar)', () => {
    // RUNGATE1 DEFECT-5, second half (RGF1 left it unfixed): 'with a zero
    // residual the bar collapsed to 2px and the label was unreadable'. The
    // bar height is Math.min(64, |residual|*1.5) -> 0 for a zero residual;
    // the rendered height is then whatever the CSS rule sets (RGF1:
    // min-height: 2px — a 2px strip under a ~0.6rem label, ~10px,
    // overflow:visible). The floor must be (a) COMPONENT-WRITTEN — a rule in
    // CalibrationCurveView.css the test reads (jsdom does not apply the
    // stylesheet, so the rule is asserted as the component's own written
    // value, not an unapplied-stylesheet assumption), and (b) at least the
    // label's own line box (font-size 0.6rem x line-height 1 = 9.6px) so the
    // in-bar label fits.
    const css = readFileSync('src/analysis/CalibrationCurveView.css', 'utf8')
    const m = css.match(/\.calibration-curve__residual-bar\s*{[^}]*}/)
    expect(m, 'the bar rule exists in the lane CSS (the floor must be component-written, not inherited)').not.toBeNull()
    const hm = m![0].match(/min-height:\s*(\d+(?:\.\d+)?)(px|rem)/)
    expect(hm, 'the bar rule WRITES a min-height floor (RGF1 shipped 2px — the label spilled it)').not.toBeNull()
    const floorPx = hm![2] === 'rem' ? parseFloat(hm![1]) * 16 : parseFloat(hm![1])
    // The label's line box: 0.6rem font-size x line-height 1 (same rule).
    expect(floorPx, 'the floor must at least cover the label line box (9.6px)').toBeGreaterThanOrEqual(9.6)
    // RENDERED (component-written) geometry: the zero-residual bar does not
    // pin a sub-floor inline height — height:0 leaves the floor (above) in
    // control, so the rendered bar is >= the floor and the ~10px label fits.
    const { container } = renderView()
    const zeroBar = container.querySelector('[data-testid="calibration-residual-level_1"]') as HTMLElement
    expect(zeroBar.style.height ?? '0px').toBe('0px')
    expect(zeroBar.textContent ?? '').toMatch(/^-?\d+\.\d{1,4}$/)
    // The floor is a FLOOR, not a cap: the outlier bar (residual 33.333333)
    // still encodes its magnitude — rendered ABOVE the floor, <= 64px.
    const outlierBar = container.querySelector('[data-testid="calibration-residual-level_3"]') as HTMLElement
    const outlierH = parseFloat(outlierBar.style.height)
    expect(outlierH).toBeGreaterThan(floorPx)
    expect(outlierH).toBeLessThanOrEqual(64)
    // The EXCLUDED bar (no residual, no label) is unaffected by the
    // legibility claim — it carries no inline label and its 2px pin stays
    // the component's explicit written value.
    const excludedBar = container.querySelector('[data-testid="calibration-residual-level_5"]') as HTMLElement
    expect(excludedBar.textContent ?? '').not.toMatch(/^-?\d+\.\d{1,4}$/)
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

// --- RGF D2 — the outlier point is VISIBLY marked in the plot ----------------
// (RUNGATE1 DEFECT-2, major: at 1:1 the four filled markers are
// indistinguishable — the flagged point differed only in a
// stroke-dasharray 2,2 with stroke = fill = rgb(63,121,196) and 1px width,
// a rim in the SAME colour as the fill, invisible. Fix: a contrasting halo
// RING at the same centre (larger radius, a stroke that is NOT the point's
// fill colour) — data-derived (only the flagged point carries it).)

describe('RGF D2 — the outlier point renders a contrasting halo ring (visible at 1:1)', () => {
  it('the flagged point carries a halo: same centre, LARGER radius, contrasting stroke; non-outliers carry none', () => {
    const { container } = renderView()
    const outlier = container.querySelector('[data-testid="calibration-point-level_3"]') as SVGElement
    expect(outlier.getAttribute('data-outlier')).toBe('true')
    // The halo circle: same centre as the point, a LARGER radius (a ring
    // AROUND the marker), and a stroke colour that CONTRASTS the point's
    // fill (the defect was stroke == fill — invisible at 1:1).
    const halo = Array.from(container.querySelectorAll('circle')).find(
      (c) =>
        c.getAttribute('data-outlier-halo') === 'true' &&
        c.getAttribute('cx') === outlier.getAttribute('cx') &&
        c.getAttribute('cy') === outlier.getAttribute('cy'),
    )
    expect(halo, 'a halo circle at the outlier point centre').toBeDefined()
    expect(Number(halo!.getAttribute('r'))).toBeGreaterThan(Number(outlier.getAttribute('r')))
    expect(halo!.getAttribute('stroke'), 'the halo stroke contrasts the point fill').not.toBe(outlier.getAttribute('fill'))
    // Non-outlier points carry NO halo (the marking follows the data, not
    // decoration on every point).
    const level1 = container.querySelector('[data-testid="calibration-point-level_1"]') as SVGElement
    const level1Halo = Array.from(container.querySelectorAll('circle')).find(
      (c) =>
        c.getAttribute('data-outlier-halo') === 'true' &&
        c.getAttribute('cx') === level1.getAttribute('cx') &&
        c.getAttribute('cy') === level1.getAttribute('cy'),
    )
    expect(level1Halo).toBeUndefined()
  })
})

// --- RGF D4 — the x-domain includes ALL plotted points (fit AND excluded) ---
// (RUNGATE1 DEFECT-4: the gate's excluded level_5 (amount 5) was drawn at
// cx=826.67 in a viewBox 0 0 640 320 — the x-domain was the model's
// FIT-only x_min/x_max (1..4), so an excluded point beyond the fit range
// was silently CLIPPED out of the plot: 4 markers for a 5-row table. Every
// table row must have a visible marker. The fit LINE still spans only the
// fit x-range — the line is the fit's geometry, the domain is the POINTS'.)
describe('RGF D4 — an excluded point outside the fit x-range stays VISIBLE (domain covers all points)', () => {
  /** Model: 5 levels (1..5) in the table, but the FIT spans x 1..4 only
   * (level 5 excluded — the gate's ANR-000013 shape: x_min/x_max come from
   * the fit points). Linear 2x+1 -> y 3..9 over the fit range. */
  const MODEL_FIT_TO_4 = {
    ...JSON.parse(JSON.stringify(MODEL_PAYLOAD)),
    x_min: 1,
    x_max: 4,
  }

  it('an excluded point BEYOND the fit x-range renders INSIDE the viewBox (not clipped)', () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_FIT_TO_4)) }
    const { container } = render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={PAGE_CTX} onRecalcDone={() => {}} />)
    const excluded = container.querySelector('[data-testid="calibration-point-level_5"]') as SVGElement
    const cx = Number(excluded.getAttribute('cx'))
    const cy = Number(excluded.getAttribute('cy'))
    // The marker exists and is INSIDE the 0 0 640 320 viewBox (a clip means
    // cx > 640, or off-plot cy). RED (fit-only domain [1,4]): cx = 826.67.
    expect(excluded).not.toBeNull()
    expect(cx).toBeGreaterThan(0)
    expect(cx).toBeLessThanOrEqual(640)
    expect(cy).toBeGreaterThan(0)
    expect(cy).toBeLessThanOrEqual(320)
  })

  it('the fit LINE still spans only the FIT x-range (the domain extension is for the points, not the fit)', () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_FIT_TO_4)) }
    const { container } = render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={PAGE_CTX} onRecalcDone={() => {}} />)
    const line = container.querySelector('[data-testid="calibration-fit-line"]') as SVGLineElement
    // Domain [1,5] (points incl. the excluded level 5 at x=5): the line's
    // endpoints sit at the fit range's own x (1 and 4), NOT at the extended
    // domain edge (5). x1 = 16 (x=1); x2 = sx(4) = 16 + (4-1)/4 * 608 = 472
    // (PAD 16, plotW 608, domain width 4).
    expect(line).not.toBeNull()
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(16, 1)
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(472, 1)
  })
})

// --- RGF D1 — the calibration table is READABLE at a narrow pane ----------
// (RUNGATE1 DEFECT-1, major: 13 columns squeezed into a 444px table in the
// ~510px results pane at 1280px — each header cell 23–43px wide x 112px
// tall, so `level` rendered as `l/e/v/e/l` and `response_raw_pa_min` as
// `res/p/ons/e/_raw/_pa/_mi/n`; data cells broke numbers mid-digit
// (`-16.15384615384614` -> `-16.1/538…`). Root cause (per the receipt):
// width:100% on the table with no min-width and no horizontal scroll
// container. Fix: a scroll container + per-column min-widths derived from
// the header NAMES (data-driven — the width follows the name's length; no
// per-name table, no invented column names). The wrap-never-truncate
// discipline stands (no text-overflow/ellipsis — the verif-6 pin): cells
// wrap only if the content exceeds the min-width, never truncate.)

describe('RGF D1 — the table is readable at a narrow pane (scroll container + per-column min-widths)', () => {
  it('the table sits in its OWN horizontal-scroll container (not pinned to the pane width)', () => {
    renderView()
    const table = screen.getByTestId('calibration-table') as HTMLTableElement
    // The scroll container is the table's PARENT with its own testid (the
    // gate measured the table at 444px == the pane: no scroll seam existed).
    const scrollEl = table.parentElement
    expect(scrollEl, 'the table has a parent scroll container').not.toBeNull()
    expect(scrollEl?.getAttribute('data-testid')).toBe('calibration-table-scroll')
    // The table is NOT forced to the container's width (the defect's
    // width:100% pin — it now may be wider and the container scrolls).
    expect(table.style.width).toBe('')
  })

  it('every header cell reserves its FULL name on one line (min-width from the header name, per column)', () => {
    renderView()
    const table = screen.getByTestId('calibration-table') as HTMLTableElement
    const ths = Array.from(table.querySelectorAll('thead th'))
    // 12 artifact-declared columns + the fit-checkbox column (fixture data).
    expect(ths.length).toBe(TABLE_PAYLOAD.columns.length + 1)
    for (const th of ths) {
      const min = getComputedStyle(th).minWidth
      expect(min, `header "${th.textContent}" reserves a min-width`).not.toBe('0px')
      expect(min, `header "${th.textContent}" reserves a min-width`).not.toBe('auto')
    }
    // Data cells get the SAME per-column floor as their header (a narrow td
    // would re-squeeze the column below its header's reservation).
    const bodyCells = Array.from(table.querySelectorAll('tbody tr:first-child td'))
    expect(bodyCells.length).toBe(ths.length)
    for (const td of bodyCells) {
      expect(getComputedStyle(td).minWidth, `data cell reserves the column min-width`).not.toBe('0px')
    }
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
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page as object as never} onRecalcDone={() => {}} />
    )
    const reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('level_1')
    expect(screen.getByTestId('calibration-source-run')).toBeDisabled()
  })
})

// --- FIX1 D4 RED — the source-run link FOLLOWS the selected row's OWN ----
// peak_source (hard line (b): "selecting a calibration-table row highlights
// its point + residual AND links to its originating run"). Default (no
// selection) = the outlier. Excluded rows resolve via their own peak_source
// (no fit point exists for them — the D5 join carries it).

describe('D2 link — FIX1 D4: the link follows the SELECTED row, defaulting to the outlier', () => {
  const GET_RECORD_BY_AOUT: Record<string, { payload: { runRef: { id: string } } }> = {
    'AOUT-SRC-1': { payload: { runRef: { id: 'ANR-SRC-1' } } },
    'AOUT-SRC-2': { payload: { runRef: { id: 'ANR-SRC-2' } } },
    'AOUT-SRC-3': { payload: { runRef: { id: 'ANR-SRC-3' } } },
  }

  it('selecting row 2 -> the link target CHANGES from the outlier default to row 2\'s source input', async () => {
    vi.mocked(apiClient.getRecord).mockImplementation((id: string) => Promise.resolve(GET_RECORD_BY_AOUT[id] as never))
    // Default (nothing selected): the outlier (level 3) is the link target.
    renderView()
    let reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('level_3')
    fireEvent.click(screen.getByTestId('calibration-resolve-source-run'))
    let link = (await screen.findByTestId('calibration-source-run')) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/analysis?run=ANR-SRC-3')

    // Select row 2 -> the link now follows row 2's OWN peak_source input
    // (level_2), even though the outlier is still level 3.
    fireEvent.click(screen.getByTestId('calibration-row-level_2'))
    reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('level_2')
    fireEvent.click(screen.getByTestId('calibration-resolve-source-run'))
    link = (await screen.findByTestId('calibration-source-run')) as HTMLAnchorElement
    expect(apiClient.getRecord).toHaveBeenLastCalledWith('AOUT-SRC-2')
    expect(link.getAttribute('href')).toBe('/analysis?run=ANR-SRC-2')
  })

  it('selecting an EXCLUDED row resolves its source run via its OWN peak_source (it has no fit point)', async () => {
    const page: PageContext = {
      activeRunId: 'ANR-CAL-1',
      revisions: PAGE_CTX.revisions,
      sourceRun: {
        recordId: 'ANR-CAL-1',
        payload: {
          id: 'ANR-CAL-1',
          title: 'TEST calibration run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-CAL-1' },
          inputs: { ...SOURCE_INPUTS, level_5: { kind: 'record', id: 'AOUT-SRC-5', type: 'analysis-output-artifact' } },
          parameters: CAL_PARAMS,
        },
      },
    }
    vi.mocked(apiClient.getRecord).mockResolvedValue({ payload: { runRef: { id: 'ANR-SRC-5' } }, id: 'AOUT-SRC-5' } as never)
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page} onRecalcDone={() => {}} />)
    // Row level 5 is excluded (fit_point false) — its source input comes from
    // its own peak_source (level_5:row0), which no fit point exists for.
    fireEvent.click(screen.getByTestId('calibration-row-level_5'))
    const reason = screen.getByTestId('calibration-source-run-unresolved')
    expect(reason.textContent).toContain('level_5')
    fireEvent.click(screen.getByTestId('calibration-resolve-source-run'))
    const link = (await screen.findByTestId('calibration-source-run')) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/analysis?run=ANR-SRC-5')
  })

  it('clearing the selection returns the link to the outlier default', () => {
    renderView()
    fireEvent.click(screen.getByTestId('calibration-row-level_2'))
    expect(screen.getByTestId('calibration-source-run-unresolved').textContent).toContain('level_2')
    fireEvent.click(screen.getByTestId('calibration-row-level_2')) // toggle off
    expect(screen.getByTestId('calibration-source-run-unresolved').textContent).toContain('level_3')
  })
})

// --- FIX2 OBS O-B: the source-run link never guesses on an amount collision --
// (cycle-2 §4 O-B: when a row's peak_source is unparseable (NO_MATCHING_PEAK),
// the join falls back to an AMOUNT-keyed fit point for the run link — the
// provenance-by-amount the D5 fix removed for the primary path. An amount
// COLLISION there attributes the LAST WRITER's source input (a provenance
// lie: the row's run link points at another level's run). The closed
// calibrationModel.test.ts NO_MATCHING_PEAK pin (unambiguous amount ->
// sourceInput 'level_1') stays untouched; the fix is COLLISION-ONLY: when
// more than one fit point shares the amount, the source is NAMED UNRESOLVED
// (sourceInput null) instead of guessed. RED: before the fix the view
// resolves the last writer's input and offers a "resolve" button (the lie);
// GREEN: no resolve button, the named unresolved arm instead.)
describe('FIX2 OBS O-B — the source-run link is a NAMED unresolved arm on an amount collision (never a last-writer guess)', () => {
  it('a single unparseable-peak_source row whose amount is COLLIDED by two fit points: no resolve button, named unresolved arm', () => {
    // ONE table row: no parseable peak_source (null), amount 2. TWO fit points
    // share amount 2 (level_2 + level_3) — a legal duplicate amount, so the
    // amount-keyed fallback is AMBIGUOUS. The row's source input must be
    // unresolved (null), NOT the last writer's (level_3).
    const page: PageContext = {
      activeRunId: 'ANR-CAL-1',
      revisions: PAGE_CTX.revisions,
      sourceRun: {
        recordId: 'ANR-CAL-1',
        payload: {
          id: 'ANR-CAL-1',
          title: 'TEST calibration run',
          status: 'succeeded',
          revisionRef: { id: 'ANREV-CAL-1' },
          inputs: {
            level_2: { kind: 'record', id: 'AOUT-SRC-2', type: 'analysis-output-artifact' },
            level_3: { kind: 'record', id: 'AOUT-SRC-3', type: 'analysis-output-artifact' },
          },
          parameters: CAL_PARAMS,
        },
      },
    }
    vi.mocked(apiClient.getRecord).mockResolvedValue({ payload: { runRef: { id: 'ANR-SRC-3' } }, id: 'AOUT-SRC-3' } as never)
    const tablePayload = {
      ...TABLE_PAYLOAD,
      rows: [
        { level: 1, amount: 2, peak_source: null, response_raw_pa_min: 9000, response_ratio: 9, fit_point: true, relative_residual: 0, flags: ['NO_MATCHING_PEAK'] },
      ],
    }
    const modelPayload = {
      ...MODEL_PAYLOAD,
      fit_points: [
        { amount: 2, response: 5, source_input: 'level_2', source_point_ref: { input_name: 'level_2', peak_row_index: 0 } },
        { amount: 2, response: 9.5, source_input: 'level_3', source_point_ref: { input_name: 'level_3', peak_row_index: 0 } },
      ],
    }
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(tablePayload)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(modelPayload)) }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page} onRecalcDone={() => {}} />)
    // The source-run link is the DISABLED unresolved button (no anchor
    // rendered), and there is NO "resolve" button — the amount collision is
    // NAMED unresolved, never resolved to the last writer's (level_3) run.
    expect((screen.getByTestId('calibration-source-run') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('calibration-source-run-unresolved')).not.toBeNull()
    expect(screen.queryByTestId('calibration-resolve-source-run')).toBeNull()
  })
})

// --- FIX1 D6 RED — the fit checkbox is keyed on the ROW's OWN inclusion ---
// (fit_point), applied via the model's setLevelFit LEVEL TAG — never the
// OPTIONAL input_names (a legal run omits them: CAL_PARAMS_SCHEMA's items
// required list has no input_names, and python only DEFAULTS it internally).

const CAL_PARAMS_NO_INPUT_NAMES = {
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
    { level: 1, compound_label: 'TEST-CMPD-A', amount: 1, rt_target_min: 1, rt_window_min: 0.25, fit: true, required: true },
    { level: 2, compound_label: 'TEST-CMPD-B', amount: 2, rt_target_min: 2, rt_window_min: 0.25, fit: true, required: true },
    { level: 3, compound_label: 'TEST-CMPD-C', amount: 3, rt_target_min: 3, rt_window_min: 0.25, fit: true, required: true },
  ],
}

/** A PageContext over the default fixture artifacts with REPLACED frozen
 * parameters (the D6 fixtures: input_names omitted / level tags unmatched). */
function pageWithFrozenParams(parameters: Record<string, unknown>): PageContext {
  return {
    activeRunId: 'ANR-CAL-1',
    revisions: PAGE_CTX.revisions,
    sourceRun: {
      recordId: 'ANR-CAL-1',
      payload: {
        id: 'ANR-CAL-1',
        title: 'TEST calibration run',
        status: 'succeeded',
        revisionRef: { id: 'ANREV-CAL-1' },
        inputs: SOURCE_INPUTS,
        parameters,
      },
    },
  }
}

describe('D6 — the fit checkbox: initial state from the row OWN inclusion; toggle via the level tag (no input_names)', () => {
  const pageNoInputNames = pageWithFrozenParams(CAL_PARAMS_NO_INPUT_NAMES)

  const renderNoInputNames = () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    return render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageNoInputNames} onRecalcDone={() => {}} />)
  }

  it('with input_names OMITTED the checkboxes reflect the rows OWN fit_point (not all-unchecked)', () => {
    // RED (input_names-keyed): no level row matches -> every checkbox renders
    // unchecked even for fit_point: true rows (a false visual claim).
    renderNoInputNames()
    expect((screen.getByTestId('calibration-fit-level_1') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('calibration-fit-level_2') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('calibration-fit-level_5') as HTMLInputElement).checked).toBe(false) // the row's OWN fit_point: false
  })

  it('toggling a row with input_names OMITTED still arms the diff + writes the fit flag via the LEVEL TAG (no silent no-op)', () => {
    // RED (input_names-keyed): toggleLevelFit matched nothing -> the levels
    // array returned unchanged and the diff line stayed "(no pending changes)".
    renderNoInputNames()
    fireEvent.click(screen.getByTestId('calibration-fit-level_2'))
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toContain('level 2: fit true -> false')
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const formMock = screen.getByTestId('calibration-recalc-mock')
    const value = JSON.parse(formMock.getAttribute('data-value') ?? '{}') as { levels: Record<string, unknown>[] }
    expect(value.levels[1].fit).toBe(false)
    expect(value.levels[0].fit).toBe(true)
  })

  it('a row whose level tag matches NO levels[] row -> NAMED unmatched state (disabled checkbox, no silent no-op)', () => {
    const page = pageWithFrozenParams({ model: 'linear', levels: [{ level: 1, fit: true }] })
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page} onRecalcDone={() => {}} />)
    // Rows 2-5 carry no matching levels[] row: the checkbox is disabled and a
    // NAMED line says so (the row's own inclusion is still the visible state).
    expect((screen.getByTestId('calibration-fit-level_2') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('calibration-fit-level_2') as HTMLInputElement).checked).toBe(true) // row's own fit_point
    expect(screen.getByTestId('calibration-fit-unmatched').textContent).toContain('level 2')
  })
})

// --- RGF D6 — the source-run line's inline siblings are SEPARATED ---------
// (RUNGATE1 DEFECT-6: the inline button + reason span + resolve button ran
// together in the rendered text — `…source runclick "resolve"…(record
// AOUT-000016)resolve` — no whitespace between the inline siblings; the
// operator reads `runclick` / `016)resolve` as one token.)

describe('RGF D6 — the source-run line: inline siblings are separated (no run-together text)', () => {
  it('the disabled button, the reason span and the resolve button are whitespace-separated in the rendered line', () => {
    renderView()
    const text = screen.getByTestId('calibration-run-line').textContent ?? ''
    // RED (no separators): the button's own text ("source run") butts
    // against the reason's leading word ("click …"), and the reason's
    // closing "(record …)" butts against the resolve button's text.
    expect(text).not.toContain('runclick')
    expect(text).not.toContain(')resolve')
    // The reason span is bounded by whitespace on BOTH sides inside the
    // line (button → space → reason → space → resolve button).
    const reason = screen.getByTestId('calibration-source-run-unresolved').textContent ?? ''
    expect(text).toContain(`${reason} resolve`)
    expect(text).toContain('source run ' + reason)
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
      <CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page as object as never} onRecalcDone={() => {}} />
    )
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    expect(screen.getByTestId('calibration-recalc-noschema').textContent).toContain('parameterSchema')
    expect(screen.queryByTestId('calibration-recalc-submit')).toBeNull()
  })
})

// --- FIX1 D1 RED — the recalc binds the SOURCE RUN'S FROZEN revisionRef, ----
// never page.revisions[0] (the reviewer's single-revision fixture masked it:
// with ONE revision, [0] is incidentally the source run's own revision).

const CAL_SCHEMA_B = {
  type: 'object',
  required: ['model'],
  properties: { model: { type: 'string', enum: ['linear', 'quadratic'] } },
}
/** Multi-revision page: the page's FIRST revision is a UNRELATED legacy
 * revision WITHOUT a parameterSchema (the lane's ANREV-000001..5 shape); the
 * source run's frozen revisionRef names the SECOND revision, which carries
 * the parameterSchema. The form must render the source run's revision's
 * schema (spec D4 verbatim: "the dedicated ParameterForm over the ACTIVE
 * RUN'S REVISION's parameterSchema"). */
const PAGE_CTX_MULTI_REV: PageContext = {
  activeRunId: 'ANR-CAL-1',
  revisions: [
    { recordId: 'ANREV-LEGACY-1', payload: { id: 'ANREV-LEGACY-1', title: 'legacy, no schema' } },
    { recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: CAL_SCHEMA_B } },
  ],
  sourceRun: {
    recordId: 'ANR-CAL-1',
    payload: {
      id: 'ANR-CAL-1',
      title: 'TEST calibration run',
      status: 'succeeded',
      revisionRef: { id: 'ANREV-CAL-1' },
      inputs: SOURCE_INPUTS,
      parameters: { model: 'linear' },
    },
  },
}

describe('D4 recalc — FIX1 D1: the revision is the source run FROZEN revisionRef, never revisions[0]', () => {
  it('the labeled form renders the SOURCE RUN revision parameterSchema when [0] is an unrelated schema-less revision', () => {
    // RED (revisions[0]-keyed): [0] has no parameterSchema -> the shipped
    // code renders the noschema arm and the labeled form never opens.
    renderView(PAGE_CTX_MULTI_REV)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const formMock = screen.getByTestId('calibration-recalc-mock')
    expect(JSON.parse(formMock.getAttribute('data-value') ?? '{}')).toEqual({ model: 'linear' })
    // The form is over the source run's revision's schema, not the first
    // page entry's (the first entry has none at all).
    expect(screen.queryByTestId('calibration-recalc-noschema')).toBeNull()
  })

  it('submit carries the SOURCE RUN revisionRef (revisions[0] is never consulted)', async () => {
    const newRunId = 'ANR-RECALC-D1'
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId, run: {} } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId, status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} } as never)
    const { onRecalcDone } = renderView(PAGE_CTX_MULTI_REV)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    await vi.waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    // RED (revisions[0]-keyed): the body carried the UNRELATED legacy
    // revision (or an empty id with an empty list) — never the source's.
    expect(apiClient.createAnalysisRun).toHaveBeenLastCalledWith(expect.objectContaining({
      revisionRef: { kind: 'record', id: 'ANREV-CAL-1', type: 'analysis-revision' },
    }))
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalledWith(expect.objectContaining({
      revisionRef: expect.objectContaining({ id: 'ANREV-LEGACY-1' }),
    }))
    // onRecalcDone fires after the NEW run's execute settles.
    await vi.waitFor(() => expect(onRecalcDone).toHaveBeenCalledWith(newRunId))
  })

  it('the source revision ABSENT from the page list -> NAMED disabled state (never a malformed empty-id POST)', () => {
    const page: PageContext = {
      ...PAGE_CTX_MULTI_REV,
      revisions: [{ recordId: 'ANREV-LEGACY-1', payload: { id: 'ANREV-LEGACY-1', title: 'legacy, no schema' } }],
    }
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const arm = screen.getByTestId('calibration-recalc-noschema')
    // The named state names the MISSING REVISION (not just "no schema").
    expect(arm.textContent).toContain('ANREV-CAL-1')
    expect(arm.textContent).toContain('parameterSchema')
    expect(screen.queryByTestId('calibration-recalc-submit')).toBeNull()
    // And nothing is ever POSTed with an empty revision id.
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })
})

// --- FIX2 M2 RED — the recalc gate over the REAL shipped parameterSchema ---
// (cycle-2 M2: collectGateIssues(...).unsupported blocked EVERY recalculation
// when the revision carried the REAL calibration parameterSchema —
// istd:{type:'object'} (no properties), calibration_run_id:{type:['string',
// 'null']}, levels[].compound_ref:{type:['object','string','null']} and
// levels[].input_names:{type:'array'} (no items) ALL classify "unsupported"
// in ParameterForm.classify — so the submit was permanently disabled for
// every real CAL run and receipt (c) was unreachable. The cycle-1 tests
// dodged this with a synthetic minimal schema. FIX (orch-ratified): mirror
// the SHIPPED page gate exactly — the unsupported arm blocks ONLY while the
// recalc region's own raw-JSON override is INACTIVE (the page's
// pCollectGateIssues / advancedSeed pattern, AnalysisPage.tsx:99-115);
// missing/invalidNumbers ALWAYS block. ParameterForm.tsx UNEDITED —
// import/reuse only (OQ-6 door A).)

/** The REAL shipped calibration parameterSchema — copied VERBATIM from
 * server/src/analysis/analysisGcCalibrationChaining.test.ts:79-113
 * (CAL_PARAMS_SCHEMA). NOT a synthetic minimal schema: the multi-type and
 * items-less nodes are the shipped shape the form must survive. */
const REAL_CAL_PARAMETER_SCHEMA = {
  type: 'object',
  required: ['model', 'weighting', 'origin_constraint', 'correlation_statistic', 'amount_unit',
    'istd', 'extrapolation', 'fail_on_out_of_range', 'levels'],
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
    calibration_run_id: { type: ['string', 'null'] },
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

/** VALID frozen parameters over the REAL schema: every required key present,
 * level 2 excluded (fit: false) — a real CAL run's stored parameters (the
 * spine's CAL_PARAMS shape, two levels). */
const REAL_CAL_FROZEN_PARAMS = {
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
    { level: 2, compound_label: 'TEST-CMPD-B', compound_ref: { id: 'LC-CMPD-2' }, amount: 2, rt_target_min: 2, rt_window_min: 0.25, fit: false, required: true, input_names: ['level_2'] },
  ],
}
/** The raw-JSON override the scientist submits for the constructs the
 * labeled form cannot render (a full parameter JSON — the override door's
 * point): the same valid frozen parameters with the model switched. */
const REAL_CAL_OVERRIDE_PARAMS = { ...JSON.parse(JSON.stringify(REAL_CAL_FROZEN_PARAMS)), model: 'quadratic' }

function pageWithRealSchema(parameters: Record<string, unknown>): PageContext {
  return {
    activeRunId: 'ANR-CAL-1',
    revisions: [{ recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: REAL_CAL_PARAMETER_SCHEMA } }],
    sourceRun: {
      recordId: 'ANR-CAL-1',
      payload: {
        id: 'ANR-CAL-1',
        title: 'TEST calibration run',
        status: 'succeeded',
        revisionRef: { id: 'ANREV-CAL-1' },
        inputs: SOURCE_INPUTS,
        parameters,
      },
    },
  }
}

describe('D7 — FIX2 M2: the recalc gate over the REAL shipped parameterSchema (raw-JSON override door)', () => {
  beforeEach(async () => {
    // The mock module's re-exported gate functions wired to the REAL
    // implementations (same harness as the FIX1 D7 block — the view's gate
    // computation imports them; the form component stays the mock).
    const real = await vi.importActual<typeof import('./ParameterForm')>('./ParameterForm')
    pfHolder.gate = real.collectGateIssues
    pfHolder.prune = real.pruneEmpty
  })

  const REAL_ARTIFACTS = () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    return { artifact, modelArtifact }
  }

  it('(i) labeled-only mode over the REAL schema is BLOCKED with the NAMED unsupported reason (no dead chrome)', () => {
    // The REAL schema's unrenderable constructs (istd object-without-
    // properties, calibration_run_id multi-type, levels[].compound_ref
    // multi-type, levels[].input_names items-less array) classify
    // "unsupported" — the labeled form cannot render them, so the submit is
    // blocked and the reason NAMES the paths (never a silent grey button).
    const { artifact, modelArtifact } = REAL_ARTIFACTS()
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithRealSchema(REAL_CAL_FROZEN_PARAMS)} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const submit = screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    const blocked = screen.getByTestId('calibration-recalc-blocked')
    expect(blocked.textContent).toContain('Cannot submit: unsupported construct(s) at')
    // The named paths include the shipped unrenderable nodes (the reviewer's
    // probe: istd, calibration_run_id, levels[*].compound_ref/input_names).
    expect(blocked.textContent).toContain('istd')
    expect(blocked.textContent).toContain('calibration_run_id')
    expect(blocked.textContent).toContain('levels[0].compound_ref')
    // A forced click still POSTs nothing (the handler refuses, not just the
    // disabled attribute).
    fireEvent.click(submit)
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })

  it('(ii) with the raw-JSON override ACTIVE the submit POSTs the OVERRIDE parameters (the real-shape recalc becomes reachable)', async () => {
    // RED (FIX2): the recalc region had NO raw-JSON override door — the
    // unsupported arm blocked every recalc on the REAL schema, so this test
    // cannot even find the door (calibration-recalc-advanced absent).
    const newRunId = 'ANR-RECALC-M2'
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ recordId: newRunId } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId, status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} } as never)
    const { artifact, modelArtifact } = REAL_ARTIFACTS()
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithRealSchema(REAL_CAL_FROZEN_PARAMS)} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    // The override door exists in the recalc region, scoped to the recalc
    // form (seeded from the current form values — the page's advancedSeed
    // pattern; NOT the schema-less legacy demo literal).
    const details = screen.getByTestId('calibration-recalc-advanced') as HTMLDetailsElement
    details.open = true
    const input = screen.getByTestId('calibration-recalc-params') as HTMLInputElement
    // Seed = the current (frozen) form values as the seed's CANONICAL form:
    // the box opens showing what the form would send — never the no-schema
    // demo literal. (The seed state is the pretty sortedParamsJson string;
    // a DOM <input> value strips newlines by platform design (jsdom
    // included — verified empirically: assigning pretty JSON to .value
    // returns it newline-free), so the DOM-faithful assertion PARSES the
    // input value and deep-compares it (key-order-agnostic) to the frozen
    // params — a different object would still fail.)
    expect(JSON.parse(input.value)).toEqual(REAL_CAL_FROZEN_PARAMS)
    // No override active yet: still blocked (arm (i)).
    expect((screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('calibration-recalc-override')).toBeNull()
    // Activate the override with the FULL parameter JSON (the constructs the
    // labeled form cannot render included verbatim).
    fireEvent.change(input, { target: { value: JSON.stringify(REAL_CAL_OVERRIDE_PARAMS) } })
    // The override badge is visible (the page's override-discipline chrome)
    // and the submit UNBLOCKS (unsupported bypassed; the real params satisfy
    // every required control).
    expect(screen.getByTestId('calibration-recalc-override').textContent).toContain('Advanced JSON overrides the form')
    const submit = screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    expect(screen.queryByTestId('calibration-recalc-blocked')).toBeNull()
    // The frozen preview shows the EXACT override JSON that will be sent
    // (sorted-keys, the page's preview contract). (The DOM node's raw text
    // child — textContent normalizes whitespace and would collapse the
    // pretty-printed JSON; firstChild may be a comment node, so take the
    // first TEXT node.)
    const previewNode = screen.getByTestId('calibration-recalc-preview')
    const previewText = Array.from(previewNode.childNodes).find((n) => n.nodeType === 3)?.nodeValue ?? ''
    expect(previewText).toBe(sortedParamsJson(REAL_CAL_OVERRIDE_PARAMS))
    // The submit POSTs the OVERRIDE parameters (the full JSON, verbatim).
    fireEvent.click(submit)
    await vi.waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as Record<string, unknown>
    expect(body.parameters).toEqual(REAL_CAL_OVERRIDE_PARAMS)
    expect((body.parameters as { levels: Record<string, unknown>[] }).levels[1].fit).toBe(false)
    // execute fires on the NEW id; the completion callback fires.
    await vi.waitFor(() => expect(apiClient.executeAnalysisRun).toHaveBeenCalledTimes(1))
    expect(apiClient.executeAnalysisRun).toHaveBeenCalledWith(newRunId)
  })

  it('(iii) missing-required STILL blocks: inactive override (block + no POST) and even with the override ACTIVE the missing arm names the missing controls', async () => {
    const { artifact, modelArtifact } = REAL_ARTIFACTS()
    // Frozen params with ONE of the nine required keys present: the missing
    // arm AND the unsupported arm both fire.
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithRealSchema({ model: 'linear' })} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    // Override INACTIVE: blocked (the named reason exists) and a forced
    // click POSTs nothing.
    const submit = screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByTestId('calibration-recalc-blocked').textContent).toContain('Cannot submit')
    fireEvent.click(submit)
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    // Override ACTIVE (a valid JSON object — the override itself omits the
    // required keys): the missing arm STILL blocks (override bypasses
    // unsupported, NOT missing/invalidNumbers) and the reason NAMES the
    // missing required parameters — the labeled-form gate arms stay live.
    const details = screen.getByTestId('calibration-recalc-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('calibration-recalc-params'), { target: { value: JSON.stringify({ model: 'linear' }) } })
    expect(submit.disabled).toBe(true)
    const blocked = screen.getByTestId('calibration-recalc-blocked')
    expect(blocked.textContent).toContain('Cannot submit: missing required parameter(s):')
    expect(blocked.textContent).toContain('weighting')
    expect(blocked.textContent).toContain('levels')
    fireEvent.click(submit)
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })

  it('(iii-c) invalid override JSON is its own NAMED condition (distinct testid, page D8 discipline) and blocks the submit', () => {
    const { artifact, modelArtifact } = REAL_ARTIFACTS()
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithRealSchema(REAL_CAL_FROZEN_PARAMS)} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const details = screen.getByTestId('calibration-recalc-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('calibration-recalc-params'), { target: { value: '{not json' } })
    // The invalid-JSON line names the condition on its OWN testid (never
    // conflated with the gate-block line), and the override does NOT
    // unblock (an unparseable override cannot carry the parameters).
    expect(screen.getByTestId('calibration-recalc-invalid-json').textContent).toContain('invalid')
    expect((screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('calibration-recalc-submit'))
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
  })
})

// --- RGF D7 — the recalc submit's DISABLED state is visually distinguishable --
// (RUNGATE1 DEFECT-7: the disabled and enabled submits 'both render as
// identical borderless text' — the button carried no class-scoped styling,
// so only the presence/absence of the reason line told the operator which
// state. The closure the component OWNS: the button's OWN class
// (`.calibration-curve__recalc-submit`) carries the disabled treatment in
// CalibrationCurveView.css (opacity .5 + not-allowed, mirroring the frozen
// page discipline) AND an explicit inline state style — opacity 0.5 +
// not-allowed when blocked, opacity 1 + pointer when live. Note: the frozen
// AnalysisPage.css `.analysis button:disabled` rules are DESCENDANT selectors
// and the composite renders in `.analysis-right`, not `.analysis` — the
// button does NOT join the `analysis` class list (that class matches the bare
// `.analysis` CONTAINER box rule on the button itself, a real-browser layout
// defect the first fix cycle shipped; RGF2 removed it).)

describe('RGF D7 — the recalc submit disabled state is visually distinguishable (own-class :disabled treatment)', () => {
  const renderRecalcOpen = (page: PageContext) => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={page} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    return screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
  }

  it('a blocked submit reads as a DISABLED button (page :disabled chrome, not identical live chrome)', () => {
    // The REAL shipped schema's unrenderable constructs block the labeled
    // form (the gate's ANR-000013 state — the submit's disabled=true arm).
    const submit = renderRecalcOpen(pageWithRealSchema(REAL_CAL_FROZEN_PARAMS))
    expect(submit.disabled).toBe(true)
    expect(screen.getByTestId('calibration-recalc-blocked').textContent).toContain('Cannot submit')
    // The button carries its OWN button-scoped class (the disabled treatment
    // lives in CalibrationCurveView.css on `.calibration-curve__recalc-submit:disabled`,
    // mirroring the frozen page discipline) — RGF1's false claim was that the
    // page's `.analysis button:disabled` discipline applied because the button
    // joined the `analysis` class list; it is a DESCENDANT selector and this
    // button is not inside `.analysis` (the composite renders in
    // `.analysis-right`).
    expect(submit.classList.contains('calibration-curve__recalc-submit')).toBe(true)
    // jsdom's style resolution does not apply stylesheet :disabled rules, so
    // the OPACITY assertion is the computed-value proxy that the component's
    // OWN state style writes at render time (a plain unstyled button computes
    // the default opaque 1):
    expect(getComputedStyle(submit).opacity).toBe('0.5')
    expect(getComputedStyle(submit).cursor).toBe('not-allowed')
  })

  it('an enabled submit keeps the LIVE page chrome (the two states now differ in the computed style)', () => {
    // The minimal gate schema with a satisfied required control: the gate
    // passes, the submit is live.
    const MIN_SCHEMA = { type: 'object', required: ['model'], properties: { model: { type: 'string' } } }
    const page: PageContext = {
      ...PAGE_CTX,
      revisions: [{ recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: MIN_SCHEMA } }],
      sourceRun: {
        recordId: 'ANR-CAL-1',
        payload: { id: 'ANR-CAL-1', title: 'TEST calibration run', status: 'succeeded', revisionRef: { id: 'ANREV-CAL-1' }, inputs: SOURCE_INPUTS, parameters: { model: 'linear' } },
      },
    }
    const submit = renderRecalcOpen(page)
    expect(submit.disabled).toBe(false)
    expect(screen.queryByTestId('calibration-recalc-blocked')).toBeNull()
    // The live button keeps FULL opacity (never the reduced-opacity disabled
    // treatment) and a cursor that is NOT not-allowed — the distinguishable
    // pair with the disabled state above.
    expect(getComputedStyle(submit).opacity).toBe('1')
    expect(getComputedStyle(submit).cursor).not.toBe('not-allowed')
  })

  it('the submit carries NO class that matches the frozen page CONTAINER box rule (RGF2: the first fix shipped className="analysis" on the button)', () => {
    // AnalysisPage.css:1-7 (FROZEN): `.analysis { display:flex;
    // flex-direction:column; gap:1rem; padding:1rem 1.25rem 2rem;
    // max-width:720px; }`. The button is NOT inside an `.analysis` element
    // (the composite renders in `.analysis-right`, AnalysisPage.tsx:706), so
    // its class list must not contain `analysis` — carrying it matches the
    // bare CONTAINER rule ON the button: flex-column with 1rem 1.25rem 2rem
    // padding and max-width 720px (a real-browser layout defect jsdom cannot
    // see — the class absence is the assertable half of this fix).
    const submit = renderRecalcOpen(pageWithRealSchema(REAL_CAL_FROZEN_PARAMS))
    expect(submit.classList.contains('analysis'), 'the frozen page CONTAINER class must not sit on the button').toBe(false)
    expect(Array.from(submit.classList), 'only the button-scoped class(es) remain').not.toContain('analysis')
  })
})

// --- FIX1 D7 RED — the recalc submit rides the SHIPPED GATE ------------------
// (spec D4: "the shipped gate collectGateIssues applies to the recalc form too —
// a blocked recalc names its reason (no dead chrome)"). The shipped onRecalc
// POSTed whatever the form held — no collectGateIssues, no pruneEmpty.
//
// This describe re-mocks './ParameterForm' so collectGateIssues is the REAL
// exported gate (the component-level mock above returns a div-only form; the
// view's GATE COMPUTATION imports the function, so the default mock would
// replace it with undefined — the test's whole authority). The form
// COMPONENT stays the mock (value visible via data-value; no real controls
// needed to drive the gate).

describe('D7 — FIX1: the recalc submit is gated by collectGateIssues (shipped gate, named reason)', () => {
  beforeEach(async () => {
    // Wire the mock module's re-exported gate functions to the REAL
    // implementations (the view imports them — the mock surface must forward,
    // spec D4: "the shipped gate applies to the recalc form too").
    const real = await vi.importActual<typeof import('./ParameterForm')>('./ParameterForm')
    pfHolder.gate = real.collectGateIssues
    pfHolder.prune = real.pruneEmpty
  })

  const RECALC_ARTIFACTS = () => {
    const artifact: RenderableArtifact = { id: 'A1', name: 't', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'A2', name: 'm', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    return { artifact, modelArtifact }
  }

  // A MINIMAL parameterSchema (one required string control) — deterministic
  // against the REAL shipped gate (CAL_SCHEMA's multi-type `compound_ref`
  // node classifies as an "unsupported construct", which would block EVERY
  // recalc and make the valid-passes arm untestable). The revision id matches
  // the source run's frozen revisionRef (the D1 binding: the form renders
  // over the ACTIVE RUN'S REVISION's parameterSchema).
  const MIN_SCHEMA = {
    type: 'object',
    required: ['model'],
    properties: { model: { type: 'string' } },
  }
  const pageWithParams = (parameters: Record<string, unknown>): PageContext => ({
    ...PAGE_CTX,
    revisions: [{ recordId: 'ANREV-CAL-1', payload: { id: 'ANREV-CAL-1', title: 'TEST cal revision', parameterSchema: MIN_SCHEMA } }],
    sourceRun: {
      recordId: 'ANR-CAL-1',
      payload: {
        id: 'ANR-CAL-1',
        title: 'TEST calibration run',
        status: 'succeeded',
        revisionRef: { id: 'ANREV-CAL-1' },
        inputs: SOURCE_INPUTS,
        parameters,
      },
    },
  })

  it('invalid recalc params (a required control missing) -> submit DISABLED + the reason NAMED, and a click POSTs nothing', async () => {
    // The source run's frozen parameters omit the REQUIRED `model` control —
    // a legal frozen-state shape the form pre-fills verbatim (spec D4). The
    // shipped onRecalc POSTed it anyway (no gate); the fixed view must block.
    const { artifact, modelArtifact } = RECALC_ARTIFACTS()
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithParams({})} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    // The form renders over the source revision's parameterSchema (the D1
    // fix); the empty frozen values pre-fill.
    expect(screen.getByTestId('calibration-recalc-mock')).toBeDefined()
    const submit = screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    // The blocked reason is NAMED next to the button (no dead chrome —
    // mirrors the page's analysis-params-blocked discipline) and names the
    // missing required control.
    const blocked = screen.getByTestId('calibration-recalc-blocked')
    expect(blocked.textContent).toContain('Cannot submit')
    expect(blocked.textContent).toContain('model')
    // A forced click still POSTs nothing (the handler refuses, not just the
    // disabled attribute).
    fireEvent.click(submit)
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
  })

  it('valid recalc params -> submit ENABLED, the gate passes, and the POST carries the PRUNED parameters', async () => {
    const newRunId = 'ANR-RECALC-D7'
    vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ recordId: newRunId } as never)
    vi.mocked(apiClient.executeAnalysisRun).mockResolvedValue({ success: true, recordId: newRunId } as never)
    const { artifact, modelArtifact } = RECALC_ARTIFACTS()
    const VALID = { model: 'linear' }
    render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageWithParams(VALID)} onRecalcDone={() => {}} />)
    fireEvent.click(screen.getByTestId('calibration-recalc-open'))
    const submit = screen.getByTestId('calibration-recalc-submit') as HTMLButtonElement
    // The required control is satisfied — the gate must NOT block a valid
    // recalc (a gate that blocks everything is dead chrome too).
    expect(submit.disabled).toBe(false)
    expect(screen.queryByTestId('calibration-recalc-blocked')).toBeNull()
    fireEvent.click(submit)
    await vi.waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const body = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0] as Record<string, unknown>
    expect(body.parameters).toEqual(VALID)
  })
})

// --- RGF D3 RED — the composite edit state is keyed to the ACTIVE RUN ------
// (RUNGATE1 DEFECT-3, probe2 receipts: `params/selected/formOpen` are
// initialised with `useState(() => frozenParams(page))` and the component is
// NOT re-keyed when page.activeRunId changes — the page's selectRun path
// re-renders the SAME instance with the new run's page context. A pending
// edit on run A therefore survives onto run B's display (phantom
// `level 3: fit true -> false` + a checkbox contradicting the displayed
// run's own fit_point cell), and a recalc opened after the switch would POST
// run A's edited parameters against run B's frozen refs — the M1 provenance
// class. GC-9 discipline: a selection change clears manual edits; a RUN
// change is the stronger case.)

/** The recalc-run's OWN stored parameters (the gate probe's ANR-000014
 * shape: level 3 excluded) — a DIFFERENT run, same revision/inputs. */
const CAL_PARAMS_LEVEL3_EXCLUDED: Record<string, unknown> = {
  ...JSON.parse(JSON.stringify(CAL_PARAMS)),
  levels: (JSON.parse(JSON.stringify(CAL_PARAMS)).levels as Record<string, unknown>[]).map((lv, i) => (i === 2 ? { ...lv, fit: false } : lv)),
}

function pageForRun(runId: string, title: string, parameters: Record<string, unknown>): PageContext {
  return {
    activeRunId: runId,
    revisions: PAGE_CTX.revisions,
    sourceRun: {
      recordId: runId,
      payload: {
        id: runId,
        title,
        status: 'succeeded',
        revisionRef: { id: 'ANREV-CAL-1' },
        inputs: SOURCE_INPUTS,
        parameters,
      },
    },
  }
}

describe('RGF D3 — the composite edit state is keyed to the active run (a run switch re-keys it)', () => {
  it('toggle fit -> switch runs -> switch back: the checkbox matches the run OWN stored fit and the diff says (no pending changes)', () => {
    const pageA = pageForRun('ANR-CAL-1', 'TEST calibration run', CAL_PARAMS)
    const pageB = pageForRun('ANR-CAL-2', 'TEST recalc run', CAL_PARAMS_LEVEL3_EXCLUDED)
    const artifact: RenderableArtifact = { id: 'AOUT-CAL-TABLE', name: 'calibration_table', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(TABLE_PAYLOAD)) }
    const modelArtifact: RenderableArtifact = { id: 'AOUT-CAL-MODEL', name: 'calibration_model', dataKind: 'table', inlineValue: JSON.parse(JSON.stringify(MODEL_PAYLOAD)) }
    const { rerender } = render(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageA} onRecalcDone={() => {}} />)
    // Run A's own stored state: level 3 fit = true, no pending changes.
    expect((screen.getByTestId('calibration-fit-level_3') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toBe('(no pending changes)')
    // A PENDING edit (toggled, never submitted).
    fireEvent.click(screen.getByTestId('calibration-fit-level_3'))
    expect((screen.getByTestId('calibration-fit-level_3') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toContain('level 3: fit true -> false')
    // Switch to run B: the component instance is NOT re-mounted (same element
    // type — the page's selectRun path re-renders it), only re-rendered with
    // run B's page context (B's own stored fit for level 3 is false).
    rerender(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageB} onRecalcDone={() => {}} />)
    expect(screen.getByTestId('calibration-run-line').textContent).toContain('ANR-CAL-2')
    // Back to run A. RED (unkeyed state): the pending edit survives — the
    // checkbox shows run A's OLD edit against run A's data and the diff claims
    // a change the run never had. GREEN: the state re-keys to run A's OWN
    // frozen parameters (checkbox = the run's stored fit, diff = none).
    rerender(<CalibrationCurveView artifact={artifact} modelArtifact={modelArtifact} page={pageA} onRecalcDone={() => {}} />)
    expect(screen.getByTestId('calibration-run-line').textContent).toContain('ANR-CAL-1')
    expect((screen.getByTestId('calibration-fit-level_3') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('calibration-recalc-diff').textContent).toBe('(no pending changes)')
  })
})
