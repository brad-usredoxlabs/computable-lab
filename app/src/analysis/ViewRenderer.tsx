/**
 * ViewRenderer — render an analysis output artifact via a validated ViewSpec.
 *
 * Only SHIPPED renderers execute. A static-figure fallback renders Python
 * visualizations; unknown renderers produce a visible compatibility error
 * rather than silently failing.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiClient } from '../shared/api/client'
import { ChromatogramView } from './ChromatogramView'
import { CalibrationCurveView } from './CalibrationCurveView'
import { parseTraceValue } from './traceModel'

export interface RenderableArtifact {
  id: string
  name: string
  dataKind: string
  inlineValue?: unknown
  units?: Record<string, string>
  schema?: Record<string, unknown>
  format?: string
  dataReferenceRef?: { id: string }
}

export interface RenderableView {
  id: string
  title: string
  artifact: string
  renderer: 'table' | 'signal' | 'metric' | 'static-figure' | 'chromatogram' | 'trace-compare' | 'calibration-curve' | 'artifact-table' | 'model' | 'binary'
  bindings?: Record<string, unknown>
  options?: Record<string, unknown>
}

/** The page's view whitelist (the GC-9 silent-coercion trap, F1 :380-382 /
 *  bait #4): a manifest view's renderer string passes through ONLY if it is a
 *  shipped view renderer; anything else is (silently) coerced to 'table' (the
 *  compatibility error arm never fires for these). GC-10 extends the set with
 *  `chromatogram` + `trace-compare` — both must PASS THROUGH, not table-coerce.
 *  GC-11 extends the set with `calibration-curve` (the calibration review
 *  composite — task :8412 "Calibration-curve view (view-spec renderer)"),
 *  also passing through, never table-coerced.
 *  The generic artifact-report renderer task adds `artifact-table`
 *  (the 2026-11-01 OQ-1 architect ruling ratifies the id): enum + union +
 *  whitelist + dispatch + source-pin land in ONE commit (the GC-10/GC-11
 *  shape). `table` keeps its raw-rows behaviour; `artifact-table` is a
 *  DISTINCT id with the OQ-3 binding slots (columns / captionFrom /
 *  warningsFrom / warningTextField) — two ids, two behaviours, no collision.
 *  Extracted as a pure function so the whitelist is unit-testable in isolation
 *  (the reviewer's "chromatogram is not table-coerced" leg). */
export const VIEW_RENDERER_WHITELIST = [
  'table',
  'signal',
  'metric',
  'static-figure',
  'chromatogram',
  'trace-compare',
  'calibration-curve',
  'artifact-table',
] as const

export type WhitelistedRenderer = (typeof VIEW_RENDERER_WHITELIST)[number]

export function resolveViewRenderer(raw: string | undefined): WhitelistedRenderer {
  return (VIEW_RENDERER_WHITELIST as readonly string[]).includes(raw ?? '')
    ? (raw as WhitelistedRenderer)
    : 'table'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Render a table cell's value.
 *
 * FAME-8 GATEFIX4 (D1 reachability): an array-valued cell (e.g. a `flags`
 * column) previously rendered as ONE unbreakable comma-joined run
 * (`String(['a','b'])` => 'a,b' with no space) — 730 px of text that sat
 * entirely outside the 574 px report pane. Rendering one element per line
 * breaks that run so each item stays readable at the default pane width.
 * GENERIC by construction: the branch is on the VALUE'S SHAPE (Array.isArray)
 * only — no artifact, column-name, or flag-substring special-casing. A
 * scalar value renders verbatim, byte-identical to the prior `String(value)`.
 *
 * L1-CELLRENDER-1 (architect ruling 2026-11-03): `String(non-scalar)` is the
 * `[object Object]` class of defect — an object-valued cell (e.g. the
 * `params` column of `effective_parameters` on ANR-000056/ANR-000071, whose
 * stored value is a dict behind a declared `type: string`) rendered the
 * literal text `[object Object]`. Two honest arms, both SHAPE-GENERIC:
 *  - DECLARED arm: `bindings.columnFields` (`{ "<column>": "<path>" }`)
 *    reduces an object-valued column to one value per RESOLVED PATH. A
 *    hand-written segment walker (dot segments, `[*]` = map -> one resolved
 *    value per `view-spec__cell-item` line, `[<n>]` = index) — NO
 *    eval/Function/dynamic execution. Resolved scalar -> rendered verbatim;
 *    anything else falls through, NEVER blank.
 *  - FALLBACK arm (a rendering-safety law, not a domain decision): a
 *    non-scalar cell value — or a non-scalar ELEMENT of an array column —
 *    renders compact `JSON.stringify(value)` with the full string on a
 *    `title` attribute. Never `[object Object]`, never blank.
 * Scalars, the empty-array arm and the 'No rows' arm stay byte-identical.
 */
function isCellScalar(v: unknown): v is string | number | bigint | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean'
}

