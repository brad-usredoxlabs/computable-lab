/**
 * StepProgress - Visual timeline of all steps with state indicators.
 * Color-coded by state (pending, current, running, completed, skipped, deviated).
 * Click to jump to any step.
 */

import { EVENT_TYPE_ICONS, type PlateEvent } from '../../types/events'

export interface StepProgressProps {
  events: PlateEvent[]
  executionStates: Record<string, { state: string }>
  currentEventId?: string
  onJumpToEvent: (eventId: string) => void
}

export function StepProgress({
  events,
  executionStates,
  currentEventId,
  onJumpToEvent,
}: StepProgressProps) {
  const getStateColor = (state?: string) => {
    switch (state) {
      case 'completed':
        return '#22c55e'
      case 'running':
      case 'current':
        return '#f59e0b'
      case 'deviated':
        return '#ef4444'
      case 'skipped':
        return '#9ca3af'
      default:
        return '#e5e7eb'
    }
  }

  const getStateIcon = (state?: string) => {
    switch (state) {
      case 'completed':
        return '✓'
      case 'running':
      case 'current':
        return '●'
      case 'deviated':
        return '⚠'
      case 'skipped':
        return '↷'
      default:
        return '○'
    }
  }

  return (
    <div className="step-progress">
      <div className="step-progress__header">
        <h4>Step Progress</h4>
        <span className="step-progress__count">{events.length} steps</span>
      </div>

      <div className="step-progress__timeline">
        {events.map((event, index) => {
          const state = executionStates[event.eventId]?.state
          const isCurrent = event.eventId === currentEventId
          const icon = EVENT_TYPE_ICONS[event.event_type] || '📝'

          return (
            <div
              key={event.eventId}
              className={`step-progress__item ${isCurrent ? 'step-progress__item--current' : ''}`}
              onClick={() => onJumpToEvent(event.eventId)}
              style={{ cursor: 'pointer' }}
            >
              <div className="step-progress__connector" style={{ backgroundColor: getStateColor(state) }} />
              
              <div className="step-progress__content">
                <div className="step-progress__step-number">
                  {index + 1}
                </div>
                
                <div className="step-progress__icon">
                  {icon}
                </div>

                <div className="step-progress__info">
                  <div className="step-progress__title">
                    {event.notes || `Step ${index + 1}`}
                  </div>
                  <div className="step-progress__type">
                    {event.event_type.replace(/_/g, ' ')}
                  </div>
                </div>

                <div className="step-progress__status" style={{ color: getStateColor(state) }}>
                  {getStateIcon(state)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .step-progress {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .step-progress__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .step-progress__header h4 {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
        }

        .step-progress__count {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .step-progress__timeline {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .step-progress__item {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 8px;
          background: #f9fafb;
          transition: all 0.15s ease;
        }

        .step-progress__item:hover {
          background: #f3f4f6;
          transform: translateX(4px);
        }

        .step-progress__item--current {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
        }

        .step-progress__connector {
          width: 3px;
          border-radius: 2px;
          min-height: 40px;
        }

        .step-progress__content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }

        .step-progress__step-number {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #e5e7eb;
          color: #6b7280;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .step-progress__item--current .step-progress__step-number {
          background: #2563eb;
          color: white;
        }

        .step-progress__icon {
          font-size: 1rem;
        }

        .step-progress__info {
          flex: 1;
          min-width: 0;
        }

        .step-progress__title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .step-progress__type {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: capitalize;
        }

        .step-progress__status {
          font-size: 1rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
