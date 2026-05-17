import type { WellId } from '../../types/plate'
import { formatVolume, getMaterialsSummary, type WellComputedState } from '../../graph/lib/eventGraph'

interface WellTooltipProps {
  wellId: WellId
  state: WellComputedState
  x: number
  y: number
}

export function WellTooltip({ wellId, state, x, y }: WellTooltipProps) {
  const empty = state.volume_uL === 0 && state.materials.length === 0 && !state.harvested

  return (
    <div
      className="well-tooltip"
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <div className="well-tooltip__title">
        <span className="well-tooltip__well-id">{wellId}</span>
        <span className="well-tooltip__volume">{formatVolume(state.volume_uL)}</span>
      </div>
      <div className="well-tooltip__contents">
        {empty ? <span className="well-tooltip__empty">Empty</span> : getMaterialsSummary(state)}
      </div>
      {state.harvested ? <div className="well-tooltip__flag">harvested</div> : null}
      {state.eventHistory.length > 0 ? (
        <div className="well-tooltip__meta">
          {state.eventHistory.length} event{state.eventHistory.length === 1 ? '' : 's'} applied
        </div>
      ) : null}
    </div>
  )
}
