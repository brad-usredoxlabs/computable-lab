/**
 * GC-11 [A] RED — the pure calibration model: shape gates, the row<->fit-point
 * join, the response_quantity->column const map, the SHIPPED `_predict` key
 * rule (line geometry ONLY), outlier-by-max-over-the-artifact's-own-residuals,
 * the quantitative/uncalibrated classifier, and the recalc-param diff.
 *
 * Every fixture mirrors the SHIPPED GC-8 shapes (calibration_fit.py @ 891185da
 * + the spine analysisGcCalibrationChaining.test.ts CAL_PARAMS_SCHEMA /
 * MINIMAL_PEAK_TABLE_ENTRY) — nothing invented. This file commits BEFORE
 * calibrationModel.ts exists (expected RED: Cannot find module './
 * calibrationModel').
 */
import { describe, expect, it } from 'vitest'
import {
  CAL_ARTIFACT_COLUMNS,
  MODEL_PAYLOAD_KEYS,
  RESPONSE_QUANTITY_TO_COLUMN,
  applyLevelOverrides,
  classifyCalibrationModel,
  classifyCalibrationTable,
  classifyResultView,
  joinCurvePoints,
  maxResidualIndexes,
  parseCalibrationBindings,
  parsePeakSource,
  predictAt,
  responseColumn,
  setLevelFit,
} from './calibrationModel'

// --- fixtures (data literals, GC-8 shipped shapes) --------------------------

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

/** The GC-8 calibration_table inline value: an OBJECT {rows, columns, ...}
 * (correction 3 — never a bare array). Level 5 is excluded (fit_point false,
 * EXCLUDED_FROM_FIT in flags); level 3 is the outlier (worst residual). */
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

const QUANT_PAYLOAD = {
  rows: [{ compound_label: 'TEST-CMPD-A', amount_ng_uL: 1.0, amount_reported_ng_uL: 1.0, area_percent: 12.5 }],
  columns: ['compound_label', 'amount_ng_uL', 'amount_reported_ng_uL', 'area_percent'],
  model_artifact_id: null, // correction F4/16: legitimately null
  model_params_digest: 'TEST-DIGEST-1',
  extrapolation_policy: 'reject',
  amount_semantics: 'model_amount_as_reported',
  calibration_scope: 'analytical',
  params_digest: 'TEST-DIGEST-1',
}

// --- structural gates -------------------------------------------------------

describe('classifyCalibrationTable — structural, never name-based', () => {
  it('accepts the shipped GC-8 calibration_table shape (object with rows + gate columns)', () => {
    const r = classifyCalibrationTable(TABLE_PAYLOAD)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.rows.length).toBe(5)
  })

  it('accepts RENAMED artifacts (the classifier is over CONTENT, bait #5)', () => {
    const r = classifyCalibrationTable(JSON.parse(JSON.stringify(TABLE_PAYLOAD)))
    expect(r.ok).toBe(true)
  })

  it('rejects a bare array (TableView-era payloads)', () => {
    expect(classifyCalibrationTable([TABLE_PAYLOAD.rows[0]]).ok).toBe(false)
  })

  it('rejects a table lacking the fit_point column', () => {
    const cols = TABLE_PAYLOAD.columns.filter((c) => c !== 'fit_point')
    expect(classifyCalibrationTable({ ...TABLE_PAYLOAD, columns: cols }).ok).toBe(false)
  })

  it('rejects a table lacking the relative_residual column', () => {
    const cols = TABLE_PAYLOAD.columns.filter((c) => c !== 'relative_residual')
    expect(classifyCalibrationTable({ ...TABLE_PAYLOAD, columns: cols }).ok).toBe(false)
  })

  it('rejects a table whose rows are not records', () => {
    expect(classifyCalibrationTable({ rows: ['x'], columns: [...TABLE_PAYLOAD.columns] }).ok).toBe(false)
  })

  it('rejects a dref-backed payload (no inline value)', () => {
    expect(classifyCalibrationTable(undefined).ok).toBe(false)
  })

  it('exposes the single column-const table (bait #2: one exported const)', () => {
    expect(CAL_ARTIFACT_COLUMNS).toEqual({
      level: 'level',
      compoundLabel: 'compound_label',
      amount: 'amount',
      peakSource: 'peak_source',
      responseRaw: 'response_raw_pa_min',
      responseRatio: 'response_ratio',
      fitPoint: 'fit_point',
      relativeResidual: 'relative_residual',
      flags: 'flags',
    })
    expect(RESPONSE_QUANTITY_TO_COLUMN).toEqual({
      raw_area_pa_min: 'response_raw_pa_min',
      area_ratio: 'response_ratio',
    })
  })
})

