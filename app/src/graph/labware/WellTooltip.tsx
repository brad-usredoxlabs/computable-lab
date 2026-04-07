/**
 * WellTooltip - Hover tooltip showing well context (volumes, materials, events).
 * Shows computed state from the event graph.
 */

import { useMemo } from 'react'
import type { WellId } from '../../types/plate'
import type { PlateEvent } from '../../types/events'
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../../types/events'
import {
  type LabwareStates,
  getWellState,
  getWellEvents,
  formatVolume,
} from '../lib/eventGraph'
import {
  formatComputedConcentration,
  formatComputedCount,
  formatScientificStateSummary,
} from '../../shared/lib/formHelpers'

interface WellTooltipProps {
  wellId: WellId
  labwareId: string
  events: PlateEvent[]
  computedStates: LabwareStates
  maxVolume?: number
  semanticInfo?: {
    biology?: string[]
    readouts?: string[]
    results?: string[]
  }
}

export function WellTooltip({
  wellId,
  labwareId,
  events,
  computedStates,
  maxVolume = 300,
  semanticInfo,
}: WellTooltipProps) {
  const state = useMemo(
    () => getWellState(computedStates, labwareId, wellId),
    [computedStates, labwareId, wellId]
  )

  const wellEvents = useMemo(
    () => getWellEvents(events, labwareId, wellId),
    [events, labwareId, wellId]
  )

  const hasSemanticInfo = Boolean(
    semanticInfo?.biology?.length
    || semanticInfo?.readouts?.length
    || semanticInfo?.results?.length,
  )

  if (state.volume_uL === 0 && wellEvents.length === 0 && !hasSemanticInfo) {
    return (
      <div className="well-tooltip well-tooltip--empty">
        <div className="well-tooltip__header">
          <span className="well-tooltip__well-id">{wellId}</span>
          <span className="well-tooltip__status">Empty</span>
        </div>
        <style>{tooltipStyles}</style>
      </div>
    )
  }

  const volumePercent = Math.min(100, (state.volume_uL / maxVolume) * 100)
  const scientificSummary = formatScientificStateSummary(state.materials.length, formatVolume(state.volume_uL))
  const displayedMaterials = state.materials.slice(0, 4)

  return (
    <div className="well-tooltip">
      {/* Header */}
      <div className="well-tooltip__header">
        <span className="well-tooltip__well-id">{wellId}</span>
        <span className="well-tooltip__volume">{formatVolume(state.volume_uL)}</span>
        {state.harvested && <span className="well-tooltip__badge">Harvested</span>}
      </div>
      <div className="well-tooltip__summary">{scientificSummary}</div>

      {/* Volume bar */}
      <div className="well-tooltip__volume-bar">
        <div
          className={`well-tooltip__volume-fill ${volumePercent > 90 ? 'well-tooltip__volume-fill--high' : ''}`}
          style={{ width: `${volumePercent}%` }}
        />
      </div>

      {/* Materials */}
      {state.materials.length > 0 && (
        <div className="well-tooltip__section">
          <div className="well-tooltip__section-title">Scientific State</div>
          <ul className="well-tooltip__materials">
            {displayedMaterials.map((m, idx) => (
              <li key={idx}>
                <span className="well-tooltip__material-name">{m.materialRef}</span>
                <span className="well-tooltip__material-meta">
                  {formatComputedConcentration(m.concentration, m.concentrationUnknown) || 'no concentration'}
                  {' · '}
                  {formatVolume(m.volume_uL)}
                  {typeof m.count === 'number' ? ` · ${formatComputedCount(m.count)}` : ''}
                </span>
              </li>
            ))}
            {state.materials.length > displayedMaterials.length && (
              <li className="well-tooltip__more">+{state.materials.length - displayedMaterials.length} more</li>
            )}
          </ul>
        </div>
      )}

      {semanticInfo?.biology?.length ? (
        <div className="well-tooltip__section">
          <div className="well-tooltip__section-title">Biology</div>
          <ul className="well-tooltip__events">
            {semanticInfo.biology.slice(0, 4).map((entry) => (
              <li key={entry}>
                <span className="well-tooltip__event-label">{entry}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {semanticInfo?.readouts?.length ? (
        <div className="well-tooltip__section">
          <div className="well-tooltip__section-title">Readouts</div>
          <ul className="well-tooltip__events">
            {semanticInfo.readouts.slice(0, 3).map((entry) => (
              <li key={entry}>
                <span className="well-tooltip__event-label">{entry}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {semanticInfo?.results?.length ? (
        <div className="well-tooltip__section">
          <div className="well-tooltip__section-title">Results</div>
          <ul className="well-tooltip__events">
            {semanticInfo.results.slice(0, 4).map((entry) => (
              <li key={entry}>
                <span className="well-tooltip__event-label">{entry}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Recent events */}
      {wellEvents.length > 0 && (
        <div className="well-tooltip__section">
          <div className="well-tooltip__section-title">Events ({wellEvents.length})</div>
          <ul className="well-tooltip__events">
            {wellEvents.slice(-4).map((event) => (
              <li key={event.eventId}>
                <span className="well-tooltip__event-icon">{EVENT_TYPE_ICONS[event.event_type]}</span>
                <span className="well-tooltip__event-label">{EVENT_TYPE_LABELS[event.event_type]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{tooltipStyles}</style>
    </div>
  )
}

const tooltipStyles = `
  .well-tooltip {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 0.75rem;
    min-width: 180px;
    max-width: 250px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 0.8rem;
    pointer-events: none;
    z-index: 1000;
  }

  .well-tooltip--empty {
    min-width: auto;
  }

  .well-tooltip__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .well-tooltip__summary {
    font-size: 0.68rem;
    color: #868e96;
    margin-bottom: 0.5rem;
  }

  .well-tooltip__well-id {
    font-weight: 700;
    font-size: 1rem;
    color: #228be6;
  }

  .well-tooltip__volume {
    font-family: monospace;
    color: #495057;
  }

  .well-tooltip__status {
    color: #868e96;
    font-style: italic;
  }

  .well-tooltip__badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: #d3f9d8;
    color: #2b8a3e;
    text-transform: uppercase;
  }

  .well-tooltip__volume-bar {
    height: 4px;
    background: #e9ecef;
    border-radius: 2px;
    margin-bottom: 0.5rem;
  }

  .well-tooltip__volume-fill {
    height: 100%;
    background: #339af0;
    border-radius: 2px;
  }

  .well-tooltip__volume-fill--high {
    background: #fcc419;
  }

  .well-tooltip__section {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e9ecef;
  }

  .well-tooltip__section-title {
    font-size: 0.625rem;
    text-transform: uppercase;
    color: #868e96;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
  }

  .well-tooltip__materials,
  .well-tooltip__events {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .well-tooltip__materials li {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.125rem 0;
  }

  .well-tooltip__material-name {
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .well-tooltip__material-meta {
    font-size: 0.68rem;
    color: #868e96;
  }

  .well-tooltip__more {
    font-style: italic;
    color: #868e96;
  }

  .well-tooltip__events li {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
  }

  .well-tooltip__event-icon {
    font-size: 0.75rem;
  }

  .well-tooltip__event-label {
    font-size: 0.7rem;
    color: #495057;
  }
`
