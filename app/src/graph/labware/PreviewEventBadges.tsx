/**
 * PreviewEventBadges - Renders SVG badges overlaid on labware canvas for preview events.
 * Each badge contains accept/reject/pending buttons for controlling event state.
 */

import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import { getAffectedWells } from '../../types/events'

export type PreviewEventState = 'pending' | 'accepted' | 'rejected'

interface Props {
  labware: Labware
  previewEvents: PlateEvent[]
  previewEventStates: Map<string, PreviewEventState>
  onSetState: (eventId: string, state: PreviewEventState) => void
  onHoverEvent?: (eventId: string | null) => void
  wellCenter: (wellId: string) => { cx: number; cy: number } | null
}

const BADGE_RADIUS = 9
const BADGE_SPACING = 14
const STATE_COLOR: Record<PreviewEventState, { stroke: string; fill: string }> = {
  pending:  { stroke: '#be4bdb', fill: '#fff' },
  accepted: { stroke: '#2f9e44', fill: '#d3f9d8' },
  rejected: { stroke: '#868e96', fill: '#f1f3f5' },
}

export function PreviewEventBadges({
  labware,
  previewEvents,
  previewEventStates,
  onSetState,
  onHoverEvent,
  wellCenter,
}: Props) {
  // Filter to events that touch at least one well of THIS labware
  const eventsForLabware = previewEvents.filter((event) => {
    const details = event.details as Record<string, unknown>
    const eventLabwareId = details.labwareId as string | undefined
    const sourceLabwareId = (details.source as { labwareInstanceId?: string } | undefined)?.labwareInstanceId
    const targetLabwareId = (details.target as { labwareInstanceId?: string } | undefined)?.labwareInstanceId
    const sourceLabwareIdLegacy = details.source_labwareId as string | undefined
    const destLabwareId = details.dest_labwareId as string | undefined

    return eventLabwareId === labware.labwareId
      || sourceLabwareId === labware.labwareId
      || targetLabwareId === labware.labwareId
      || sourceLabwareIdLegacy === labware.labwareId
      || destLabwareId === labware.labwareId
  })

  // Compute badge positions, grouping by well centroid so same-well events stack
  const positioned = eventsForLabware.map((event) => {
    const wells = getAffectedWells(event).filter(Boolean)
    if (wells.length === 0) return null
    // Centroid = average of well centers
    const centers = wells.map((w) => wellCenter(w)).filter((c): c is { cx: number; cy: number } => c !== null)
    if (centers.length === 0) return null
    const cx = centers.reduce((s, c) => s + c.cx, 0) / centers.length
    // Topmost = min y
    const topY = Math.min(...centers.map((c) => c.cy))
    return { event, cx, cy: topY - BADGE_SPACING }
  }).filter((e): e is NonNullable<typeof e> => e !== null)

  // Stack badges that share near-identical centroids
  const stacked: Array<{ event: PlateEvent; cx: number; cy: number }> = []
  for (const entry of positioned) {
    const collisions = stacked.filter(
      (s) => Math.abs(s.cx - entry.cx) < 4 && Math.abs(s.cy - entry.cy) < 4,
    )
    stacked.push({ ...entry, cy: entry.cy - collisions.length * BADGE_SPACING })
  }

  return (
    <g className="preview-event-badges">
      {stacked.map(({ event, cx, cy }) => {
        const state = previewEventStates.get(event.eventId) ?? 'pending'
        const color = STATE_COLOR[state]
        return (
          <g
            key={event.eventId}
            transform={`translate(${cx}, ${cy})`}
            onMouseEnter={() => onHoverEvent?.(event.eventId)}
            onMouseLeave={() => onHoverEvent?.(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* background pill */}
            <rect
              x={-3 * BADGE_RADIUS}
              y={-BADGE_RADIUS}
              width={6 * BADGE_RADIUS}
              height={2 * BADGE_RADIUS}
              rx={BADGE_RADIUS}
              fill={color.fill}
              stroke={color.stroke}
              strokeWidth={1.5}
              opacity={state === 'rejected' ? 0.5 : 1}
            />
            {/* Accept ✓ */}
            <g
              transform={`translate(${-2 * BADGE_RADIUS}, 0)`}
              onClick={(e) => { e.stopPropagation(); onSetState(event.eventId, 'accepted'); }}
              style={{ pointerEvents: 'all' }}
            >
              <circle r={BADGE_RADIUS - 2} fill="transparent" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="11" fill={state === 'accepted' ? '#2f9e44' : '#868e96'}>✓</text>
            </g>
            {/* Pending ○ */}
            <g
              transform="translate(0, 0)"
              onClick={(e) => { e.stopPropagation(); onSetState(event.eventId, 'pending'); }}
              style={{ pointerEvents: 'all' }}
            >
              <circle r={BADGE_RADIUS - 2} fill="transparent" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="11" fill={state === 'pending' ? '#be4bdb' : '#868e96'}>○</text>
            </g>
            {/* Reject ✗ */}
            <g
              transform={`translate(${2 * BADGE_RADIUS}, 0)`}
              onClick={(e) => { e.stopPropagation(); onSetState(event.eventId, 'rejected'); }}
              style={{ pointerEvents: 'all' }}
            >
              <circle r={BADGE_RADIUS - 2} fill="transparent" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="11" fill={state === 'rejected' ? '#c92a2a' : '#868e96'}>✗</text>
            </g>
          </g>
        )
      })}
    </g>
  )
}
