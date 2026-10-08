/**
 * ExecutionContext — state management for protocol executions.
 *
 * Provides the active execution's provenance metadata (name, operator,
 * notes, timestamps) and lifecycle actions (start, setStep, complete,
 * abort). Consumed by ExecutionTabPanel and child execution UI.
 *
 * Start is server-authoritative: we await POST /api/runs/:runId/start and
 * only enter the executing state once the server accepts the transition
 * (run moves 'planned' -> 'in_progress'). On 4xx the local state stays
 * untouched and the failure reason (server error code + precondition
 * findings) is stored in state.executionError for the UI to surface.
 */

import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from 'react'

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
  /** Human-readable reason the last start attempt was rejected by the
   *  server (error code + failed preconditions). Cleared on the next
   *  successful start or an abort. */
  executionError: string | null
}

export type ExecutionContextAction =
  | { type: 'start'; metadata: ExecutionMetadata; protocolId: string; eventGraphId: string }
  | { type: 'setStep'; stepId: string }
  | { type: 'complete' }
  | { type: 'abort' }
  | { type: 'startFailed'; message: string }

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
  executionError: null,
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
        executionError: null,
      }
    case 'setStep':
      return { ...state, currentStepId: action.stepId }
    case 'complete':
      return { ...state, isActive: false }
    case 'abort':
      return initialState
    case 'startFailed':
      return { ...state, executionError: action.message }
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
  const stateRef = useRef(state)
  stateRef.current = state

  const startExecution = useCallback(
    async (metadata: Omit<ExecutionMetadata, 'timestamp'>, protocolId: string, eventGraphId: string): Promise<ExecutionContextState> => {
      const withTimestamp: ExecutionMetadata = {
        ...metadata,
        timestamp: new Date().toISOString(),
      }

      // Server-authoritative start: only enter the executing state once the
      // backend accepts the planned -> in_progress transition. A rejected
      // start (controlled-use block, confirmation required, etc.) leaves the
      // local state untouched and records why in state.executionError.
      const runId = protocolId
      let response: Response
      try {
        response = await fetch(`/api/runs/${encodeURIComponent(runId)}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            executedBy: metadata.operatorName,
            startedAt: withTimestamp.timestamp,
          }),
        })
      } catch (err) {
        const message = `Run start failed: ${err instanceof Error ? err.message : String(err)}`
        dispatch({ type: 'startFailed', message })
        return stateRef.current
      }

      if (response.ok) {
        dispatch({ type: 'start', metadata: withTimestamp, protocolId, eventGraphId })
        return executionReducer(stateRef.current, {
          type: 'start',
          metadata: withTimestamp,
          protocolId,
          eventGraphId,
        })
      }

      // Rejected: parse the error body defensively and surface which
      // preconditions failed.
      let message = `Run start failed (HTTP ${response.status}).`
      try {
        const body = (await response.json()) as {
          error?: unknown
          message?: unknown
          details?: { findings?: Array<{ message?: unknown }> }
        }
        const code = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
        const findings = Array.isArray(body.details?.findings)
          ? body.details.findings
              .map((f) => (typeof f?.message === 'string' ? f.message : null))
              .filter((m): m is string => m !== null)
          : []
        message = findings.length > 0 ? `${code}: ${findings.join('; ')}` : `${code}: ${typeof body.message === 'string' ? body.message : 'Run start rejected.'}`
      } catch {
        // Body was not JSON — keep the generic HTTP message above.
      }
      dispatch({ type: 'startFailed', message })
      return stateRef.current
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
