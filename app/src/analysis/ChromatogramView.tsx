/**
 * GC-10 [C] — ChromatogramView.tsx — the interactive single-trace renderer.
 *
 * Replaces the 320x120 static `signal` polyline for `chromatogram` view-specs:
 * zoom (drag-select), pan (Shift-drag), reset, hover readout (raw points),
 * RT/peak markers from a sibling peak-table artifact, peak-table row <-> trace
 * sync, and axes labeled from the artifact-carried unit strings.
 *
 * Hard lines (spec §D2/§D5 + reviewer bait #7/#8/#13):
 *  - Units/labels/field names arrive from the DATA (the artifact payload /
 *    the marker rows); this component contains ZERO unit literals and ZERO
 *    domain-name literals beyond the single sanctioned DEFAULT_MARKER_FIELDS
 *    fallback const (the shipped column names as data, not logic).
 *  - Decimation is visual-only: `decimateForRender` output drives the SVG
 *    geometry only; the hover readout snaps to RAW points; nothing persists
 *    a decimated copy.
 *  - dref-backed artifacts read their full-resolution bytes through the
 *    ratified OQ-1(a) content route (apiClient.getAnalysisArtifactContent);
 *    a failure is a NAMED error, never a silent partial/scaled fallback.
 *  - Interaction state (zoom domain, selection, hover, active peak) is
 *    component-local view state — never written back to any record.
 *
 * Gesture model (documented; the spec names "drag-select" zoom + "no-modifier"
 * pan as two distinct drags, so a modifier disambiguates):
 *   - plain left-drag  = ZOOM drag-select (rubber-band -> set x-domain)
 *   - Shift left-drag  = PAN (translate the x-domain)
 *   - Reset button     = restore the FULL data extent
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../shared/api/client'
import type { RenderableArtifact } from './ViewRenderer'
import {
  decimateForRender,
  parseMarkerRows,
  parseTraceValue,
  type MarkerRow,
} from './traceModel'
import { fmt, nearestIndex, tickValues, useTraceInteraction } from './traceInteraction'

/** The single sanctioned fallback field-name table (shipped column names AS
 *  DATA — the one exception to the bait #7 grep pin; bindings override it). */
export const DEFAULT_MARKER_FIELDS = { rt: 'rt_min', label: 'peak', saturated: 'saturated', flags: 'flags' } as const

export interface ChromatogramBindings {
  /** Sibling artifact NAME that carries the peak-table markers. */
  markersFrom?: string
  /** Property NAMES in the marker rows (data). Fallback: DEFAULT_MARKER_FIELDS. */
  markerRtField?: string
  markerLabelField?: string
  markerSaturatedField?: string
  markerFlagsField?: string
}

interface Domain {
  x0: number
  x1: number
}

