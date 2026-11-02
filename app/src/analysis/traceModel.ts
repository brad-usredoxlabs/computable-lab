/**
 * GC-10 [B] — traceModel.ts — the pure core of the chromatogram/compare
 * renderers (spec §D3). NO DOM, NO React, NO fetch: every input is a
 * run-payload-shaped object, every output is a plain value.
 *
 * Hard lines (spec §D5 + reviewer bait #7/#8/#10):
 *  - units arrive from the DATA (the artifact payload's unit fields); this
 *    module contains ZERO unit literals — the default unit-map KEYs below are
 *    structural names, never unit values.
 *  - the axis-compat gate compares data-carried unit strings only; a conflict
 *    clears ONLY under a scientist-declared conversion; nothing here
 *    resamples, offsets, or implicitly factors.
 *  - decimation is visual-only: the function is pure over its inputs and
 *    returns indices + a droppedCount — the only arithmetic over trace values
 *    is applyDeclaredConversion, and only under declared data.
 *  - colour is a deterministic function of the artifact record id.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single extracted trace (the legend fields come from RECORD data). */
export interface Trace {
  recordId: string
  runId: string
  runTitle: string
  artifactName: string
  axis: number[]
  values: number[]
  xUnit?: string
  yUnit?: string
  /** An explicit data label (legend "source"/sample name) — arrives as DATA
   *  (artifact label / saved-spec bindings); the TS never invents one. */
  label?: string
  /** Present only when a declared conversion was applied (display copy). */
  conversion?: DeclaredConversion
}

/** A scientist-declared conversion (data -> view-spec bindings). */
export interface DeclaredConversion {
  factor: number
  toUnit: string
  declaredBy: string
}

/** A named axis conflict (rendered verbatim by the Compare surface). */
export interface AxisConflict {
  code: 'UNIT_UNDECLARED' | 'UNIT_MISMATCH' | 'AXIS_NOT_NUMERIC'
  axis: 'x' | 'y'
  /** The data-carried unit strings seen (declared ones already applied). */
  seen: string[]
  message: string
}

export type AxisCheckResult = { ok: true; conflicts: [] } | { ok: false; conflicts: AxisConflict[] }

/** A visual-only render slice: indices into the FULL arrays + dropped count. */
export interface RenderSlice {
  indices: number[]
  droppedCount: number
}

/** The OQ-1(a) content-fetch channel (the ratified read-only route).
 *  The prod wiring is the client method itself, which fetches
 *  `GET /api/analysis-artifacts/:id/content` and returns the route's
 *  `content` field UNWRAPPED from the `{ artifactId, dataReferenceId,
 *  content }` envelope — i.e. the artifact's stored (parsed) trace payload
 *  OBJECT for a well-formed dref artifact (never a raw JSON string). */
export type FetchContent = (artifactRecordId: string) => Promise<unknown>

export type TraceError =
  | { ok: false; code: 'ARTIFACT_NOT_FOUND'; message: string }
  | { ok: false; code: 'NO_PAYLOAD'; message: string }

/** The fixed 8-colour palette (presentation constant, not spec data). */
export const TRACES_PALETTE: readonly string[] = [
  '#1971c2',
  '#c2255c',
  '#2f9e44',
  '#e8590c',
  '#6741d9',
  '#0c8599',
  '#e03131',
  '#5f3dc4',
]

/** The run-payload envelope extractTrace reads (data-only shapes). */
interface RunRecordShape {
  recordId?: string
  payload?: {
    title?: string
    outputManifest?: {
      artifacts?: Array<ManifestArtifact>
      artifactRefs?: Record<string, { artifactRecordId?: string; dataReferenceId?: string }>
    }
    outputArtifactRefs?: Array<{ id?: string; artifactRecordId?: string }>
  }
}

interface ManifestArtifact {
  name?: string
  dataKind?: string
  value?: unknown
  units?: Record<string, string>
  dataReferenceRef?: { id?: string }
  id?: string
}

/** A unit-map entry: the structural key is data (never a unit value). */
const AXIS_UNIT_KEYS = ['axis_units', 'axisUnit', 'x']
const VALUE_UNIT_KEYS = ['value_units', 'valueUnit', 'value', 'y']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function firstString(record: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!record) return undefined
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

