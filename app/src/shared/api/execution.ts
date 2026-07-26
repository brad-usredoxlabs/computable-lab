/**
 * Execution API client methods for runtime execution state management.
 * These methods enable the Execution View UI to interact with the execution backend.
 */

/**
 * Execution state for an individual event
 */
export type ExecutionEventState =
  | 'pending'
  | 'current'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'deviated'

/**
 * Per-event execution tracking metadata
 */
export interface ExecutionState {
  state: ExecutionEventState
  startedAt?: string
  completedAt?: string
  deviationNote?: string
  deviationDetails?: Record<string, unknown>
  operatorRef?: string
}

/**
 * Deviation data structure for capturing execution deviations
 */
export interface DeviationData {
  deviationType: 'remediation' | 'operator' | 'runtime'
  eventId: string
  deviationCode: string
  expectedValue?: string
  actualValue?: string
  notes?: string
  severity?: 'info' | 'warning' | 'error'
  reportedBy: string
  reportedAt: string
}

/**
 * Full execution state for a run
 */
export interface RunExecutionState {
  runId: string
  executionStates: Record<string, ExecutionState>
  currentEventId?: string
  startedAt?: string
  completedAt?: string
  status: 'pending' | 'in_progress' | 'completed' | 'paused'
}

/**
 * Update execution state for a specific event
 * @param runId - The run identifier
 * @param eventId - The event identifier
 * @param state - The new execution state
 * @param details - Optional additional details
 * @returns Updated execution state
 */
export async function updateExecutionState(
  runId: string,
  eventId: string,
  state: ExecutionEventState,
  details?: {
    deviationNote?: string
    deviationDetails?: Record<string, unknown>
  }
): Promise<ExecutionState> {
  const response = await fetch(`/api/execution/run/${runId}/event/${eventId}/state`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state,
      ...(details?.deviationNote && { deviationNote: details.deviationNote }),
      ...(details?.deviationDetails && { deviationDetails: details.deviationDetails }),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to update execution state' }))
    throw new Error(error.message || 'Failed to update execution state')
  }

  return response.json()
}

/**
 * Capture a deviation during execution
 * @param runId - The run identifier
 * @param deviationData - Deviation data to capture
 * @returns Created deviation record
 */
export async function captureDeviation(
  runId: string,
  deviationData: DeviationData
): Promise<{ id: string; deviationType: string }> {
  const response = await fetch(`/api/execution/run/${runId}/deviation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deviationData),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to capture deviation' }))
    throw new Error(error.message || 'Failed to capture deviation')
  }

  return response.json()
}

/**
 * Get full execution state for all events in a run
 * @param runId - The run identifier
 * @returns Full execution state
 */
export async function getExecutionState(runId: string): Promise<RunExecutionState> {
  const response = await fetch(`/api/execution/run/${runId}/state`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to get execution state' }))
    throw new Error(error.message || 'Failed to get execution state')
  }

  return response.json()
}

/**
 * Complete the current step in execution
 * @param runId - The run identifier
 * @param eventId - The event identifier to complete
 * @returns Updated execution state
 */
export async function completeStep(runId: string, eventId: string): Promise<ExecutionState> {
  return updateExecutionState(runId, eventId, 'completed')
}

/**
 * Skip the current step in execution
 * @param runId - The run identifier
 * @param eventId - The event identifier to skip
 * @returns Updated execution state
 */
export async function skipStep(runId: string, eventId: string): Promise<ExecutionState> {
  return updateExecutionState(runId, eventId, 'skipped')
}

/**
 * Mark an event as the current step
 * @param runId - The run identifier
 * @param eventId - The event identifier to set as current
 * @returns Updated execution state
 */
export async function setCurrentStep(runId: string, eventId: string): Promise<RunExecutionState> {
  const response = await fetch(`/api/execution/run/${runId}/current-step`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ eventId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to set current step' }))
    throw new Error(error.message || 'Failed to set current step')
  }

  return response.json()
}
