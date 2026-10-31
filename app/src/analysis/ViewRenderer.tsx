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
  renderer: 'table' | 'signal' | 'metric' | 'static-figure' | 'chromatogram' | 'trace-compare' | 'calibration-curve' | 'model' | 'binary'
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

/** Render a table artifact (rows of plain values). */
function TableView({ artifact }: { artifact: RenderableArtifact }) {
  const value = artifact.inlineValue
  const rows = Array.isArray(value) ? value : []
  if (rows.length === 0) return <div className="view-spec__empty">No rows</div>
  const headers = new Set<string>()
  for (const r of rows) {
    if (isRecord(r)) for (const k of Object.keys(r)) headers.add(k)
  }
  const columns = [...headers]
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
              {columns.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
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
 */
function SignalView({ artifact }: { artifact: RenderableArtifact }) {
  const drefId = artifact.dataReferenceRef?.id
  const aoutId = artifact.id
  const [fetched, setFetched] = useState<unknown>(undefined)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (artifact.inlineValue !== undefined) return
    if (!drefId || !aoutId) return
    let on = true
    setFetched(undefined)
    setFetchError(null)
    apiClient
      .getAnalysisArtifactContent(aoutId)
      .then((v) => {
        if (on) setFetched(v)
      })
      .catch((err) => {
        if (on) setFetchError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      on = false
    }
  }, [drefId, aoutId, artifact.inlineValue])

  const value = artifact.inlineValue !== undefined ? artifact.inlineValue : fetched
  const parsed = useMemo(() => {
    if (value === undefined) return null
    const r = parseTraceValue(value)
    return r.ok ? r.trace : null
  }, [value])

  const loading = drefId !== undefined && artifact.inlineValue === undefined && value === undefined && !fetchError
  if (fetchError) {
    return (
      <div className="view-spec__error" data-testid="view-spec-signal-error">
        Could not load the signal data: {fetchError}
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
      return <TableView artifact={artifact} />
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