/**
 * EventPillBar - Compact horizontal timeline scrubber with rewind/replay.
 * Replaces vertical event cards with a space-efficient slider.
 */

import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import type { PlateEvent, EventType } from '../../../types/events'
import { EVENT_TYPE_LABELS, EVENT_TYPE_ICONS, EVENT_TYPE_COLORS } from '../../../types/events'
import { getEventSummary } from '../../../types/events'

interface EventPillBarProps {
  events: PlateEvent[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
  onAddEvent?: (type: EventType) => void  // Optional, not used when form has type selector
  onDeleteEvent?: (eventId: string) => void
  /** Called with the "playback position" - number of events to apply (0 = none, events.length = all) */
  onPlaybackPositionChange?: (position: number) => void
  /** Event ids staged by AI preview rather than committed to the graph */
  draftEventIds?: Set<string>
}

/**
 * Add event dropdown button
 */
function AddEventButton({
  onAddEvent,
}: {
  onAddEvent: (type: EventType) => void
}) {
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
      <button className="add-event-btn" title="Add new event">
        <span>+</span>
      </button>
      <div className="add-event-menu">
        {eventTypes.map((type) => (
          <button
            key={type}
            className="add-event-menu__item"
            onClick={() => onAddEvent(type)}
          >
            <span className="add-event-menu__icon">{EVENT_TYPE_ICONS[type]}</span>
            <span className="add-event-menu__label">{EVENT_TYPE_LABELS[type]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function EventPillBar({
  events,
  selectedEventId,
  onSelectEvent,
  onAddEvent,
  onDeleteEvent,
  onPlaybackPositionChange,
  draftEventIds,
}: EventPillBarProps) {
  const timelineEvents = useMemo(() => {
    const seen = new Set<string>()
    return events.filter((event) => {
      if (seen.has(event.eventId)) return false
      seen.add(event.eventId)
      return true
    })
  }, [events])

  // Playback position: 0 = no events applied, N = first N events applied
  const [playbackPosition, setPlaybackPosition] = useState(timelineEvents.length)
  const [isPlaying, setIsPlaying] = useState(false)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Sync playback position with event count
  useEffect(() => {
    setPlaybackPosition(timelineEvents.length)
  }, [timelineEvents.length])

  useEffect(() => {
    if (selectedEventId == null) return
    const selectedIndex = timelineEvents.findIndex((event) => event.eventId === selectedEventId)
    if (selectedIndex >= 0) {
      setPlaybackPosition(selectedIndex + 1)
    }
  }, [timelineEvents, selectedEventId])
  
  // Notify parent of position changes
  useEffect(() => {
    onPlaybackPositionChange?.(playbackPosition)
  }, [playbackPosition, onPlaybackPositionChange])
  
  // Auto-play animation
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setPlaybackPosition((pos) => {
          if (pos >= timelineEvents.length) {
            setIsPlaying(false)
            return timelineEvents.length
          }
          return pos + 1
        })
      }, 500) // 500ms per event
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [isPlaying, timelineEvents.length])

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = parseInt(e.target.value)
    setPlaybackPosition(newPos)
    setIsPlaying(false)
    
    // Select the event at this position (or null if at 0)
    if (newPos > 0 && newPos <= timelineEvents.length) {
      onSelectEvent(timelineEvents[newPos - 1].eventId)
    } else {
      onSelectEvent(null)
    }
  }, [timelineEvents, onSelectEvent])

  const handleStepBack = useCallback(() => {
    setIsPlaying(false)
    setPlaybackPosition((pos) => {
      const newPos = Math.max(0, pos - 1)
      if (newPos > 0) {
        onSelectEvent(timelineEvents[newPos - 1].eventId)
      } else {
        onSelectEvent(null)
      }
      return newPos
    })
  }, [timelineEvents, onSelectEvent])

  const handleStepForward = useCallback(() => {
    setIsPlaying(false)
    setPlaybackPosition((pos) => {
      const newPos = Math.min(timelineEvents.length, pos + 1)
      if (newPos > 0) {
        onSelectEvent(timelineEvents[newPos - 1].eventId)
      }
      return newPos
    })
  }, [timelineEvents, onSelectEvent])

  const handleRewind = useCallback(() => {
    setIsPlaying(false)
    setPlaybackPosition(0)
    onSelectEvent(null)
  }, [onSelectEvent])

  const handlePlayPause = useCallback(() => {
    if (playbackPosition >= timelineEvents.length) {
      // At end, restart from beginning
      setPlaybackPosition(0)
      setIsPlaying(true)
    } else {
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying, playbackPosition, timelineEvents.length])

  const handleFastForward = useCallback(() => {
    setIsPlaying(false)
    setPlaybackPosition(timelineEvents.length)
    if (timelineEvents.length > 0) {
      onSelectEvent(timelineEvents[timelineEvents.length - 1].eventId)
    }
  }, [timelineEvents, onSelectEvent])

  // Get current event info
  const currentEvent = playbackPosition > 0 ? timelineEvents[playbackPosition - 1] : null
  const currentEventLabel = currentEvent 
    ? `${EVENT_TYPE_ICONS[currentEvent.event_type]} ${EVENT_TYPE_LABELS[currentEvent.event_type]}`
    : 'Start'
  const focusedEvent = useMemo(
    () => timelineEvents.find((event) => event.eventId === selectedEventId) || null,
    [timelineEvents, selectedEventId]
  )
  const focusedEventSummary = focusedEvent ? getEventSummary(focusedEvent) : null
  const focusedEventIndex = focusedEvent
    ? timelineEvents.findIndex((event) => event.eventId === focusedEvent.eventId)
    : -1

  // Handle click on tick mark
  const handleTickClick = useCallback((index: number) => {
    setIsPlaying(false)
    setPlaybackPosition(index + 1)
    onSelectEvent(timelineEvents[index].eventId)
  }, [timelineEvents, onSelectEvent])

  return (
    <div className="event-timeline-scrubber">
      {/* Transport controls */}
      <div className="scrubber-controls">
        <button 
          className="scrubber-btn" 
          onClick={handleRewind} 
          title="Rewind to start"
          disabled={timelineEvents.length === 0}
        >
          ⏮
        </button>
        <button 
          className="scrubber-btn" 
          onClick={handleStepBack} 
          title="Step back"
          disabled={playbackPosition === 0}
        >
          ⏪
        </button>
        <button 
          className="scrubber-btn scrubber-btn--play" 
          onClick={handlePlayPause} 
          title={isPlaying ? 'Pause' : 'Play'}
          disabled={timelineEvents.length === 0}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button 
          className="scrubber-btn" 
          onClick={handleStepForward} 
          title="Step forward"
          disabled={playbackPosition >= timelineEvents.length}
        >
          ⏩
        </button>
        <button 
          className="scrubber-btn" 
          onClick={handleFastForward} 
          title="Jump to end"
          disabled={timelineEvents.length === 0}
        >
          ⏭
        </button>
      </div>

      {/* Timeline slider */}
      <div className="scrubber-timeline">
        {timelineEvents.length > 0 ? (
          <>
            <input
              type="range"
              min="0"
              max={timelineEvents.length}
              value={playbackPosition}
              onChange={handleSliderChange}
              className="scrubber-slider"
            />
            <div className="scrubber-ticks">
              {timelineEvents.map((event, index) => {
                const isDraft = draftEventIds?.has(event.eventId) ?? false
                return (
                  <div
                    key={event.eventId}
                    className={`scrubber-tick ${index < playbackPosition ? 'scrubber-tick--active' : ''} ${
                      selectedEventId === event.eventId ? 'scrubber-tick--selected' : ''
                    } ${isDraft ? 'scrubber-tick--draft' : ''}`}
                    style={{ 
                      left: `${((index + 1) / (timelineEvents.length + 1)) * 100}%`,
                      backgroundColor: index < playbackPosition ? EVENT_TYPE_COLORS[event.event_type] : undefined
                    }}
                    onClick={() => handleTickClick(index)}
                    title={`${index + 1}. ${isDraft ? 'Draft - ' : ''}${EVENT_TYPE_LABELS[event.event_type]}`}
                  />
                )
              })}
            </div>
          </>
        ) : (
          <span className="scrubber-empty">No events yet</span>
        )}
      </div>

      {/* Current position info */}
      <div className="scrubber-info">
        <span className="scrubber-position">
          {playbackPosition}/{timelineEvents.length}
        </span>
        <span className="scrubber-current" title={currentEvent?.notes || ''}>
          {currentEventLabel}
        </span>
        {focusedEvent && (
          <span className="scrubber-focus" title={focusedEventSummary || undefined}>
            Focused: {focusedEventIndex + 1}. {focusedEventSummary || EVENT_TYPE_LABELS[focusedEvent.event_type]}
          </span>
        )}
        {currentEvent && onDeleteEvent && selectedEventId === currentEvent.eventId && (
          <button
            className="scrubber-delete"
            onClick={() => onDeleteEvent(currentEvent.eventId)}
            title="Delete this event"
          >
            🗑
          </button>
        )}
      </div>

      {/* Add button - only show if onAddEvent is provided */}
      {onAddEvent && <AddEventButton onAddEvent={onAddEvent} />}

      <style>{`
        .event-timeline-scrubber {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: #f1f3f5;
          border-radius: 6px;
          min-height: 44px;
        }

        .scrubber-controls {
          display: flex;
          gap: 0.25rem;
          flex-shrink: 0;
        }

        .scrubber-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          background: white;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .scrubber-btn:hover:not(:disabled) {
          background: #e9ecef;
          border-color: #adb5bd;
        }

        .scrubber-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .scrubber-btn--play {
          background: #339af0;
          border-color: #228be6;
          color: white;
        }

        .scrubber-btn--play:hover:not(:disabled) {
          background: #228be6;
        }

        .scrubber-timeline {
          flex: 1;
          position: relative;
          height: 28px;
          display: flex;
          align-items: center;
          min-width: 120px;
        }

        .scrubber-slider {
          width: 100%;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          background: #dee2e6;
          border-radius: 2px;
          cursor: pointer;
        }

        .scrubber-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #339af0;
          border: 2px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .scrubber-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #339af0;
          border: 2px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .scrubber-ticks {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        .scrubber-tick {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          background: #adb5bd;
          border-radius: 50%;
          cursor: pointer;
          pointer-events: auto;
          transition: all 0.15s ease;
        }

        .scrubber-tick:hover {
          transform: translate(-50%, -50%) scale(1.3);
        }

        .scrubber-tick--active {
          box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.3);
        }

        .scrubber-tick--selected {
          box-shadow: 0 0 0 3px rgba(51, 154, 240, 0.5);
          transform: translate(-50%, -50%) scale(1.2);
        }

        .scrubber-tick--draft {
          width: 10px;
          height: 10px;
          border: 2px dashed #9c36b5;
          background: #f3d9fa;
          box-shadow: 0 0 0 3px rgba(190, 75, 219, 0.16);
        }

        .scrubber-tick--draft.scrubber-tick--active {
          box-shadow: 0 0 0 3px rgba(190, 75, 219, 0.28);
        }

        .scrubber-empty {
          font-size: 0.8rem;
          color: #868e96;
          font-style: italic;
          flex: 1;
          text-align: center;
        }

        .scrubber-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
          min-width: 100px;
        }

        .scrubber-position {
          font-size: 0.75rem;
          font-family: monospace;
          color: #495057;
          background: white;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          border: 1px solid #dee2e6;
        }

        .scrubber-current {
          font-size: 0.8rem;
          color: #495057;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }

        .scrubber-focus {
          font-size: 0.75rem;
          color: #364fc7;
          background: rgba(54, 79, 199, 0.1);
          border: 1px solid rgba(54, 79, 199, 0.18);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          max-width: 320px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scrubber-delete {
          padding: 0.125rem 0.25rem;
          border: none;
          background: none;
          font-size: 0.85rem;
          cursor: pointer;
          opacity: 0.6;
        }

        .scrubber-delete:hover {
          opacity: 1;
        }

        /* Add event dropdown */
        .add-event-dropdown {
          position: relative;
          flex-shrink: 0;
        }

        .add-event-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 2px dashed #adb5bd;
          border-radius: 50%;
          background: white;
          font-size: 1rem;
          color: #868e96;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .add-event-btn:hover {
          border-color: #339af0;
          color: #339af0;
          background: #e7f5ff;
        }

        .add-event-menu {
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.25rem;
          padding: 0.25rem;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 100;
          min-width: 150px;
        }

        .add-event-dropdown:hover .add-event-menu,
        .add-event-dropdown:focus-within .add-event-menu {
          display: block;
        }

        .add-event-menu__item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: none;
          border-radius: 4px;
          background: none;
          font-size: 0.85rem;
          text-align: left;
          cursor: pointer;
        }

        .add-event-menu__item:hover {
          background: #e7f5ff;
        }

        .add-event-menu__icon {
          font-size: 1rem;
        }
      `}</style>
    </div>
  )
}
