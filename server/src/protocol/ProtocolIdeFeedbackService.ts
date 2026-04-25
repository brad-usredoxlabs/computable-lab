/**
 * ProtocolIdeFeedbackService — manages feedback intake and rolling issue
 * summaries for Protocol IDE sessions.
 *
 * This service is responsible for:
 * - Accepting freeform feedback comments with optional graph/source anchors
 * - Attaching unanchored comments to the current session iteration
 * - Maintaining a system-managed rolling issue summary
 * - Making the rolling summary available to future reruns
 *
 * v1 intentionally avoids:
 * - Required verdict enums (correct/partial/incorrect)
 * - Immutable feedback timelines
 * - User-editable rolling summaries
 */

import type { RecordStore, StoreResult } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

// ---------------------------------------------------------------------------
// Feedback types
// ---------------------------------------------------------------------------

/**
 * Anchor pointing to a node in the event-graph.
 */
export interface GraphAnchor {
  /** The event-graph node ID (e.g. "add_material-001") */
  nodeId: string;
  /** Optional label describing what the anchor refers to */
  label?: string;
}

/**
 * Anchor pointing to a source document snippet.
 */
export interface SourceAnchor {
  /** Source document reference (e.g. vendor document ID, PDF URL) */
  sourceRef: string;
  /** Optional snippet or excerpt from the source */
  snippet?: string;
  /** Optional page or line number */
  page?: number;
}

/**
 * Severity levels for feedback comments.
 * Optional — callers may omit this field.
 */
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single feedback comment submitted by the user.
 */
export interface FeedbackComment {
  /** Unique identifier for this comment */
  id: string;
  /** Freeform comment body */
  body: string;
  /** Optional graph anchor */
  graphAnchor?: GraphAnchor;
  /** Optional source anchor */
  sourceAnchor?: SourceAnchor;
  /** Optional severity/importance */
  severity?: FeedbackSeverity;
  /** ISO 8601 timestamp of submission */
  submittedAt: string;
}

/**
 * Shape of the rolling issue summary stored on the session.
 * System-managed — not user-editable in v1.
 */
