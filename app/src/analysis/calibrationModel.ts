/**
 * calibrationModel — the pure core of the GC-11 calibration-curve view.
 *
 * No DOM, no API, no domain policy: this module holds (a) the SINGLE exported
 * const tables naming the artifact property names (bait #2: every other file
 * consumes these constants; zero domain literals elsewhere), (b) structural
 * shape guards over the SHIPPED GC-8 payload shapes (calibration_fit.py @
 * 891185da — content classification, never name equality), (c) the row <->
 * fit-point join, (d) the `_predict` key rule mirrored VERBATIM from
 * calibration_fit.py:528-534 (line GEOMETRY only — the python module owns all
 * analysis math; this evaluation is plotting, not refitting), and (e) the
 * quantitative/uncalibrated classifier + recalc-param diff (D4/D5).
 */

// --- the single exported const tables (property NAMES, one place) ------------

/** The GC-8 calibration_table column names (CAL_TABLE_COLUMNS,
 * calibration_fit.py:1070-1073 — verbatim). */
export const CAL_ARTIFACT_COLUMNS = {
  level: 'level',
  compoundLabel: 'compound_label',
  amount: 'amount',
  peakSource: 'peak_source',
  responseRaw: 'response_raw_pa_min',
  responseRatio: 'response_ratio',
  fitPoint: 'fit_point',
  relativeResidual: 'relative_residual',
  flags: 'flags',
} as const

/** The GC-8 calibration_model payload keys (payload build :1026-1055). */
export const MODEL_PAYLOAD_KEYS = {
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
} as const

/** response_quantity VALUE -> table COLUMN (F4 correction 17: the values are
 * `raw_area_pa_min` / `area_ratio`, NOT column names). A wrong pick is a
 * defect; the fixture-flip test proves the data drives it. */
export const RESPONSE_QUANTITY_TO_COLUMN = {
  raw_area_pa_min: 'response_raw_pa_min',
  area_ratio: 'response_ratio',
} as const

/** The quantified-table digest key (quantification.py:823-824/:551 — ALWAYS
 * present on a quantified payload; `model_artifact_id` may legitimately be
 * null, so the classifier keys on THIS, correction F4/16). */
export const QUANT_DIGEST_KEY = 'model_params_digest'

// --- small guards -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

type Guarded<T> = { ok: true; value: T } | { ok: false; error: string }

// --- structural gates (content, never names) ----------------------------------

export interface CalibrationTableShape {
  rows: Record<string, unknown>[]
  columns: string[]
  amountUnit?: string
}

/** Structural gate for the GC-8 calibration_table inline value: an OBJECT
 * with an array `rows` of records + a `columns` array containing BOTH the
 * fit_point AND the relative_residual column names (the shipped gate keys,
 * OQ-2 closed). Never matches by artifact name. */
export function classifyCalibrationTable(value: unknown): Guarded<CalibrationTableShape> {
  if (!isRecord(value)) return { ok: false, error: 'not an object payload' }
  const rows = value.rows
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'rows missing or empty' }
  for (const r of rows) {
    if (!isRecord(r)) return { ok: false, error: 'a row is not an object' }
  }
  if (!Array.isArray(value.columns)) return { ok: false, error: 'columns missing' }
  const cols = (value.columns as unknown[]).filter((c): c is string => typeof c === 'string')
  if (!cols.includes(CAL_ARTIFACT_COLUMNS.fitPoint)) return { ok: false, error: 'fit_point column missing' }
  if (!cols.includes(CAL_ARTIFACT_COLUMNS.relativeResidual)) return { ok: false, error: 'relative_residual column missing' }
  const out: CalibrationTableShape = { rows: rows as Record<string, unknown>[], columns: cols }
  if (typeof value.amount_unit === 'string') out.amountUnit = value.amount_unit
  return { ok: true, value: out }
}

export interface CalibrationModelShape {
  model: string
  equation?: string
  coefficients: Record<string, number>
  statisticName?: string
  statisticValue: number | null
  statisticDefinition?: string
  residualBasis?: string
  responseQuantity?: string
  amountUnit?: string
  fitPoints: Record<string, unknown>[]
  xMin?: number
  xMax?: number
}

/** Structural gate for the GC-8 calibration_model payload: carries
 * `model` + structured `coefficients` (keyed object) + `fit_points` +
 * `statistic_name`. Content classification, never name equality. */
