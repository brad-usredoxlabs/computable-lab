/**
 * ProtocolIdeHandlers — HTTP handlers for Protocol IDE session management.
 *
 * Provides endpoints for:
 * - Creating a new Protocol IDE session from an intake request
 * - Rejecting attempts to attach a second source to an existing session
 * - Returning shell-ready session metadata
 * - Submitting feedback comments with optional graph/source anchors
 * - Retrieving the rolling issue summary for a session
 * - Generating on-demand issue cards from user feedback and system diagnostics
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { ProtocolIdeSessionService } from '../../protocol/ProtocolIdeSessionService.js';
import { validateIntakeRequest } from '../../protocol/ProtocolIdeIntakeContracts.js';
import {
  ProtocolIdeFeedbackService,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
  type GetRollingSummaryResponse,
} from '../../protocol/ProtocolIdeFeedbackService.js';
import {
  ProtocolIdeIssueCardService,
  type GenerateIssueCardsResponse,
  type GetIssueCardsResponse,
} from '../../protocol/ProtocolIdeIssueCardService.js';
import {
  ProtocolIdeRalphExportService,
  type ExportIssueCardsResponse,
  type CanExportResponse,
} from '../../protocol/ProtocolIdeRalphExportService.js';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/**
 * Response shape returned by the session creation endpoint.
 * Shell-ready fields for routing and display.
 */
