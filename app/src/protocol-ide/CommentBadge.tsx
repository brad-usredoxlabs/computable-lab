/**
 * CommentBadge — renders a comment badge based on its primary anchor.
 * Shows auxiliary anchor count when anchors.length > 1.
 */

import type { CommentAnchor, FeedbackComment } from './ProtocolIdeGraphReviewSurface'

// ---------------------------------------------------------------------------
// Comment badge component
// ---------------------------------------------------------------------------

export function CommentBadge({
  comment,
}: {
  comment: FeedbackComment
}): JSX.Element {
  const primary = comment.anchors[0]
  const auxCount = comment.anchors.length - 1

  if (!primary) {
    // No anchor — render a generic comment badge
    return (
      <span
        className="protocol-ide-comment-badge"
        data-testid={`comment-badge-${comment.id}`}
        title="Unanchored comment"
      >
        💬
      </span>
    )
  }

  const auxLabel = auxCount > 0 ? ` +${auxCount}` : ''
  const auxTitle = auxCount > 0
    ? comment.anchors.slice(1).map((a) => a.kind).join(', ')
    : undefined

  if (primary.kind === 'node') {
    return (
      <span
        className="protocol-ide-comment-badge protocol-ide-comment-badge--node"
        data-testid={`comment-badge-node-${primary.semanticKey}`}
        title={`Node anchor: ${primary.semanticKey}${auxTitle ? ` (${auxTitle})` : ''}`}
      >
        💬{auxLabel}
      </span>
    )
  }

  if (primary.kind === 'phase') {
    return (
      <span
        className="protocol-ide-comment-badge protocol-ide-comment-badge--phase"
        data-testid={`comment-badge-phase-${primary.phaseId}`}
        title={`Phase anchor: ${primary.phaseId}${auxTitle ? ` (${auxTitle})` : ''}`}
      >
        💬{auxLabel}
      </span>
    )
  }

  // source anchor
  return (
    <span
      className="protocol-ide-comment-badge protocol-ide-comment-badge--source"
      data-testid={`comment-badge-source-${primary.documentRef}`}
      title={`Source anchor: ${primary.documentRef}${auxTitle ? ` (${auxTitle})` : ''}`}
    >
      💬{auxLabel}
    </span>
  )
}
