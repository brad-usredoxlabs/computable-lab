/**
 * EventTimeline component - Displays chronological list of events.
 * Manages event selection, ordering, and provides add/delete actions.
 */

import { useState, useCallback } from 'react'
import type { PlateEvent, EventType } from '../../types/events'
import { EVENT_TYPE_LABELS, EVENT_TYPE_ICONS, createEmptyEvent } from '../../types/events'
import { EventCard } from './EventCard'

interface EventTimelineProps {
  events: PlateEvent[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
  onAddEvent: (event: PlateEvent) => void
  onUpdateEvent: (event: PlateEvent) => void
  onDeleteEvent: (eventId: string) => void
  onReorderEvents: (events: PlateEvent[]) => void
  onEditEvent?: (eventId: string) => void
}

/**
 * Event type selector dropdown
 */
function AddEventDropdown({
  onAdd,
}: {
  onAdd: (eventType: EventType) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = useCallback(
    (eventType: EventType) => {
      onAdd(eventType)
      setIsOpen(false)
    },
    [onAdd]
  )

  const eventTypes: EventType[] = [
    'add_material',
    'transfer',
    'mix',
    'wash',
    'incubate',
    'read',
    'harvest',
    'other',
  ]

  return (
    <div className="add-event-dropdown">
      <button
        className="btn btn-primary add-event-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        + Add Event
      </button>

      {isOpen && (
        <div className="add-event-menu">
          {eventTypes.map((type) => (
            <button
              key={type}
              className="add-event-option"
              onClick={() => handleSelect(type)}
            >
              <span className="add-event-option__icon">
                {EVENT_TYPE_ICONS[type]}
              </span>
              <span className="add-event-option__label">
                {EVENT_TYPE_LABELS[type]}
              </span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .add-event-dropdown {
          position: relative;
        }
        .add-event-btn {
          width: 100%;
        }
        .add-event-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10;
          margin-top: 0.25rem;
        }
        .add-event-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: 0.875rem;
        }
        .add-event-option:hover {
          background: #f1f3f5;
        }
        .add-event-option__icon {
          font-size: 1rem;
        }
        .add-event-option__label {
          flex: 1;
        }
      `}</style>
    </div>
  )
}

/**
 * EventTimeline - Main timeline component
 */
export function EventTimeline({
  events,
  selectedEventId,
  onSelectEvent,
  onAddEvent,
  onDeleteEvent,
  onReorderEvents,
  onEditEvent,
}: EventTimelineProps) {
  const handleSelect = useCallback(
    (eventId: string) => {
      onSelectEvent(eventId === selectedEventId ? null : eventId)
    },
    [selectedEventId, onSelectEvent]
  )

  const handleEdit = useCallback(
    (eventId: string) => {
      onEditEvent?.(eventId)
    },
    [onEditEvent]
  )

  const handleDelete = useCallback(
    (eventId: string) => {
      onDeleteEvent(eventId)
      if (selectedEventId === eventId) {
        onSelectEvent(null)
      }
    },
    [onDeleteEvent, selectedEventId, onSelectEvent]
  )

  const handleMoveUp = useCallback(
    (eventId: string) => {
      const index = events.findIndex((e) => e.eventId === eventId)
      if (index > 0) {
        const newEvents = [...events]
        const temp = newEvents[index]
        newEvents[index] = newEvents[index - 1]
        newEvents[index - 1] = temp
        onReorderEvents(newEvents)
      }
    },
    [events, onReorderEvents]
  )

  const handleMoveDown = useCallback(
    (eventId: string) => {
      const index = events.findIndex((e) => e.eventId === eventId)
      if (index < events.length - 1) {
        const newEvents = [...events]
        const temp = newEvents[index]
        newEvents[index] = newEvents[index + 1]
        newEvents[index + 1] = temp
        onReorderEvents(newEvents)
      }
    },
    [events, onReorderEvents]
  )

  const handleAddEvent = useCallback(
    (eventType: EventType) => {
      const newEvent = createEmptyEvent(eventType)
      onAddEvent(newEvent)
      onSelectEvent(newEvent.eventId)
      onEditEvent?.(newEvent.eventId)
    },
    [onAddEvent, onSelectEvent, onEditEvent]
  )

  return (
    <div className="event-timeline">
      <div className="event-timeline__header">
        <h3 className="event-timeline__title">Events</h3>
        <span className="event-timeline__count">{events.length}</span>
      </div>

      <div className="event-timeline__add">
        <AddEventDropdown onAdd={handleAddEvent} />
      </div>

      <div className="event-timeline__list">
        {events.length === 0 ? (
          <div className="event-timeline__empty">
            <p>No events yet.</p>
            <p className="hint">Add your first event to get started.</p>
          </div>
        ) : (
          events.map((event, index) => (
            <EventCard
              key={event.eventId}
              event={event}
              index={index}
              isSelected={event.eventId === selectedEventId}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              canMoveUp={index > 0}
              canMoveDown={index < events.length - 1}
            />
          ))
        )}
      </div>

      <style>{`
        .event-timeline {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
        }
        .event-timeline__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: white;
          border-bottom: 1px solid #e9ecef;
        }
        .event-timeline__title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .event-timeline__count {
          background: #e9ecef;
          color: #495057;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
        }
        .event-timeline__add {
          padding: 0.75rem 1rem;
          background: white;
          border-bottom: 1px solid #e9ecef;
        }
        .event-timeline__list {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
        }
        .event-timeline__empty {
          text-align: center;
          padding: 2rem 1rem;
          color: #868e96;
        }
        .event-timeline__empty p {
          margin: 0 0 0.5rem;
        }
        .event-timeline__empty .hint {
          font-size: 0.875rem;
          font-style: italic;
        }
      `}</style>
    </div>
  )
}