// ---------------------------------------------------------------------------
// 0. parseTraceValue — the axis/values/unit extraction (shared by inline and
//    the OQ-1(a) content-route bytes)
// ---------------------------------------------------------------------------

/** A parsed trace payload (data-only). */
export interface ParsedTraceValue {
  axis: number[]
  values: number[]
  xUnit?: string
  yUnit?: string
}

/**
 * Parse a trace payload (inline value OR the content-route JSON) into
 * axis/values + the data-carried unit strings. Unit-map KEYS are structural
 * names (never unit VALUES); the unit STRINGS come from the data.
 */
export function parseTraceValue(value: unknown): { ok: true; trace: ParsedTraceValue } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: 'trace payload is not an object' }
  const axis = Array.isArray(value.axis) ? value.axis.map(Number) : []
  const values = Array.isArray(value.values) ? value.values.map(Number) : []
  if (axis.length === 0 || values.length === 0) {
    return { ok: false, message: 'trace payload has no axis/values' }
  }
  return {
    ok: true,
    trace: {
      axis,
      values,
      ...(firstString(value, AXIS_UNIT_KEYS) ? { xUnit: firstString(value, AXIS_UNIT_KEYS) } : {}),
      ...(firstString(value, VALUE_UNIT_KEYS) ? { yUnit: firstString(value, VALUE_UNIT_KEYS) } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// 1. extractTrace — AOUT-* -> inline payload OR dref bytes via the OQ-1(a) route
// ---------------------------------------------------------------------------

/** Resolve the manifest entry for an artifact record id. */
function findManifestArtifact(runRecord: RunRecordShape, artifactRecordId: string): ManifestArtifact | undefined {
  const payload = runRecord.payload
  const manifest = payload?.outputManifest
  if (!manifest) return undefined
  const artifacts = manifest.artifacts ?? []
  // Defensive: some manifest shapes stamp the AOUT id on the entry itself.
  const byId = artifacts.find((a) => a.id === artifactRecordId)
  if (byId) return byId
  // The persisted manifest carries `artifactRefs` (NAME -> artifactRecordId) —
  // the authoritative resolver: match the name, then the artifact entry.
  const refs = manifest.artifactRefs ?? {}
  for (const [artifactName, ref] of Object.entries(refs)) {
    if (ref?.artifactRecordId === artifactRecordId) {
      return artifacts.find((a) => a.name === artifactName)
    }
  }
  return undefined
}

/** Extract one trace from a fetched run record. */
export async function extractTrace(
  runRecord: RunRecordShape,
  artifactRecordId: string,
  fetchContent?: FetchContent,
): Promise<{ ok: true; trace: Trace } | TraceError> {
  const entry = findManifestArtifact(runRecord, artifactRecordId)
  if (!entry) {
    return { ok: false, code: 'ARTIFACT_NOT_FOUND', message: `artifact not found in the run manifest: ${artifactRecordId}` }
  }
  const runId = runRecord.recordId ?? ''
  const base: Omit<Trace, 'axis' | 'values' | 'xUnit' | 'yUnit'> = {
    recordId: artifactRecordId,
    runId,
    runTitle: runRecord.payload?.title ?? runId,
    artifactName: entry.name ?? artifactRecordId,
  }

  // Inline payload (small artifacts ride the run record verbatim).
  const inline = isRecord(entry.value) ? entry.value : undefined
  if (inline) {
    const parsed = parseTraceValue(inline)
    if (!parsed.ok) {
      return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId}: ${parsed.message}` }
    }
    return { ok: true, trace: { ...base, ...parsed.trace } }
  }

  // Dref-backed: the ratified content route is the ONLY byte source.
  const drefId = entry.dataReferenceRef?.id
  if (!drefId || !fetchContent) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId} has no readable payload (dref content route unavailable)` }
  }
  // The channel already returns the client-unwrapped `content` field (the
  // route's PARSED JSON payload — the client method does the res.json()).
  const value = await fetchContent(artifactRecordId)
  if (value === null || value === undefined) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId} content route returned no payload` }
  }
  const parsed = parseTraceValue(value)
  if (!parsed.ok) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId}: ${parsed.message}` }
  }
  return { ok: true, trace: { ...base, ...parsed.trace } }
}

// ---------------------------------------------------------------------------
// 1c. resolveCompare — AOUT artifact RECORDS -> labeled traces (compare
//     data-path; used by the Compare surface + saved-comparison re-render)
// ---------------------------------------------------------------------------

