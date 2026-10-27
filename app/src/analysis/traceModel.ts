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

/** The OQ-1(a) content-fetch channel (the ratified read-only route). */
export type FetchContent = (artifactRecordId: string) => Promise<string | null>

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
  const bytes = await fetchContent(artifactRecordId)
  if (!bytes) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId} content route returned no bytes` }
  }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(bytes)
  } catch {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId} content is not JSON` }
  }
  const parsed = parseTraceValue(parsedJson)
  if (!parsed.ok) {
    return { ok: false, code: 'NO_PAYLOAD', message: `artifact ${artifactRecordId}: ${parsed.message}` }
  }
  return { ok: true, trace: { ...base, ...parsed.trace } }
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
 */
export function parseMarkerRows(
  rows: unknown,
  fields: { rt: string; label: string; saturated?: string; flags?: string },
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
    return {
      peakId: String(i),
      rt,
      label,
      saturated: satVal === true || (typeof satVal === 'string' && satVal.toLowerCase() === 'true'),
      flags: typeof flagVal === 'string' ? flagVal : Array.isArray(flagVal) ? flagVal.join(', ') : '',
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
