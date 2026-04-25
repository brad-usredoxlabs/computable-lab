/**
 * ProtocolIdeActionRail — the right-side action rail for the Protocol IDE.
 *
 * This is the core day-to-day loop: adjust the directive, inspect the
 * projection, say what is wrong, and rerun.  The UX stays immediate —
 * no history browser, no compare view, no iteration branch picker.
 *
 * Layout (right-side panel):
 *   ┌──────────────────────────────────────┐
 *   │  Rerun & Feedback                    │
 *   ├──────────────────────────────────────┤
 *   │  Directive (editable)                │
 *   │  [textarea]                          │
 *   ├──────────────────────────────────────┤
 *   │  Feedback comment                    │
 *   │  [textarea]                          │
 *   │  [anchor toggle]                     │
 *   │  [anchor target selector]            │
 *   ├──────────────────────────────────────┤
 *   │  [Rerun button]                      │
 *   │  [Submit comment button]             │
 *   ├──────────────────────────────────────┤
 *   │  Rolling issue summary (collapsed)   │
 *   │  [details — hidden by default]       │
 *   └──────────────────────────────────────┘
 *
 * Rerun semantics:
 *   - Always operates on the latest session state.
 *   - Automatically reuses the system-managed rolling issue summary.
 *   - Unanchored comments are accepted and stored at the current iteration.
 */

import { useState, useCallback, useRef } from 'react'
import type { ProtocolIdeSession } from './types'
import type { IssueCardRef } from './ProtocolIdeGraphReviewSurface'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anchor target for a feedback comment. */
export type CommentAnchorTarget =
  | { type: 'none' }
  | { type: 'graphNode'; nodeId: string; label: string }
  | { type: 'evidenceCitation'; citationId: string; label: string }

/** A feedback comment submitted by the user. */
export interface FeedbackComment {
  id: string
  text: string
  anchor: CommentAnchorTarget
  createdAt: string
}