/** The scalar text arm — byte-identical to the pre-fix `String(value ?? '')`,
 *  reached ONLY after `isCellScalar` (or a null/undefined check) narrows the
 *  value: `String(` never sees a non-scalar in the cell path. */
function scalarCellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/** The fallback arm: compact JSON + full text on `title`. */
function jsonCell(value: unknown): ReactNode {
  const text = JSON.stringify(value)
  return (
    <span className="view-spec__cell-json" title={text}>
      {text}
    </span>
  )
}

type CellPathStep = { kind: 'prop'; key: string } | { kind: 'index'; n: number } | { kind: 'map' }

/** Hand-written path-segment parser (L1-CELLRENDER-1 ruling 2):
 *  dot-separated object segments, each optionally suffixed with `[*]`
 *  (map over the array) or `[<n>]` (index). Returns null for any token it
 *  cannot represent — an unparseable path is an UNRESOLVABLE path, which
 *  falls through to the fallback arm. No eval/Function anywhere. */
function parseCellPath(path: string): CellPathStep[] | null {
  const steps: CellPathStep[] = []
  for (const token of path.split('.')) {
    if (token === '') return null
    const m = /^([^[\]]*)(?:\[(\*|\d+)\])?$/.exec(token)
    if (!m) return null
    if (m[1] !== '') steps.push({ kind: 'prop', key: m[1] })
    if (m[2] === '*') steps.push({ kind: 'map' })
    else if (m[2] !== undefined) steps.push({ kind: 'index', n: Number(m[2]) })
  }
  return steps.length > 0 ? steps : null
}

interface CellPathResult {
  /** true when a `[*]` map fired — the resolved values render one per line */
  multi: boolean
  values: unknown[]
}

/** Walk `steps` over `value` (hand-written, no dynamic execution). A missing
 *  prop, a non-array for an index/map step, or an out-of-range index is
 *  UNRESOLVABLE mid-way -> null (the caller falls back, never blank). */
function resolveCellPath(value: unknown, steps: CellPathStep[]): CellPathResult | null {
  let multi = false
  let current: unknown[] = [value]
  for (const step of steps) {
    const next: unknown[] = []
    for (const c of current) {
      if (step.kind === 'prop') {
        if (!isRecord(c) || !(step.key in c)) return null
        next.push(c[step.key])
      } else if (step.kind === 'index') {
        if (!Array.isArray(c) || step.n >= c.length) return null
        next.push(c[step.n])
      } else {
        if (!Array.isArray(c)) return null
        multi = true
        for (const e of c) next.push(e)
      }
    }
    current = next
  }
  return { multi, values: current }
}

function cellContentBody(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    return value.map((e, i) => (
      <div key={i} className="view-spec__cell-item">
        {isCellScalar(e) || e === null || e === undefined ? scalarCellText(e) : jsonCell(e)}
      </div>
    ))
  }
  if (isCellScalar(value) || value === null || value === undefined) return scalarCellText(value)
  return jsonCell(value)
}

/** Render a table cell, optionally reduced along a declared `columnFields`
 *  path first (see the cellContentBody doc above). */
