/**
 * FeedbackChat — iterative feedback loop for refining an AI-generated draft.
 *
 * Lets the user type remarks and click "Redraft" to ask the AI to revise
 * the current event graph. Shows iteration badge after the first redraft.
 */

import { useState } from 'react'

interface FeedbackChatProps {
  /** Current iteration count (0 = initial draft, 1+ = redrafts). */
  iteration: number
  /** Whether a redraft request is currently in-flight. */
  isProcessing: boolean
  /** Callback invoked when the user submits remarks. */
  onRedraft: (remarks: string) => Promise<void>
}

export function FeedbackChat({
  iteration,
  isProcessing,
  onRedraft,
}: FeedbackChatProps) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!remarks.trim() || isProcessing) return
    setError(null)
    try {
      await onRedraft(remarks.trim())
      setRemarks('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redraft failed')
    }
  }

  return (
    <div className="protocol-feedback-chat" data-testid="feedback-chat">
      <div className="protocol-feedback-chat__header">
        <h4 className="protocol-feedback-chat__title">Refine Draft</h4>
        {iteration > 0 && (
          <span className="protocol-feedback-chat__badge" data-testid="redraft-badge">
            Redraft #{iteration}
          </span>
        )}
      </div>

      {error && (
        <div className="protocol-feedback-chat__error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="protocol-feedback-chat__form">
        <textarea
          className="protocol-feedback-chat__textarea"
          placeholder="Tell the AI what to change..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={isProcessing}
          rows={3}
          data-testid="feedback-remarks-input"
        />
        <div className="protocol-feedback-chat__actions">
          <button
            type="submit"
            className="protocol-feedback-chat__btn"
            disabled={!remarks.trim() || isProcessing}
            data-testid="redraft-btn"
          >
            {isProcessing ? 'Redrafting...' : 'Redraft'}
          </button>
        </div>
      </form>
    </div>
  )
}
