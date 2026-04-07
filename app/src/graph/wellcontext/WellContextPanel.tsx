/**
 * WellContextPanel - Displays derived well state from events.
 * Shows current contents, volumes, and event history for selected wells.
 */

import { useMemo } from 'react'
import type { WellId } from '../../types/plate'
import type { PlateEvent, AddMaterialDetails, TransferDetails, WashDetails } from '../../types/events'
import { getAddMaterialRef, getRefLabel } from '../../types/events'
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS, getAffectedWells } from '../../types/events'
import { formatComputedConcentration, formatScientificStateSummary } from '../../shared/lib/formHelpers'

/**
 * Represents a material/substance in a well
 */
interface WellContent {
  materialRef: string
  volume: number
  volumeUnit: string
  concentration?: number
  concentrationUnit?: string
  addedByEventId: string
}

/**
 * Derived well context
 */
interface WellContext {
  wellId: WellId
  contents: WellContent[]
  totalVolume: number
  volumeUnit: string
  eventHistory: PlateEvent[]
}

/**
 * Derive well context by replaying events
 * This is a client-side implementation - ideally the kernel would provide this
 */
function deriveWellContext(wellId: WellId, events: PlateEvent[]): WellContext {
  const contents: WellContent[] = []
  const history: PlateEvent[] = []
  let totalVolume = 0
  const volumeUnit = 'µL'

  // Replay events in order
  events.forEach((event) => {
    const affectedWells = getAffectedWells(event)
    if (!affectedWells.includes(wellId)) return

    history.push(event)

    switch (event.event_type) {
      case 'add_material': {
        const details = event.details as AddMaterialDetails
        if (details.volume || typeof details.count === 'number') {
          const vol = details.volume
            ? (details.volume.unit === 'mL' ? details.volume.value * 1000 : details.volume.value)
            : 0
          totalVolume += vol
          contents.push({
            materialRef: getRefLabel(getAddMaterialRef(details) as string | { label?: string; id?: string } | undefined) || 'Unknown material',
            volume: vol,
            volumeUnit,
            concentration: details.concentration?.value,
            concentrationUnit: details.concentration?.unit,
            addedByEventId: event.eventId,
          })
        }
        break
      }
      case 'transfer': {
        const details = event.details as TransferDetails
        // If this well is destination, add volume
        if (details.dest_wells?.includes(wellId) && details.volume) {
          const vol = details.volume.unit === 'mL'
            ? details.volume.value * 1000
            : details.volume.value
          totalVolume += vol
          contents.push({
            materialRef: 'Transfer from ' + (details.source_wells?.join(', ') || 'source'),
            volume: vol,
            volumeUnit,
            addedByEventId: event.eventId,
          })
        }
        // If this well is source, subtract volume
        if (details.source_wells?.includes(wellId) && details.volume) {
          const vol = details.volume.unit === 'mL'
            ? details.volume.value * 1000
            : details.volume.value
          totalVolume = Math.max(0, totalVolume - vol)
        }
        break
      }
      case 'wash': {
        const details = event.details as WashDetails
        // Wash typically removes existing contents
        // This is a simplification - real wash may leave some material
        contents.length = 0
        totalVolume = 0
        if (details.volume) {
          const vol = details.volume.unit === 'mL'
            ? details.volume.value * 1000
            : details.volume.value
          totalVolume = vol
          contents.push({
            materialRef: details.buffer_ref || 'Wash buffer',
            volume: vol,
            volumeUnit,
            addedByEventId: event.eventId,
          })
        }
        break
      }
      case 'harvest': {
        // Harvest removes contents
        contents.length = 0
        totalVolume = 0
        break
      }
      // Other event types don't change well contents
    }
  })

  return {
    wellId,
    contents,
    totalVolume,
    volumeUnit,
    eventHistory: history,
  }
}

interface WellContextPanelProps {
  selectedWells: WellId[]
  events: PlateEvent[]
  onEventClick?: (eventId: string) => void
}

/**
 * WellContextPanel component
 */
