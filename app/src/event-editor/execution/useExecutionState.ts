/**
 * Reactive hook for execution tab state.
 *
 * Wraps the execution API (getExecutionState, updateExecutionState) and
 * provides a memoized sorted list of events for the ExecutionTabShell.
 */

import { useState, useEffect, useMemo } from 'react'
import type { PlateEvent } from '../../types/events'
import {
  getExecutionState,
  updateExecutionState,
  type ExecutionState,
} from '../../shared/api/execution'

export interface UseExecutionStateReturn {
  /** All execution states for events in this run. */
  executionStates: Record<string, ExecutionState>
  /** Sorted events list (by timestamp or t_offset). */
  sortedEvents: PlateEvent[]
  /** Currently selected event index in the sorted list. */
  currentEventIndex: number
  /** The currently selected event. */
  currentEvent: PlateEvent | undefined
  /** Whether data is still loading. */
  loading: boolean
  /** Error state if any API call failed. */
  error: string | null
  /** Mark an event as completed. */
  completeStep: (eventId: string) => Promise<void>
  /** Mark an event as skipped. */
  skipStep: (eventId: string) => Promise<void>
  /** Report a deviation for the current event. */
  reportDeviation: () => void
  /** Submit a deviation. */
  submitDeviation: (deviationId: string) => Promise<void>
  /** Jump to a specific event. */
  jumpToEvent: (eventId: string) => void
  /** Navigate to previous event. */
  previous: () => void
  /** Navigate to next event. */
  next: () => void
  /** Whether a deviation panel is showing. */
  showDeviationPanel: boolean
  /** Event ID for which deviation is being reported. */
  deviationForEvent: string | null
}

export function useExecutionState(
  runId: string,
  events: PlateEvent[],
): UseExecutionStateReturn {
  const [executionStates, setExecutionStates] = useState<Record<string, ExecutionState>>({})
  const [currentEventIndex, setCurrentEventIndex] = useState(0)
  const [showDeviationPanel, setShowDeviationPanel] = useState(false)
  const [deviationForEvent, setDeviationForEvent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Load execution state on mount
  useEffect(() => {
    let cancelled = false

    async function loadState() {
      try {
        setLoading(true)
        const state = await getExecutionState(runId)
        if (!cancelled) {
          setExecutionStates(state.executionStates)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load execution state')
          setLoading(false)
        }
      }
    }

    loadState()
    return () => {
      cancelled = true
    }
  }, [runId])

  const handleCompleteStep = async () => {
    if (!currentEventId) return
    try {
      await updateExecutionState(runId, currentEventId, 'completed')
      // Move to next event
      const nextIndex = currentEventIndex + 1
      if (nextIndex < sortedEvents.length) {
        setCurrentEventIndex(nextIndex)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete step')
    }
  }

  const handleSkipStep = async () => {
    if (!currentEventId) return
    try {
      await updateExecutionState(runId, currentEventId, 'skipped')
      // Move to next event
      const nextIndex = currentEventIndex + 1
      if (nextIndex < sortedEvents.length) {
        setCurrentEventIndex(nextIndex)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip step')
    }
  }

  const handleReportDeviation = () => {
    setDeviationForEvent(currentEventId)
    setShowDeviationPanel(true)
  }

  const handleDeviationSubmitted = async (deviationId: string) => {
    setShowDeviationPanel(false)
    setDeviationForEvent(null)
    if (currentEventId) {
      try {
        await updateExecutionState(runId, currentEventId, 'deviated', {
          deviationDetails: { deviationId },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark deviation')
      }
    }
  }

  const handleJumpToEvent = (eventId: string) => {
    const index = sortedEvents.findIndex((e) => e.eventId === eventId)
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

  return {
    executionStates,
    sortedEvents,
    currentEventIndex,
    currentEvent,
    loading,
    error,
    completeStep: handleCompleteStep,
    skipStep: handleSkipStep,
    reportDeviation: handleReportDeviation,
    submitDeviation: handleDeviationSubmitted,
    jumpToEvent: handleJumpToEvent,
    previous: handlePrevious,
    next: handleNext,
    showDeviationPanel,
    deviationForEvent,
  }
}
