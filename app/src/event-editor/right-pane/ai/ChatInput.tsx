/**
 * ChatInput — textarea + Send/Stop buttons for the workspace AI panel.
 *
 * Phase 7b ships a plain textarea (no TipTap) to keep the dependency
 * surface tight. The slash-menu and ontology-copilot integration the
 * legacy dock has are valuable but a follow-up — wiring them into a
 * fresh editor instance is its own state machine. The textarea handles
 * the 80% case (typing + Enter to send + Shift-Enter for newline).
 */

import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

export interface ChatInputProps {
  isStreaming: boolean
  onSend: (text: string) => void | Promise<void>
  onStop: () => void
  /** Whether the underlying provider is in a state where sending makes
   *  sense (e.g. an active viewer is present). When false, the send button
   *  is disabled but the textarea is still editable for staging. */
  disabled?: boolean
  /** Optional placeholder override; defaults to a generic prompt hint. */
  placeholder?: string
  /** Allow the parent to push text into the input (e.g. Run-in-event-editor
   *  pre-fills the prompt from a viewer excerpt). */
  prefill?: string
}

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
  disabled,
  placeholder,
  prefill,
}: ChatInputProps) {
  const [text, setText] = useState(prefill ?? '')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // If the parent pushes a new prefill (e.g. the user clicked
  // "Run in event-editor" from a PDF viewer), replace whatever was in the
  // textarea — the prefill is short-lived and overrides whatever the user
  // had staged. The dependency on `prefill` here is intentional: parents
  // should only set it when they truly want to overwrite.
  useResetOnPrefill(prefill, setText, textareaRef)

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    await onSend(trimmed)
  }, [text, onSend])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift-Enter / Ctrl-Enter inserts a newline. Matches
      // the legacy dock and most chat UIs.
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        void send()
      }
    },
    [send],
  )

  return (
    <div className="chat-input" data-testid="chat-input">
      <textarea
        ref={textareaRef}
        className="chat-input__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          placeholder ??
          'Ask anything about this viewer. Enter to send, Shift-Enter for newline.'
        }
        rows={3}
        data-testid="chat-input-textarea"
      />
      <div className="chat-input__actions">
        {isStreaming ? (
          <button
            type="button"
            className="chat-input__btn chat-input__btn--stop"
            onClick={onStop}
            data-testid="chat-input-stop"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="chat-input__btn chat-input__btn--send"
            onClick={() => void send()}
            disabled={disabled || !text.trim()}
            data-testid="chat-input-send"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

// Tiny helper so the prefill effect doesn't clutter the main component.
function useResetOnPrefill(
  prefill: string | undefined,
  setText: (v: string) => void,
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>,
): void {
  const lastPrefillRef = useRef<string | undefined>(undefined)
  if (prefill !== undefined && prefill !== lastPrefillRef.current) {
    lastPrefillRef.current = prefill
    // Defer to allow whatever triggered the prefill (likely a button click)
    // to finish its synchronous work first.
    queueMicrotask(() => {
      setText(prefill)
      textareaRef.current?.focus()
    })
  }
}
