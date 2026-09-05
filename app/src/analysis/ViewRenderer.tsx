/**
 * ViewRenderer — render an analysis output artifact via a validated ViewSpec.
 *
 * Only SHIPPED renderers execute. A static-figure fallback renders Python
 * visualizations; unknown renderers produce a visible compatibility error
 * rather than silently failing.
 */
import type { ReactNode } from 'react'

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
  renderer: 'table' | 'signal' | 'metric' | 'static-figure' | 'model' | 'binary'
  bindings?: Record<string, unknown>
  options?: Record<string, unknown>
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

export function ViewRenderer({ view, artifact }: { view: RenderableView; artifact: RenderableArtifact }) {
  switch (view.renderer) {
    case 'table':
      return <TableView artifact={artifact} />
    case 'signal':
      return <SignalView artifact={artifact} />
    case 'metric':
      return <MetricView artifact={artifact} />
    case 'static-figure':
      return <StaticFigureView artifact={artifact} />
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
        <ViewRenderer view={view} artifact={artifact} />
      </div>
    )
  })
}