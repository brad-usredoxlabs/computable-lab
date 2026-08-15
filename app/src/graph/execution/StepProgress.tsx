/**
 * StepProgress - Shows progress through all steps in the execution.
 */

import type { PlateEvent } from '../../types/events'

export interface StepProgressProps {
  events: PlateEvent[]
  executionStates: Record<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }>
  currentEventId: string | undefined
  onJumpToEvent: (eventId: string) => void
}

export function StepProgress({
  events,
  executionStates,
  currentEventId,
  onJumpToEvent,
}: StepProgressProps) {
  return (
    <div className="step-progress" data-testid="step-progress">
      <h4 className="step-progress__title">Steps</h4>
      <ul className="step-progress__list">
        {events.map((event, index) => {
          const state = executionStates[event.eventId]?.state || 'pending'
          const isCurrent = event.eventId === currentEventId

          return (
            <li
              key={event.eventId || index}
              className={`step-progress__item step-progress__item--${state}${isCurrent ? ' step-progress__item--current' : ''}`}
              onClick={() => event.eventId && onJumpToEvent(event.eventId)}
              role="button"
              tabIndex={0}
              aria-label={`Jump to step ${index + 1}`}
            >
              <span className="step-progress__step-number">{index + 1}</span>
              <span className="step-progress__step-label">
                {event.notes?.substring(0, 40) || `Step ${index + 1}`}
                {event.notes && event.notes.length > 40 ? '...' : ''}
              </span>
              <span className={`step-progress__status status-${state}`}>{state}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