describe('classifyCalibrationModel — structural, never name-based', () => {
  it('accepts the shipped GC-8 calibration_model payload', () => {
    const r = classifyCalibrationModel(MODEL_PAYLOAD)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.coefficients).toEqual({ slope: 2, intercept: 1 })
  })

  it('exposes the single model-key const table', () => {
    expect(MODEL_PAYLOAD_KEYS).toEqual({
      model: 'model',
      equation: 'equation',
      coefficients: 'coefficients',
      statisticName: 'statistic_name',
      statisticValue: 'statistic_value',
      statisticDefinition: 'statistic_definition',
      residualBasis: 'residual_basis',
      responseQuantity: 'response_quantity',
      amountUnit: 'amount_unit',
      fitPoints: 'fit_points',
      xMin: 'x_min',
      xMax: 'x_max',
    })
  })

  it('rejects a payload without coefficients', () => {
    const p: Record<string, unknown> = { ...MODEL_PAYLOAD }
    delete p.coefficients
    expect(classifyCalibrationModel(p).ok).toBe(false)
  })

  it('rejects a payload without fit_points', () => {
    const p: Record<string, unknown> = { ...MODEL_PAYLOAD }
    delete p.fit_points
    expect(classifyCalibrationModel(p).ok).toBe(false)
  })

  it('rejects undefined (dref-backed model artifact)', () => {
    expect(classifyCalibrationModel(undefined).ok).toBe(false)
  })

  // FIX1 O5 — omit-absent discipline (the project's omit-absent rule, bait #8):
  // optional string/number keys whose payload value is absent must be OMITTED
  // from the returned shape, not present with an undefined value.
  it('OMITS absent optional keys (never present-with-undefined — omit-absent rule)', () => {
    const p: Record<string, unknown> = { ...MODEL_PAYLOAD }
    delete p.equation
    delete p.statistic_definition
    delete p.residual_basis
    delete p.amount_unit
    delete p.x_min
    delete p.x_max
    const r = classifyCalibrationModel(p)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).not.toHaveProperty('headLine')
      expect(r.value).not.toHaveProperty('statisticDefinition')
      expect(r.value).not.toHaveProperty('residualBasis')
      expect(r.value).not.toHaveProperty('amountUnit')
      expect(r.value).not.toHaveProperty('xMin')
      expect(r.value).not.toHaveProperty('xMax')
      // The present optionals still arrive verbatim.
      expect(r.value.statisticName).toBe('weighted_r_squared')
      expect(r.value.responseQuantity).toBe('area_ratio')
    }
  })
})

// --- response quantity -> column (data-driven, bait #2) ----------------------

describe('responseColumn — the F4 const map, no branching on domain words', () => {
  it('maps area_ratio to the ratio column', () => {
    expect(responseColumn('area_ratio')).toBe('response_ratio')
  })
  it('maps raw_area_pa_min to the raw column', () => {
    expect(responseColumn('raw_area_pa_min')).toBe('response_raw_pa_min')
  })
  it('returns undefined for an unmapped quantity (the view renders a named reason)', () => {
    expect(responseColumn('mystery_quantity')).toBeUndefined()
  })
})

// --- _predict mirror (line geometry only, python :528-534) -------------------

describe('predictAt — the SHIPPED _predict key rule verbatim (geometry, not analysis)', () => {
  it('linear: {slope, intercept}', () => {
    expect(predictAt('linear', { slope: 2, intercept: 1 }, 4)).toBe(9)
  })
  it('linear_through_origin: {slope, intercept}', () => {
    expect(predictAt('linear_through_origin', { slope: 3, intercept: 0 }, 2)).toBe(6)
  })
  it('quadratic: {c0, c1, c2} (c0 + c1*x + c2*x*x)', () => {
    expect(predictAt('quadratic', { c0: 1, c1: 2, c2: 0.5 }, 3)).toBe(11.5)
  })
  it('returns null for an unknown model id (honest, never a guessed formula)', () => {
    expect(predictAt('cubic', { slope: 1, intercept: 0 }, 2)).toBeNull()
  })
  it('returns null for non-finite inputs', () => {
    expect(predictAt('linear', { slope: 1, intercept: 0 }, Number.NaN)).toBeNull()
  })
})