/** A fetched artifact record envelope (data-only shape). */
export interface ArtifactRecordShape {
  recordId?: string
  payload?: Record<string, unknown>
}

/**
 * Resolve one pinned AOUT artifact record into a trace. `inlineValue` rides
 * the record; otherwise the dref bytes arrive through the OQ-1(a) content
 * route (the ratified byte source). Legend labels are DATA (the record's
 * name + any explicit `label` override); nothing is invented here.
 */
export async function resolveArtifactTrace(
  record: ArtifactRecordShape,
  fetchContent: FetchContent,
  label?: string,
): Promise<{ ok: true; trace: Trace } | TraceError> {
  const payload = record.payload ?? {}
  const inline = isRecord(payload.inlineValue) ? payload.inlineValue : undefined
  const runId = typeof (payload.runRef as { id?: string } | undefined)?.id === 'string' ? ((payload.runRef as { id: string }).id) : ''
  const runTitle = typeof payload.title === 'string' ? payload.title : runId
  const artifactName = typeof payload.name === 'string' ? payload.name : (record.recordId ?? '')
  const base: Omit<Trace, 'axis' | 'values' | 'xUnit' | 'yUnit'> = {
    recordId: record.recordId ?? '',
    runId,
    runTitle,
    artifactName,
  }
  if (inline) {
    const parsed = parseTraceValue(inline)
    if (!parsed.ok) return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${record.recordId}: ${parsed.message}` }
    return { ok: true, trace: { ...base, ...parsed.trace, label } }
  }
  const drefId = (payload.dataReferenceRef as { id?: string } | undefined)?.id
  if (!drefId) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${record.recordId} has no readable payload (no inline value, no data reference)` }
  }
  const bytes = await fetchContent(record.recordId ?? '')
  if (!bytes) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${record.recordId} content route returned no bytes` }
  }
  // The channel already returns the client-unwrapped `content` field (the
  // route's PARSED JSON payload — the client method does the res.json(),
  // never a raw string), so the value goes straight to parseTraceValue —
  // same as the sibling extractTrace (no asymmetric string branch).
  const parsed = parseTraceValue(bytes)
  if (!parsed.ok) return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${record.recordId}: ${parsed.message}` }
  return { ok: true, trace: { ...base, ...parsed.trace, label } }
}

// ---------------------------------------------------------------------------
// 1b. parseMarkerRows — the peak-table marker extraction (data-only)
// ---------------------------------------------------------------------------

/** A parsed marker row (all fields arrive as DATA from the artifact). */
export interface MarkerRow {
  peakId: string
  /** The RT value (null when the row declares none — skipped visibly). */
  rt: number | null
  label: string
  saturated: boolean
  flags: string
}

/**
 * Parse a peak-table artifact into marker rows. Field NAMES come from the
 * bindings (or the shipped default names held in DEFAULT_MARKER_FIELDS); the
 * row VALUES are data. Rows with a null/absent RT are returned with rt:null —
 * the component SKIPS them visibly (counted, never silently dropped).
 *
 * B3 (item 250TH-8): saturation is DECLARED, never computed. A row is
 * saturated when its boolean field (named by `fields.saturated`) is true, OR
 * when `fields.saturationFlags` (the DECLARED token list, from the view-spec
 * binding) names a token that appears in the row's flags. No declared token
 * list ⇒ flags never mark saturation (OVERLAP_SHARED_BASELINE and friends are
 * not guessed to be saturation). Zero amplitude/height comparisons.
 */
export function parseMarkerRows(
  rows: unknown,
  fields: { rt: string; label: string; saturated?: string; flags?: string; saturationFlags?: string[] },
): MarkerRow[] {
  if (!Array.isArray(rows)) return []
  return rows.map((raw, i) => {
    const r = isRecord(raw) ? raw : {}
    const rtVal = r[fields.rt]
    const rt = typeof rtVal === 'number' && Number.isFinite(rtVal) ? rtVal : null
    const labelVal = r[fields.label]
    const label = typeof labelVal === 'string' && labelVal.length > 0 ? labelVal : String(i + 1)
    const satVal = fields.saturated ? r[fields.saturated] : undefined
    const flagVal = fields.flags ? r[fields.flags] : undefined
    const flagList = Array.isArray(flagVal) ? flagVal : []
    const declaredSat = fields.saturationFlags ?? []
    const saturatedByFlag = declaredSat.length > 0 && flagList.some((f) => typeof f === 'string' && declaredSat.includes(f))
    return {
      peakId: String(i),
      rt,
      label,
      saturated: satVal === true || (typeof satVal === 'string' && satVal.toLowerCase() === 'true') || saturatedByFlag,
      flags: typeof flagVal === 'string' ? flagVal : flagList.join(', '),
    }
  })
}

