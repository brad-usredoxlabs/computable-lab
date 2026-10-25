import { useLayoutEffect, useRef, useState } from 'react'
import type { WellId } from '../../types/plate'
import { formatVolume, type WellComputedState } from '../../graph/lib/eventGraph'
import { describeCellTotal, formatComputedConcentration, formatComputedCount } from '../../shared/lib/formHelpers'

interface WellTooltipProps {
  wellId: WellId
  state: WellComputedState
  /** True when the focused labware is a tube rack (changes the empty label). */
  isTubeRack?: boolean
  /** Cursor position in viewport coordinates (clientX/clientY). */
  clientX: number
  clientY: number
}

// Cap the rows so the tooltip stays compact on a crowded well; the rest are
// summarized with a "+N more" line.
const MAX_ROWS = 6
const CURSOR_GAP = 14
const EDGE_GAP = 8

export function WellTooltip({ wellId, state, isTubeRack = false, clientX, clientY }: WellTooltipProps) {
  const empty = state.volume_uL === 0 && state.materials.length === 0 && !state.harvested
  const emptyLabel = state.tube ? 'Empty tube' : isTubeRack ? 'No tube' : 'Empty'
  const rows = state.materials.slice(0, MAX_ROWS)
  const overflow = state.materials.length - rows.length

  // The tooltip is fixed-positioned (so the scrollable stage's overflow can't
  // clip it) and flips to the left/above the cursor when it would spill past
  // the viewport edge — otherwise column-12 and row-H wells push it off-screen.
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const measureKey = `${wellId}:${rows.length}:${overflow}:${state.harvested}:${empty}:${state.tube?.sizeLabel ?? ''}`
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [measureKey])

  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = clientX + CURSOR_GAP
  if (size.w) {
    if (left + size.w > vw - EDGE_GAP) left = clientX - CURSOR_GAP - size.w
    left = Math.min(Math.max(left, EDGE_GAP), vw - EDGE_GAP - size.w)
  }
  let top = clientY + CURSOR_GAP
  if (size.h) {
    if (top + size.h > vh - EDGE_GAP) top = clientY - CURSOR_GAP - size.h
    top = Math.min(Math.max(top, EDGE_GAP), vh - EDGE_GAP - size.h)
  }

  return (
    <div
      ref={ref}
      className="well-tooltip"
      style={{ left, top }}
      role="tooltip"
    >
      <div className="well-tooltip__title">
        <span className="well-tooltip__well-id">{wellId}</span>
        <span className="well-tooltip__volume">{formatVolume(state.volume_uL)}</span>
      </div>
      {state.tube ? (
        <div className="well-tooltip__tube">
          {state.tube.sizeLabel} tube · {formatVolume(state.tube.maxVolume_uL)} cap
          {state.tube.implied ? ' (assumed)' : ''}
        </div>
      ) : null}
      {empty ? (
        <div className="well-tooltip__contents">
          <span className="well-tooltip__empty">{emptyLabel}</span>
        </div>
      ) : state.materials.length > 0 ? (
        // Per-material table: each component with its event-graph-computed
        // current concentration (dilution already applied), plus its volume.
        <table className="well-tooltip__materials">
          <tbody>
            {rows.map((m, idx) => {
              const conc = formatComputedConcentration(m.concentration, m.concentrationUnknown)
              const count = formatComputedCount(m.count)
              const density = formatComputedConcentration(m.counterDensity)
              // SH-QA-4: a carrier-marked row (multi-entry composition_snapshot)
              // makes NO own-volume claim — the header above is the tooltip's
              // single volume assertion. The row states what the snapshot
              // actually carries: its share of the mixture, plus count/density.
              const isCarrier = Boolean(m.volumeIsCarrier)
              // CELLRATE-1: the per-well total is DISPLAY truth over the declared
              // data. The helper derives it ONLY from a declared rate x a declared
              // volume and labels it derived; a bare count is labeled
              // absolute-unverified and NEVER scaled. A carrier row cites the
              // header volume (the single volume assertion); a single-material
              // row cites its own volume.
              const cellTotal = describeCellTotal({
                ...(typeof m.count === 'number' ? { count: m.count } : {}),
                ...(m.counterDensity ? { density: m.counterDensity } : {}),
                ...(isCarrier
                  ? (state.volume_uL > 0 ? { volume_uL: state.volume_uL } : {})
                  : (m.volume_uL > 0 ? { volume_uL: m.volume_uL } : {})),
              })
              // Both DECLARED numbers stay visible whenever a density is declared
              // (auditability); the helper's labeled reading rides alongside.
              // With no rate anywhere, the helper's absolute-unverified label
              // replaces the bare count rather than duplicating it.
              const amountParts = density ? [count, density, cellTotal] : [cellTotal ?? count]
              const concCell = isCarrier
                ? [conc, ...amountParts].filter(Boolean).join(' · ') || '—'
                : conc ?? amountParts.find(Boolean) ?? '—'
              const volCell = isCarrier
                ? m.fractionOfMixture ?? '—'
                : formatVolume(m.volume_uL)
              return (
                <tr key={idx} className="well-tooltip__material">
                  <td className="well-tooltip__material-name" title={m.materialRef}>
                    {m.materialRef}
                    {m.role ? <span className="well-tooltip__material-role"> · {m.role}</span> : null}
                  </td>
                  <td className="well-tooltip__material-conc">{concCell}</td>
                  <td className="well-tooltip__material-vol">{volCell}</td>
                </tr>
              )
            })}
            {overflow > 0 ? (
              <tr className="well-tooltip__material well-tooltip__more">
                <td colSpan={3}>+{overflow} more</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : (
        <div className="well-tooltip__contents">
          <span className="well-tooltip__empty">No materials</span>
        </div>
      )}
      {state.harvested ? <div className="well-tooltip__flag">harvested</div> : null}
      {state.eventHistory.length > 0 ? (
        <div className="well-tooltip__meta">
          {state.eventHistory.length} event{state.eventHistory.length === 1 ? '' : 's'} applied
        </div>
      ) : null}
    </div>
  )
}
