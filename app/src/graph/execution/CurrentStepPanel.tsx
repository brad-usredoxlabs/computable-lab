/**
 * CurrentStepPanel - Displays the current step details in execution mode.
 */

import type { PlateEvent } from '../../types/events'

export interface CurrentStepPanelProps {
  event: PlateEvent | undefined
  executionState?: {
    state: string
    startedAt?: string
    completedAt?: string
    deviationNote?: string
    deviationDetails?: Record<string, unknown>
  }
  onComplete: (eventId: string) => Promise<void>
  onSkip: (eventId: string) => Promise<void>
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
      <div className="current-step-panel__empty">
        <p>No steps remaining in this run.</p>
      </div>
    )
  }

  const stateLabel = executionState?.state ?? 'pending'

  return (
    <div className="current-step-panel" data-testid="current-step-panel">
      <div className="current-step-panel__header">
        <h3 className="current-step-panel__title">
          {event.eventId || 'Untitled Step'}
        </h3>
        <span className={`current-step-panel__state state-${stateLabel}`}>
          {stateLabel}
        </span>
      </div>

      <div className="current-step-panel__body">
        <p className="current-step-panel__description">
          {event.notes || 'No description available.'}
        </p>

        {executionState?.startedAt && (
          <p className="current-step-panel__meta">
            Started: {new Date(executionState.startedAt).toLocaleString()}
          </p>
        )}

        {executionState?.completedAt && (
          <p className="current-step-panel__meta">
            Completed: {new Date(executionState.completedAt).toLocaleString()}
          </p>
        )}

        {executionState?.deviationNote && (
          <div className="current-step-panel__deviation">
            <strong>Deviation:</strong> {executionState.deviationNote}
          </div>
        )}
      </div>

      <div className="current-step-panel__actions">
        {executionState?.state === 'pending' && (
          <>
            <button
              type="button"
              className="current-step-panel__button current-step-panel__button--primary"
              onClick={() => onComplete(event.eventId)}
            >
              Complete
            </button>
            <button
              type="button"
              className="current-step-panel__button"
              onClick={() => onSkip(event.eventId)}
            >
              Skip
            </button>
            <button
              type="button"
              className="current-step-panel__button current-step-panel__button--warning"
              onClick={onReportDeviation}
            >
              Report Deviation
            </button>
          </>
        )}

        {executionState?.state === 'completed' && (
          <p className="current-step-panel__status">Step completed.</p>
        )}

        {executionState?.state === 'skipped' && (
          <p className="current-step-panel__status">Step skipped.</p>
        )}

        {executionState?.state === 'deviated' && (
          <p className="current-step-panel__status">Deviation reported.</p>
        )}
      </div>
    </div>
  )
}
