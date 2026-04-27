/**
 * FeedbackCommentForm — the feedback comment form with anchor selector.
 * Extracted from ProtocolIdeActionRail to keep file sizes manageable.
 */

import { useState, useCallback } from 'react'
import type { CommentAnchor, IssueCardRef } from './ProtocolIdeGraphReviewSurface'

// ---------------------------------------------------------------------------
// Feedback comment form (manages anchor state internally)
// ---------------------------------------------------------------------------

export function FeedbackCommentForm({
  text,
  onChange,
  onAnchorsChange,
  onSubmit,
  issueCards,
}: {
  text: string
  onChange: (text: string) => void
  /** Called when the user changes the anchor array. */
  onAnchorsChange: (anchors: CommentAnchor[]) => void
  /** Called when the user submits the comment. */
  onSubmit: () => void
  issueCards?: IssueCardRef[]
}): JSX.Element {
  const [showAnchor, setShowAnchor] = useState(false)
  const [anchors, setAnchors] = useState<CommentAnchor[]>([])

  const handleToggleAnchor = useCallback(() => {
    setShowAnchor((prev) => {
      const next = !prev
      if (next) {
        // When opening anchor selector, default to empty (no anchor)
        setAnchors([])
        onAnchorsChange([])
      }
      return next
    })
  }, [onAnchorsChange])

  const handleSelectAnchor = useCallback(
    (semanticKey: string, label: string) => {
      const newAnchors: CommentAnchor[] = [{ kind: 'node', semanticKey, instanceId: semanticKey }]
      setAnchors(newAnchors)
      onAnchorsChange(newAnchors)
    },
    [onAnchorsChange],
  )

  const handleSelectNone = useCallback(() => {
    setAnchors([])
    onAnchorsChange([])
  }, [onAnchorsChange])

  return (
    <section className="action-rail-section" data-testid="action-rail-feedback">
      <h3 className="action-rail-section-title">Feedback Comment</h3>
      <textarea
        className="action-rail-comment-input"
        data-testid="action-rail-comment-input"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="What needs to change? (optional)"
        aria-label="Feedback comment"
      />

      {/* Anchor toggle */}
      <div className="action-rail-anchor-toggle" data-testid="action-rail-anchor-toggle">
        <button
          type="button"
          className="action-rail-anchor-btn"
          data-testid="action-rail-anchor-toggle-btn"
          onClick={handleToggleAnchor}
          aria-expanded={showAnchor}
        >
          {showAnchor ? '▲' : '▼'} Anchor to context
        </button>
      </div>

      {/* Anchor target selector */}
      {showAnchor && (
        <div className="action-rail-anchor-selector" data-testid="action-rail-anchor-selector">
          <button
            type="button"
            className={`action-rail-anchor-option ${anchors.length === 0 ? 'active' : ''}`}
            data-testid="action-rail-anchor-none"
            onClick={handleSelectNone}
          >
            No anchor (freeform)
          </button>
          {issueCards &&
            issueCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`action-rail-anchor-option ${
                  anchors.length > 0 && anchors[0].kind === 'node' && anchors[0].semanticKey === card.id ? 'active' : ''
                }`}
                data-testid={`action-rail-anchor-issue-${card.id}`}
                onClick={() =>
                  handleSelectAnchor(card.id, card.title)
                }
              >
                {card.title}
              </button>
            ))}
        </div>
      )}
    </section>
  )
}
