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
 * fit-point AND relative-residual column names (the shipped gate keys,
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
  if (!cols.includes(CAL_ARTIFACT_COLUMNS.fitPoint)) return { ok: false, error: `the ${CAL_ARTIFACT_COLUMNS.fitPoint} column is missing` }
  if (!cols.includes(CAL_ARTIFACT_COLUMNS.relativeResidual)) return { ok: false, error: `the ${CAL_ARTIFACT_COLUMNS.relativeResidual} column is missing` }
  const out: CalibrationTableShape = { rows: rows as Record<string, unknown>[], columns: cols }
  if (typeof value.amount_unit === 'string') out.amountUnit = value.amount_unit
  return { ok: true, value: out }
}

export interface CalibrationModelShape {
  model: string
  /** The model's declared head line string (the artifact's own explicit
   * formula text) — display-only; the structured coefficients are the truth. */
  headLine?: string
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
 * `model` + structured `coefficients` (keyed object) + the fit-points array +
 * the named statistic. Content classification, never name equality. */
export function classifyCalibrationModel(value: unknown): Guarded<CalibrationModelShape> {
  if (!isRecord(value)) return { ok: false, error: 'not an object payload' }
  if (typeof value[MODEL_PAYLOAD_KEYS.model] !== 'string') return { ok: false, error: 'model id missing' }
  const coefs = value[MODEL_PAYLOAD_KEYS.coefficients]
  if (!isRecord(coefs)) return { ok: false, error: `the ${MODEL_PAYLOAD_KEYS.coefficients} object is missing` }
  for (const k of Object.keys(coefs)) {
    if (!isFiniteNumber(coefs[k])) return { ok: false, error: `coefficient ${k} is not a finite number` }
  }
  if (!Array.isArray(value[MODEL_PAYLOAD_KEYS.fitPoints])) return { ok: false, error: `the ${MODEL_PAYLOAD_KEYS.fitPoints} array is missing` }
  if (typeof value[MODEL_PAYLOAD_KEYS.statisticName] !== 'string') return { ok: false, error: `the ${MODEL_PAYLOAD_KEYS.statisticName} field is missing` }
  const sv = value[MODEL_PAYLOAD_KEYS.statisticValue]
  if (!(sv === null || isFiniteNumber(sv))) return { ok: false, error: 'statistic_value must be a number or null' }
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const headLine = str(value[MODEL_PAYLOAD_KEYS.equation])
  const statisticName = str(value[MODEL_PAYLOAD_KEYS.statisticName])
  const statisticDefinition = str(value[MODEL_PAYLOAD_KEYS.statisticDefinition])
  const residualBasis = str(value[MODEL_PAYLOAD_KEYS.residualBasis])
  const responseQuantity = str(value[MODEL_PAYLOAD_KEYS.responseQuantity])
  const amountUnit = str(value[MODEL_PAYLOAD_KEYS.amountUnit])
  const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined)
  const xMin = num(value[MODEL_PAYLOAD_KEYS.xMin])
  const xMax = num(value[MODEL_PAYLOAD_KEYS.xMax])
  // Omit-absent discipline (bait #8): an optional key whose payload value is
  // ABSENT is OMITTED from the returned shape — never present-with-undefined
  // (the GC-8 module doctrine: omission, never null/undefined placeholders).
  const out: CalibrationModelShape = {
    model: str(value[MODEL_PAYLOAD_KEYS.model]) ?? '',
    coefficients: coefs as Record<string, number>,
    statisticValue: sv as number | null,
    fitPoints: value[MODEL_PAYLOAD_KEYS.fitPoints] as Record<string, unknown>[],
    ...(headLine !== undefined ? { headLine } : {}),
    ...(statisticName !== undefined ? { statisticName } : {}),
    ...(statisticDefinition !== undefined ? { statisticDefinition } : {}),
    ...(residualBasis !== undefined ? { residualBasis } : {}),
    ...(responseQuantity !== undefined ? { responseQuantity } : {}),
    ...(amountUnit !== undefined ? { amountUnit } : {}),
    ...(xMin !== undefined ? { xMin } : {}),
    ...(xMax !== undefined ? { xMax } : {}),
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
 * guessed formula). String-parsing the head line is BANNED (model_schema note
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
  /** Stable selection key: the row's INPUT NAME (the peak_source input, the
   * level's identity in the run's frozen inputs) falling back to the row's
   * own level tag (both are artifact data). Drives the
   * calibration-row-/calibration-point-/calibration-residual-<key> testids
   * (spec D2's "<level>" key). */
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
 * — split on the LAST `:row`. The index must be an explicit non-negative
 * integer literal (`Number('')` is 0 — an empty index is malformed and
 * rejected). Returns null when absent/malformed (honest). */
export function parsePeakSource(peakSource: unknown): { inputName: string; rowIndex: number } | null {
  if (typeof peakSource !== 'string') return null
  const i = peakSource.lastIndexOf(':row')
  if (i <= 0) return null
  const inputName = peakSource.slice(0, i)
  const idxText = peakSource.slice(i + ':row'.length)
  if (!/^\d+$/.test(idxText)) return null
  const idx = Number(idxText)
  if (inputName.length === 0 || !Number.isInteger(idx)) return null
  return { inputName, rowIndex: idx }
}

function levelTag(row: Record<string, unknown>): string {
  const lv = row[CAL_ARTIFACT_COLUMNS.level]
  return typeof lv === 'string' || typeof lv === 'number' ? String(lv) : ''
}

/** Join the table rows to the model's fit points on the SHIPPED LINK, never
 * on amount (FIX1 D5: duplicate standard amounts are legal declared data and
 * the amount-keyed join collapsed provenance + produced duplicate row keys —
 * reviewer probe). Authority chain per row:
 *   1. the row's OWN `peak_source` string `<input>:row<idx>` (calibration_fit.
 *      py:797) parsed via parsePeakSource — matched against the fit point's
 *      `source_point_ref` {input_name, peak_row_index};
 *   2. else the fit point whose `source_input` / `source_point_ref.input_name`
 *      equals the parsed input name (a ref WITHOUT peak_row_index still
 *      resolves by name — the spine's unpromoted-inline case);
 *   3. else the row keeps its own peak_source input name (an excluded row has
 *      NO fit point at all — python builds fit_points only for fit levels —
 *      and its source input still resolves for the run link).
 * Row-level truth (included/excluded, flags, residual) always comes from the
 * ROW; the fit-point cross-check (source_input) rides the matched entry.
 * Degraded paths (honest, never invented): a row with NO parseable
 * `peak_source` (python's NO_MATCHING_PEAK case) falls back to the fit point
 * whose amount equals the row's amount (geometry equality only — the last
 * resolvable link), and a row with no resolvable input keeps its level tag /
 * row index as its key with sourceInput null. Keys are collision-safe: a key
 * already claimed by an earlier row is suffixed with the row index, so
 * duplicate React keys / testids are impossible by construction. */
export function joinCurvePoints(
  rows: Record<string, unknown>[],
  fitPoints: Record<string, unknown>[],
  responseCol: string,
): CurvePoint[] {
  type FpEntry = { fp: Record<string, unknown>; sourceInput: string | null; amount: number | null }
  const byLink = new Map<string, FpEntry>()
  const byName = new Map<string, FpEntry>()
  const byAmount = new Map<number, FpEntry>()
  // FIX2 OBS O-B: how many fit points share each amount — an amount COLLISION
  // (count > 1) makes the amount-keyed fallback AMBIGUOUS (it would attribute
  // the LAST WRITER's source input — a provenance lie). Tracked here so the
  // join can name the source UNRESOLVED instead of guessing.
  const byAmountCount = new Map<number, number>()
  for (const fp of fitPoints) {
    if (!isRecord(fp)) continue
    const refRaw = fp.source_point_ref
    const ref =
      isRecord(refRaw) && typeof refRaw.input_name === 'string' && isFiniteNumber(refRaw.peak_row_index)
        ? { inputName: refRaw.input_name as string, rowIndex: refRaw.peak_row_index as number }
        : null
    const srcIn = typeof fp.source_input === 'string' ? (fp.source_input as string) : (ref !== null ? ref.inputName : null)
    const amt = isFiniteNumber(fp.amount) ? (fp.amount as number) : null
    const entry: FpEntry = { fp, sourceInput: srcIn, amount: amt }
    if (ref !== null) byLink.set(peakSourceKey(ref), entry)
    if (srcIn !== null) byName.set(srcIn, entry)
    if (amt !== null) {
      byAmount.set(amt, entry)
      byAmountCount.set(amt, (byAmountCount.get(amt) ?? 0) + 1)
    }
  }
  const seenKeys = new Set<string>()
  const keyFor = (base: string, rowIdx: number): string => {
    // Collision-safe: a key already claimed by an earlier row gets a BOUNDED
    // suffix (the row index, then an incrementing counter) — duplicate keys
    // are impossible by construction (the D5 defect: the amount-keyed join
    // produced the same key for two rows). FIX2 OBS O-C: the shipped loop
    // `while (seenKeys.has(k)) k = \`${base}-${rowIdx}\`` NEVER MUTATES k on
    // a repeat — when the natural suffix is itself a claimed base it spins
    // forever (adversarial names A / A-1 / A-1). The bounded counter makes
    // the loop TERMINATE: base, then base-<rowIdx>, then base-<rowIdx>-2 …
    let k = base
    let suffix = 0
    while (seenKeys.has(k)) {
      suffix += 1
      k = suffix === 1 ? `${base}-${rowIdx}` : `${base}-${rowIdx}-${suffix}`
    }
    seenKeys.add(k)
    return k
  }
  return rows.map((row, rowIdx) => {
    const amount = isFiniteNumber(row[CAL_ARTIFACT_COLUMNS.amount]) ? (row[CAL_ARTIFACT_COLUMNS.amount] as number) : null
    const parsed = parsePeakSource(row[CAL_ARTIFACT_COLUMNS.peakSource])
    // The row's OWN shipped link is the primary input-name authority — it
    // names the row's input even when the row is excluded (no fit point).
    const fromRow: FpEntry | undefined =
      parsed !== null ? (byLink.get(peakSourceKey(parsed)) ?? byName.get(parsed.inputName)) : undefined
    // Degraded fallback ONLY when the row carries no parseable peak_source:
    // amount-equality against the fit points (geometry, never a provenance
    // claim when the row's own link is present). FIX2 OBS O-B: when MORE THAN
    // ONE fit point shares the amount (a collision), the amount-keyed lookup
    // is AMBIGUOUS — it would attribute the LAST WRITER's source input (a
    // provenance lie), so the source is NAMED UNRESOLVED (null) instead of
    // guessed. The unambiguous case (exactly one fit point at the amount)
    // keeps the honest fallback (the NO_MATCHING_PEAK degraded path).
    const amountAmbiguous = amount !== null && (byAmountCount.get(amount) ?? 0) > 1
    const fromAmount: FpEntry | undefined = parsed === null && amount !== null && !amountAmbiguous ? byAmount.get(amount) : undefined
    const inputName = parsed !== null ? parsed.inputName : (fromRow !== undefined ? fromRow.sourceInput : fromAmount !== undefined ? fromAmount.sourceInput : null)
    const tag = levelTag(row)
    const key = keyFor(inputName ?? (tag !== '' ? tag : `row-${rowIdx}`), rowIdx)
    return {
      key,
      row,
      amount,
      response: isFiniteNumber(row[responseCol]) ? (row[responseCol] as number) : null,
      included: row[CAL_ARTIFACT_COLUMNS.fitPoint] === true,
      residual: isFiniteNumber(row[CAL_ARTIFACT_COLUMNS.relativeResidual]) ? (row[CAL_ARTIFACT_COLUMNS.relativeResidual] as number) : null,
      sourceInput: inputName,
      peakSource: typeof row[CAL_ARTIFACT_COLUMNS.peakSource] === 'string' ? (row[CAL_ARTIFACT_COLUMNS.peakSource] as string) : null,
      flags: Array.isArray(row[CAL_ARTIFACT_COLUMNS.flags])
        ? (row[CAL_ARTIFACT_COLUMNS.flags] as unknown[]).filter((f): f is string => typeof f === 'string')
        : [],
    }
  })
}

function peakSourceKey(ps: { inputName: string; rowIndex: number }): string {
  return `${ps.inputName}:row${ps.rowIndex}`
}

// --- outlier (max over the artifact OWN residuals; NO threshold) ---------------

/** The row indexes with the largest |relative residual| among rows carrying a
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

/** The manifest-level half of the D5 classifier: true iff the manifest's
 * artifacts STRUCTURALLY pair a calibration table with a calibration model
 * (both gates pass on some artifact — content, never names). */
export function hasCalibrationPair(artifacts: Array<{ inlineValue?: unknown } | undefined>): boolean {
  let hasTable = false
  let hasModel = false
  for (const a of artifacts) {
    if (!a) continue
    if (classifyCalibrationTable(a.inlineValue).ok) hasTable = true
    if (classifyCalibrationModel(a.inlineValue).ok) hasModel = true
  }
  return hasTable && hasModel
}

// --- display shaping (property names stay in THIS module — bait #2) ---------

/** The model head line: the explicit head string the artifact declared,
 * rendered verbatim (never parsed — the structured coefficients are the
 * truth; this is display, not analysis). */
export function modelHead(m: CalibrationModelShape): { testId: string; text: string } | null {
  if (m.headLine === undefined) return null
  return { testId: `calibration-${MODEL_PAYLOAD_KEYS.equation}`, text: m.headLine }
}

/** The named-statistic line, verbatim: name + value + definition. A null
 * statistic VALUE renders honestly as the word `null` beside the verbatim
 * definition — no reason string is invented (the reason lives in the
 * calibration_statistic METRIC only, never in the model payload) and no
 * 1.0/0.0 is substituted. */
export function statisticText(m: CalibrationModelShape): string {
  const parts: string[] = []
  if (m.statisticName !== undefined) parts.push(m.statisticName)
  parts.push(m.statisticValue === null ? 'null' : String(m.statisticValue))
  if (m.statisticDefinition !== undefined) parts.push(` — ${m.statisticDefinition}`)
  return parts.join(' ')
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
  /** The artifact COLUMN used as the row's display label (schema
   * view-spec.schema.yaml:57-58). VALIDATED here; NOT YET CONSUMED by the
   * composite renderer (rows label themselves by the table's own `level`
   * column — the D5 join's shipped key). Recorded as a reserved binding
   * surface, not a defect (review O2, FIX1 disposition: comment, not
   * scope-expansion — the default label is data-derived and correct). */
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
      case 'page':
        // Opaque pass-through: the client-synthesis door (the /analysis page)
        // binds the page context (active run id, revisions, frozen source run)
        // so the composite's run-link + recalc footer have their data. It is
        // NOT domain data — the view's PageContext typing owns its shape; the
        // persisted-record door carries no such key (and no such page).
        break
      default:
        return { ok: false, error: `unknown bindings key: ${k}` }
    }
  }
  return { ok: true, value: out }
}
