/**
 * EventCard component - Displays a single event in the timeline.
 * Shows event type, summary, and affected wells. Handles selection.
 */

import { useCallback, type MouseEvent } from 'react'
import type { PlateEvent } from '../../types/events'
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ICONS,
  EVENT_TYPE_COLORS,
  getEventSummary,
  getAffectedWells,
} from '../../types/events'

interface EventCardProps {
  event: PlateEvent
  index: number
  isSelected: boolean
  onSelect: (eventId: string) => void
  onEdit: (eventId: string) => void
  onDelete: (eventId: string) => void
  onMoveUp?: (eventId: string) => void
  onMoveDown?: (eventId: string) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

/**
 * EventCard - Single event display in timeline
 */
export function EventCard({
  event,
  index,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: EventCardProps) {
  const handleClick = useCallback(() => {
    onSelect(event.eventId)
  }, [event.eventId, onSelect])

  const handleEdit = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onEdit(event.eventId)
    },
    [event.eventId, onEdit]
  )

  const handleDelete = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      if (window.confirm('Delete this event?')) {
        onDelete(event.eventId)
      }
    },
    [event.eventId, onDelete]
  )

  const handleMoveUp = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onMoveUp?.(event.eventId)
    },
    [event.eventId, onMoveUp]
  )

  const handleMoveDown = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onMoveDown?.(event.eventId)
    },
    [event.eventId, onMoveDown]
  )

  const affectedWells = getAffectedWells(event)
  const summary = getEventSummary(event)
  const color = EVENT_TYPE_COLORS[event.event_type]
  const icon = EVENT_TYPE_ICONS[event.event_type]
  const label = EVENT_TYPE_LABELS[event.event_type]

  return (
    <div
      className={`event-card ${isSelected ? 'event-card--selected' : ''}`}
      onClick={handleClick}
      style={{ borderLeftColor: color }}
      data-event-id={event.eventId}
    >
      <div className="event-card__header">
        <span className="event-card__index">{index + 1}</span>
        <span className="event-card__icon">{icon}</span>
        <span className="event-card__type">{label}</span>
        {event.t_offset && (
          <span className="event-card__time">{event.t_offset}</span>
        )}
      </div>

      <div className="event-card__body">
        <p className="event-card__summary">{summary}</p>
        {affectedWells.length > 0 && (
          <p className="event-card__wells">
            Wells: {affectedWells.length > 6
              ? `${affectedWells.slice(0, 6).join(', ')}... (${affectedWells.length} total)`
              : affectedWells.join(', ')
            }
          </p>
        )}
        {event.notes && (
          <p className="event-card__notes">{event.notes}</p>
        )}
      </div>

      <div className="event-card__actions">
        <button
          className="event-card__btn event-card__btn--move"
          onClick={handleMoveUp}
          disabled={!canMoveUp}
          title="Move up"
        >
          ↑
        </button>
        <button
          className="event-card__btn event-card__btn--move"
          onClick={handleMoveDown}
          disabled={!canMoveDown}
          title="Move down"
        >
          ↓
        </button>
        <button
          className="event-card__btn event-card__btn--edit"
          onClick={handleEdit}
          title="Edit event"
        >
          ✏️
        </button>
        <button
          className="event-card__btn event-card__btn--delete"
          onClick={handleDelete}
          title="Delete event"
        >
          🗑️
        </button>
      </div>

      <style>{`
        .event-card {
          background: white;
          border: 1px solid #e9ecef;
          border-left: 4px solid #339af0;
          border-radius: 4px;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .event-card:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .event-card--selected {
          background: #e7f5ff;
          border-color: #228be6;
          border-left-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.3);
        }
        .event-card__header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .event-card__index {
          background: #f1f3f5;
          color: #495057;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.125rem 0.375rem;
          border-radius: 9999px;
          min-width: 1.5rem;
          text-align: center;
        }
        .event-card__icon {
          font-size: 1rem;
        }
        .event-card__type {
          font-weight: 600;
          color: #212529;
          flex: 1;
        }
        .event-card__time {
          font-size: 0.75rem;
          color: #868e96;
          font-family: monospace;
        }
        .event-card__body {
          margin-left: 1rem;
        }
        .event-card__summary {
          margin: 0 0 0.25rem;
          color: #495057;
          font-size: 0.875rem;
        }
        .event-card__wells {
          margin: 0 0 0.25rem;
          color: #868e96;
          font-size: 0.75rem;
          font-family: monospace;
        }
        .event-card__notes {
          margin: 0;
          color: #868e96;
          font-size: 0.75rem;
          font-style: italic;
        }
        .event-card__actions {
          display: flex;
          gap: 0.25rem;
          margin-top: 0.5rem;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .event-card:hover .event-card__actions,
        .event-card--selected .event-card__actions {
          opacity: 1;
        }
        .event-card__btn {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .event-card__btn:hover:not(:disabled) {
          background: #e9ecef;
        }
        .event-card__btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .event-card__btn--delete:hover:not(:disabled) {
          background: #ffe3e3;
          border-color: #ffa8a8;
        }
      `}</style>
    </div>
  )
}