export interface ProtocolIdeSessionCreateResponse {
  success: true;
  sessionId: string;
  status: string;
  sourceSummary: string;
  latestDirectiveText: string;
  sourceEvidenceRef: null;
  graphReviewRef: null;
  issueCardsRef: null;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createProtocolIdeHandlers(ctx: AppContext) {
  const sessionService = new ProtocolIdeSessionService(ctx.store);
  const feedbackService = new ProtocolIdeFeedbackService(ctx.store);
  const issueCardService = new ProtocolIdeIssueCardService(ctx.store);
  const exportService = new ProtocolIdeRalphExportService(ctx.store);

  return {
    /**
     * POST /protocol-ide/sessions
     *
     * Create a new Protocol IDE session from an intake request.
     *
     * The intake request must contain:
     * - `directiveText`: a non-empty string
     * - `source`: exactly one source mode (vendor_document, pasted_url, uploaded_pdf)
     *
     * A new session is always created — the handler does NOT append a second
     * source to an existing session.
     *
     * Returns shell-ready session metadata for the IDE shell to route to.
     */
    async createSession(
      request: FastifyRequest<{
        Body: {
          directiveText?: string;
          source?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<ProtocolIdeSessionCreateResponse | ApiError> {
      // Validate the intake payload
      const validation = validateIntakeRequest(request.body);

      if (!validation.valid) {
        reply.status(400);
        return {
          error: 'INVALID_INTAKE',
          message: validation.error,
        };
      }

      const { request: intake } = validation;

      // Check if a session already exists for this source hint
      // (e.g., vendor_document may carry a sessionIdHint)
      if (
        intake.source.sourceKind === 'vendor_document' &&
        intake.source.sessionIdHint
      ) {
        const existing = await sessionService.getSessionByHint(
          intake.source.sessionIdHint,
        );
        if (existing) {
          reply.status(409);
          return {
            error: 'SESSION_EXISTS',
            message: `A session already exists for source hint '${intake.source.sessionIdHint}'. Create a new session instead.`,
          };
        }
      }

      // Bootstrap the session
      try {
        const shell = await sessionService.bootstrapSession(intake);

        reply.status(201);
        return {
          success: true,
          sessionId: shell.sessionId,
          status: shell.status,
          sourceSummary: shell.sourceSummary,
          latestDirectiveText: shell.latestDirectiveText,
          sourceEvidenceRef: shell.sourceEvidenceRef,
          graphReviewRef: shell.graphReviewRef,
          issueCardsRef: shell.issueCardsRef,
        };
      } catch (err) {
        reply.status(500);
        return {
          error: 'SESSION_CREATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /protocol-ide/sessions/:sessionId/feedback
     *
     * Submit a feedback comment for the given session.
     *
     * The comment body is required. Graph and source anchors are optional.
     * Unanchored comments attach to the session iteration as a whole.
     *
     * Returns the submitted feedback ID and the updated rolling summary.
     */
    async submitFeedback(
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: SubmitFeedbackRequest;
      }>,
      reply: FastifyReply,
    ): Promise<SubmitFeedbackResponse | ApiError> {
      const { sessionId } = request.params;
      const feedbackRequest = request.body;

      try {
        const result = await feedbackService.submitFeedback(sessionId, feedbackRequest);

        reply.status(201);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        if (message.includes('non-empty string')) {
          reply.status(400);
          return {
            error: 'INVALID_FEEDBACK',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'FEEDBACK_SUBMIT_FAILED',
          message,
        };
      }
    },

    /**
     * GET /protocol-ide/sessions/:sessionId/rolling-summary
     *
     * Retrieve the current rolling issue summary for the given session.
     *
     * Returns the compressed summary text, last-updated timestamp, and
     * comment count.
     */
    async getRollingSummary(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<GetRollingSummaryResponse | ApiError> {
      const { sessionId } = request.params;

      try {
        const result = await feedbackService.getRollingSummary(sessionId);

        reply.status(200);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'ROLLING_SUMMARY_FETCH_FAILED',
          message,
        };
      }
    },

    /**
     * POST /protocol-ide/sessions/:sessionId/generate-issue-cards
     *
     * Generate on-demand issue cards from the latest user feedback,
     * rolling issue summary, and system diagnostics.
     *
     * This action:
     * - Reads feedback comments, rolling summary, and overlay summaries
     * - Derives compact diagnostics from overlay summaries
     * - Generates user, system, and mixed-origin cards
     * - REPLACES the current card set (no historical accumulation)
     *
     * Returns the generated issue cards.
     */
    async generateIssueCards(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<GenerateIssueCardsResponse | ApiError> {
      const { sessionId } = request.params;

      try {
        const result = await issueCardService.generateIssueCards(sessionId);

        reply.status(200);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'ISSUE_CARDS_GENERATION_FAILED',
          message,
        };
      }
    },

    /**
     * GET /protocol-ide/sessions/:sessionId/issue-cards
     *
     * Retrieve the current issue-card set for the given session.
     *
     * Returns the issue cards with their titles, bodies, origins,
     * evidence citations, and suggested compiler-change language.
     */
    async getIssueCards(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<GetIssueCardsResponse | ApiError> {
      const { sessionId } = request.params;

      try {
        const result = await issueCardService.getIssueCards(sessionId);

        reply.status(200);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'ISSUE_CARDS_FETCH_FAILED',
          message,
        };
      }
    },

    /**
     * POST /protocol-ide/sessions/:sessionId/export-issue-cards
     *
     * Export all current issue cards into Ralph-compatible spec drafts.
     *
     * This action:
     * - Reads all current issue cards from the session
     * - Generates one spec draft per card (multi-spec, not monolithic)
     * - Each draft carries source context, directive context, evidence citations,
     *   and requested compiler changes
     * - Clears the current issue-card set from the session
     * - Retains only summary export metadata on the session
     *
     * Returns the export bundle with all spec drafts.
     */
    async exportIssueCards(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<ExportIssueCardsResponse | ApiError> {
      const { sessionId } = request.params;

      try {
        const result = await exportService.exportIssueCards(sessionId);

        reply.status(200);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        if (message.includes('No issue cards')) {
          reply.status(400);
          return {
            error: 'NO_ISSUE_CARDS',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'EXPORT_FAILED',
          message,
        };
      }
    },

    /**
     * GET /protocol-ide/sessions/:sessionId/can-export
     *
     * Check whether a session has exportable issue cards.
     *
     * Returns whether cards can be exported and how many.
     */
    async canExport(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<CanExportResponse | ApiError> {
      const { sessionId } = request.params;

      try {
        const result = await exportService.canExport(sessionId);

        reply.status(200);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('not found')) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message,
          };
        }

        reply.status(500);
        return {
          error: 'CAN_EXPORT_CHECK_FAILED',
          message,
        };
      }
    },
  };
}

export type ProtocolIdeHandlers = ReturnType<typeof createProtocolIdeHandlers>;
