/**
 * useExecutionState - Centralized execution state management hook.
 *
 * Manages run-level execution state including:
 * - Run identification (runId, runName, isRunNameEditable)
 * - Mode (plan | execute)
 * - Planned vs executed event graphs
 * - Step-by-step execution tracking (statuses, timestamps)
 * - playAll() for sequential step execution
 */

import { useCallback, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Execution mode — planning or actively executing. */
export type ExecutionMode = 'plan' | 'execute'

/** Status of an individual step during execution. */
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'deviated'

/** Per-step timestamp tracking. */
export interface StepTimestamps {
  startedAt?: string
  completedAt?: string
}

/** Per-step deviation record. */
export interface StepDeviation {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
  reportedBy: string
  reportedAt: string
}

/** An event in the planned or executed graph. */
export interface GraphEvent {
  eventId: string
  event_type?: string
  at?: string
  t_offset?: string
}

/** Full execution state for a run. */
export interface ExecutionState {
  /** Stable run identifier. */
  runId: string
  /** Human-readable run name. */
  runName: string
  /** Whether the run name can be edited by the user. */
  isRunNameEditable: boolean
  /** Current execution mode. */
  mode: ExecutionMode
  /** The planned event graph before execution begins. */
  plannedGraph: GraphEvent[]
  /** The executed event graph (cloned from planned, updated with timestamps). */
  executedGraph: GraphEvent[]
  /** Index of the step currently being executed. */
  currentStepIndex: number
  /** Map of stepId -> status. */
  stepStatuses: Record<string, StepStatus>
  /** Map of stepId -> timestamps. */
  stepTimestamps: Record<string, StepTimestamps>
  /** Map of stepId -> deviation records. */
  stepDeviations: Record<string, StepDeviation | undefined>
}

/** Return type of the hook. */
export interface ExecutionStateHandle {
  /** Current execution state (read-only). */
  state: ExecutionState
  /** Update the run name. */
  setRunName: (name: string) => void
  /** Switch between plan and execute modes. */
  setMode: (mode: ExecutionMode) => void
  /** Mark a step as started (in_progress) and record startedAt. */
  startStep: (stepId: string) => void
  /** Mark a step as completed (or deviated if deviations provided). */
  completeStep: (stepId: string, deviations?: StepDeviation) => void
  /** Update the at timestamp on an event in the executed graph. */
  updateEventTimestamp: (eventId: string, at: string) => void
  /** Skip a step. */
  skipStep: (stepId: string) => void
  /** Execute all pending steps sequentially. */
  playAll: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Default factory
// ---------------------------------------------------------------------------

function createInitialState(runId: string, runName: string, plannedGraph: GraphEvent[]): ExecutionState {
  const stepStatuses: Record<string, StepStatus> = {}
  const stepTimestamps: Record<string, StepTimestamps> = {}
  const stepDeviations: Record<string, StepDeviation | undefined> = {}

  for (const evt of plannedGraph) {
    stepStatuses[evt.eventId] = 'pending'
    stepTimestamps[evt.eventId] = {}
    stepDeviations[evt.eventId] = undefined
  }

  return {
    runId,
    runName,
    isRunNameEditable: true,
    mode: 'plan',
    plannedGraph,
    executedGraph: JSON.parse(JSON.stringify(plannedGraph)),
    currentStepIndex: -1,
    stepStatuses,
    stepTimestamps,
    stepDeviations,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Centralized execution state hook.
 *
 * @param runId - Stable run identifier.
 * @param initialRunName - Initial human-readable run name (editable).
 * @param plannedGraph - The planned event graph (defaults to empty array).
 */
export function useExecutionState(
  runId: string,
  initialRunName: string,
  plannedGraph: GraphEvent[] = [],
): ExecutionStateHandle {
  const [state, setState] = useState<ExecutionState>(() =>
    createInitialState(runId, initialRunName, plannedGraph),
  )

  // ---------- Mutators ----------

  const setRunName = useCallback((name: string) => {
    setState((prev) => ({ ...prev, runName: name }))
  }, [])

  const setMode = useCallback((mode: ExecutionMode) => {
    setState((prev) => {
      if (prev.mode === mode) return prev
      return { ...prev, mode }
    })
  }, [])

  const startStep = useCallback((stepId: string) => {
    const now = new Date().toISOString()
    setState((prev) => {
      // Skip if already in_progress, completed, skipped, or deviated
      const existing = prev.stepStatuses[stepId]
      if (existing && existing !== 'pending') return prev

      const statusIndex = prev.plannedGraph.findIndex((e) => e.eventId === stepId)

      return {
        ...prev,
        currentStepIndex: statusIndex >= 0 ? statusIndex : prev.currentStepIndex,
        stepStatuses: { ...prev.stepStatuses, [stepId]: 'in_progress' },
        stepTimestamps: {
          ...prev.stepTimestamps,
          [stepId]: { ...prev.stepTimestamps[stepId], startedAt: now },
        },
      }
    })
  }, [])

  const completeStep = useCallback((stepId: string, deviations?: StepDeviation) => {
    const now = new Date().toISOString()
    const finalStatus: StepStatus = deviations ? 'deviated' : 'completed'

    setState((prev) => {
      const newStatus = prev.stepStatuses[stepId]
      if (newStatus === 'completed' || newStatus === 'deviated') return prev

      return {
        ...prev,
        stepStatuses: { ...prev.stepStatuses, [stepId]: finalStatus },
        stepTimestamps: {
          ...prev.stepTimestamps,
          [stepId]: { ...prev.stepTimestamps[stepId], completedAt: now },
        },
        stepDeviations: deviations ? { ...prev.stepDeviations, [stepId]: deviations } : prev.stepDeviations,
      }
    })
  }, [])

  const skipStep = useCallback((stepId: string) => {
    setState((prev) => {
      const newStatus = prev.stepStatuses[stepId]
      if (newStatus === 'completed' || newStatus === 'skipped' || newStatus === 'deviated') return prev

      return {
        ...prev,
        stepStatuses: { ...prev.stepStatuses, [stepId]: 'skipped' },
      }
    })
  }, [])

  const updateEventTimestamp = useCallback((eventId: string, at: string) => {
    setState((prev) => {
      const updatedExecutedGraph = prev.executedGraph.map((evt) => {
        if (evt.eventId === eventId) {
          return { ...evt, at }
        }
        return evt
      })

      return {
        ...prev,
        executedGraph: updatedExecutedGraph,
      }
    })
  }, [])

  const playAll = useCallback(async () => {
    const now = new Date().toISOString()

    setState((prev) => {
      // Collect pending steps
      const pendingSteps = prev.plannedGraph.filter(
        (evt) => prev.stepStatuses[evt.eventId] === 'pending',
      )

      if (pendingSteps.length === 0) return prev

      // Mark all pending steps as completed with timestamps
      const newStatuses = { ...prev.stepStatuses }
      const newTimestamps = { ...prev.stepTimestamps }
      let lastPendingIndex = prev.currentStepIndex

      for (const evt of pendingSteps) {
        newStatuses[evt.eventId] = 'completed'
        newTimestamps[evt.eventId] = {
          ...newTimestamps[evt.eventId],
          startedAt: now,
          completedAt: now,
        }
        const idx = prev.plannedGraph.findIndex((e) => e.eventId === evt.eventId)
        if (idx > lastPendingIndex) lastPendingIndex = idx
      }

      return {
        ...prev,
        currentStepIndex: lastPendingIndex,
        stepStatuses: newStatuses,
        stepTimestamps: newTimestamps,
      }
    })
  }, [])

  return useMemo(
    () => ({
      state,
      setRunName,
      setMode,
      startStep,
      completeStep,
      skipStep,
      updateEventTimestamp,
      playAll,
    }),
    [state, setRunName, setMode, startStep, completeStep, skipStep, updateEventTimestamp, playAll],
  )
}
