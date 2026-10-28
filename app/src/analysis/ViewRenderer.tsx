/**
 * ViewRenderer — render an analysis output artifact via a validated ViewSpec.
 *
 * Only SHIPPED renderers execute. A static-figure fallback renders Python
 * visualizations; unknown renderers produce a visible compatibility error
 * rather than silently failing.
 */
import type { ReactNode } from 'react'
import { ChromatogramView } from './ChromatogramView'
import { CalibrationCurveView } from './CalibrationCurveView'

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

/** Render a signal artifact (x/y series) as an inline SVG polyline. */
function SignalView({ artifact }: { artifact: RenderableArtifact }) {
  const value = isRecord(artifact.inlineValue) ? artifact.inlineValue : {}
  const axis = Array.isArray(value.axis) ? value.axis.map(Number) : []
  const values = Array.isArray(value.values) ? value.values.map(Number) : []
  const W = 320
  const H = 120
  const PAD = 8
  const xMin = axis.length ? Math.min(...axis) : 0
  const xMax = axis.length ? Math.max(...axis) : 1
  const yMin = values.length ? Math.min(...values) : 0
  const yMax = values.length ? Math.max(...values) : 1
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const pts = axis
    .map((x, i) => {
      const px = PAD + ((x - xMin) / xSpan) * (W - 2 * PAD)
      const py = H - PAD - ((values[i] ?? yMin) - yMin) / ySpan * (H - 2 * PAD)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="view-spec__signal" width={W} height={H} viewBox={`0 0 ${W} ${H}`} data-testid="view-spec-signal">
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