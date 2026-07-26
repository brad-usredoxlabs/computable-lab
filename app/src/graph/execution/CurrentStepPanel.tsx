/**
 * CurrentStepPanel - Displays the current step in execution mode.
 * Shows step details, parameters, and action buttons (Complete, Skip, Report Deviation).
 */

import { EVENT_TYPE_LABELS, EVENT_TYPE_ICONS, type PlateEvent } from '../../types/events'

export interface CurrentStepPanelProps {
  event: PlateEvent | null | undefined
  executionState?: {
    state: string
    startedAt?: string
    completedAt?: string
    deviationNote?: string
    deviationDetails?: Record<string, unknown>
  }
  onComplete: () => void
  onSkip: () => void
  onReportDeviation: () => void
}

export function CurrentStepPanel({
  event,
  executionState,
  onComplete,
  onSkip,
  onReportDeviation,
}: CurrentStepPanelProps) {
  if (!event) {
    return (
      <div className="current-step-panel">
        <div className="current-step-panel__empty">
          <h3>No events to execute</h3>
          <p>This run has no events defined. Please add events to the protocol first.</p>
        </div>
      </div>
    )
  }

  const eventTypeLabel = EVENT_TYPE_LABELS[event.event_type] || event.event_type
  const eventIcon = EVENT_TYPE_ICONS[event.event_type] || '📝'

  const stateColor = executionState?.state === 'completed'
    ? '#22c55e'
    : executionState?.state === 'running'
      ? '#f59e0b'
      : executionState?.state === 'deviated'
        ? '#ef4444'
        : '#6b7280'

  const stateLabel = executionState?.state === 'completed'
    ? 'Completed'
    : executionState?.state === 'running'
      ? 'In Progress'
      : executionState?.state === 'deviated'
        ? 'Deviated'
        : executionState?.state === 'skipped'
          ? 'Skipped'
          : 'Pending'

  return (
    <div className="current-step-panel">
      <div className="current-step-panel__header">
        <div className="current-step-panel__icon">{eventIcon}</div>
        <div className="current-step-panel__meta">
          <span className="current-step-panel__type">{eventTypeLabel}</span>
          <span className="current-step-panel__state" style={{ color: stateColor }}>
            {stateLabel}
          </span>
        </div>
      </div>

      <div className="current-step-panel__content">
        <h3 className="current-step-panel__title">{event.notes || `Step ${event.eventId}`}</h3>
        
        <div className="current-step-panel__details">
          <EventDetailsDisplay event={event} />
        </div>

        {executionState?.deviationNote && (
          <div className="current-step-panel__deviation-note">
            <strong>Deviation:</strong> {executionState.deviationNote}
          </div>
        )}
      </div>

      <div className="current-step-panel__actions">
        {executionState?.state !== 'completed' && executionState?.state !== 'skipped' && (
          <>
            <button
              className="current-step-panel__action current-step-panel__action--primary"
              onClick={onComplete}
            >
              Complete Step
            </button>
            <button
              className="current-step-panel__action current-step-panel__action--secondary"
              onClick={onSkip}
            >
              Skip
            </button>
            <button
              className="current-step-panel__action current-step-panel__action--warning"
              onClick={onReportDeviation}
            >
              Report Deviation
            </button>
          </>
        )}

        {executionState?.state === 'completed' && (
          <div className="current-step-panel__status current-step-panel__status--success">
            ✓ Step completed
          </div>
        )}

        {executionState?.state === 'skipped' && (
          <div className="current-step-panel__status current-step-panel__status--skipped">
            ↷ Step skipped
          </div>
        )}

        {executionState?.state === 'deviated' && (
          <div className="current-step-panel__status current-step-panel__status--deviated">
            ⚠ Deviation reported
          </div>
        )}
      </div>

      <style>{`
        .current-step-panel {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .current-step-panel__empty {
          padding: 3rem;
          text-align: center;
          color: #6b7280;
        }

        .current-step-panel__empty h3 {
          margin: 0 0 0.5rem 0;
          color: #111827;
        }

        .current-step-panel__header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .current-step-panel__icon {
          font-size: 2rem;
        }

        .current-step-panel__meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .current-step-panel__type {
          font-weight: 600;
          color: #111827;
        }

        .current-step-panel__state {
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .current-step-panel__content {
          padding: 1.5rem;
        }

        .current-step-panel__title {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .current-step-panel__details {
          background: #f9fafb;
          border-radius: 8px;
          padding: 1rem;
          font-size: 0.875rem;
        }

        .current-step-panel__deviation-note {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #fef2f2;
          border-left: 3px solid #ef4444;
          border-radius: 4px;
          color: #991b1b;
        }

        .current-step-panel__actions {
          padding: 1.25rem;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .current-step-panel__action {
          padding: 0.625rem 1.25rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }

        .current-step-panel__action--primary {
          background: #2563eb;
          color: white;
        }

        .current-step-panel__action--primary:hover {
          background: #1d4ed8;
        }

        .current-step-panel__action--secondary {
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .current-step-panel__action--secondary:hover {
          background: #f3f4f6;
        }

        .current-step-panel__action--warning {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .current-step-panel__action--warning:hover {
          background: #fee2e2;
        }

        .current-step-panel__status {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .current-step-panel__status--success {
          background: #dcfce7;
          color: #166534;
        }

        .current-step-panel__status--skipped {
          background: #f3f4f6;
          color: #6b7280;
        }

        .current-step-panel__status--deviated {
          background: #fee2e2;
          color: #991b1b;
        }
      `}</style>
    </div>
  )
}

/**
 * Simple event details display - shows key details based on event type
 */
function EventDetailsDisplay({ event }: { event: PlateEvent }) {
  const details = event.details

  // Render different details based on event type
  if (event.event_type === 'transfer') {
    const d = details as any
    return (
      <div>
        <p><strong>Volume:</strong> {d.volume?.value} {d.volume?.unit || 'uL'}</p>
        {d.source_labwareId && <p><strong>From:</strong> {d.source_labwareId}</p>}
        {d.dest_labwareId && <p><strong>To:</strong> {d.dest_labwareId}</p>}
        {d.wells && d.wells.length > 0 && <p><strong>Wells:</strong> {d.wells.join(', ')}</p>}
      </div>
    )
  }

  if (event.event_type === 'add_material') {
    const d = details as any
    return (
      <div>
        {d.material_ref && <p><strong>Material:</strong> {d.material_ref}</p>}
        {d.volume && <p><strong>Volume:</strong> {d.volume.value} {d.volume.unit}</p>}
        {d.role && <p><strong>Role:</strong> {d.role}</p>}
      </div>
    )
  }

  if (event.event_type === 'mix') {
    const d = details as any
    return (
      <div>
        {d.mix_count && <p><strong>Mix count:</strong> {d.mix_count}</p>}
        {d.speed && <p><strong>Speed:</strong> {d.speed}</p>}
      </div>
    )
  }

  if (event.event_type === 'incubate') {
    const d = details as any
    return (
      <div>
        {d.duration && <p><strong>Duration:</strong> {d.duration}</p>}
        {d.temperature && <p><strong>Temperature:</strong> {d.temperature.value}°{d.temperature.unit || 'C'}</p>}
      </div>
    )
  }

  // Default: show all details as JSON
  return (
    <pre style={{ margin: 0, fontSize: '0.75rem', overflowX: 'auto' }}>
      {JSON.stringify(details, null, 2)}
    </pre>
  )
}
