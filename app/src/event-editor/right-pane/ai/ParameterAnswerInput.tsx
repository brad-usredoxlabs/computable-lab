/**
 * The answer box for a question with nothing to choose from.
 *
 * A "parameter" clarification asks for a value in plain language — "What is the
 * volume of HepG2 cells?", "How many HepG2 Cell per well?" — and carries NO
 * options on purpose (a volume is typed, not picked from a menu of records).
 *
 * Reported 2026-09-20: the card asked exactly that and showed no input box at
 * all, because the picker returned null for any request without a slash-menu
 * provider. The question was unanswerable.
 */
import { useState } from 'react'

export interface ParameterAnswerInputProps {
  requestId: string
  /** Submit the typed amount; the answer rides back as `value`. */
  onAnswer: (answer: { requestId: string; value: string; label: string }) => void
  /** Wording for the empty field, from the question's own context. */
  placeholder?: string
  disabled?: boolean
}

export function ParameterAnswerInput({
  requestId,
  onAnswer,
  placeholder = 'Type your answer…',
  disabled = false,
}: ParameterAnswerInputProps) {
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onAnswer({ requestId, value: text, label: text })
    setValue('')
  }

  return (
    <div className="message-log__clarification-picker" data-testid="parameter-answer">
      <input
        type="text"
        className="message-log__clarification-search"
        data-testid="parameter-answer-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button
        type="button"
        className="questions-panel__btn questions-panel__btn--primary"
        data-testid="parameter-answer-submit"
        disabled={disabled || value.trim().length === 0}
        onClick={submit}
      >
        Use this answer
      </button>
    </div>
  )
}