export interface RollingIssueSummary {
  /** The compressed summary text */
  summary: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Count of comments incorporated */
  commentCount: number;
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/**
 * Request body for submitting feedback.
 */
export interface SubmitFeedbackRequest {
  /** Freeform comment body (required) */
  body: string;
  /** Optional graph anchor */
  graphAnchor?: GraphAnchor;
  /** Optional source anchor */
  sourceAnchor?: SourceAnchor;
  /** Optional severity */
  severity?: FeedbackSeverity;
}

/**
 * Response after successfully submitting feedback.
 */
export interface SubmitFeedbackResponse {
  success: true;
  feedbackId: string;
  rollingSummary: RollingIssueSummary;
}

/**
 * Response shape for retrieving the current rolling summary.
 */
export interface GetRollingSummaryResponse {
  success: true;
  rollingSummary: RollingIssueSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique feedback comment ID.
 */
function generateFeedbackId(): string {
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build a rolling issue summary from a list of feedback comments.
 *
 * The summary is a simple concatenation of comment bodies with severity
 * indicators, designed to be consumed as hidden context by future reruns.
 */
function buildRollingSummary(comments: FeedbackComment[]): RollingIssueSummary {
  if (comments.length === 0) {
    return {
      summary: '',
      updatedAt: new Date().toISOString(),
      commentCount: 0,
    };
  }

  const lines = comments.map((c) => {
    const severityTag = c.severity ? `[${c.severity}] ` : '';
    const anchorInfo = buildAnchorInfo(c);
    return `${severityTag}${c.body}${anchorInfo}`;
  });

  return {
    summary: lines.join('\n'),
    updatedAt: new Date().toISOString(),
    commentCount: comments.length,
  };
}

/**
 * Build a short anchor description for inclusion in the rolling summary.
 */
function buildAnchorInfo(comment: FeedbackComment): string {
  const parts: string[] = [];
  if (comment.graphAnchor) {
    parts.push(
      ` [graph:${comment.graphAnchor.nodeId}${
        comment.graphAnchor.label ? ` (${comment.graphAnchor.label})` : ''
      }]`,
    );
  }
  if (comment.sourceAnchor) {
    parts.push(
      ` [source:${comment.sourceAnchor.sourceRef}${
        comment.sourceAnchor.page ? ` p.${comment.sourceAnchor.page}` : ''
      }]`,
    );
  }
  return parts.join('');
}

/**
 * Extract feedback comments from a session envelope's payload.
 */
function extractCommentsFromEnvelope(
  envelope: RecordEnvelope,
): FeedbackComment[] {
  const payload = envelope.payload as Record<string, unknown>;
  const raw = payload.feedbackComments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as unknown as FeedbackComment[];
}

/**
 * Extract the rolling issue summary from a session envelope's payload.
 */
function extractRollingSummaryFromEnvelope(
  envelope: RecordEnvelope,
): RollingIssueSummary | null {
  const payload = envelope.payload as Record<string, unknown>;
  const raw = payload.rollingIssueSummary;
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    updatedAt:
      typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    commentCount:
      typeof obj.commentCount === 'number' ? obj.commentCount : 0,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeFeedbackService {
  constructor(private store: RecordStore) {}

  /**
   * Submit a feedback comment for the given session.
   *
   * - If the comment has a graph or source anchor, it is retained with that anchor.
   * - If the comment has no anchor, it attaches to the session iteration as a whole.
   * - The rolling issue summary is recomputed and persisted.
   *
   * @param sessionId — the Protocol IDE session ID
   * @param request — the feedback submission request
   * @returns the submitted feedback ID and the updated rolling summary
   */
  async submitFeedback(
    sessionId: string,
    request: SubmitFeedbackRequest,
  ): Promise<SubmitFeedbackResponse> {
    // Validate the request body
    if (!request.body || request.body.trim().length === 0) {
      throw new Error('Feedback body must be a non-empty string');
    }

    // Fetch the current session
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    // Extract existing comments
    const existingComments = extractCommentsFromEnvelope(envelope);

    // Create the new comment
    const newComment: FeedbackComment = {
      id: generateFeedbackId(),
      body: request.body.trim(),
      graphAnchor: request.graphAnchor,
      sourceAnchor: request.sourceAnchor,
      severity: request.severity,
      submittedAt: new Date().toISOString(),
    };

    // Append to existing comments
    const updatedComments = [...existingComments, newComment];

    // Recompute the rolling summary
    const rollingSummary = buildRollingSummary(updatedComments);

    // Update the session envelope
    const updatedPayload = {
      ...envelope.payload,
      feedbackComments: updatedComments,
      rollingIssueSummary: rollingSummary,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...envelope,
      payload: updatedPayload,
    };

    const result = await this.store.update({
      envelope: updatedEnvelope,
      message: `Add feedback comment ${newComment.id} to session ${sessionId}`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to persist feedback for session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    return {
      success: true,
      feedbackId: newComment.id,
      rollingSummary,
    };
  }

  /**
   * Retrieve the current rolling issue summary for a session.
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns the rolling issue summary
   */
  async getRollingSummary(
    sessionId: string,
  ): Promise<GetRollingSummaryResponse> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const rollingSummary = extractRollingSummaryFromEnvelope(envelope);

    if (!rollingSummary) {
      // Return an empty summary if none exists yet
      return {
        success: true,
        rollingSummary: {
          summary: '',
          updatedAt: new Date().toISOString(),
          commentCount: 0,
        },
      };
    }

    return {
      success: true,
      rollingSummary,
    };
  }

  /**
   * Retrieve all feedback comments for a session.
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns array of feedback comments
   */
  async getFeedbackComments(
    sessionId: string,
  ): Promise<FeedbackComment[]> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    return extractCommentsFromEnvelope(envelope);
  }
}