function cellContent(value: unknown, declaredPath?: string): ReactNode {
  if (declaredPath !== undefined) {
    const steps = parseCellPath(declaredPath)
    if (steps) {
      const resolved = resolveCellPath(value, steps)
      if (resolved === null) return cellContentBody(value) // unresolvable mid-way -> fallback on the cell
      if (resolved.multi || resolved.values.length > 1) {
        if (resolved.values.every((v) => isCellScalar(v) || v === null || v === undefined)) {
          return resolved.values.map((v, i) => (
            <div key={i} className="view-spec__cell-item">
              {scalarCellText(v)}
            </div>
          ))
        }
        return cellContentBody(value) // a mapped value is non-scalar -> fallback
      }
      const only = resolved.values[0]
      if (isCellScalar(only) || only === null || only === undefined) return scalarCellText(only)
      return cellContentBody(only) // resolved non-scalar -> JSON of the RESOLVED value
    }
  }
  return cellContentBody(value)
}

/** Extract the canonical `columnFields` binding (`{ "<column>": "<path>" }`,
 *  ruling 2026-11-03) from a renderer's bindings object. Malformed shapes
 *  (non-object map, non-string path for a column) degrade to "no declared
 *  path" for the affected column — the fallback arm then applies. */
function columnFieldPaths(bindings: Record<string, unknown> | undefined): Record<string, string | undefined> {
  const raw = bindings !== undefined && isRecord(bindings.columnFields) ? (bindings.columnFields as Record<string, unknown>) : {}
  const out: Record<string, string | undefined> = {}
  for (const [col, path] of Object.entries(raw)) {
    out[col] = typeof path === 'string' ? path : undefined
  }
  return out
}

/** Render a table artifact (rows of plain values).
 *
 * C1 (FAME-2): the generic table also understands the DECLARED object shape
 * `{ columns, rows }` — column entries are either `{ name, ... }` objects or
 * plain strings, and rows are records. Detection is SHAPE-ONLY (an object
 * whose `rows` member is an array); a bare array of rows keeps today's
 * behavior verbatim, `{ rows: [] }` keeps the named "No rows" arm, and any
 * other value keeps the existing fallback.
 *
 * L1-CELLRENDER-1 (ruling 4): the table renderer ALSO takes `bindings` and
 * applies the canonical `columnFields` slot — the observed broken surface
 * (ANR-000056/ANR-000071) is a `renderer: "table"` view, so a binding-only
 * fix in ArtifactTable would have left it broken. */