/** Props for the action rail. */
export interface ProtocolIdeActionRailProps {
  /** The current Protocol IDE session. */
  session: ProtocolIdeSession
  /** Current directive text (controlled). */
  directiveText: string
  /** Callback when directive text changes. */
  onDirectiveChange: (text: string) => void
  /** Current feedback comment text (controlled). */
  commentText: string
  /** Callback when feedback comment text changes. */
  onCommentChange: (text: string) => void
  /** Callback when the user submits a rerun. */
  onRerun: () => void
  /** Callback when the user submits a feedback comment. */
  onSubmitComment: (comment: FeedbackComment) => void
  /** Whether a rerun is in progress. */
  isRerunning?: boolean
  /** Whether the rolling issue summary is available. */
  rollingIssueSummary?: string | null
  /** Issue cards that can be used as anchor targets. */
  issueCards?: IssueCardRef[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a simple comment id. */
function generateCommentId(): string {
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Directive editor
// ---------------------------------------------------------------------------

function DirectiveEditor({
  text,
  onChange,
}: {
  text: string
  onChange: (text: string) => void
}): JSX.Element {
  return (
    <section className="action-rail-section" data-testid="action-rail-directive">
      <h3 className="action-rail-section-title">Directive</h3>
      <textarea
        className="action-rail-directive-input"
        data-testid="action-rail-directive-input"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Describe what you want the protocol to do…"
        aria-label="Protocol directive"
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Feedback comment form (manages anchor state internally)
// ---------------------------------------------------------------------------

function FeedbackCommentForm({
  text,
  onChange,
  onAnchorSelect,
  onSubmit,
  issueCards,
}: {
  text: string
  onChange: (text: string) => void
  /** Called when the user selects an anchor target. */
  onAnchorSelect: (target: CommentAnchorTarget) => void
  /** Called when the user submits the comment. */
  onSubmit: () => void
  issueCards?: IssueCardRef[]
}): JSX.Element {
  const [showAnchor, setShowAnchor] = useState(false)
  const [anchorTarget, setAnchorTarget] = useState<CommentAnchorTarget>({ type: 'none' })

  const handleToggleAnchor = useCallback(() => {
    setShowAnchor((prev) => {
      const next = !prev
      if (next) {
        // When opening anchor selector, default to 'none'
        setAnchorTarget({ type: 'none' })
        onAnchorSelect({ type: 'none' })
      }
      return next
    })
  }, [onAnchorSelect])

  const handleSelectAnchor = useCallback(
    (target: CommentAnchorTarget) => {
      setAnchorTarget(target)
      onAnchorSelect(target)
    },
    [onAnchorSelect],
  )

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
            className={`action-rail-anchor-option ${anchorTarget.type === 'none' ? 'active' : ''}`}
            data-testid="action-rail-anchor-none"
            onClick={() => handleSelectAnchor({ type: 'none' })}
          >
            No anchor (freeform)
          </button>
          {issueCards &&
            issueCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`action-rail-anchor-option ${
                  anchorTarget.type === 'graphNode' && anchorTarget.nodeId === card.id ? 'active' : ''
                }`}
                data-testid={`action-rail-anchor-issue-${card.id}`}
                onClick={() =>
                  handleSelectAnchor({
                    type: 'graphNode',
                    nodeId: card.id,
                    label: card.title,
                  })
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

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

function ActionButtons({
  onRerun,
  onSubmitComment,
  isRerunning,
}: {
  onRerun: () => void
  onSubmitComment: () => void
  isRerunning?: boolean
}): JSX.Element {
  return (
    <div className="action-rail-actions" data-testid="action-rail-actions">
      <button
        className="action-rail-btn action-rail-btn--primary"
        data-testid="action-rail-rerun"
        onClick={onRerun}
        disabled={isRerunning}
        aria-label="Rerun with latest state"
      >
        {isRerunning ? 'Rerunning…' : '▶ Rerun'}
      </button>
      <button
        className="action-rail-btn action-rail-btn--secondary"
        data-testid="action-rail-submit-comment"
        onClick={onSubmitComment}
        aria-label="Submit feedback comment"
      >
        💬 Submit Comment
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rolling issue summary (collapsed by default — behind the scenes)
// ---------------------------------------------------------------------------

function RollingIssueSummary({
  summary,
}: {
  summary?: string | null
}): JSX.Element | null {
  if (!summary) return null

  return (
    <details className="action-rail-section action-rail-section--summary" data-testid="action-rail-rolling-summary">
      <summary className="action-rail-section-title">
        Rolling Issue Summary (system-managed)
      </summary>
      <div className="action-rail-summary-content" data-testid="action-rail-summary-content">
        <p className="action-rail-summary-text">{summary}</p>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Main Action Rail
// ---------------------------------------------------------------------------

export function ProtocolIdeActionRail({
  session,
  directiveText,
  onDirectiveChange,
  commentText,
  onCommentChange,
  onRerun,
  onSubmitComment,
  isRerunning = false,
  rollingIssueSummary,
  issueCards = [],
}: ProtocolIdeActionRailProps): JSX.Element {
  // Use a ref to track the current anchor state from the form
  const anchorRef = useRef<CommentAnchorTarget>({ type: 'none' })

  // Expose a setter that the form can call to update the anchor
  const handleAnchorSelect = useCallback((target: CommentAnchorTarget) => {
    anchorRef.current = target
  }, [])

  const handleCommentSubmit = useCallback(() => {
    if (!commentText.trim()) return
    const comment: FeedbackComment = {
      id: generateCommentId(),
      text: commentText.trim(),
      anchor: anchorRef.current,
      createdAt: new Date().toISOString(),
    }
    onSubmitComment(comment)
  }, [commentText, onSubmitComment])

  return (
    <aside
      className="protocol-ide-action-rail"
      role="complementary"
      aria-label="Rerun and feedback actions"
      data-testid="protocol-ide-action-rail"
    >
      <h2 className="protocol-ide-rail-title">Rerun &amp; Feedback</h2>

      {/* Directive editor */}
      <DirectiveEditor
        text={directiveText}
        onChange={onDirectiveChange}
      />

      {/* Feedback comment form */}
      <FeedbackCommentForm
        text={commentText}
        onChange={onCommentChange}
        onAnchorSelect={handleAnchorSelect}
        onSubmit={handleCommentSubmit}
        issueCards={issueCards}
      />

      {/* Action buttons */}
      <ActionButtons
        onRerun={onRerun}
        onSubmitComment={handleCommentSubmit}
        isRerunning={isRerunning}
      />

      {/* Rolling issue summary — collapsed, behind the scenes */}
      <RollingIssueSummary summary={rollingIssueSummary} />

      {/* Inline styles */}
      <style>{`
        .protocol-ide-action-rail {
          padding: 1rem;
          overflow-y: auto;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .protocol-ide-rail-title {
          font-size: 1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.25rem 0;
        }

        .action-rail-section {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .action-rail-section-title {
          font-size: 0.82rem;
          font-weight: 600;
          color: #495057;
          margin: 0;
        }

        .action-rail-directive-input,
        .action-rail-comment-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
          font-family: inherit;
          resize: vertical;
          color: #212529;
          background: #fff;
        }

        .action-rail-directive-input:focus,
        .action-rail-comment-input:focus {
          outline: none;
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.15);
        }

        .action-rail-anchor-toggle {
          margin-top: 0.25rem;
        }

        .action-rail-anchor-btn {
          background: none;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 0.25rem 0.5rem;
          font-size: 0.78rem;
          color: #495057;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .action-rail-anchor-btn:hover {
          background: #f1f3f5;
        }

        .action-rail-anchor-selector {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-top: 0.25rem;
          padding: 0.25rem;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .action-rail-anchor-option {
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 3px;
          padding: 0.3rem 0.5rem;
          font-size: 0.78rem;
          color: #495057;
          cursor: pointer;
          text-align: left;
          width: 100%;
        }

        .action-rail-anchor-option:hover {
          background: #e7f5ff;
        }

        .action-rail-anchor-option.active {
          background: #e7f5ff;
          border-color: #228be6;
          color: #1971c2;
          font-weight: 600;
        }

        .action-rail-actions {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .action-rail-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 0.8rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s;
          width: 100%;
        }

        .action-rail-btn--primary {
          background: #228be6;
          color: #fff;
          border-color: #1971c2;
        }

        .action-rail-btn--primary:hover:not(:disabled) {
          background: #1971c2;
        }

        .action-rail-btn--primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .action-rail-btn--secondary {
          background: #fff;
          color: #495057;
          border-color: #dee2e6;
        }

        .action-rail-btn--secondary:hover {
          background: #f1f3f5;
        }

        .action-rail-section--summary {
          border-top: 1px solid #e9ecef;
          padding-top: 0.5rem;
        }

        .action-rail-section--summary summary {
          cursor: pointer;
          font-size: 0.78rem;
          color: #6c757d;
        }

        .action-rail-summary-content {
          margin-top: 0.4rem;
          padding: 0.4rem;
          background: #f8f9fa;
          border-radius: 4px;
          font-size: 0.78rem;
          color: #495057;
        }

        .action-rail-summary-text {
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </aside>
  )
}
