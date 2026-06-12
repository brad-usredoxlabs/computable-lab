/**
 * Pure chat reducer for the workspace AI panel.
 *
 * State shape mirrors what an SSE-driven chat needs:
 *  - `messages`: ordered conversation, role + text.
 *  - `pending`: when the user has sent a message and we're waiting on the
 *    assistant turn; carries the in-flight assistant text deltas.
 *  - `status`: the latest backend status string ("Received — preparing
 *    agent…", "Compiling…", etc.) so the UI can show what's happening.
 *  - `error`: last error if the SSE stream ended in an `error` event.
 *
 * The SSE client (`useChatStream`) dispatches actions; this reducer keeps
 * all transitions in one testable place.
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Timestamp pinned at the point the message was added — for ordering and display. */
  ts: number
}

export interface ChatState {
  messages: ChatMessage[]
  /** When non-null, the assistant turn is in flight. Held outside `messages`
   *  so it can be promoted atomically on `stream-done`. */
  pending: { id: string; text: string } | null
  status: string | null
  error: string | null
}

export type ChatAction =
  | { type: 'send'; userMessage: ChatMessage; pendingAssistantId: string }
  | { type: 'stream-status'; message: string }
  | { type: 'stream-delta'; delta: string }
  | { type: 'stream-done'; fallbackText?: string }
  | { type: 'stream-error'; message: string }
  | { type: 'stream-cancelled' }
  | { type: 'reset' }

export const initialChatState: ChatState = {
  messages: [],
  pending: null,
  status: null,
  error: null,
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      // The user's message is committed immediately; an empty pending
      // assistant message is started so the UI can render the spinner /
      // streaming text in-place rather than appending a new bubble.
      return {
        ...state,
        messages: [...state.messages, action.userMessage],
        pending: { id: action.pendingAssistantId, text: '' },
        status: null,
        error: null,
      }
    }

    case 'stream-status': {
      // Status events are backend pipeline progress, not assistant text.
      // We keep only the latest so the UI doesn't grow a log; debugging
      // info lives in the server logs.
      return { ...state, status: action.message }
    }

    case 'stream-delta': {
      if (!state.pending) return state
      return {
        ...state,
        pending: {
          ...state.pending,
          text: state.pending.text + action.delta,
        },
      }
    }

    case 'stream-done': {
      if (!state.pending) {
        // `done` arrived without a `pending` — most likely a backend that
        // didn't stream any text_delta (e.g. tool-call-only path). The
        // assistant turn just finishes with no visible text.
        return { ...state, status: null }
      }
      // Promote the in-flight pending message into the committed history.
      // Tool-call-only turns stream no text — use the caller's summary of
      // the draft result before falling back to a placeholder.
      const text = state.pending.text || action.fallbackText || '(no response)'
      const committed: ChatMessage = {
        id: state.pending.id,
        role: 'assistant',
        text,
        ts: Date.now(),
      }
      return {
        ...state,
        messages: [...state.messages, committed],
        pending: null,
        status: null,
      }
    }

    case 'stream-error': {
      // Cancel any in-flight pending message — the assistant turn never
      // completed. Stash the error for the UI banner.
      return {
        ...state,
        pending: null,
        status: null,
        error: action.message,
      }
    }

    case 'stream-cancelled': {
      // User-initiated stop. Same as error but without the error string.
      return { ...state, pending: null, status: null }
    }

    case 'reset': {
      return { ...initialChatState }
    }

    default: {
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}
