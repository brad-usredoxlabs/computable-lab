/**
 * ExecutionView - Main container for execution mode in the event editor.
 * Provides GPS-style navigation with current step highlight, progress tracking,
 * and deviation capture capabilities.
 */

import { useState, useMemo } from 'react'
import type { PlateEvent } from '../../types/events'
import { ExecutionNav } from './ExecutionNav'
import { CurrentStepPanel } from './CurrentStepPanel'
import { StepProgress } from './StepProgress'
import { DeviationPanel } from './DeviationPanel'

export interface ExecutionViewProps {
  runId: string
  events: PlateEvent[]
  executionStates: Record<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }>
  onExecutionStateChange: (eventId: string, state: { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }) => Promise<void>
  onDeviationCaptured: (deviationId: string) => void
}

export function ExecutionView({
  runId,
  events,
  executionStates,
  onExecutionStateChange,
  onDeviationCaptured,
}: ExecutionViewProps) {
  const [currentEventIndex, setCurrentEventIndex] = useState(0)
  const [showDeviationPanel, setShowDeviationPanel] = useState(false)
  const [deviationForEvent, setDeviationForEvent] = useState<string | null>(null)

  const currentEvent = events[currentEventIndex]
  const currentEventId = currentEvent?.eventId

  // Sort events by timestamp or t_offset
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const timeA = a.at || a.t_offset || ''
      const timeB = b.at || b.t_offset || ''
      return timeA.localeCompare(timeB)
    })
  }, [events])

  const handleCompleteStep = async () => {
    if (!currentEventId) return
    await onExecutionStateChange(currentEventId, {
      state: 'completed',
      completedAt: new Date().toISOString(),
    })
    // Move to next event
    const nextIndex = currentEventIndex + 1
    if (nextIndex < sortedEvents.length) {
      setCurrentEventIndex(nextIndex)
    }
  }

  const handleSkipStep = async () => {
    if (!currentEventId) return
    await onExecutionStateChange(currentEventId, {
      state: 'skipped',
    })
    // Move to next event
    const nextIndex = currentEventIndex + 1
    if (nextIndex < sortedEvents.length) {
      setCurrentEventIndex(nextIndex)
    }
  }

  const handleReportDeviation = () => {
    setDeviationForEvent(currentEventId)
    setShowDeviationPanel(true)
  }

  const handleDeviationSubmitted = async (deviationId: string) => {
    setShowDeviationPanel(false)
    setDeviationForEvent(null)
    onDeviationCaptured(deviationId)
    // Mark event as deviated
    if (currentEventId) {
      await onExecutionStateChange(currentEventId, {
        state: 'deviated',
        deviationDetails: { deviationId },
      })
    }
  }

  const handleJumpToEvent = (eventId: string) => {
    const index = sortedEvents.findIndex(e => e.eventId === eventId)
    if (index >= 0) {
      setCurrentEventIndex(index)
    }
  }

  const handlePrevious = () => {
    const prevIndex = Math.max(0, currentEventIndex - 1)
    setCurrentEventIndex(prevIndex)
  }

  const handleNext = () => {
    const nextIndex = Math.min(sortedEvents.length - 1, currentEventIndex + 1)
    setCurrentEventIndex(nextIndex)
  }

  return (
    <div className="execution-view">
      <div className="execution-view__header">
        <h2 className="execution-view__title">Execution Mode</h2>
        <div className="execution-view__progress">
          Step {currentEventIndex + 1} of {sortedEvents.length}
        </div>
      </div>

      <div className="execution-view__layout">
        {/* Left: Current Step Panel */}
        <div className="execution-view__main">
          <CurrentStepPanel
            event={currentEvent}
            executionState={currentEventId ? executionStates[currentEventId] : undefined}
            onComplete={handleCompleteStep}
            onSkip={handleSkipStep}
            onReportDeviation={handleReportDeviation}
          />
        </div>

        {/* Right: Navigation and Progress */}
        <div className="execution-view__sidebar">
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
          runId={runId}
          eventId={deviationForEvent}
          event={currentEvent}
          onSubmit={handleDeviationSubmitted}
          onCancel={() => {
            setShowDeviationPanel(false)
            setDeviationForEvent(null)
          }}
        />
      )}

      <style>{`
        .execution-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fafbfc;
          border-radius: 12px;
          overflow: hidden;
        }

        .execution-view__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
        }

        .execution-view__title {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }

        .execution-view__progress {
          font-size: 0.875rem;
          font-weight: 500;
          opacity: 0.9;
        }

        .execution-view__layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .execution-view__main {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
          border-right: 1px solid #e5e7eb;
        }

        .execution-view__sidebar {
          width: 320px;
          display: flex;
          flex-direction: column;
          background: white;
          border-left: 1px solid #e5e7eb;
        }
      `}</style>
    </div>
  )
}