// ---------------------------------------------------------------------------
// 2. checkAxes — the same-axes gate (rejected or declared conversion)
// ---------------------------------------------------------------------------

/** The declared conversions keyed by artifact record id. */
export type Conversions = Record<string, DeclaredConversion>

/** Validate that the traces can share ONE axis pair. */
export function checkAxes(traces: Trace[], conversions?: Conversions): AxisCheckResult {
  const conflicts: AxisConflict[] = []
  // 1. Non-numeric axis values are a named conflict (never a throw).
  for (const t of traces) {
    if (!t.axis.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      conflicts.push({
        code: 'AXIS_NOT_NUMERIC',
        axis: 'x',
        seen: [],
        message: `trace ${t.recordId} has a non-numeric axis value — it cannot be overlaid`,
      })
      break
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts }
  // 2. Unit agreement, post-conversion for traces carrying a declared one.
  //    An absent unit is its OWN named conflict (UNIT_UNDECLARED) — never
  //    assumed, never conflated with a declared-unit mismatch.
  const effective = traces.map((t) => ({
    id: t.recordId,
    xUnit: t.xUnit,
    yUnit: conversions?.[t.recordId] ? applyDeclaredConversion(t, conversions[t.recordId]!).yUnit : t.yUnit,
  }))
  for (const axis of ['x', 'y'] as const) {
    const units = effective.map((e) => (axis === 'x' ? e.xUnit : e.yUnit))
    const declared = units.filter((u): u is string => typeof u === 'string')
    const seen = [...new Set(units.map((u) => u ?? '(no unit)'))]
    if (declared.length < units.length) {
      conflicts.push({
        code: 'UNIT_UNDECLARED',
        axis,
        seen,
        message: `axis units undeclared on one or more traces — a shared axis cannot be assumed`,
      })
      continue
    }
    if (seen.length > 1) {
      conflicts.push({
        code: 'UNIT_MISMATCH',
        axis,
        seen,
        message: `axis units differ: ${seen.join(' vs ')} — no automatic conversion is performed; add a declared conversion or remove the trace`,
      })
    }
  }
  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true, conflicts: [] }
}

// ---------------------------------------------------------------------------
// 3. applyDeclaredConversion — the ONLY declared arithmetic
// ---------------------------------------------------------------------------

/** Multiply the values by the declared factor and rename the unit. Pure. */
export function applyDeclaredConversion(trace: Trace, conversion?: DeclaredConversion): Trace {
  if (!conversion) return trace
  return {
    ...trace,
    values: trace.values.map((v) => v * conversion.factor),
    yUnit: conversion.toUnit,
    conversion,
  }
}

// ---------------------------------------------------------------------------
// 4. decimateForRender — visual-only, pure over inputs
// ---------------------------------------------------------------------------

/**
 * Per-pixel min/max decimation for RENDERING ONLY (O(width) output).
 * Returns indices into the FULL arrays plus a droppedCount; the inputs are
 * never touched and nothing here is persistable (no values, no axis).
 */
export function decimateForRender(axis: number[], values: number[], pixelWidth: number, mode: 'min-max' = 'min-max'): RenderSlice {
  const n = Math.min(axis.length, values.length)
  if (n === 0) return { indices: [], droppedCount: 0 }
  const full: RenderSlice = { indices: Array.from({ length: n }, (_, i) => i), droppedCount: 0 }
  // Degenerate widths fall back to the full slice (still honest: dropped 0).
  if (!Number.isFinite(pixelWidth) || pixelWidth <= 0) return full
  void mode // the min-max policy is the only one; the flag is spec-shape
  const buckets = Math.max(1, Math.min(n, Math.floor(pixelWidth)))
  const indices: number[] = []
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((b * n) / buckets)
    const hi = Math.floor(((b + 1) * n) / buckets)
    if (hi <= lo) continue
    let maxI = lo
    let minI = lo
    for (let i = lo + 1; i < hi; i++) {
      if (values[i] > values[maxI]) maxI = i
      if (values[i] < values[minI]) minI = i
    }
    if (maxI === minI) {
      indices.push(maxI)
    } else if (maxI < minI) {
      indices.push(maxI, minI)
    } else {
      indices.push(minI, maxI)
    }
  }
  indices.sort((a, b) => a - b)
  const seen = new Set(indices)
  const dropped = values.filter((_v, i) => !seen.has(i)).length
  return { indices, droppedCount: dropped }
}