export function classifyCalibrationModel(value: unknown): Guarded<CalibrationModelShape> {
  if (!isRecord(value)) return { ok: false, error: 'not an object payload' }
  if (typeof value[MODEL_PAYLOAD_KEYS.model] !== 'string') return { ok: false, error: 'model id missing' }
  const coefs = value[MODEL_PAYLOAD_KEYS.coefficients]
  if (!isRecord(coefs)) return { ok: false, error: 'coefficients missing' }
  for (const k of Object.keys(coefs)) {
    if (!isFiniteNumber(coefs[k])) return { ok: false, error: `coefficient ${k} is not a finite number` }
  }
  if (!Array.isArray(value[MODEL_PAYLOAD_KEYS.fitPoints])) return { ok: false, error: 'fit_points missing' }
  if (typeof value[MODEL_PAYLOAD_KEYS.statisticName] !== 'string') return { ok: false, error: 'statistic_name missing' }
  const sv = value[MODEL_PAYLOAD_KEYS.statisticValue]
  if (!(sv === null || isFiniteNumber(sv))) return { ok: false, error: 'statistic_value must be a number or null' }
  const equation = typeof value[MODEL_PAYLOAD_KEYS.equation] === 'string' ? value[MODEL_PAYLOAD_KEYS.equation] : undefined
  const statisticName = typeof value[MODEL_PAYLOAD_KEYS.statisticName] === 'string' ? value[MODEL_PAYLOAD_KEYS.statisticName] : undefined
  const statisticDefinition = typeof value[MODEL_PAYLOAD_KEYS.statisticDefinition] === 'string' ? value[MODEL_PAYLOAD_KEYS.statisticDefinition] : undefined
  const residualBasis = typeof value[MODEL_PAYLOAD_KEYS.residualBasis] === 'string' ? value[MODEL_PAYLOAD_KEYS.residualBasis] : undefined
  const responseQuantity = typeof value[MODEL_PAYLOAD_KEYS.responseQuantity] === 'string' ? value[MODEL_PAYLOAD_KEYS.responseQuantity] : undefined
  const amountUnit = typeof value[MODEL_PAYLOAD_KEYS.amountUnit] === 'string' ? value[MODEL_PAYLOAD_KEYS.amountUnit] : undefined
  const xMin = isFiniteNumber(value[MODEL_PAYLOAD_KEYS.xMin]) ? value[MODEL_PAYLOAD_KEYS.xMin] : undefined
  const xMax = isFiniteNumber(value[MODEL_PAYLOAD_KEYS.xMax]) ? value[MODEL_PAYLOAD_KEYS.xMax] : undefined
  const out: CalibrationModelShape = {
    model: value[MODEL_PAYLOAD_KEYS.model],
    coefficients: coefs as Record<string, number>,
    statisticValue: sv as number | null,
    fitPoints: value[MODEL_PAYLOAD_KEYS.fitPoints] as Record<string, unknown>[],
    equation,
    statisticName,
    statisticDefinition,
    residualBasis,
    responseQuantity,
    amountUnit,
    xMin,
    xMax,
  }
  return { ok: true, value: out }
}

// --- response quantity -> column (data-driven) --------------------------------

/** The F4 const map: returns the TABLE COLUMN for a declared
 * response_quantity, or undefined (the view renders a named reason). */
export function responseColumn(quantity: string | undefined): string | undefined {
  if (quantity === undefined) return undefined
  return (RESPONSE_QUANTITY_TO_COLUMN as Record<string, string>)[quantity]
}

// --- _predict mirror (geometry ONLY) ------------------------------------------

/** The SHIPPED `_predict` key rule VERBATIM (calibration_fit.py:528-534):
 * `{slope, intercept}` for linear / linear_through_origin, `{c0, c1, c2}` for
 * quadratic. Line geometry for the plot ONLY — the python module owns the
 * arithmetic; this evaluates the artifact's OWN structured coefficients.
 * Unknown model ids or non-finite inputs return null (honest, never a
 * guessed formula). String-parsing `equation` is BANNED (model_schema note
 * :1181-1182: the structured coefficients carry the truth). */
