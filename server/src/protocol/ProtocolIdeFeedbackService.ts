/**
 * ProtocolIdeFeedbackService — manages feedback intake and rolling issue
 * summaries for Protocol IDE sessions.
 *
 * This service is responsible for:
 * - Accepting freeform feedback comments with optional anchors[]
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
 * Discriminated union of anchor kinds.
 * Mirrors the schema from spec-016.
 */
export type Anchor =
  | { kind: 'node'; semanticKey: string; instanceId?: string; snapshot: Record<string, unknown> }
  | { kind: 'source'; documentRef: string; page: number; region?: { x: number; y: number; width: number; height: number } }
  | { kind: 'phase'; phaseId: string };

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
  /** Anchor array (replaces the old graphAnchor/sourceAnchor fields) */
  anchors: Anchor[];
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
 * Caller-supplied anchor (snapshot is optional for node anchors;
 * the service fills it in from the event graph).
 */
type CallerAnchor =
  | { kind: 'node'; semanticKey: string; instanceId?: string; snapshot?: Record<string, unknown> }
  | { kind: 'source'; documentRef: string; page: number; region?: { x: number; y: number; width: number; height: number } }
  | { kind: 'phase'; phaseId: string };

/**
 * Request body for submitting feedback.
 */
export interface SubmitFeedbackRequest {
  /** Freeform comment body (required) */
  body: string;
  /** Anchor array (required — must contain at least one anchor) */
  anchors: CallerAnchor[];
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
 * Build a short anchor description for inclusion in the rolling summary.
 */
function buildAnchorInfo(comment: FeedbackComment): string {
  const parts: string[] = [];
  for (const anchor of comment.anchors) {
    switch (anchor.kind) {
      case 'node':
        parts.push(`[${anchor.semanticKey}]`);
        break;
      case 'source':
        parts.push(`[${anchor.documentRef}:p${anchor.page}]`);
        break;
      case 'phase':
        parts.push(`[phase:${anchor.phaseId}]`);
        break;
    }
  }
  return parts.join(' ');
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
    const anchorSuffix = anchorInfo ? ` ${anchorInfo}` : '';
    return `${severityTag}${c.body}${anchorSuffix}`;
  });

  return {
    summary: lines.join('\n'),
    updatedAt: new Date().toISOString(),
    commentCount: comments.length,
  };
}

/**
 * Extract feedback comments from a session envelope's payload.
 * Skips entries that lack the new anchors[] field (malformed).
 */
function extractCommentsFromEnvelope(
  envelope: RecordEnvelope,
): FeedbackComment[] {
  const payload = envelope.payload as Record<string, unknown>;
  const raw = payload.feedbackComments;
  if (!Array.isArray(raw)) {
    return [];
  }
  const comments: FeedbackComment[] = [];
  for (const item of raw) {
    if (
      item === null ||
      typeof item !== 'object' ||
      !Array.isArray((item as Record<string, unknown>).anchors)
    ) {
      console.warn('Skipping malformed feedback comment (missing anchors[])');
      continue;
    }
    comments.push(item as unknown as FeedbackComment);
  }
  return comments;
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

/**
 * Look up an event-graph snapshot by semanticKey.
 *
 * Reads the session's `latestEventGraphRef`, fetches that event-graph record,
 * and finds the event whose `semanticKey` matches the requested key.
 * Returns the event's payload as the snapshot, or null if not found.
 */
async function lookupEventGraphSnapshot(
  store: RecordStore,
  sessionId: string,
  semanticKey: string,
): Promise<Record<string, unknown> | null> {
  // Fetch the session to get latestEventGraphRef
  const sessionEnvelope = await store.get(sessionId);
  if (!sessionEnvelope) {
    return null;
  }
  const sessionPayload = sessionEnvelope.payload as Record<string, unknown>;
  const eventGraphRef = sessionPayload.latestEventGraphRef as string | undefined;
  if (!eventGraphRef) {
    return null;
  }

  // Fetch the event-graph record
  const graphEnvelope = await store.get(eventGraphRef);
  if (!graphEnvelope) {
    return null;
  }

  const graphPayload = graphEnvelope.payload as Record<string, unknown>;
  const events = graphPayload.events as Array<{ semanticKey?: string; payload?: Record<string, unknown> }> | undefined;
  if (!Array.isArray(events)) {
    return null;
  }

  // Find the event matching the semanticKey
  for (const event of events) {
    if (event.semanticKey === semanticKey) {
      return event.payload ?? null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeFeedbackService {
  constructor(private store: RecordStore) {}

  /**
   * Submit a feedback comment for the given session.
   *
   * - If the comment has anchors, they are retained with that anchor data.
   * - If the comment has no anchors, it attaches to the session iteration as a whole.
   * - The rolling issue summary is recomputed and persisted.
   *
   * For node anchors without a snapshot, the service looks up the snapshot
   * from the session's latestEventGraphRef event-graph payload.
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

    // Validate anchors — must be non-empty
    if (!request.anchors || request.anchors.length === 0) {
      throw new Error('Feedback must include at least one anchor');
    }

    // Fetch the current session
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    // Extract existing comments
    const existingComments = extractCommentsFromEnvelope(envelope);

    // Build the anchors array, filling in snapshots for node anchors
    const anchors: Anchor[] = [];
    for (const callerAnchor of request.anchors) {
        if (callerAnchor.kind === 'node') {
          if (callerAnchor.snapshot) {
            // Caller supplied snapshot — use it directly
            anchors.push({
              kind: 'node',
              semanticKey: callerAnchor.semanticKey,
              instanceId: callerAnchor.instanceId,
              snapshot: callerAnchor.snapshot,
            });
          } else {
            // Look up snapshot from event graph
            const snapshot = await lookupEventGraphSnapshot(
              this.store,
              sessionId,
              callerAnchor.semanticKey,
            );
            if (snapshot === null) {
              throw new Error(
                `no event-graph node found for semanticKey ${callerAnchor.semanticKey}`,
              );
            }
            anchors.push({
              kind: 'node',
              semanticKey: callerAnchor.semanticKey,
              instanceId: callerAnchor.instanceId,
              snapshot,
            });
          }
        } else if (callerAnchor.kind === 'source') {
          anchors.push({
            kind: 'source',
            documentRef: callerAnchor.documentRef,
            page: callerAnchor.page,
            region: callerAnchor.region,
          });
        } else if (callerAnchor.kind === 'phase') {
          anchors.push({
            kind: 'phase',
            phaseId: callerAnchor.phaseId,
          });
        }
    }

    // Create the new comment
    const newComment: FeedbackComment = {
      id: generateFeedbackId(),
      body: request.body.trim(),
      anchors,
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
