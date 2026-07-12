/**
 * DraftPreviewPanel — displays ghost events as a step-by-step list with
 * dashed borders and "Proposed" badges.
 */

import type { PlateEvent } from '../types/events'
import { EVENT_TYPE_LABELS } from '../types/events'

interface DraftPreviewPanelProps {
  events: PlateEvent[]
  labwares?: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string }>
  iteration?: number
  onPromote: () => void
  onExport: () => void
  isPromoting: boolean
}

function eventVerbLabel(event: PlateEvent): string {
  return EVENT_TYPE_LABELS[event.event_type] ?? event.event_type
}

function eventTargetWells(event: PlateEvent): string | null {
  const details = event.details as Record<string, unknown> | undefined
  if (!details) return null
  const wells = details.wells as string[] | undefined
  if (Array.isArray(wells) && wells.length > 0) return wells.join(', ')
  return null
}

export function DraftPreviewPanel({
  events,
  labwares,
  iteration = 0,
  onPromote,
  onExport,
  isPromoting,
}: DraftPreviewPanelProps) {
  return (
    <div className="protocol-builder-draft-preview" data-testid="draft-preview-panel">
      {/* Header */}
      <div className="protocol-builder-draft-preview__header">
        <div className="protocol-builder-draft-preview__header-row">
          <span className="protocol-builder-draft-preview__event-count">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
          {iteration > 0 && (
            <span className="protocol-builder-draft-preview__iteration" data-testid="draft-iteration-badge">
              Redraft #{iteration}
            </span>
          )}
        </div>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div className="protocol-builder-draft-preview__empty">
          <p>No events in this draft yet.</p>
        </div>
      ) : (
        <div className="protocol-builder-draft-preview__events">
          {events.map((event, index) => {
            const wells = eventTargetWells(event)
            return (
              <div
                key={event.eventId ?? index}
                className="protocol-builder-draft-event"
                data-testid={`draft-event-${index}`}
              >
                <div className="protocol-builder-draft-event__header">
                  <span className="protocol-builder-draft-event__index">{index + 1}</span>
                  <span className="protocol-builder-draft-event__verb">
                    {eventVerbLabel(event)}
                  </span>
                  <span className="protocol-builder-draft-event__badge">Proposed</span>
                </div>
                {wells && (
                  <div className="protocol-builder-draft-event__wells">
                    Wells: {wells}
                  </div>
                )}
                {event.notes && (
                  <div className="protocol-builder-draft-event__notes">{event.notes}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Labware placements */}
      {labwares && labwares.length > 0 && (
        <div className="protocol-builder-draft-preview__labwares">
          <h4 className="protocol-builder-draft-preview__labwares-title">Labware Placements</h4>
          {labwares.map((lw) => (
            <div key={lw.labwareId} className="protocol-builder-draft-labware">
              <span className="protocol-builder-draft-labware__name">{lw.name}</span>
              <span className="protocol-builder-draft-labware__type">{lw.labwareType}</span>
              {lw.deckSlot && (
                <span className="protocol-builder-draft-labware__slot">Slot {lw.deckSlot}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="protocol-builder-action-bar">
        <button
          type="button"
          className="protocol-builder-action-bar__btn protocol-builder-action-bar__btn--promote"
          onClick={onPromote}
          disabled={isPromoting || events.length === 0}
          data-testid="draft-promote-btn"
        >
          {isPromoting ? 'Promoting…' : 'Promote'}
        </button>
        <button
          type="button"
          className="protocol-builder-action-bar__btn protocol-builder-action-bar__btn--export"
          onClick={onExport}
          disabled={events.length === 0}
          data-testid="draft-export-btn"
        >
          Export JSON
        </button>
      </div>
    </div>
  )
}
