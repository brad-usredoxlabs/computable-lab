/**
 * ExecutionTabShell - Wrapper component that integrates ExecutionView
 * into the workspace tab system.
 *
 * This component receives execution context from the workspace (eventGraphId, runId)
 * and renders the ExecutionView with proper state management via useExecutionState.
 */

import { useEventEditor } from '../EventEditorContext'
import { useExecutionState } from './useExecutionState'
import { ExecutionNav } from '../../graph/execution/ExecutionNav'
import { CurrentStepPanel } from '../../graph/execution/CurrentStepPanel'
import { StepProgress } from '../../graph/execution/StepProgress'
import { DeviationPanel } from '../../graph/execution/DeviationPanel'

export interface ExecutionTabShellProps {
  /** The execution tab configuration. */
  tab: {
    id: string
    kind: 'execution'
    eventGraphId: string
    runId: string
    title: string
  }
}

export function ExecutionTabShell({ tab }: ExecutionTabShellProps) {
  const { state } = useEventEditor()
  const events = state.events

  const {
    executionStates,
    sortedEvents,
    currentEventIndex,
    currentEvent,
    loading,
    error,
    completeStep,
    skipStep,
    reportDeviation,
    submitDeviation,
    jumpToEvent,
    previous,
    next,
    showDeviationPanel,
    deviationForEvent,
  } = useExecutionState(tab.runId, events)

  const currentEventId = currentEvent?.eventId

  const handleDeviationSubmitted = async (deviationId: string) => {
    await submitDeviation(deviationId)
  }

  const handleJumpToEvent = (eventId: string) => {
    jumpToEvent(eventId)
  }

  const handlePrevious = () => {
    previous()
  }

  const handleNext = () => {
    next()
  }

  if (loading) {
    return (
      <div className="execution-tab-shell">
        <div className="execution-tab-shell__loading">
          <h2>Loading execution…</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="execution-tab-shell">
        <div className="execution-tab-shell__error">
          <h2>Error loading execution</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="execution-tab-shell">
      <div className="execution-tab-shell__header">
        <h2 className="execution-tab-shell__title">Execution Mode</h2>
        <div className="execution-tab-shell__progress">
          Step {currentEventIndex + 1} of {sortedEvents.length}
        </div>
      </div>

      <div className="execution-tab-shell__layout">
        {/* Left: Current Step Panel */}
        <div className="execution-tab-shell__main">
          <CurrentStepPanel
            event={currentEvent}
            executionState={currentEventId ? executionStates[currentEventId] : undefined}
            onComplete={completeStep}
            onSkip={skipStep}
            onReportDeviation={reportDeviation}
          />
        </div>

        {/* Right: Navigation and Progress */}
        <div className="execution-tab-shell__sidebar">
          <ExecutionNav
            currentIndex={currentEventIndex}
            totalEvents={sortedEvents.length}
            onPrevious={handlePrevious}
            onNext={handleNext}
            canGoPrevious={currentEventIndex > 0}
            canGoNext={currentEventIndex < sortedEvents.length - 1}
          />

          <StepProgress
            events={sortedEvents}
            executionStates={executionStates}
            currentEventId={currentEventId}
            onJumpToEvent={handleJumpToEvent}
          />
        </div>
      </div>

      {/* Deviation Panel Modal */}
      {showDeviationPanel && deviationForEvent && (
        <DeviationPanel
          eventId={deviationForEvent}
          event={currentEvent}
          onSubmit={handleDeviationSubmitted}
          onCancel={() => {
            // Deviation panel closed without submitting
          }}
        />
      )}

      <style>{`
        .execution-tab-shell {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fafbfc;
          border-radius: 12px;
          overflow: hidden;
        }

        .execution-tab-shell__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
        }

        .execution-tab-shell__title {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }

        .execution-tab-shell__progress {
          font-size: 0.875rem;
          font-weight: 500;
          opacity: 0.9;
        }

        .execution-tab-shell__layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .execution-tab-shell__main {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
          border-right: 1px solid #e5e7eb;
        }

        .execution-tab-shell__sidebar {
          width: 320px;
          display: flex;
          flex-direction: column;
          background: white;
          border-left: 1px solid #e5e7eb;
        }

        .execution-tab-shell__loading,
        .execution-tab-shell__error {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 2rem;
          text-align: center;
        }

        .execution-tab-shell__error p {
          color: #dc2626;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  )
}