// ---------------------------------------------------------------------------
// 6b. closed-shape guards (D6) — named client-side errors, no silent blanks
// ---------------------------------------------------------------------------

/** A named binding-guard error (rendered verbatim by the renderers). */
export interface BindingsGuardError {
  path: string
  message: string
}

/** The chromatogram bindings (closed shape; unknown keys pass through and
 *  are reported for the dev-visible audit line, §D6). */
export interface ChromatogramBindingsParsed {
  markersFrom?: string
  markerRtField?: string
  markerLabelField?: string
  markerSaturatedField?: string
  markerFlagsField?: string
  /** B3: the DECLARED saturation flag tokens (a string[] — DATA from the
   *  view-spec binding; absent when the binding is not declared). */
  markerSaturationFlags?: string[]
  baselineFrom?: string
  baselineField?: string
  /** Unknown keys (forward-compat — listed, not rejected). */
  audit: string[]
}

const CHROMATOGRAM_KNOWN_KEYS = [
  'markersFrom',
  'markerRtField',
  'markerLabelField',
  'markerSaturatedField',
  'markerFlagsField',
  'markerSaturationFlags',
  'baselineFrom',
  'baselineField',
] as const

/** The array-typed known binding keys (B3: the declared token list). */
const CHROMATOGRAM_ARRAY_KEYS = ['markerSaturationFlags'] as const

/**
 * Parse a `chromatogram` view's `bindings` free object. Known keys must be
 * strings when present (named error otherwise); the array-typed known keys
 * (B3 `markerSaturationFlags`) must be string[]s; unknown keys are KEPT (the
 * schema's own additionalProperties stance) and listed in `audit`.
 */
export function parseChromatogramBindings(
  bindings: Record<string, unknown> | undefined,
): { ok: true; value: ChromatogramBindingsParsed } | { ok: false; error: BindingsGuardError } {
  const out: ChromatogramBindingsParsed = { audit: [] }
  for (const [k, v] of Object.entries(bindings ?? {})) {
    if ((CHROMATOGRAM_ARRAY_KEYS as readonly string[]).includes(k)) {
      const arr = v as unknown
      if (!Array.isArray(arr) || !arr.every((t) => typeof t === 'string')) {
        return { ok: false, error: { path: `bindings.${k}`, message: `bindings.${k} must be a string[] token list — refusing to guess` } }
      }
      out.markerSaturationFlags = arr as string[]
      continue
    }
    const key = k as (typeof CHROMATOGRAM_KNOWN_KEYS)[number]
    if ((CHROMATOGRAM_KNOWN_KEYS as readonly string[]).includes(k)) {
      if (typeof v !== 'string') {
        return { ok: false, error: { path: `bindings.${k}`, message: `bindings.${k} must be a string — refusing to guess` } }
      }
      // The array-typed key was handled above (and continued), so every key
      // reaching here is a string-typed binding.
      out[key as 'markersFrom' | 'markerRtField' | 'markerLabelField' | 'markerSaturatedField' | 'markerFlagsField' | 'baselineFrom' | 'baselineField'] = v
    } else {
      out.audit.push(k)
    }
  }
  return { ok: true, value: out }
}

/** One entry of a `trace-compare` view's `bindings.traces`. */
export interface CompareBindingsTrace {
  artifactId: string
  label?: string
  conversion?: DeclaredConversion
}

/** The parsed `trace-compare` bindings (closed shape). */
export interface CompareBindingsParsed {
  traces: CompareBindingsTrace[]
  axisUnits?: { x: string; y: string }
  audit: string[]
}

