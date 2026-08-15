/**
 * ExecutionView - Main container for execution mode in the event editor.
 * Provides GPS-style navigation with current step highlight, progress tracking,
 * and deviation capture capabilities.
 */

import { useState, useMemo } from 'react';
import type { PlateEvent } from '../../types/events';
import { getEventSummary } from '../../types/events.js';
import type { RunExecutionState, DeviationData } from '../../shared/api/execution.js';
import { ExecutionNav } from './ExecutionNav.js';
import { CurrentStepPanel } from './CurrentStepPanel.js';
import { StepProgress } from './StepProgress.js';
import { DeviationPanel } from './DeviationPanel.js';
import { PromoteToProtocolModal } from '../../run/PromoteToProtocolModal.js';
import { createProtocolFromDraft } from '../../shared/api/protocols.js';
import './execution.css';

export interface ExecutionViewProps {
  runId: string
  events: PlateEvent[]
  executionStates: Record<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }>
  onExecutionStateChange: (eventId: string, state: { state: string; startedAt?: string; completedAt?: string; deviationNote?: string; deviationDetails?: Record<string, unknown> }) => Promise<void>
  onDeviationCaptured: (deviationId: string) => void
  studyId?: string
}

export function ExecutionView({
  runId: _runId,
  events,
  executionStates,
  onExecutionStateChange,
  onDeviationCaptured,
  studyId,
}: ExecutionViewProps) {
  const [currentEventIndex, setCurrentEventIndex] = useState(0)
  const [showDeviationPanel, setShowDeviationPanel] = useState(false)
  const [deviationForEvent, setDeviationForEvent] = useState<string | null>(null)
  const [showPromoteModal, setShowPromoteModal] = useState(false)

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

  // Check if execution is complete (all events completed or skipped)
  const isExecutionComplete = useMemo(() => {
    return Object.values(executionStates).every(
      (s) => s.state === 'completed' || s.state === 'skipped'
    )
  }, [executionStates])

  // Collect deviations from execution states
  const deviations: DeviationData[] = useMemo(() => {
    return Object.entries(executionStates)
      .filter(([_, s]) => s.deviationDetails)
      .map(([eventId, s]) => {
        const details = s.deviationDetails as unknown as DeviationData
        return {
          eventId,
          deviationType: details.deviationType || 'operator',
          deviationCode: details.deviationCode || 'UNKNOWN',
          expectedValue: details.expectedValue,
          actualValue: details.actualValue,
          notes: details.notes,
          severity: details.severity || 'info',
          reportedBy: details.reportedBy || 'system',
          reportedAt: details.reportedAt || new Date().toISOString(),
        }
      })
  }, [executionStates])

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

  const handlePromoteToProtocol = async (protocolData: {
    protocolName: string;
    protocolDescription?: string;
    version: string;
    corrections: Array<{
      eventId: string;
      originalValue: string;
      correctedValue: string;
      note?: string;
    }>;
  }) => {
    try {
      const result = await createProtocolFromDraft(
        {
          protocolName: protocolData.protocolName,
          protocolDescription: protocolData.protocolDescription,
          version: protocolData.version,
          steps: sortedEvents.map((event) => {
            // Extract action description from event details
            const action = getEventSummary(event);
            return {
              eventId: event.eventId,
              originalAction: action,
              correctedAction: protocolData.corrections.find((c) => c.eventId === event.eventId)?.correctedValue,
              deviationNote: protocolData.corrections.find((c) => c.eventId === event.eventId)?.note,
            };
          }),
        },
        _runId,
        studyId,
      );

      if (result.success && result.protocolId) {
        // Show success message and close modal
        setShowPromoteModal(false);
        // TODO: Show success notification with link to created protocol
        console.log('Protocol created:', result.protocolId);
      }
    } catch (error) {
      console.error('Failed to create protocol:', error);
      // TODO: Show error notification
      throw error;
    }
  }

  return (
    <div className="execution-view">
      <div className="execution-view__header">
        <h2 className="execution-view__title">Execution Mode</h2>
        <div className="execution-view__header-actions">
          <div className="execution-view__progress">
            Step {currentEventIndex + 1} of {sortedEvents.length}
          </div>
          {isExecutionComplete && (
            <button
              className="execution-view__promote-button"
              onClick={() => setShowPromoteModal(true)}
            >
              Promote to Protocol
            </button>
          )}
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
          eventId={deviationForEvent}
          event={currentEvent}
          onSubmit={handleDeviationSubmitted}
          onCancel={() => {
            setShowDeviationPanel(false)
            setDeviationForEvent(null)
          }}
        />
      )}

      {/* Promote to Protocol Modal */}
      {showPromoteModal && (
        <PromoteToProtocolModal
          runId={_runId}
          events={sortedEvents.map((event) => ({
            eventId: event.eventId,
            action: getEventSummary(event),
            at: event.at,
            t_offset: event.t_offset,
          }))}
          executionState={
            executionStates as unknown as RunExecutionState
          }
          deviations={deviations}
          onClose={() => setShowPromoteModal(false)}
          onConfirm={handlePromoteToProtocol}
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