export function predictAt(model: string, coefficients: Record<string, number>, x: number): number | null {
  if (!Number.isFinite(x)) return null
  const num = (v: unknown): number | null => (isFiniteNumber(v) ? v : null)
  if (model === 'linear') {
    const slope = num(coefficients.slope)
    const intercept = num(coefficients.intercept)
    if (slope === null || intercept === null) return null
    return slope * x + intercept
  }
  if (model === 'linear_through_origin') {
    const slope = num(coefficients.slope)
    if (slope === null) return null
    return slope * x
  }
  if (model === 'quadratic') {
    const c0 = num(coefficients.c0)
    const c1 = num(coefficients.c1)
    const c2 = num(coefficients.c2)
    if (c0 === null || c1 === null || c2 === null) return null
    return c2 * x * x + c1 * x + c0
  }
  return null
}

// --- the row <-> fit-point join ------------------------------------------------

export interface CurvePoint {
  /** Stable selection key: the parsed peak_source input name + row index,
   * falling back to the row's own level tag (both are artifact data). */
  key: string
  row: Record<string, unknown>
  amount: number | null
  response: number | null
  included: boolean
  residual: number | null
  sourceInput: string | null
  peakSource: string | null
  flags: string[]
}

/** Parse the peak_source STRING `<input_name>:row<idx>` (calibration_fit.py:797)
 * — split on the LAST `:row`. Returns null when absent/malformed (honest). */
export function parsePeakSource(peakSource: unknown): { inputName: string; rowIndex: number } | null {
  if (typeof peakSource !== 'string') return null
  const i = peakSource.lastIndexOf(':row')
  if (i <= 0) return null
  const inputName = peakSource.slice(0, i)
  const idx = Number(peakSource.slice(i + ':row'.length))
  if (inputName.length === 0 || !Number.isInteger(idx) || idx < 0) return null
  return { inputName, rowIndex: idx }
}

function levelTag(row: Record<string, unknown>): string {
  const lv = row[CAL_ARTIFACT_COLUMNS.level]
  return typeof lv === 'string' || typeof lv === 'number' ? String(lv) : ''
}

/** Join the table rows to the model's fit points keyed on AMOUNT (the
 * declared x variable). Row-level truth (included/excluded, flags, residual,
 * peak_source) comes from the ROW; the fit-point cross-check (source_input)
 * rides the matched entry. Rows without a matching fit point keep their row
 * data with sourceInput null (never dropped, never invented). */
export function joinCurvePoints(
  rows: Record<string, unknown>[],
  fitPoints: Record<string, unknown>[],
  responseCol: string,
): CurvePoint[] {
  const byAmount = new Map<number, Record<string, unknown>>()
  for (const fp of fitPoints) {
    if (isRecord(fp) && isFiniteNumber(fp.amount)) byAmount.set(fp.amount, fp)
  }
  return rows.map((row) => {
    const amount = isFiniteNumber(row[CAL_ARTIFACT_COLUMNS.amount]) ? (row[CAL_ARTIFACT_COLUMNS.amount] as number) : null
    const fp = amount !== null ? byAmount.get(amount) : undefined
    const srcRef = isRecord(fp?.source_point_ref) ? fp.source_point_ref : undefined
    const ps = parsePeakSource(row[CAL_ARTIFACT_COLUMNS.peakSource])
    const key = ps ? `${ps.inputName}:row${ps.rowIndex}` : (levelTag(row) || `row-${rows.indexOf(row)}`)
    const residualRaw = row[CAL_ARTIFACT_COLUMNS.relativeResidual]
    const flagsRaw = row[CAL_ARTIFACT_COLUMNS.flags]
    const peakSourceRaw = row[CAL_ARTIFACT_COLUMNS.peakSource]
    return {
      key,
      row,
      amount,
      response: isFiniteNumber(row[responseCol]) ? (row[responseCol] as number) : null,
      included: row[CAL_ARTIFACT_COLUMNS.fitPoint] === true,
      residual: isFiniteNumber(residualRaw) ? (residualRaw as number) : null,
      sourceInput: typeof srcRef?.input_name === 'string' ? srcRef.input_name : (typeof fp?.source_input === 'string' ? fp.source_input : null),
      peakSource: typeof peakSourceRaw === 'string' ? peakSourceRaw : null,
      flags: Array.isArray(flagsRaw) ? (flagsRaw as unknown[]).filter((f): f is string => typeof f === 'string') : [],
    }
  })
}

// --- outlier (max over the artifact OWN residuals; NO threshold) ---------------

/** The row indexes with the largest |relative_residual| among rows carrying a
 * FINITE residual (nulls render as declared ticks with their flags reason —
 * they never rank). Ties keep row order. `topN` is presentation data
 * (bindings.outlierTopN, default 1); the UI points at data and declares no
 * scientific threshold. */