function TableView({ artifact, bindings }: { artifact: RenderableArtifact; bindings?: Record<string, unknown> }) {
  const value = artifact.inlineValue
  const columnFields = columnFieldPaths(bindings)
  const declared = isRecord(value) && Array.isArray(value.rows)
  const rows = Array.isArray(value) ? value : declared ? (value.rows as unknown[]) : []
  if (rows.length === 0) return <div className="view-spec__empty">No rows</div>
  const declaredHeaders = declared && Array.isArray(value.columns) && value.columns.length > 0
  const declaredLabels = declaredHeaders
    ? (value.columns as unknown[]).map((c) => (typeof c === 'string' ? c : isRecord(c) && typeof c.name === 'string' ? c.name : null))
    : null
  const headers = new Set<string>()
  for (const r of rows) {
    if (isRecord(r)) for (const k of Object.keys(r)) headers.add(k)
  }
  const columns = declaredLabels ? (declaredLabels as string[]).filter((c): c is string => c !== null) : [...headers]
  return (
    <table className="view-spec__table">
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((raw, i) => {
          const r: Record<string, unknown> = isRecord(raw) ? raw : { value: raw }
          return (
            <tr key={i}>
              {columns.map((c) => <td key={c}>{cellContent(r[c], columnFields[c])}</td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function isBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() === ''
}

/** Render a generic artifact-report table (the OQ-1 id `artifact-table`,
 * ratified by the 2026-11-01 architect ruling).
 *
 * A superset of TableView's declared-{columns,rows} arm plus the OQ-3
 * binding convention slots (canonical-shape comments live in
 * schema/knowledge/view-spec.schema.yaml, minted in the same commit as the
 * enum):
 *  - `columns`: an ORDERED column-subset selector — bindings NAME the payload
 *    field names to show; absent -> the payload's declared {columns} (the
 *    TableView parity, :79-87), and if those are absent the union-of-keys.
 *  - `captionFrom`: that payload field's string value renders as a visible
 *    caption line ABOVE the table (denominator caption, basis note).
 *  - `warningsFrom`: that payload field's array value; each entry renders as
 *    a visible warning line BELOW the table.
 *  - `warningTextField`: when the warning entries are records, the property
 *    NAME whose string value renders; entries may be plain strings without it.
 *
 * Data-driven (R8 / bait #3b / bait #6): the bindings NAME fields, the
 * payload carries the values, and this component renders the strings where
 * the bindings say to. ZERO state-word comparisons — a state column renders
 * whatever string the payload carries at that key (the readable-state
 * guarantee); ZERO baked column lists (a `columns` binding or the payload's
 * own declaration drives the columns — no DEFAULT_COLUMNS constant); ZERO
 * normalization (no percent math, no per-compound formatting, no sorting).
 * An unrequested slot is simply ABSENT (no placeholder, no disabled block);
 * a binding naming an absent or blank payload field renders nothing; a
 * missing/blank/empty-rows payload renders the NAMED empty arm (the
 * TableView 'No rows' parity, :78) — never a silent blank.
 */
function ArtifactTable({ artifact, bindings }: { artifact: RenderableArtifact; bindings: Record<string, unknown> }) {
  const value = artifact.inlineValue
  const declared = isRecord(value) && Array.isArray(value.rows)
  const rows = Array.isArray(value) ? value : declared ? (value.rows as unknown[]) : []

  const captionKey = typeof bindings.captionFrom === 'string' ? (bindings.captionFrom as string) : undefined
  const rawCaption = captionKey && declared ? value[captionKey] : undefined
  const caption = typeof rawCaption === 'string' && !isBlankString(rawCaption) ? rawCaption : undefined

  const warningsKey = typeof bindings.warningsFrom === 'string' ? (bindings.warningsFrom as string) : undefined
  const warningTextField = typeof bindings.warningTextField === 'string' ? (bindings.warningTextField as string) : undefined
  const rawWarnings = warningsKey && declared ? value[warningsKey] : undefined
  const warnings: string[] = []
  if (Array.isArray(rawWarnings)) {
    for (const entry of rawWarnings) {
      if (typeof entry === 'string') {
        if (!isBlankString(entry)) warnings.push(entry)
      } else if (isRecord(entry) && warningTextField !== undefined && typeof entry[warningTextField] === 'string') {
        const w = entry[warningTextField]
        if (!isBlankString(w)) warnings.push(w)
      }
    }
  }

  const columnKeys = Array.isArray(bindings.columns)
    ? (bindings.columns as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined

  const columnFields = columnFieldPaths(bindings)

  const warningsBlock =
    warnings.length > 0 ? (
      <div data-testid="view-spec-artifact-table-warnings">
        {warnings.map((w, i) => (
          <div key={i} className="view-spec__warning" data-testid="view-spec-artifact-table-warning">
            {w}
          </div>
        ))}
      </div>
    ) : null

  if (rows.length === 0) {
    return (
      <div data-testid="view-spec-artifact-table">
        {caption !== undefined ? (
          <div className="view-spec__caption" data-testid="view-spec-artifact-table-caption">
            {caption}
          </div>
        ) : null}
        <div className="view-spec__empty" data-testid="view-spec-artifact-table-empty">
          No rows
        </div>
        {warningsBlock}
      </div>
    )
  }

  const declaredHeaders = declared && Array.isArray(value.columns) && value.columns.length > 0
  const declaredLabels = declaredHeaders
    ? (value.columns as unknown[]).map((c) => (typeof c === 'string' ? c : isRecord(c) && typeof c.name === 'string' ? c.name : null))
    : null
  const headers = new Set<string>()
  for (const r of rows) {
    if (isRecord(r)) for (const k of Object.keys(r)) headers.add(k)
  }
  const columns =
    columnKeys && columnKeys.length > 0
      ? columnKeys
      : declaredLabels
        ? (declaredLabels as string[]).filter((c): c is string => c !== null)
        : [...headers]

  return (
    <div data-testid="view-spec-artifact-table">
      {caption !== undefined ? (
        <div className="view-spec__caption" data-testid="view-spec-artifact-table-caption">
          {caption}
        </div>
      ) : null}
      <table className="view-spec__table">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((raw, i) => {
            const r: Record<string, unknown> = isRecord(raw) ? raw : { value: raw }
            return (
              <tr key={i}>
                {columns.map((c) => <td key={c}>{cellContent(r[c], columnFields[c])}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
      {warningsBlock}
    </div>
  )
}

/** Render a signal artifact (x/y series) as an inline SVG polyline.
 *
 * L1-SIGNALDREF-1 — the generic OQ-1(a) content route (the same machinery
 * ChromatogramView already ships, per the lane-1 architect ruling): a view
 * renders its artifact's payload from wherever the artifact data says the
 * payload is.
 *  - `inlineValue` present  -> render inline (current behavior preserved).
 *  - else dref-backed (an `id` + `dataReferenceRef.id` are stamped by the
 *    page's toRenderable on both doors) -> resolve the bytes through
 *    `apiClient.getAnalysisArtifactContent(artifact.id)` — the AOUT record
 *    id, NEVER the dref id (the handler 400s NOT_ARTIFACT on a dref id).
 *    A NAMED loading arm is shown while the fetch is pending.
 *  - route failure          -> a NAMED error arm (the silent blank polyline
 *    is the defect this fix removes — never again).
 *  - no payload by either route -> a NAMED empty arm, not a blank SVG
 *    pretending a trace is there.
 * Both routes parse through the shared `parseTraceValue` (units come from
 * the data: `axis_units`/`value_units`), so the renderer carries no axis/
 * values re-derivation of its own and no GC/engine/point-count knowledge.
 * The async outcome is keyed to the artifact id that produced it
 * (`forId`): an artifact prop change invalidates the previous outcome in
 * the same commit (no stale-frame bleed, no stale resolve winning), inline
 * is always checked before the error arm, and a settled-but-undefined
 * payload renders the named empty arm (settled is tracked separately from
 * "has value").
 */
type SignalRouteState =
  | { status: 'idle' }
  | { status: 'loading'; forId: string }
  | { status: 'settled'; forId: string; value: unknown }
  | { status: 'error'; forId: string; message: string }

function SignalView({ artifact }: { artifact: RenderableArtifact }) {
  const drefId = artifact.dataReferenceRef?.id
  const aoutId = artifact.id
  const hasInline = artifact.inlineValue !== undefined
  // The content-route outcome, keyed to the artifact that produced it
  // (`forId`). `settled` is tracked separately from "has value": a settled
  // but undefined payload is the named empty arm, never stuck loading.
  const [routeState, setRouteState] = useState<SignalRouteState>({ status: 'idle' })

  useEffect(() => {
    if (hasInline) return
    if (!drefId || !aoutId) return
    let on = true
    setRouteState({ status: 'loading', forId: aoutId })
    apiClient
      .getAnalysisArtifactContent(aoutId)
      .then((v) => {
        if (on) setRouteState({ status: 'settled', forId: aoutId, value: v })
      })
      .catch((err) => {
        if (on) setRouteState({ status: 'error', forId: aoutId, message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      on = false
    }
  }, [drefId, aoutId, hasInline])

  // Inline is always checked first (a stale error must never shadow an
  // inline payload). An async outcome is only displayed for the artifact
  // that produced it (the `forId` key): the moment the artifact prop
  // changes, the previous outcome stops rendering in the same commit. If
  // the route is intended for this artifact but no current outcome exists
  // yet (first paint, or a stale outcome for a different artifact), the
  // fetch is in flight -> the named loading arm, not the empty arm.
  const routeIntended = !hasInline && drefId !== undefined && aoutId !== ''
  let value: unknown
  let loading = false
  let routeError: string | null = null
  if (hasInline) {
    value = artifact.inlineValue
  } else if (routeState.status === 'loading' && routeState.forId === aoutId) {
    loading = true
  } else if (routeState.status === 'settled' && routeState.forId === aoutId) {
    value = routeState.value
  } else if (routeState.status === 'error' && routeState.forId === aoutId) {
    routeError = routeState.message
  } else if (routeIntended) {
    loading = true
  } else {
    value = undefined
  }
  const parsed = useMemo(() => {
    if (value === undefined) return null
    const r = parseTraceValue(value)
    return r.ok ? r.trace : null
  }, [value])

  if (routeError !== null) {
    return (
      <div className="view-spec__error" data-testid="view-spec-signal-error">
        Could not load the signal data: {routeError}
      </div>
    )
  }
  if (loading) {
    return (
      <div className="view-spec__empty" data-testid="view-spec-signal-loading">
        Signal loading…
      </div>
    )
  }
  if (!parsed) {
    return (
      <div className="view-spec__empty" data-testid="view-spec-signal-empty">
        No signal data to display (no axis/values).
      </div>
    )
  }

  const { axis, values } = parsed
  const W = 320
  const H = 120
  const PAD = 8
  const xMin = Math.min(...axis)
  const xMax = Math.max(...axis)
  const yMin = Math.min(...values)
  const yMax = Math.max(...values)
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const pts = axis
    .map((x, i) => {
      const px = PAD + ((x - xMin) / xSpan) * (W - 2 * PAD)
      const py = H - PAD - ((values[i] ?? yMin) - yMin) / ySpan * (H - 2 * PAD)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
  const xUnit = parsed.xUnit
  const yUnit = parsed.yUnit
  return (
    <svg
      className="view-spec__signal"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Signal trace${xUnit ? ` (x: ${xUnit})` : ''}${yUnit ? ` (y: ${yUnit})` : ''}`}
      data-testid="view-spec-signal"
    >
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Render a metric (scalar + units). */
function MetricView({ artifact }: { artifact: RenderableArtifact }) {
  const val = artifact.inlineValue
  const unit = artifact.units && Object.values(artifact.units)[0]
  return (
    <div className="view-spec__metric" data-testid="view-spec-metric">
      <span className="view-spec__metric-value">{String(val ?? '—')}</span>
      {unit ? <span className="view-spec__metric-unit">{unit}</span> : null}
    </div>
  )
}

/** Static figure fallback — python-saved image referenced by value (URL/dataURI). */
function StaticFigureView({ artifact }: { artifact: RenderableArtifact }) {
  const src = typeof artifact.inlineValue === 'string' ? artifact.inlineValue : ''
  if (!src) return <div className="view-spec__empty">No figure</div>
  return <img className="view-spec__figure" src={src} alt={artifact.name} data-testid="view-spec-image" />
}

/** Model / binary artifact — show format + whether it's storage-backed. */
function ModelView({ artifact }: { artifact: RenderableArtifact }) {
  return (
    <div className="view-spec__model" data-testid="view-spec-model">
      <span className="view-spec__model-kind">{artifact.dataKind}</span>
      {artifact.format ? <span className="view-spec__model-format">{artifact.format}</span> : null}
      {artifact.dataReferenceRef?.id
        ? <span className="view-spec__model-dref" title="data-reference">DREF {artifact.dataReferenceRef.id}</span>
        : <span className="view-spec__model-dref view-spec__model-dref--inline">inline (promote to use downstream)</span>}
    </div>
  )
}

export function ViewRenderer({
  view,
  artifact,
  siblings,
  onRecalcDone,
}: {
  view: RenderableView
  artifact: RenderableArtifact
  siblings?: RenderableArtifact[]
  /** FIX1 D2: the calibration composite's recalc-completion callback — the
   * page threads its selectRun + refresh here (spec D4 "then select the new
   * run"). Optional: the persisted-record door carries none (the composite's
   * own named arms cover the footer; no dead chrome). */
  onRecalcDone?: (runId: string) => void
}) {
  switch (view.renderer) {
    case 'table':
      return <TableView artifact={artifact} bindings={view.bindings ?? {}} />
    case 'signal':
      return <SignalView artifact={artifact} />
    case 'metric':
      return <MetricView artifact={artifact} />
    case 'static-figure':
      return <StaticFigureView artifact={artifact} />
    // GC-10: the interactive chromatogram + the compare view. These land
    // BEFORE `default:` so an unknown renderer still hits the visible
    // compatibility error arm below (the closed-set error is preserved).
    case 'chromatogram': {
      const bindings = view.bindings ?? {}
      const markersFrom = typeof bindings.markersFrom === 'string' ? (bindings.markersFrom as string) : undefined
      const markerArtifact =
        markersFrom && siblings ? siblings.find((a) => a.name === markersFrom) : undefined
      return (
        <ChromatogramView
          artifact={artifact}
          markerArtifact={markerArtifact}
          bindings={bindings}
          siblings={siblings}
        />
      )
    }
    case 'trace-compare':
      // A `trace-compare` view renders through the Compare surface (§D4), not
      // the single-artifact per-view path. The dispatch arm exists so an
      // orphan trace-compare view-spec is VISIBLE (a named error), never blank.
      return (
        <div className="view-spec__error" data-testid="view-spec-error">
          trace-compare views render through the Compare surface (select runs → Compare traces)
        </div>
      )
    // GC-11: the calibration review composite (curve + residual strip + table
    // with shared selection). The model artifact is resolved by NAME from the
    // siblings via `bindings.modelArtifact` (the markersFrom pattern, :169-181);
    // when the binding is absent the first sibling is offered as the model
    // candidate — the composite's own structural gate (calibrationModel)
    // decides whether the shapes actually pair, so a wrong sibling degrades to
    // a NAMED error arm, never a faked curve. The page context (frozen inputs
    // + the revision's parameterSchema) rides `bindings.page` from the
    // client-synthesis door (the /analysis page); the persisted-record door
    // carries none, and the composite's own named arms then cover the
    // run-link and recalc footer (no dead chrome — the same honest-degrade
    // rule as trace-compare's named state, but the PLOT still renders).
    case 'calibration-curve': {
      const bindings = view.bindings ?? {}
      const modelFrom = typeof bindings.modelArtifact === 'string' ? (bindings.modelArtifact as string) : undefined
      const modelArtifact =
        modelFrom && siblings ? siblings.find((a) => a.name === modelFrom) : (siblings?.find((a) => a.name !== artifact.name) ?? undefined)
      const page = bindings.page as
        | { activeRunId?: string; revisions?: Array<{ recordId: string; payload: Record<string, unknown> }>; sourceRun?: unknown }
        | undefined
      return (
        <CalibrationCurveView
          artifact={artifact}
          modelArtifact={modelArtifact}
          bindings={bindings}
          page={{
            activeRunId: page?.activeRunId ?? artifact.id,
            revisions: Array.isArray(page?.revisions) ? page.revisions : [],
            sourceRun: page?.sourceRun ?? null,
          }}
          onRecalcDone={onRecalcDone}
        />
      )
    }
    case 'model':
    case 'binary':
      return <ModelView artifact={artifact} />
    // The generic artifact-report renderer (the OQ-1 id `artifact-table`; the
    // OQ-3 binding convention slots — columns / captionFrom / warningsFrom /
    // warningTextField — are DATA: the bindings name payload fields, the
    // payload carries the values). These land BEFORE `default:` so an unknown
    // renderer still hits the visible compatibility error arm below (the
    // closed-set error is preserved).
    case 'artifact-table':
      return <ArtifactTable artifact={artifact} bindings={view.bindings ?? {}} />
    default:
      return (
        <div className="view-spec__error" data-testid="view-spec-error">
          Unsupported renderer: {String((view as { renderer?: unknown }).renderer)}
        </div>
      )
  }
}

/** Convenience: build a RenderableArtifact from a raw record-shaped value. */
export function toRenderableArtifact(
  name: string,
  dataKind: string,
  inlineValue: unknown,
  units?: Record<string, string>,
): RenderableArtifact {
  return { id: '', name, dataKind, ...(inlineValue !== undefined ? { inlineValue } : {}), ...(units ? { units } : {}) }
}

/** Wrap renderers so callers can render a list of views cleanly. */
export function renderViews(
  views: RenderableView[],
  artifacts: RenderableArtifact[],
  onRecalcDone?: (runId: string) => void,
): ReactNode[] {
  return views.map((view) => {
    const artifact = artifacts.find((a) => a.name === view.artifact)
    if (!artifact) {
      return (
        <div key={view.id} className="view-spec__error">
          Missing artifact for view: {view.artifact}
        </div>
      )
    }
    return (
      <div key={view.id} className="view-spec">
        <div className="view-spec__title">{view.title}</div>
        <ViewRenderer view={view} artifact={artifact} siblings={artifacts} onRecalcDone={onRecalcDone} />
      </div>
    )
  })
}