/**
 * Parse a `trace-compare` view's `bindings` free object. `traces` must be an
 * array of `{ artifactRef: { id }, label?, conversion? }`; a declared
 * conversion must carry a finite `factor`, a `toUnit` string and a
 * `declaredBy` string (named error otherwise — "refusing to guess"). Unknown
 * keys are KEPT and listed in `audit`.
 */
export function parseCompareBindings(
  bindings: Record<string, unknown> | undefined,
): { ok: true; value: CompareBindingsParsed } | { ok: false; error: BindingsGuardError } {
  if (!bindings || typeof bindings !== 'object') return { ok: true, value: { traces: [], audit: [] } }
  const audit: string[] = []
  const knownTop = new Set(['traces', 'axisUnits'])
  for (const k of Object.keys(bindings)) {
    if (!knownTop.has(k)) audit.push(k)
  }
  const rawTraces = bindings.traces
  if (rawTraces !== undefined && !Array.isArray(rawTraces)) {
    return { ok: false, error: { path: 'bindings.traces', message: 'bindings.traces must be an array — refusing to guess' } }
  }
  const traces: CompareBindingsTrace[] = []
  for (let i = 0; i < (rawTraces?.length ?? 0); i++) {
    const raw = rawTraces?.[i]
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: { path: `bindings.traces[${i}]`, message: `bindings.traces[${i}] must be an object — refusing to guess` } }
    }
    const entry = raw as Record<string, unknown>
    for (const k of Object.keys(entry)) {
      if (!['artifactRef', 'label', 'conversion'].includes(k)) audit.push(`traces[${i}].${k}`)
    }
    const ref = entry.artifactRef
    const refObj = ref && typeof ref === 'object' ? (ref as Record<string, unknown>) : null
    const refId = refObj ? (refObj.id as unknown) : undefined
    if (typeof refId !== 'string' || refId.length === 0) {
      return { ok: false, error: { path: `bindings.traces[${i}].artifactRef.id`, message: `bindings.traces[${i}].artifactRef.id must be a non-empty string — refusing to guess` } }
    }
    const out: CompareBindingsTrace = { artifactId: refId }
    // The identity label: the canonical write shape (buildCompareViewSpec
    // Payload + the view-spec schema's documented traces[] shape) rides it on
    // the REF object (ref.schema.yaml allows `label` on record refs); the
    // entry-level `label` key is also a documented known key and still wins
    // when present (entry-level is the more explicit location).
    const entryLabel = typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : undefined
    const refLabel = refObj && typeof refObj.label === 'string' && refObj.label.length > 0 ? refObj.label : undefined
    const label = entryLabel ?? refLabel
    if (label !== undefined) out.label = label
    if (entry.conversion !== undefined) {
      const c = entry.conversion as Record<string, unknown> | undefined
      if (!c || typeof c !== 'object' || typeof c.factor !== 'number' || !Number.isFinite(c.factor)) {
        return { ok: false, error: { path: `bindings.traces[${i}].conversion.factor`, message: `bindings.traces[${i}].conversion.factor is not a number — refusing to guess` } }
      }
      if (typeof c.toUnit !== 'string' || c.toUnit.length === 0) {
        return { ok: false, error: { path: `bindings.traces[${i}].conversion.toUnit`, message: `bindings.traces[${i}].conversion.toUnit is not a string — refusing to guess` } }
      }
      if (typeof c.declaredBy !== 'string' || c.declaredBy.length === 0) {
        return { ok: false, error: { path: `bindings.traces[${i}].conversion.declaredBy`, message: `bindings.traces[${i}].conversion.declaredBy is not a string — refusing to guess` } }
      }
      out.conversion = { factor: c.factor, toUnit: c.toUnit, declaredBy: c.declaredBy }
    }
    traces.push(out)
  }
  const out: CompareBindingsParsed = { traces, audit }
  if (bindings.axisUnits !== undefined) {
    const au = bindings.axisUnits
    if (!au || typeof au !== 'object' || typeof (au as { x?: unknown }).x !== 'string' || typeof (au as { y?: unknown }).y !== 'string') {
      return { ok: false, error: { path: 'bindings.axisUnits', message: 'bindings.axisUnits must be {x:string,y:string} — refusing to guess' } }
    }
    out.axisUnits = { x: (au as { x: string }).x, y: (au as { y: string }).y }
  }
  return { ok: true, value: out }
}