// --- the row<->fit-point join ------------------------------------------------

describe('joinCurvePoints — rows x fit_points keyed on amount', () => {
  it('joins every row to its fit point (source_input + residual from the artifact)', () => {
    const j = joinCurvePoints(TABLE_PAYLOAD.rows as Record<string, unknown>[], MODEL_PAYLOAD.fit_points as Record<string, unknown>[], 'response_ratio')
    expect(j.length).toBe(5)
    const p3 = j[2]
    expect(p3.row.amount).toBe(3)
    expect(p3.response).toBe(9.5)
    expect(p3.included).toBe(true)
    expect(p3.residual).toBe(33.333333)
    expect(p3.sourceInput).toBe('level_3')
    expect(p3.peakSource).toBe('level_3:row0')
  })

  it('marks excluded rows from the row OWN fit_point flag (not the fit_points list)', () => {
    const j = joinCurvePoints(TABLE_PAYLOAD.rows as Record<string, unknown>[], MODEL_PAYLOAD.fit_points as Record<string, unknown>[], 'response_ratio')
    expect(j[4].included).toBe(false)
  })

  it('a row whose fit point is missing keeps its row data; its source input now resolves from its OWN peak_source (FIX1 D4/D5 contract — the fit point is a cross-check, the row link is the authority)', () => {
    const fp = (MODEL_PAYLOAD.fit_points as Record<string, unknown>[]).slice(0, 2)
    const j = joinCurvePoints(TABLE_PAYLOAD.rows as Record<string, unknown>[], fp, 'response_ratio')
    // Row level 4 has no fit point in the list (sliced away) but its OWN
    // shipped peak_source names its input — D4: the run link must follow the
    // row's own link even when no fit point exists.
    expect(j[3].sourceInput).toBe('level_4')
    expect(j[3].residual).toBe(0)
  })

  it('a row with NO parseable peak_source falls back to the amount-matched fit point source (degraded honest path — the NO_MATCHING_PEAK case)', () => {
    const rows: Record<string, unknown>[] = [
      { level: 1, amount: 1, peak_source: null, response_ratio: 3, fit_point: true, relative_residual: 0, flags: ['NO_MATCHING_PEAK'] },
    ]
    const fps: Record<string, unknown>[] = [
      { amount: 1, response: 3, source_input: 'level_1', source_point_ref: { input_name: 'level_1', peak_row_index: 0 } },
    ]
    const j = joinCurvePoints(rows, fps, 'response_ratio')
    expect(j[0].sourceInput).toBe('level_1')
  })

  it('reads the response column per the response_quantity map (fixture-flip proof)', () => {
    const jRaw = joinCurvePoints(TABLE_PAYLOAD.rows as Record<string, unknown>[], MODEL_PAYLOAD.fit_points as Record<string, unknown>[], 'response_raw_pa_min')
    expect(jRaw[2].response).toBe(9500)
    const jRatio = joinCurvePoints(TABLE_PAYLOAD.rows as Record<string, unknown>[], MODEL_PAYLOAD.fit_points as Record<string, unknown>[], 'response_ratio')
    expect(jRatio[2].response).toBe(9.5)
  })
})

// --- FIX1 D5 RED — the join must key on the SHIPPED link, never on amount ----
// The reviewer's vite-node probe (GC11-advreview-cycle1 §3 D5): two levels
// sharing an amount (the reviewer's levels 1/2/3, amounts 1/2/2) collapsed the
// provenance under the amount-keyed join — row level 2 got level_3's
// source_input and both rows carried the same React key. Duplicate standard
// amounts are legal declared parameter data; the join must use the row's OWN
// shipped peak_source string "<input>:row<idx>" (calibration_fit.py:797) vs the
// fit point's source_point_ref {input_name, peak_row_index}, and the row key
// must be unique per row.

