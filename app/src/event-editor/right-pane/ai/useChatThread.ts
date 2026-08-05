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
import { runAssistStream, summarizeDraftResult, type AssistDraftResult, type AssistStreamRequest } from './assistStream'
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

export interface UseChatThreadOptions {
  /** Stable surface id derived from the active viewer kind. */
  surface: string
  /** Whatever the agent should know about the active viewer/study. */
  context: Record<string, unknown>
  /**
   * Called when a stream finishes with a draft-tool result, before the turn
   * commits to chat history. Deck surfaces use this to promote the draft
   * into the event editor's ghost preview.
   */
  onDraftResult?: (result: AssistDraftResult, prompt: string) => void
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
    [state.messages, surface, context, onDraftResult, runStream],
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