export function maxResidualIndexes(rows: Record<string, unknown>[], topN: number): number[] {
  const ranked: Array<{ i: number; abs: number }> = []
  rows.forEach((r, i) => {
    const v = r[CAL_ARTIFACT_COLUMNS.relativeResidual]
    if (isFiniteNumber(v)) ranked.push({ i, abs: Math.abs(v) })
  })
  ranked.sort((a, b) => b.abs - a.abs || a.i - b.i)
  return ranked.slice(0, Math.max(0, topN)).map((r) => r.i)
}

// --- quantitative vs uncalibrated (D5, correction F4/16) -----------------------

/** Quantitative iff the payload object carries the quantified-table digest
 * (`model_params_digest` — always present on a real quantified table; do NOT
 * key on model_artifact_id, it is legitimately null) OR the run's manifest
 * pairs a calibration model feeding it. Everything else (raw peak tables,
 * area%, generic revisions incl. the DNA lane) classifies uncalibrated —
 * WITHOUT error (bait #13: badges degrade gracefully). */
export function classifyResultView(inlineValue: unknown, hasCalibrationPair: boolean): 'quantitative' | 'uncalibrated' {
  if (hasCalibrationPair) return 'quantitative'
  if (isRecord(inlineValue) && typeof inlineValue[QUANT_DIGEST_KEY] === 'string') return 'quantitative'
  return 'uncalibrated'
}

// --- recalc params (D4) ---------------------------------------------------------

/** Return a NEW parameters object with `levels[<key>]=<levelValue>`'s `fit`
 * flag set — the source object is NEVER mutated (bait #6). When the level tag
 * is absent the override APPENDS a minimal `{level, fit}` row so a toggled
 * point is never silently dropped. No-op when the levels value is not an
 * array. */
export function setLevelFit(
  params: Record<string, unknown>,
  levelsKey: string,
  levelValue: number | string,
  fit: boolean,
): Record<string, unknown> {
  const levels = params[levelsKey]
  if (!Array.isArray(levels)) return params
  const matchesTag = (lv: unknown): boolean => {
    if (!isRecord(lv)) return false
    const tag = lv.level
    return tag === levelValue || (tag !== undefined && String(tag) === String(levelValue))
  }
  const nextLevels = levels.map((lv) => {
    if (!isRecord(lv)) return lv
    const tag = lv.level
    if (tag === levelValue || (tag !== undefined && String(tag) === String(levelValue))) {
      return { ...lv, fit }
    }
    return lv
  })
  if (!levels.some(matchesTag)) {
    nextLevels.push({ level: levelValue, fit })
  }
  return { ...params, [levelsKey]: nextLevels }
}

/** Apply many {level, fit} overrides (appends a minimal row when a level is
 * new). Pure; the source is untouched. */
export function applyLevelOverrides(
  params: Record<string, unknown>,
  levelsKey: string,
  overrides: Array<{ level: number | string; fit: boolean }>,
): Record<string, unknown> {
  let out = params
  for (const o of overrides) out = setLevelFit(out, levelsKey, o.level, o.fit)
  return out
}

// --- bindings guard (persisted-record door) ------------------------------------

export interface CalibrationBindings {
  modelArtifact?: string
  rowLabelField?: string
  outlierTopN: number
}

/** Closed-shape guard over the view-spec `bindings` free object (mirrors
 * traceModel's parseChromatogramBindings style: audited unknown keys, NAMED
 * guard errors). The dispatch arm renders the view-spec__error arm on a
 * failure. */
export function parseCalibrationBindings(raw: unknown): Guarded<CalibrationBindings> {
  if (!isRecord(raw)) return { ok: false, error: 'bindings must be an object' }
  const out: CalibrationBindings = { outlierTopN: 1 }
  for (const [k, v] of Object.entries(raw)) {
    switch (k) {
      case 'modelArtifact':
        if (typeof v !== 'string' || v.length === 0) return { ok: false, error: `bindings.${k} must be a non-empty string` }
        out.modelArtifact = v
        break
      case 'rowLabelField':
        if (typeof v !== 'string' || v.length === 0) return { ok: false, error: `bindings.${k} must be a non-empty string` }
        out.rowLabelField = v
        break
      case 'outlierTopN':
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, error: `bindings.${k} must be a positive integer` }
        out.outlierTopN = v
        break
      default:
        return { ok: false, error: `unknown bindings key: ${k}` }
    }
  }
  return { ok: true, value: out }
}