export function WellContextPanel({
  selectedWells,
  events,
  onEventClick,
}: WellContextPanelProps) {
  // Derive context for selected wells
  const wellContexts = useMemo(() => {
    return selectedWells.map((wellId) => deriveWellContext(wellId, events))
  }, [selectedWells, events])

  if (selectedWells.length === 0) {
    return (
      <div className="well-context-panel well-context-panel--empty">
        <p>Select wells to view their context.</p>
        <p className="hint">Click on wells in the plate to see their contents and history.</p>
      </div>
    )
  }

  return (
    <div className="well-context-panel">
      <div className="well-context-panel__header">
        <h3>Well Context</h3>
        <span className="well-count">{selectedWells.length} well{selectedWells.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="well-context-panel__content">
        {wellContexts.map((context) => (
          <WellContextCard
            key={context.wellId}
            context={context}
            onEventClick={onEventClick}
            showWellId={selectedWells.length > 1}
          />
        ))}
      </div>

      <style>{`
        .well-context-panel {
          background: white;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .well-context-panel--empty {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 2rem;
          color: #868e96;
        }
        .well-context-panel--empty p {
          margin: 0.5rem 0;
        }
        .well-context-panel--empty .hint {
          font-size: 0.875rem;
          font-style: italic;
        }
        .well-context-panel__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e9ecef;
        }
        .well-context-panel__header h3 {
          margin: 0;
          font-size: 1rem;
        }
        .well-count {
          background: #e9ecef;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          color: #495057;
        }
        .well-context-panel__content {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
        }
      `}</style>
    </div>
  )
}

/**
 * Single well context card
 */
function WellContextCard({
  context,
  onEventClick,
  showWellId = true,
}: {
  context: WellContext
  onEventClick?: (eventId: string) => void
  showWellId?: boolean
}) {
  return (
    <div className="well-context-card">
      {showWellId && (
        <div className="well-context-card__well-id">{context.wellId}</div>
      )}

      <div className="well-context-card__section">
        <h4>Scientific State</h4>
        {context.contents.length === 0 ? (
          <p className="empty">Empty</p>
        ) : (
          <ul className="contents-list">
            {context.contents.map((content, idx) => (
              <li key={idx}>
                <span className="material">{content.materialRef}</span>
                <span className="meta">
                  {formatComputedConcentration(
                    content.concentration && content.concentrationUnit
                      ? { value: content.concentration, unit: content.concentrationUnit }
                      : undefined,
                  ) || 'no concentration'}
                  {' · '}
                  {content.volume.toFixed(1)} {content.volumeUnit}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="total-volume">
          <strong>{formatScientificStateSummary(context.contents.length, `${context.totalVolume.toFixed(1)} ${context.volumeUnit}`)}</strong>
        </div>
      </div>

      <div className="well-context-card__section">
        <h4>Event History ({context.eventHistory.length})</h4>
        {context.eventHistory.length === 0 ? (
          <p className="empty">No events</p>
        ) : (
          <ul className="history-list">
            {context.eventHistory.map((event, idx) => (
              <li
                key={event.eventId}
                onClick={() => onEventClick?.(event.eventId)}
                className="history-item"
              >
                <span className="index">{idx + 1}</span>
                <span className="icon">{EVENT_TYPE_ICONS[event.event_type]}</span>
                <span className="label">{EVENT_TYPE_LABELS[event.event_type]}</span>
                {event.t_offset && <span className="time">{event.t_offset}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .well-context-card {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .well-context-card__well-id {
          font-size: 1.25rem;
          font-weight: 700;
          color: #228be6;
          margin-bottom: 0.5rem;
        }
        .well-context-card__section {
          margin-bottom: 0.75rem;
        }
        .well-context-card__section:last-child {
          margin-bottom: 0;
        }
        .well-context-card__section h4 {
          margin: 0 0 0.5rem;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #868e96;
          letter-spacing: 0.5px;
        }
        .contents-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .contents-list li {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          padding: 0.375rem 0;
          border-bottom: 1px solid #e9ecef;
          font-size: 0.875rem;
        }
        .contents-list li:last-child {
          border-bottom: none;
        }
        .contents-list .material {
          flex: 1;
          font-weight: 500;
        }
        .contents-list .meta {
          color: #868e96;
          font-size: 0.75rem;
        }
        .total-volume {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #dee2e6;
          font-size: 0.875rem;
          color: #495057;
        }
        .history-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .history-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .history-item:hover {
          background: #e9ecef;
        }
        .history-item .index {
          width: 1.25rem;
          height: 1.25rem;
          background: #dee2e6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          color: #495057;
        }
        .history-item .icon {
          font-size: 0.875rem;
        }
        .history-item .label {
          flex: 1;
        }
        .history-item .time {
          font-family: monospace;
          font-size: 0.75rem;
          color: #868e96;
        }
        .empty {
          color: #adb5bd;
          font-style: italic;
          margin: 0;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  )
}
