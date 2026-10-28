/**
 * GC-10 [F2] — traceInteraction.ts — the SHARED interaction model for the
 * two GC-10 trace surfaces (ChromatogramView single-trace + CompareTraces
 * multi-trace overlay).
 *
 * This is the REUSE home for the x-domain interaction: zoom (drag-select),
 * pan (Shift-drag), reset, and the hover snap-to-nearest-RAW-sample. Both
 * surfaces consume `useTraceInteraction` — the logic lives here ONCE (no
 * forked copy of the readout/zoom code), and the single-trace surface's
 * behaviours/testids are unchanged (the hook reproduces its exact domain,
 * selection, pan, and reset semantics; only the file moved).
 *
 * Hard lines (spec §D2 + reviewer bait #7): units/labels never live here —
 * this module is geometry + gesture state only (numbers in, pixels out);
 * every unit string a readout shows arrives from the DATA at the call site.
 * Interaction state is view state (never persisted, never written back to
 * any record).
 */
import { useCallback, useEffect, useState } from 'react'

export interface XDomain {
  x0: number
  x1: number
}

/** Binary-search the nearest ascending-axis index to x. Exported (pure) so
 *  the surfaces share the ONE nearest-sample authority. */
export function nearestIndex(axis: number[], x: number): number {
  if (axis.length === 0) return -1
  let lo = 0
  let hi = axis.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (axis[mid]! < x) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(axis[lo - 1]! - x) < Math.abs(axis[lo]! - x)) return lo - 1
  return lo
}

/** N evenly spaced tick values (inclusive endpoints). */
export function tickValues(x0: number, x1: number, count: number): number[] {
  if (x1 <= x0) return [x0]
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(x0 + ((x1 - x0) * i) / (count - 1))
  return out
}

/** Compact number formatting for readout/tick labels (no unit literals —
 *  the call site appends the data-carried unit). */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2)
  return String(Math.round(v * 1000) / 1000)
}

export interface TraceInteractionOptions {
  /** The SVG element to attach gesture coordinates to. */
  svgRef: { current: SVGSVGElement | null }
  /** The FULL data extent (the reset target). For the compare overlay this
   *  is the VISIBLE-set x extent, so hiding a trace re-derives the full
   *  extent (leg-e semantics: axes recompute from visible traces only). */
  fullDomain: XDomain | null
  /** The plot rectangle within the fixed viewBox. */
  plot: { padL: number; plotW: number }
  /** The viewBox width (SVG user units). */
  viewBoxWidth: number
}

export interface TraceInteraction {
  /** The ACTIVE x-domain (state domain, else the full domain). */
  domain: XDomain | null
  /** The domain the gesture should anchor to (the full extent; pan/zoom
   *  math read the gesture-start copy, not the live domain). */
  fullDomain: XDomain | null
  sel: { a: number; b: number } | null
  /** The snapped hover x in DATA units (null when no hover). Surfaces pair
   *  this with their own nearest-sample value lookup (the readout y). */
  hoverX: number | null
  /** Map an SVG user-unit px to a data-x. */
  pxToX: (px: number) => number
  /** Attach to the svg: mousedown/mousemove/mouseup/mouseleave. */
  svgHandlers: {
    onMouseDown: (e: React.MouseEvent) => void
    onMouseMove: (e: React.MouseEvent) => void
    onMouseUp: () => void
    onMouseLeave: () => void
  }
  reset: () => void
}

/**
 * The shared x-domain interaction state machine.
 *
 * Gesture model (the single-trace surface's documented model — spec §D2
 * names "drag-select" zoom + pan as two distinct drags, so a modifier
 * disambiguates; the compare surface carries the SAME affordances):
 *   - plain left-drag  = ZOOM drag-select (rubber-band -> set x-domain)
 *   - Shift left-drag  = PAN (translate the x-domain)
 *   - Reset            = restore the FULL data extent (`fullDomain`)
 */
export function useTraceInteraction(opts: TraceInteractionOptions): TraceInteraction {
  const { svgRef, fullDomain, plot, viewBoxWidth } = opts
  const [stateDomain, setStateDomain] = useState<XDomain | null>(null)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const [drag, setDrag] = useState<{ mode: 'zoom' | 'pan'; startPx: number; start: XDomain } | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  // When the full extent re-derives (new data; compare: a trace is hidden
  // and the visible-set extent shrinks), snap the domain back to full —
  // the single-trace surface's exact reset-on-data-change behaviour.
  useEffect(() => {
    if (fullDomain) setStateDomain(fullDomain)
  }, [fullDomain])

  const domain = stateDomain ?? fullDomain

  const clientToPx = useCallback(
    (clientX: number): number => {
      const el = svgRef.current
      if (!el) return plot.padL
      const rect = el.getBoundingClientRect()
      if (!rect.width) return plot.padL
      return (clientX - rect.left) * (viewBoxWidth / rect.width)
    },
    [svgRef, plot.padL, viewBoxWidth],
  )

  const pxToX = useCallback(
    (px: number): number => {
      if (!domain) return 0
      const span = domain.x1 - domain.x0 || 1
      return domain.x0 + ((px - plot.padL) / plot.plotW) * span
    },
    [domain, plot.padL, plot.plotW],
  )

  function onPointerDown(e: React.MouseEvent) {
    if (!domain) return
    e.preventDefault()
    const px = clientToPx(e.clientX)
    setDrag({ mode: e.shiftKey ? 'pan' : 'zoom', startPx: px, start: domain })
  }
  function onPointerMove(e: React.MouseEvent) {
    if (!domain) return
    const px = clientToPx(e.clientX)
    if (drag) {
      if (drag.mode === 'zoom') {
        setSel({ a: Math.min(drag.startPx, px), b: Math.max(drag.startPx, px) })
      } else {
        const dxData = ((px - drag.startPx) / plot.plotW) * (drag.start.x1 - drag.start.x0)
        setStateDomain({ x0: drag.start.x0 - dxData, x1: drag.start.x1 - dxData })
      }
      return
    }
    // Hover: expose the data-x under the cursor; the surface snaps it to
    // the nearest RAW sample (readout reads raw points, never decimated).
    setHoverX(pxToX(px))
  }
  function onPointerUp() {
    if (drag?.mode === 'zoom' && sel && sel.b - sel.a > 2) {
      const x0 = pxToX(sel.a)
      const x1 = pxToX(sel.b)
      setStateDomain({ x0: Math.min(x0, x1), x1: Math.max(x0, x1) })
    }
    setDrag(null)
    setSel(null)
  }
  function onPointerLeave() {
    setHoverX(null)
  }
  function reset() {
    if (fullDomain) setStateDomain(fullDomain)
    setSel(null)
    setHoverX(null)
  }

  return {
    domain,
    fullDomain,
    sel,
    hoverX,
    pxToX,
    svgHandlers: {
      onMouseDown: onPointerDown,
      onMouseMove: onPointerMove,
      onMouseUp: onPointerUp,
      onMouseLeave: onPointerLeave,
    },
    reset,
  }
}
