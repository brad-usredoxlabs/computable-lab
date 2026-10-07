/**
 * useChatThread — orchestrates the chat reducer and an in-flight SSE
 * stream for the workspace AI panel.
 *
 * Caller hands in the `surface` id, viewer context, and the resolved
 * conversation history shape; the hook handles message-id generation,
 * AbortController lifecycle (for the Stop button), and routing SSE
 * events into the reducer.
 *
 * Chat state is in-memory and per-mount — Phase 7b doesn't persist threads
 * (deferred to a future phase that wires `ai/threads/:endpoint` into
 * workspace.yaml).
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  chatReducer,
  initialChatState,
  type ChatMessage,
} from './chatReducer'
import { runAssistStream, summarizeDraftResult, type AssistDraftResult, type AssistStreamRequest, type AgentActionEnvelope } from './assistStream'
import type { AiClarificationAnswer } from '../../../types/ai'

interface SendOptions {
  /** Override the surface id for this single send. Used by RunInEventEditor. */
  surfaceOverride?: string
  clarificationAnswers?: AiClarificationAnswer[]
  /** Opt into the model's chain-of-thought for this send (off by default). */
  enableThinking?: boolean
  /**
   * Protocol-planning step context: the current step + user-highlighted
   * subsection, so the AI adapts/ghosts THAT step (past steps dimmed).
   */
  protocolStepContext?: {
    stepId: string
    stepLabel: string
    highlightedSection: string
    selectedText: string
  }
  /**
   * PB-CH-4 — the structured working focus (ChatContextHeader's focused step).
   * Rides the request TOP-LEVEL so the server renders the WORKING FOCUS block;
   * never folded into `context` (per-turn churn would break the KV warm prefix).
   */
  workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
}

export interface UseChatThreadResult {
  state: ReturnType<typeof chatReducer>
  isStreaming: boolean
  send: (text: string, options?: SendOptions) => Promise<void>
  stop: () => void
  reset: () => void
  clearProtocolCandidate: () => void
}

let nextMessageId = 1
function makeMessageId(role: 'user' | 'assistant'): string {
  // Predictable monotonic ids so tests can pin them. The trailing role
  // suffix makes log inspection easier when reading a thread.
  nextMessageId += 1
  return `msg-${nextMessageId}-${role}`
}

/**
 * PB-CH-4 — fallback trace evidence for a tier-1 agent action when the mount
 * reports nothing. Derived from the compiled payload only (never from raw
 * model prose) and always states that NOTHING was written — tier-1 actions
 * move the workspace, they do not mutate records.
 */
function describeAgentAction(action: AgentActionEnvelope): string {
  const target = action.target
  const label =
    target?.label ??
    (target?.kind === 'protocol-step' ? target.stepId : undefined) ??
    (target && target.kind !== 'protocol-step' ? target.id : undefined) ??
    'the target'
  if (action.action === 'open-surface') {
    return `Opened ${action.surface ?? label} — nothing was written.`
  }
  return `Focused on ${label} — nothing was written.`
}

export interface UseChatThreadOptions {
  /** Stable surface id derived from the active viewer kind. */
  surface: string
  /** Whatever the agent should know about the active viewer/study. */
  context: Record<string, unknown>
  /**
   * PB-CH-4 — the structured working focus (the step ChatContextHeader shows).
   * Rides the request TOP-LEVEL (like protocolStepContext) so the server
   * renders the WORKING FOCUS block; never folded into `context` — focus
   * changes per turn and would churn the KV warm prefix.
   */
  workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
  /**
   * Called when a stream finishes with a draft-tool result, before the turn
   * commits to chat history. Deck surfaces use this to promote the draft
   * into the event editor's ghost preview.
   */
  onDraftResult?: (result: AssistDraftResult, prompt: string) => void
  /**
   * PB-CH-4 — tier-1 mount: fires when the server's workspace-action compiler
   * emits a compiled `agent_action` (Ajv + spine + registry resolution already
   * happened server-side). The mount (AiTabPanel via useWorkstateExecutor)
   * applies it; returned text (if any) becomes the trace evidence. A raw model
   * proposal NEVER rides this event — assistStream only relays compiled frames.
   */
  onAgentAction?: (action: AgentActionEnvelope) => string | void
  /**
   * PB-CH-4 — tier-2 mount: fires when the model proposes a workstate. Forwards
   * the INTENT verbatim; the mount relays it to POST /api/drafts/compile. The
   * hook itself touches NOTHING (no trace, no store) — the card owns the
   * compile→review→accept flow.
   */
  onWorkstateProposal?: (workstate: Record<string, unknown>) => void
  /**
   * Test seam — override the SSE runner. Real callers leave this unset
   * to use the default fetch-based client.
   */
  runStream?: typeof runAssistStream
}