// B1: the viewBox WIDTH follows the MEASURED pane width so the
// SVG paints at ~1:1 CSS px per user unit — the CSS-declared type sizes are
// the painted sizes (pre-fix: the whole fixed 720-unit canvas, 9 px tick
// labels included, scaled by paneWidth/720 ≈ 0.742 at the shipped 534 px
// pane). H stays fixed at 280; the fixed width is only the FALLBACK for an
// unmeasured container (jsdom / zero rect — the pre-B1 geometry).
const FALLBACK_W = 720
const H = 280
const PAD_L = 52
const PAD_R = 14
const PAD_T = 14
const PAD_B = 30

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function ChromatogramView({
  artifact,
  markerArtifact,
  bindings,
  siblings,
}: {
  artifact: RenderableArtifact
  markerArtifact?: RenderableArtifact
  bindings?: Record<string, unknown>
  siblings?: RenderableArtifact[]
}) {
  const b = (bindings ?? {}) as ChromatogramBindings
  const svgRef = useRef<SVGSVGElement | null>(null)

  // ---- B1: the measured container width drives the viewBox
  //      WIDTH (1:1 CSS px per user unit). The svg is width="100%", so the
  //      measured pane width IS the viewBox width. The ResizeObserver lives
  //      on the wrapping div (the .view-spec__chromatogram flex column) —
  //      measuring the svg element itself would be circular (its CSS width
  //      is the very thing derived from the viewBox). Unmeasured (jsdom /
  //      zero rect) falls back to the pre-B1 fixed width — geometry only,
  //      no data semantics. ----
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [measuredW, setMeasuredW] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number' && Number.isFinite(w) && w > 0) setMeasuredW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = measuredW > 0 ? Math.round(measuredW) : FALLBACK_W
  const PLOT_W = W - PAD_L - PAD_R
  const PLOT_H = H - PAD_T - PAD_B

  // ---- Data: inline value OR the OQ-1(a) content route (dref-only) ----
  // `dataReferenceRef` only SIGNALS that this artifact is dref-backed (its
  // bytes live in storage, not in the manifest). The content route resolves
  // AOUT-* record ids (the handler looks the id up in the store and requires
  // kind analysis-output-artifact — a DREF id would 400 NOT_ARTIFACT), so the
  // fetch carries the artifact's AOUT record id and receives the client-
  // UNWRAPPED `content` field (the stored trace payload object).
  const drefId = artifact.dataReferenceRef?.id
  const aoutId = artifact.id
  const [fetched, setFetched] = useState<unknown>(undefined)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [drefId, aoutId])

  const value = artifact.inlineValue !== undefined ? artifact.inlineValue : fetched
  const parsed = useMemo(() => {
    if (value === undefined) return null
    const r = parseTraceValue(value)
    return r.ok ? r.trace : null
  }, [value])

  const fullDomain = useMemo<Domain | null>(() => {
    if (!parsed) return null
    const x0 = Math.min(...parsed.axis)
    const x1 = Math.max(...parsed.axis)
    return x1 > x0 ? { x0, x1 } : { x0: x0 - 0.5, x1: x1 + 0.5 }
  }, [parsed])

  // ---- Interaction state (the SHARED x-domain model, traceInteraction —
  //      the same zoom/pan/reset/hover logic the Compare overlay consumes;
  //      component-local view state, never persisted) ----
  const inter = useTraceInteraction({
    svgRef,
    fullDomain,
    plot: { padL: PAD_L, plotW: PLOT_W },
    viewBoxWidth: W,
  })
  const { domain, sel, hoverX } = inter
  const [activePeak, setActivePeak] = useState<string | null>(null)

  const xToPx = (x: number): number => {
    if (!domain) return PAD_L
    const span = domain.x1 - domain.x0 || 1
    return PAD_L + ((x - domain.x0) / span) * PLOT_W
  }
  const yExtent = useMemo(() => {
    if (!parsed) return { y0: 0, y1: 1 }
    let y0 = Math.min(...parsed.values)
    let y1 = Math.max(...parsed.values)
    if (y1 === y0) {
      y0 -= 0.5
      y1 += 0.5
    }
    return { y0, y1 }
  }, [parsed])
  const yToPx = (y: number): number => PAD_T + PLOT_H - ((y - yExtent.y0) / (yExtent.y1 - yExtent.y0 || 1)) * PLOT_H

  // ---- Markers (from the sibling peak-table artifact) ----
  // D2 contract: the caller resolves `markersFrom` by NAME and passes the
  // resolved artifact. When only `siblings` is provided (e.g. renderViews
  // without a cross-view bus), resolve by NAME here as a fallback so the
  // markers still surface — either way the field-name DATA comes from
  // bindings, and the rows come from the artifact (data-only).
  const resolvedMarkerArtifact = useMemo(() => {
    if (markerArtifact) return markerArtifact
    if (!b.markersFrom || !siblings) return undefined
    return siblings.find((a) => a.name === b.markersFrom)
  }, [markerArtifact, b.markersFrom, siblings])

  // The resolved marker field names (DATA: the bindings, or the shipped
  // default names held in DEFAULT_MARKER_FIELDS). The table header renders
  // these names (B2: the column names are data-carried).
  const markerFields = useMemo(
    () => ({
      rt: b.markerRtField ?? DEFAULT_MARKER_FIELDS.rt,
      label: b.markerLabelField ?? DEFAULT_MARKER_FIELDS.label,
      saturated: b.markerSaturatedField ?? DEFAULT_MARKER_FIELDS.saturated,
      flags: b.markerFlagsField ?? DEFAULT_MARKER_FIELDS.flags,
    }),
    [b.markerRtField, b.markerLabelField, b.markerSaturatedField, b.markerFlagsField],
  )

  const markers = useMemo<MarkerRow[]>(() => {
    const ma = resolvedMarkerArtifact
    if (!ma) return []
    const inline = isRecord(ma.inlineValue) ? ma.inlineValue : {}
    const rows = Array.isArray(inline.rows) ? inline.rows : []
    return parseMarkerRows(rows, {
      rt: markerFields.rt,
      label: markerFields.label,
      saturated: markerFields.saturated,
      flags: markerFields.flags,
    })
  }, [resolvedMarkerArtifact, markerFields])

  const skippedNoRt = markers.filter((m) => m.rt === null).length

  // ---- Visual-only decimation (SVG geometry only; readout uses raw points) ----
  const slice = useMemo(
    () => (parsed ? decimateForRender(parsed.axis, parsed.values, Math.max(1, Math.floor(PLOT_W))) : { indices: [], droppedCount: 0 }),
    [parsed, PLOT_W],
  )

  const polyline = useMemo(() => {
    if (!parsed || !domain) return ''
    const pts: string[] = []
    for (const i of slice.indices) {
      const x = parsed.axis[i]!
      if (x < domain.x0 || x > domain.x1) continue
      pts.push(`${xToPx(x).toFixed(2)},${yToPx(parsed.values[i]!).toFixed(2)}`)
    }
    return pts.join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, slice, domain, yExtent])

  // ---- Hover readout: the SHARED interaction exposes the data-x under the
  //      cursor (inter.hoverX); snap it to the nearest RAW sample (the
  //      readout reads raw points, never decimated — §D5). ----
  const hover = useMemo(() => {
    if (hoverX === null || !parsed) return null
    const i = nearestIndex(parsed.axis, hoverX)
    if (i < 0) return null
    return { x: parsed.axis[i]!, y: parsed.values[i]! }
  }, [hoverX, parsed])
  const { reset } = inter

  // ---- Named error / empty states (never a thrown render) ----
  if (fetchError) {
    return (
      <div className="view-spec__chromatogram" data-testid="view-spec-chromatogram">
        <div className="view-spec__error" data-testid="chromatogram-error">
          Could not load the trace bytes: {fetchError}
        </div>
      </div>
    )
  }
  if (!parsed || !domain) {
    return (
      <div className="view-spec__chromatogram" data-testid="view-spec-chromatogram">
        <div className="view-spec__empty" data-testid="chromatogram-empty">
          {drefId && fetched === undefined ? 'Loading trace…' : 'No trace data to display (no axis/values).'}
        </div>
      </div>
    )
  }

  const xUnit = parsed.xUnit
  const yUnit = parsed.yUnit
  const xTicks = tickValues(domain.x0, domain.x1, 5)
  const yTicks = tickValues(yExtent.y0, yExtent.y1, 5)

  return (
    <div
      ref={wrapRef}
      className="view-spec__chromatogram"
      data-testid="view-spec-chromatogram"
      data-x-domain={domain ? `${domain.x0}:${domain.x1}` : undefined}
      data-width={W}
    >
      <div className="chromatogram__toolbar">
        <button type="button" onClick={reset} data-testid="chromatogram-reset" className="chromatogram__reset">
          Reset
        </button>
        {hover && (
          <span className="chromatogram__readout" data-testid="chromatogram-readout">
            {fmt(hover.x)}
            {xUnit ? ` ${xUnit}` : ''} / {fmt(hover.y)}
            {yUnit ? ` ${yUnit}` : ''}
          </span>
        )}
        {slice.droppedCount > 0 && (
          <span className="chromatogram__decim" data-testid="chromatogram-decimated">
            decimating {slice.droppedCount} points for display — full resolution is preserved in the artifact
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        className="chromatogram__svg"
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        data-testid="chromatogram-svg"
        onMouseDown={inter.svgHandlers.onMouseDown}
        onMouseMove={inter.svgHandlers.onMouseMove}
        onMouseUp={inter.svgHandlers.onMouseUp}
        onMouseLeave={inter.svgHandlers.onMouseLeave}
      >
        {/* plot frame */}
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} className="chromatogram__frame" />
        {/* x-axis ticks + labels */}
        {xTicks.map((t, i) => (
          <g key={`xt-${i}`}>
            <line x1={xToPx(t)} y1={PAD_T + PLOT_H} x2={xToPx(t)} y2={PAD_T + PLOT_H + 4} className="chromatogram__tick" />
            <text x={xToPx(t)} y={PAD_T + PLOT_H + 16} className="chromatogram__ticklabel">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* y-axis ticks + labels */}
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line x1={PAD_L - 4} y1={yToPx(t)} x2={PAD_L} y2={yToPx(t)} className="chromatogram__tick" />
            <text x={PAD_L - 8} y={yToPx(t) + 3} textAnchor="end" className="chromatogram__ticklabel">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* axis unit labels (data-carried) */}
        <text x={PAD_L + PLOT_W / 2} y={H - 4} textAnchor="middle" className="chromatogram__axislabel">
          {xUnit ?? 'x'}
        </text>
        <text x={12} y={PAD_T + PLOT_H / 2} textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`} className="chromatogram__axislabel">
          {yUnit ?? 'y'}
        </text>

        {/* markers (RT peaks) */}
        {markers
          .filter((m) => m.rt !== null)
          .map((m) => {
            if (m.rt === null) return null
            const px = xToPx(m.rt)
            const inView = px >= PAD_L && px <= PAD_L + PLOT_W
            if (!inView) return null
            const active = activePeak === m.peakId
            return (
              <g
                key={m.peakId}
                data-testid={`chromatogram-marker-${m.peakId}`}
                className={`chromatogram__marker${m.saturated ? ' chromatogram__marker--saturated' : ''}${active ? ' chromatogram__marker--active' : ''}`}
                onClick={() => setActivePeak(activePeak === m.peakId ? null : m.peakId)}
              >
                <line x1={px} y1={PAD_T} x2={px} y2={PAD_T + PLOT_H} className="chromatogram__markerline" />
                <text x={px + 3} y={PAD_T + 10} className="chromatogram__markerlabel">
                  {m.label}
                </text>
              </g>
            )
          })}

        {/* the trace (decimated geometry) */}
        <polyline points={polyline} fill="none" className="chromatogram__trace" />

        {/* hover cursor */}
        {hover && (
          <line x1={xToPx(hover.x)} y1={PAD_T} x2={xToPx(hover.x)} y2={PAD_T + PLOT_H} className="chromatogram__hover" />
        )}

        {/* zoom selection rectangle */}
        {sel && (
          <rect x={Math.min(sel.a, sel.b)} y={PAD_T} width={Math.abs(sel.b - sel.a)} height={PLOT_H} className="chromatogram__sel" data-testid="chromatogram-selection" />
        )}
      </svg>

      {/* peak-table micro-table with row <-> trace sync.
          B2: the table carries a <thead> — the column names are
          DATA-CARRIED (the resolved binding field names), and the RT header
          carries the unit ONCE (from parsed.xUnit — data, never a literal;
          absent unit ⇒ bare field name, nothing invented). The RT cells are
          numeric-only (the per-cell unit append is removed). */}
      {markers.length > 0 && (
        <div className="chromatogram__tablewrap">
          {skippedNoRt > 0 && (
            <div className="chromatogram__skipnote" data-testid="chromatogram-skipped">
              {skippedNoRt} marker row(s) have no RT value and are not plotted.
            </div>
          )}
          <table className="chromatogram__table">
            <thead>
              <tr>
                <th className="chromatogram__rowlabel">{markerFields.label}</th>
                <th>{xUnit ? `RT (${xUnit})` : 'RT'}</th>
                <th>{markerFields.saturated}</th>
                <th>{markerFields.flags}</th>
              </tr>
            </thead>
            <tbody>
              {markers.map((m) => (
                <tr
                  key={m.peakId}
                  data-testid={`chromatogram-row-${m.peakId}`}
                  className={activePeak === m.peakId ? 'chromatogram__row--active' : ''}
                  onClick={() => setActivePeak(activePeak === m.peakId ? null : m.peakId)}
                >
                  <td className="chromatogram__rowlabel">{m.label}</td>
                  <td>{m.rt === null ? '—' : fmt(m.rt)}</td>
                  <td className={m.saturated ? 'chromatogram__row-saturated' : ''}>{m.saturated ? 'saturated' : ''}</td>
                  <td className="chromatogram__rowflags">{m.flags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

