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
import {
  ProtocolIdeSourceImportService,
  type SourceImportRequest,
} from '../../protocol/ProtocolIdeSourceImportService.js';
import { ProtocolIdeProjectionService } from '../../protocol/ProtocolIdeProjectionService.js';
import {
  ProtocolIdeOverlaySummaryService,
  type OverlaySummaries,
} from '../../protocol/ProtocolIdeOverlaySummaryService.js';
import type { TerminalArtifacts } from '../../compiler/pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../../compiler/state/LabState.js';
import { getCuratedVendorRegistry } from '../../registry/CuratedVendorRegistry.js';

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
  sourceEvidenceRef: string | null;
  graphReviewRef: string | null;
  issueCardsRef: null;
  importWarning?: string;
  projectionWarning?: string;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createProtocolIdeHandlers(ctx: AppContext) {
  const sessionService = new ProtocolIdeSessionService(ctx.store);
  const sourceImportService = new ProtocolIdeSourceImportService(ctx.store);
  const projectionService = new ProtocolIdeProjectionService(ctx.store);
  const feedbackService = new ProtocolIdeFeedbackService(ctx.store);
  const issueCardService = new ProtocolIdeIssueCardService(ctx.store);
  const exportService = new ProtocolIdeRalphExportService(ctx.store);
  const overlayService = new ProtocolIdeOverlaySummaryService();

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

      // Extract enableThinking for forwarding to downstream services
      const enableThinking = intake.enableThinking;

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

        // Chain importSource synchronously — wait for it before responding
        let sourceEvidenceRef: string | null = null;
        let importWarning: string | undefined

        try {
          const importReq: SourceImportRequest = {
            sessionId: shell.sessionId,
            sourceKind: intake.source.sourceKind,
            ...(enableThinking !== undefined ? { enableThinking } : {}),
          }
          if (intake.source.sourceKind === 'vendor_document') {
            importReq.vendor = {
              vendor: intake.source.vendor as string,
              title: intake.source.title,
              landingUrl: intake.source.landingUrl,
              ...(intake.source.pdfUrl !== undefined && { pdfUrl: intake.source.pdfUrl }),
              ...(intake.source.snippet !== undefined && { snippet: intake.source.snippet }),
            }
          } else if (intake.source.sourceKind === 'pasted_url') {
            importReq.pastedUrl = intake.source.url
          } else if (intake.source.sourceKind === 'uploaded_pdf') {
            importReq.upload = {
              fileName: intake.source.fileName,
              mediaType: intake.source.mediaType,
              contentBase64: intake.source.contentBase64,
            }
          }
          const result = await sourceImportService.importSource(importReq)
          sourceEvidenceRef = result.protocolImportRef ?? result.vendorDocumentRef ?? null
        } catch (err) {
          importWarning = err instanceof Error ? err.message : String(err)
        }

        // Chain runProjection — only when there is source evidence to project against
        let graphReviewRef: string | null = null;
        let projectionWarning: string | undefined

        if (sourceEvidenceRef !== null || intake.source.sourceKind === 'vendor_document') {
          try {
            // Read session payload to extract rollingIssueSummary and source refs
            const sessionEnvelope = await sessionService.getSession(shell.sessionId);
            const sessionPayload = sessionEnvelope?.payload as Record<string, unknown> | undefined;
            const rollingIssueSummary = (sessionPayload?.rollingIssueSummary as string) ?? '';
            const evidenceRefs = (sessionPayload?.evidenceRefs as string[]) ?? [];
            const evidenceCitations = (sessionPayload?.evidenceCitations as Array<{ evidenceRef: string; description: string; sourceLocation?: string }>) ?? [];

            const sourceRefs: Array<{ recordId: string; label: string; kind: string }> = [];
            for (const ref of evidenceRefs) {
              sourceRefs.push({ recordId: ref, label: ref, kind: 'evidence' });
            }
            for (const cit of evidenceCitations) {
              sourceRefs.push({ recordId: cit.evidenceRef, label: cit.description, kind: 'citation' });
            }

            const projection = await projectionService.executeProjection({
              sessionRef: shell.sessionId,
              directiveText: intake.directiveText,
              rollingIssueSummary,
              sourceRefs,
              ...(enableThinking !== undefined ? { enableThinking } : {}),
            });
            if (projection.status === 'success' || projection.status === 'partial') {
              graphReviewRef = projection.eventGraphData.recordId
            } else {
              projectionWarning = `projection status ${projection.status}`
            }
          } catch (err) {
            projectionWarning = err instanceof Error ? err.message : String(err)
          }
        }

        reply.status(201);
        return {
          success: true,
          sessionId: shell.sessionId,
          status: shell.status,
          sourceSummary: shell.sourceSummary,
          latestDirectiveText: shell.latestDirectiveText,
          sourceEvidenceRef,
          graphReviewRef,
          issueCardsRef: shell.issueCardsRef,
          ...(importWarning ? { importWarning } : {}),
          ...(projectionWarning ? { projectionWarning } : {}),
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

    /**
     * POST /protocol-ide/sessions/:sessionId/rerun
     *
     * Re-run the projection for the given session with an optional new
     * directive text.  Calls `projectionService.executeProjection` and
     * persists the result.
     *
     * Returns `{ success: true, graphReviewRef: <eventGraphData.recordId> }`.
     */
    async rerunSession(
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { directiveText?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; graphReviewRef: string | null } | ApiError> {
      const { sessionId } = request.params;
      const { directiveText } = request.body;

      try {
        // Read session to extract rollingIssueSummary and source refs
        const sessionEnvelope = await sessionService.getSession(sessionId);

        if (!sessionEnvelope) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message: `Session '${sessionId}' not found`,
          };
        }

        const payload = sessionEnvelope.payload as Record<string, unknown>;
        const rollingIssueSummary = (payload.rollingIssueSummary as string) ?? '';
        const evidenceRefs = (payload.evidenceRefs as string[]) ?? [];
        const evidenceCitations = (payload.evidenceCitations as Array<{ evidenceRef: string; description: string; sourceLocation?: string }>) ?? [];

        const sourceRefs: Array<{ recordId: string; label: string; kind: string }> = [];
        for (const ref of evidenceRefs) {
          sourceRefs.push({ recordId: ref, label: ref, kind: 'evidence' });
        }
        for (const cit of evidenceCitations) {
          sourceRefs.push({ recordId: cit.evidenceRef, label: cit.description, kind: 'citation' });
        }

        const projection = await projectionService.executeProjection({
          sessionRef: sessionId,
          directiveText: directiveText ?? '',
          rollingIssueSummary,
          sourceRefs,
        });

        const graphReviewRef =
          projection.status === 'success' || projection.status === 'partial'
            ? projection.eventGraphData.recordId
            : null;

        reply.status(200);
        return { success: true, graphReviewRef };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'RERUN_FAILED',
          message,
        };
      }
    },

    /**
     * GET /protocol-ide/sessions/:sessionId/overlay-summaries
     *
     * Derive and return overlay summaries (deck, tools, reagents, budget)
     * for the given session.
     *
     * When the session has no projected artifacts yet (no
     * `latestEventGraphRef`), returns `{ success: true, deck: null, tools: null,
     * reagents: null, budget: null }`.
     *
     * When `latestTerminalArtifacts` is not yet populated (v1 projection
     * persists only refs), also returns null summaries — no error.
     */
    async getOverlaySummaries(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; deck: OverlaySummaries['deck'] | null; tools: OverlaySummaries['tools'] | null; reagents: OverlaySummaries['reagents'] | null; budget: OverlaySummaries['budget'] | null } | ApiError> {
      const { sessionId } = request.params;

      try {
        const envelope = await sessionService.getSession(sessionId);

        if (!envelope) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message: `Session '${sessionId}' not found`,
          };
        }

        const payload = envelope.payload as Record<string, unknown>;

        // No projection yet — return null summaries
        if (!payload.latestEventGraphRef) {
          return { success: true, deck: null, tools: null, reagents: null, budget: null };
        }

        // v1 projection may not persist artifacts — fall through to null
        const artifacts = payload.latestTerminalArtifacts as TerminalArtifacts | undefined;
        if (!artifacts) {
          return { success: true, deck: null, tools: null, reagents: null, budget: null };
        }

        const labState = payload.latestLabState as LabStateSnapshot | undefined;
        const summaries = overlayService.derive(artifacts, labState);

        return { success: true, ...summaries };
      } catch (err) {
        reply.status(500);
        return {
          error: 'OVERLAY_DERIVE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /protocol-ide/sessions/:sessionId/event-graph
     *
     * Return the event-graph data (events, labwares, deck placements)
     * for the given session.
     *
     * When the session has no projection yet (no `latestEventGraphRef`),
     * returns `{ success: true, events: [], labwares: [], deckPlacements: [] }`.
     *
     * When `latestTerminalArtifacts` is not yet populated (v1 projection
     * persists only refs), returns empty arrays — no error.
     */
    async getEventGraph(
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; events: unknown[]; labwares: unknown[]; deckPlacements: unknown[] } | ApiError> {
      const { sessionId } = request.params;

      try {
        const envelope = await sessionService.getSession(sessionId);

        if (!envelope) {
          reply.status(404);
          return {
            error: 'SESSION_NOT_FOUND',
            message: `Session '${sessionId}' not found`,
          };
        }

        const payload = envelope.payload as Record<string, unknown>;

        // No projection yet — return empty arrays
        if (!payload.latestEventGraphRef) {
          return { success: true, events: [], labwares: [], deckPlacements: [] };
        }

        // v1 projection may not persist artifacts — fall through to empty arrays
        const artifacts = payload.latestTerminalArtifacts as TerminalArtifacts | undefined;
        const labState = payload.latestLabState as LabStateSnapshot | undefined;

        return {
          success: true,
          events: artifacts?.events ?? [],
          labwares: Object.values(labState?.labware ?? {}),
          deckPlacements: labState?.deck ?? [],
        };
      } catch (err) {
        reply.status(500);
        return {
          error: 'EVENT_GRAPH_FETCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /protocol-ide/curated-vendors
     *
     * Return the list of enabled curated vendors.
     *
     * Returns `{ success: true, vendors: Array<{ vendor: string, label: string }> }`.
     */
    async getCuratedVendors(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<{ success: true; vendors: Array<{ vendor: string; label: string }> } | ApiError> {
      try {
        const vendors = getCuratedVendorRegistry().list();
        reply.status(200);
        return {
          success: true,
          vendors: vendors.map((v: { id: string; display_name: string }) => ({ vendor: v.id, label: v.display_name })),
        };
      } catch (err) {
        reply.status(500);
        return {
          error: 'CURATED_VENDORS_FETCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export type ProtocolIdeHandlers = ReturnType<typeof createProtocolIdeHandlers>;