// ---------------------------------------------------------------------------
// 6c. mintViewSpecId — client-side VSPEC-NNNNNN max+1 (mirrors the runner)
// ---------------------------------------------------------------------------

/**
 * Mint the next `VSPEC-NNNNNN` id from existing view-spec record ids, using
 * the runner's max+1 rule (F2 :433-447). Returns `VSPEC-000001` when no
 * existing ids match the shape (the first is always legal).
 */
export function mintViewSpecId(existingIds: readonly string[]): string {
  let max = 0
  for (const id of existingIds) {
    const m = /^VSPEC-(\d+)$/.exec(id)
    if (m && m[1]) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `VSPEC-${String(max + 1).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// 5. colour — deterministic, stable under membership churn
// ---------------------------------------------------------------------------

/**
 * The stable per-trace colour (spec §D3.5, bait #9): RANK (position) within
 * the saved spec's trace list sorted by artifact record id, assigned from a
 * fixed palette that cycles. Rank is a pure function of the spec's id SET, so
 * toggling visibility (hide/show) or reordering the list never recolours a
 * trace, and a save/reload of the same spec reproduces the same colours.
 *
 * @param traceIds the spec's FULL trace-id list (NOT the currently-visible
 *                 subset) — pass the stable identity set for invariance.
 * @param recordId the trace to colour.
 */
export function colorForTraceInSet(traceIds: readonly string[], recordId: string): string {
  const sorted = [...traceIds].sort()
  const rank = sorted.indexOf(recordId)
  const idx = rank < 0 ? 0 : rank
  return TRACES_PALETTE[((idx % TRACES_PALETTE.length) + TRACES_PALETTE.length) % TRACES_PALETTE.length]!
}

/** The deterministic rank authority (sorted by record id). */
export function stableTraceOrder(traces: Trace[]): Trace[] {
  return [...traces].sort((a, b) => a.recordId.localeCompare(b.recordId))
}

// ---------------------------------------------------------------------------
// 6. buildCompareViewSpecPayload — saved comparison = view-spec data
// ---------------------------------------------------------------------------

/** One entry of the saved spec's trace list. */
export interface CompareTraceEntry {
  trace: Trace
  label?: string
  conversion?: DeclaredConversion
}

/** The persisted view-spec payload shape (absent optional keys are OMITTED). */
export interface CompareViewSpecPayload {
  kind: 'view-spec'
  id: string
  title: string
  artifactRef: Record<string, unknown>
  renderer: 'trace-compare'
  bindings: {
    traces: Array<Record<string, unknown>>
    /** Echo of the data-carried (post-conversion) units — omitted when absent. */
    axisUnits?: { x: string; y: string }
  }
}

/** Build the persisted view-spec payload (absent optional keys are OMITTED). */
export function buildCompareViewSpecPayload(entries: CompareTraceEntry[], viewId: string): CompareViewSpecPayload {
  const converted = entries.map((e) => applyDeclaredConversion(e.trace, e.conversion))
  const xUnits = [...new Set(converted.map((t) => t.xUnit).filter((u): u is string => typeof u === 'string'))]
  const yUnits = [...new Set(converted.map((t) => t.yUnit).filter((u): u is string => typeof u === 'string'))]
  const primary = converted[0]

  const tracesPayload = converted.map((t, i) => {
    const original = entries[i]!
    const label = original.label
    const ref: Record<string, unknown> = { kind: 'record', id: t.recordId, type: 'analysis-output-artifact' }
    if (typeof label === 'string' && label.length > 0) ref.label = label
    const entry: Record<string, unknown> = { artifactRef: ref }
    if (original.conversion) entry.conversion = original.conversion
    return entry
  })

  const bindings: {
    traces: Array<Record<string, unknown>>
    axisUnits?: { x: string; y: string }
  } = { traces: tracesPayload }
  if (xUnits.length === 1 && yUnits.length === 1) {
    bindings.axisUnits = { x: xUnits[0]!, y: yUnits[0]! }
  }

  const ref: Record<string, unknown> = { kind: 'record', id: primary.recordId, type: 'analysis-output-artifact' }
  if (typeof entries[0]?.label === 'string' && entries[0]!.label.length > 0) ref.label = entries[0]!.label

  return {
    kind: 'view-spec',
    id: viewId,
    title: 'Trace comparison',
    artifactRef: ref,
    renderer: 'trace-compare',
    bindings,
  }
}
