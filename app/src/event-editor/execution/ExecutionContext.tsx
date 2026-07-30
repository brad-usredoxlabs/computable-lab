/**
 * ExecutionContext — state management for protocol executions.
 *
 * Provides the active execution's provenance metadata (name, operator,
 * notes, timestamps) and lifecycle actions (start, setStep, complete,
 * abort). Consumed by ExecutionTabPanel and child execution UI.
 *
 * On start, persists the execution to the backend via POST /api/runs/:runId/start
 * so the run record transitions from 'planned' to 'in_progress'. This
 * survives page reloads — the run's executionTracking field holds the state.
 */

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface ExecutionMetadata {
  /** Human-readable name for this execution run. */
  executionName: string
  /** Name of the operator who started the execution. */
  operatorName: string
  /** Freeform notes captured at start time. */
  notes?: string
  /** ISO-8601 timestamp when the execution was created. */
  timestamp: string
}

export interface ExecutionContextState {
  /** Whether an execution is actively running. */
  isActive: boolean
  /** Unique identifier for the current execution session. */
  executionId: string | null
  /** Execution metadata once started. */
  metadata: ExecutionMetadata | null
  /** Protocol ID associated with this execution. */
  protocolId: string | null
  /** Current step ID within the protocol. */
  currentStepId: string | null
  /** Event graph driving this execution. */
  eventGraphId: string | null
}

export type ExecutionContextAction =
  | { type: 'start'; metadata: ExecutionMetadata; protocolId: string; eventGraphId: string }
  | { type: 'setStep'; stepId: string }
  | { type: 'complete' }
  | { type: 'abort' }

/* ------------------------------------------------------------------ */
/* Reducer                                                              */
/* ------------------------------------------------------------------ */

const initialState: ExecutionContextState = {
  isActive: false,
  executionId: null,
  metadata: null,
  protocolId: null,
  currentStepId: null,
  eventGraphId: null,
}

function executionReducer(
  state: ExecutionContextState,
  action: ExecutionContextAction,
): ExecutionContextState {
  switch (action.type) {
    case 'start':
      return {
        isActive: true,
        executionId: `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        metadata: action.metadata,
        protocolId: action.protocolId,
        currentStepId: null,
        eventGraphId: action.eventGraphId,
      }
    case 'setStep':
      return { ...state, currentStepId: action.stepId }
    case 'complete':
      return { ...state, isActive: false }
    case 'abort':
      return initialState
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

/* ------------------------------------------------------------------ */
/* Context & Provider                                                   */
/* ------------------------------------------------------------------ */

export interface ExecutionContextValue {
  state: ExecutionContextState
  /** Begin a new execution with provenance metadata. Persists to backend. */
  startExecution: (metadata: Omit<ExecutionMetadata, 'timestamp'>, protocolId: string, eventGraphId: string) => Promise<ExecutionContextState>
  /** Advance or set the current step. */
  setStep: (stepId: string) => void
  /** Mark the execution as completed. */
  completeExecution: () => void
  /** Abort and reset the execution. */
  abortExecution: () => void
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null)

export interface ExecutionProviderProps {
  children: ReactNode
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const [state, dispatch] = useReducer(executionReducer, initialState)

  const startExecution = useCallback(
    async (metadata: Omit<ExecutionMetadata, 'timestamp'>, protocolId: string, eventGraphId: string): Promise<ExecutionContextState> => {
      const withTimestamp: ExecutionMetadata = {
        ...metadata,
        timestamp: new Date().toISOString(),
      }
      dispatch({ type: 'start', metadata: withTimestamp, protocolId, eventGraphId })

      // Persist to backend so the run transitions from 'planned' to 'in_progress'.
      // This is fire-and-forget — the local state is already updated and the
      // user can proceed immediately. If the API call fails, the run record
      // stays in 'planned' but the UI still works (step execution PATCH calls
      // will fail with INVALID_STATE_TRANSITION, surfacing the error).
      const runId = protocolId
      void fetch(`/api/runs/${encodeURIComponent(runId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executedBy: metadata.operatorName,
          startedAt: withTimestamp.timestamp,
        }),
      }).catch((err) => {
        console.warn('Failed to persist run start to backend:', err)
      })

      return executionReducer(undefined as never, {
        type: 'start',
        metadata: withTimestamp,
        protocolId,
        eventGraphId,
      }) as ExecutionContextState
    },
    [],
  )

  const setStep = useCallback((stepId: string) => {
    dispatch({ type: 'setStep', stepId })
  }, [])

  const completeExecution = useCallback(() => {
    dispatch({ type: 'complete' })
  }, [])

  const abortExecution = useCallback(() => {
    dispatch({ type: 'abort' })
  }, [])

  const value: ExecutionContextValue = {
    state,
    startExecution,
    setStep,
    completeExecution,
    abortExecution,
  }

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  )
}

/**
 * Read the execution context. Throws if used outside <ExecutionProvider>.
 */
export function useExecution(): ExecutionContextValue {
  const ctx = useContext(ExecutionContext)
  if (!ctx) {
    throw new Error('useExecution must be used inside <ExecutionProvider>')
  }
  return ctx
}