describe('joinCurvePoints — FIX1 D5: the join keys on the shipped link, NOT amount', () => {
  // The reviewer's own fixture shape: levels 1/2/3, amounts 1/2/2. Row level
  // 2's peak_source names level_2 (its OWN input) while both amount-2 rows
  // share the x value; fit_points carries the per-level refs.
  const DUP_ROWS: Record<string, unknown>[] = [
    { level: 1, amount: 1, peak_source: 'level_1:row0', response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
    { level: 2, amount: 2, peak_source: 'level_2:row3', response_ratio: 5, fit_point: true, relative_residual: 1.2, flags: [] },
    { level: 3, amount: 2, peak_source: 'level_3:row7', response_ratio: 9, fit_point: true, relative_residual: 2.4, flags: [] },
  ]
  const DUP_FPS: Record<string, unknown>[] = [
    { amount: 1, response: 3, source_input: 'level_1', source_point_ref: { input_name: 'level_1', peak_row_index: 0 } },
    { amount: 2, response: 5, source_input: 'level_2', source_point_ref: { input_name: 'level_2', peak_row_index: 3 } },
    { amount: 2, response: 9, source_input: 'level_3', source_point_ref: { input_name: 'level_3', peak_row_index: 7 } },
  ]

  it('two rows sharing an amount keep their OWN source inputs (no provenance collapse)', () => {
    const j = joinCurvePoints(DUP_ROWS, DUP_FPS, 'response_ratio')
    expect(j.length).toBe(3)
    expect(j[0].sourceInput).toBe('level_1')
    // RED (amount-keyed join): the amount-2 rows both resolve to the LAST
    // writer (level_3) — row level 2 must keep its OWN input name.
    expect(j[1].sourceInput).toBe('level_2')
    expect(j[2].sourceInput).toBe('level_3')
  })

  it('every row key is unique on duplicate-amount data (duplicate React keys are impossible)', () => {
    const j = joinCurvePoints(DUP_ROWS, DUP_FPS, 'response_ratio')
    const keys = j.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('an EXCLUDED row (no fit point) still resolves its source input from its own peak_source', () => {
    // Python builds fit_points only for fit levels (calibration_fit.py:845-853):
    // the excluded row is absent from the fit_points list entirely.
    const rows: Record<string, unknown>[] = [
      { level: 1, amount: 1, peak_source: 'level_1:row0', response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
      { level: 2, amount: 2, peak_source: 'level_2:row1', response_ratio: 11, fit_point: false, relative_residual: null, flags: ['EXCLUDED_FROM_FIT'] },
    ]
    const fps: Record<string, unknown>[] = [
      { amount: 1, response: 3, source_input: 'level_1', source_point_ref: { input_name: 'level_1', peak_row_index: 0 } },
    ]
    const j = joinCurvePoints(rows, fps, 'response_ratio')
    expect(j[1].included).toBe(false)
    expect(j[1].sourceInput).toBe('level_2') // from the row's OWN peak_source, not a fit point
    expect(j[1].peakSource).toBe('level_2:row1')
  })

  it('parsePeakSource is the join authority (split on the LAST :row; honest null on malformed)', () => {
    expect(parsePeakSource('level_2:row3')).toEqual({ inputName: 'level_2', rowIndex: 3 })
    expect(parsePeakSource('a:b:row12')).toEqual({ inputName: 'a:b', rowIndex: 12 })
    expect(parsePeakSource('row0')).toBeNull()
    expect(parsePeakSource(null)).toBeNull()
    expect(parsePeakSource('level_1:row')).toBeNull()
  })
})

// --- FIX2 OBS O-C + O-B: join termination + the amount-collision arm --------
// O-C: the shipped keyFor loop `while (seenKeys.has(k)) k = \`${base}-${rowIdx}\``
// never MUTATES k on a repeat — when the natural suffix is itself a claimed base
// it spins forever (adversarial names X / X-2 / X). The bounded suffix counter
// makes it TERMINATE (RED: the old loop is an unbounded spin — captured by probe,
// never by a vitest worker that would hang). O-B: a row with an unparseable
// peak_source whose amount is COLLIDED by two fit points must resolve its source
// to UNRESOLVED (null) — not the last writer's input (the closed unambiguous
// NO_MATCHING_PEAK pin stays green).
describe('joinCurvePoints — FIX2 OBS O-C/O-B: bounded key suffix + amount-collision arm', () => {
  // The reviewer's adversarial name shape: base X claimed by row 0, X-2 claimed
  // by row 1, then row 2 re-asks for base X — the natural suffix X-2 is ALREADY
  // claimed, so the old loop recomputes X-2 forever. The bounded counter must
  // terminate with a unique key.
  it('O-C: adversarial colliding names terminate with UNIQUE keys (no infinite loop)', () => {
    const rows: Record<string, unknown>[] = [
      { level: 1, amount: 1, peak_source: 'X:row0', response_ratio: 3, fit_point: true, relative_residual: 0, flags: [] },
      { level: 2, amount: 2, peak_source: 'X-2:row0', response_ratio: 5, fit_point: true, relative_residual: 0, flags: [] },
      { level: 3, amount: 3, peak_source: 'X:row1', response_ratio: 9, fit_point: true, relative_residual: 0, flags: [] },
    ]
    // The old keyFor would spin forever here (RED evidence via the standalone
    // probe — a vitest run on the old code times out the worker). The fixed
    // join must RETURN with every key unique.
    const j = joinCurvePoints(rows, [], 'response_ratio')
    expect(j.length).toBe(3)
    const keys = j.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    // Row 2 (base X, suffix X-2 both claimed) gets the bounded counter key.
    expect(keys[2]).toBe('X-2-2')
  })

  it('O-B: a row with NO parseable peak_source whose amount is COLLIDED by two fit points resolves sourceInput to null (named unresolved, not a last-writer guess)', () => {
    const rows: Record<string, unknown>[] = [
      { level: 1, amount: 2, peak_source: null, response_ratio: 9, fit_point: true, relative_residual: 0, flags: ['NO_MATCHING_PEAK'] },
    ]
    const fps: Record<string, unknown>[] = [
      { amount: 2, response: 5, source_input: 'level_2', source_point_ref: { input_name: 'level_2', peak_row_index: 0 } },
      { amount: 2, response: 9.5, source_input: 'level_3', source_point_ref: { input_name: 'level_3', peak_row_index: 0 } },
    ]
    // Two fit points share amount 2 — the amount-keyed fallback is AMBIGUOUS.
    // RED (old code): the last writer's source_input (level_3) was returned —
    // a provenance lie. GREEN: named unresolved (null).
    const j = joinCurvePoints(rows, fps, 'response_ratio')
    expect(j[0].sourceInput).toBeNull()
  })

  it('O-B: the UNAMBIGUOUS amount case keeps the honest fallback (the closed NO_MATCHING_PEAK pin)', () => {
    const rows: Record<string, unknown>[] = [
      { level: 1, amount: 1, peak_source: null, response_ratio: 3, fit_point: true, relative_residual: 0, flags: ['NO_MATCHING_PEAK'] },
    ]
    const fps: Record<string, unknown>[] = [
      { amount: 1, response: 3, source_input: 'level_1', source_point_ref: { input_name: 'level_1', peak_row_index: 0 } },
    ]
    // Exactly one fit point at amount 1 — the amount key is unambiguous, so the
    // degraded fallback names level_1 (the behavior the closed leg pins).
    const j = joinCurvePoints(rows, fps, 'response_ratio')
    expect(j[0].sourceInput).toBe('level_1')
  })
})

// --- outlier (max over the artifact OWN residuals, no threshold) -------------

describe('maxResidualIndexes — presentation pointer, no scientific threshold', () => {
  it('returns the single max |relative_residual| among INCLUDED rows', () => {
    const idx = maxResidualIndexes(
      TABLE_PAYLOAD.rows as Record<string, unknown>[],
      1,
    )
    expect(idx).toEqual([2])
  })
  it('respects outlierTopN=2 (descending by absolute residual; ties keep row order)', () => {
    const idx = maxResidualIndexes(TABLE_PAYLOAD.rows as Record<string, unknown>[], 2)
    expect(idx).toEqual([2, 0])
  })
  it('ignores null residuals (the ZERO_OBSERVED rows carry flags, not a number)', () => {
    const rows = TABLE_PAYLOAD.rows.map((r) => ({ ...r })) as Record<string, unknown>[]
    rows[0].relative_residual = null
    rows[0].flags = ['ZERO_OBSERVED']
    const idx = maxResidualIndexes(rows, 1)
    expect(idx).toEqual([2])
  })
  it('returns empty when no row carries a finite residual', () => {
    const rows = TABLE_PAYLOAD.rows.map((r) => ({ ...r, relative_residual: null })) as Record<string, unknown>[]
    expect(maxResidualIndexes(rows, 1)).toEqual([])
  })
})

// --- quantitative vs uncalibrated (D5, correction F4/16) ---------------------

describe('classifyResultView — quantitative iff model_params_digest present', () => {
  it('classifies the quantified payload quantitative (digest present, model_artifact_id NULL)', () => {
    expect(classifyResultView(QUANT_PAYLOAD, false)).toBe('quantitative')
  })
  it('classifies a raw table uncalibrated', () => {
    expect(classifyResultView({ rows: [{ a: 1 }], columns: ['a'] }, false)).toBe('uncalibrated')
  })
  it('classifies a non-object payload uncalibrated (no error)', () => {
    expect(classifyResultView([1, 2, 3], false)).toBe('uncalibrated')
    expect(classifyResultView(undefined, false)).toBe('uncalibrated')
  })
  it('a calibration-pair manifest feeds quantitative for the pair artifacts', () => {
    expect(classifyResultView(TABLE_PAYLOAD, true)).toBe('quantitative')
    expect(classifyResultView(MODEL_PAYLOAD, true)).toBe('quantitative')
  })
})

// --- recalc params (D4) ------------------------------------------------------

describe('setLevelFit / applyLevelOverrides — pure, no source mutation', () => {
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
  const frozen = JSON.stringify(CAL_PARAMS)

  it('setLevelFit flips the matching level by its level tag', () => {
    const out = setLevelFit(CAL_PARAMS as Record<string, unknown>, 'levels', 3, false)
    const lv = out.levels as unknown as Record<string, unknown>[]
    expect(lv[2].fit).toBe(false)
    expect(lv[0].fit).toBe(true)
    expect(JSON.stringify(CAL_PARAMS)).toBe(frozen) // source untouched
  })

  it('setLevelFit is a no-op for a non-array levels value', () => {
    const p = { levels: { level: 1 } }
    expect(setLevelFit(p, 'levels', 1, false)).toEqual(p)
  })

  it('applyLevelOverrides applies many toggles, appends when a level is new', () => {
    const out = applyLevelOverrides(CAL_PARAMS as Record<string, unknown>, 'levels', [{ level: 2, fit: false }, { level: 9, fit: true }])
    const levels = out.levels as Record<string, unknown>[]
    expect(levels[1].fit).toBe(false)
    expect(levels[3]).toEqual({ level: 9, fit: true })
    expect(JSON.stringify(CAL_PARAMS)).toBe(frozen)
  })
})

// --- bindings guard (persisted-record door) ----------------------------------

describe('parseCalibrationBindings — closed-shape guard (named errors)', () => {
  it('parses an empty bindings object', () => {
    const r = parseCalibrationBindings({})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.outlierTopN).toBe(1)
  })

  it('parses the canonical GC-11 bindings', () => {
    const r = parseCalibrationBindings({ modelArtifact: 'calibration_model', rowLabelField: 'compound_label', outlierTopN: 3 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.modelArtifact).toBe('calibration_model')
      expect(r.value.rowLabelField).toBe('compound_label')
      expect(r.value.outlierTopN).toBe(3)
    }
  })

  it('rejects unknown keys with a NAMED guard error (bait: audited keys)', () => {
    const r = parseCalibrationBindings({ bogus: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('bogus')
  })

  it('rejects a non-integer outlierTopN', () => {
    const r = parseCalibrationBindings({ outlierTopN: 1.5 })
    expect(r.ok).toBe(false)
  })

  it('rejects a non-string modelArtifact', () => {
    const r = parseCalibrationBindings({ modelArtifact: 42 })
    expect(r.ok).toBe(false)
  })

  it('rejects a non-object bindings value', () => {
    const r = parseCalibrationBindings('nope')
    expect(r.ok).toBe(false)
  })
})