export function useChatThread({
  surface,
  context,
  onDraftResult,
  onAgentAction,
  onWorkstateProposal,
  workingFocus,
  runStream,
}: UseChatThreadOptions): UseChatThreadResult {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const abortRef = useRef<AbortController | null>(null)
  const isStreaming = state.pending !== null

  // Cancel any in-flight stream on unmount so a closed tab doesn't keep
  // a hanging fetch alive.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    async (text: string, options?: SendOptions) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (abortRef.current) {
        // Defensive: another send is in flight; don't overlap streams.
        abortRef.current.abort()
      }
      let traceSeq = 0
      const userMessage: ChatMessage = {
        id: makeMessageId('user'),
        role: 'user',
        text: trimmed,
        ts: Date.now(),
      }
      const pendingAssistantId = makeMessageId('assistant')
      dispatch({
        type: 'send',
        userMessage,
        pendingAssistantId,
      })

      const history = [...state.messages, userMessage].map((m) => ({
        role: m.role,
        content: m.text,
      }))

      const controller = new AbortController()
      abortRef.current = controller

      const request: AssistStreamRequest = {
        prompt: trimmed,
        surface: options?.surfaceOverride ?? surface,
        context,
        history: history.slice(0, -1), // exclude the prompt itself — sent separately
        ...(options?.clarificationAnswers?.length ? { clarificationAnswers: options.clarificationAnswers } : {}),
        ...(options?.enableThinking !== undefined ? { enableThinking: options.enableThinking } : {}),
        ...(options?.protocolStepContext ? { protocolStepContext: options.protocolStepContext } : {}),
        // PB-CH-4: focus rides the request top-level; ABSENT when nothing is
        // focused (exactOptionalPropertyTypes — never `workingFocus: undefined`).
        ...(workingFocus ? { workingFocus } : {}),
      }

      const stream = runStream ?? runAssistStream
      try {
        await stream(request, {
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.type) {
              case 'status':
                dispatch({ type: 'stream-status', message: event.message })
                return
              case 'text_delta':
                dispatch({ type: 'stream-delta', delta: event.delta })
                return
              case 'done': {
                if (event.result) {
                  try {
                    onDraftResult?.(event.result, trimmed)
                  } catch {
                    // Preview promotion must never break the chat turn.
                  }
                }
                // Forced-draft-tool responses carry their whole answer in the
                // result payload (no text deltas); summarize it so the turn
                // doesn't commit as "(no response)".
                const fallbackText = summarizeDraftResult(event.result)
                dispatch({
                  type: 'stream-done',
                  ...(fallbackText ? { fallbackText } : {}),
                  ...(event.result?.clarificationRequests?.length
                    ? { clarificationRequests: event.result.clarificationRequests }
                    : {}),
                })
                return
              }
              case 'error':
                dispatch({ type: 'stream-error', message: event.message })
                return
              case 'protocol_extracted':
                dispatch({
                  type: 'stream-protocol-extracted',
                  candidate: event.candidate,
                  ...(event.sourcePdf ? { sourcePdf: event.sourcePdf } : {}),
                })
                return
              // Observability: forward the model's tool trail + pipeline
              // diagnostics into the chat as a per-turn trace (plan §5.3).
              case 'tool_call':
                dispatch({ type: 'stream-trace', entry: { seq: traceSeq++, kind: 'tool_call', toolName: event.toolName, args: event.args } })
                return
              case 'tool_result':
                dispatch({ type: 'stream-trace', entry: { seq: traceSeq++, kind: 'tool_result', toolName: event.toolName, success: event.success, durationMs: event.durationMs } })
                return
              case 'pipeline_diagnostics':
                for (const d of event.diagnostics.slice(0, 12)) {
                  dispatch({ type: 'stream-trace', entry: { seq: traceSeq++, kind: 'diagnostic', passId: d.pass_id, code: d.code, severity: d.severity, message: d.message } })
                }
                return
              case 'draft':
                dispatch({ type: 'stream-trace', entry: { seq: traceSeq++, kind: 'draft', evidence: `${event.events.length} event(s) drafted` } })
                return
              case 'agent_action': {
                // PB-CH-4 tier-1: the frame is the OUTPUT of the server's
                // workspace-action compiler (Ajv + spine + registry already
                // resolved). Hand it to the mount; whatever the mount reports
                // becomes the trace evidence. A throwing mount must never
                // break the chat turn (same wrapper as onDraftResult).
                let mountText: string | void
                try {
                  mountText = onAgentAction?.(event.action)
                } catch {
                  mountText = 'Agent action failed to apply — nothing was written.'
                }
                dispatch({
                  type: 'stream-trace',
                  entry: { seq: traceSeq++, kind: 'action', evidence: mountText || describeAgentAction(event.action) },
                })
                return
              }
              case 'workstate_proposal':
                // PB-CH-4 tier-2: forward the model's INTENT verbatim. The hook
                // touches NOTHING else — no trace, no store, no compile. The
                // card mount owns the compile→review→accept flow.
                onWorkstateProposal?.(event.workstate)
                return
              default: {
                const _exhaustive: never = event
                return _exhaustive
              }
            }
          },
        })
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    // We capture state.messages so the history snapshot is fresh. The
    // alternative — reading via a ref — risks stale conversation context.
    [state.messages, surface, context, workingFocus, onDraftResult, onAgentAction, onWorkstateProposal, runStream],
  )

  const stop = useCallback(() => {
    if (!abortRef.current) return
    abortRef.current.abort()
    abortRef.current = null
    dispatch({ type: 'stream-cancelled' })
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: 'reset' })
  }, [])

  const clearProtocolCandidate = useCallback(() => {
    dispatch({ type: 'clear-protocol-candidate' })
  }, [])

  return { state, isStreaming, send, stop, reset, clearProtocolCandidate }
}
