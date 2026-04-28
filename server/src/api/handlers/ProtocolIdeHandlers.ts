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
import type { RecordEnvelope } from '../../store/types.js';
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
import { runPromotionCompile } from '../../compiler/pipeline/PromotionCompileRunner.js';
import { buildSemanticKey } from '../../protocol/SemanticKeyBuilder.js';
import { derivations } from '../../protocol/derivations/index.js';
import { OpenAICompatibleExtractor } from '../../extract/OpenAICompatibleExtractor.js';
import { ExtractionRunnerService } from '../../extract/ExtractionRunnerService.js';
import { MentionCandidatePopulator } from '../../extract/MentionCandidatePopulator.js';
import { findMatchingLibraryExtractor } from '../../extract/LibraryExtractorMatcher.js';
import { ExtractionMetrics } from '../../extract/ExtractionMetrics.js';
import { runChatbotCompile } from '../../ai/runChatbotCompile.js';
import type { LlmClient } from '../../compiler/pipeline/passes/ChatbotCompilePasses.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';

// ---------------------------------------------------------------------------
// AI runtime deps (set after AI runtime initializes; nullable until then)
// ---------------------------------------------------------------------------

/**
 * Mutable holder so the streaming endpoint can pick up the AI runtime
 * (extractor + LLM client) once `initializeAiRuntime` has finished. Mirrors
 * the pattern other AI-dependent handlers use.
 */
export interface ProtocolIdeAiDepsHolder {
  current: {
    extractionService: ExtractionRunnerService;
    llmClient: LlmClient;
    model?: string;
  } | undefined;
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/**
 * SSE event shape streamed from POST /protocol-ide/sessions/stream.
 * Phases: bootstrap → import → compile → done. Mirrors the AiStreamEvent
 * shape so the labware-editor chat-message renderer can consume it.
 */
export type ProtocolIdeStreamEvent =
  | { type: 'status'; phase: 'bootstrap' | 'import' | 'compile'; message: string }
  | { type: 'phase_complete'; phase: 'bootstrap' | 'import' | 'compile'; detail?: string }
  | { type: 'warning'; phase: 'bootstrap' | 'import' | 'compile'; message: string }
  | {
      type: 'pipeline_diagnostics';
      outcome: import('../../compiler/pipeline/CompileContracts.js').CompileOutcome;
      diagnostics: Array<{ pass_id: string; code: string; severity: 'info' | 'warning' | 'error'; message: string }>;
    }
  | { type: 'done'; result: ProtocolIdeSessionCreateResponse }
  | { type: 'error'; message: string };

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

export function createProtocolIdeHandlers(
  ctx: AppContext,
  aiDeps?: ProtocolIdeAiDepsHolder,
) {
  const sessionService = new ProtocolIdeSessionService(ctx.store);
  const sourceImportService = new ProtocolIdeSourceImportService(ctx.store);

  // Build deps for the real pass chain
  const extractorProfile = ctx.appConfig?.ai?.extractor;
  const extractorFactory = (targetKind: string) => {
    if (!extractorProfile || !extractorProfile.enabled) {
      return {
        async extract() {
          return {
            candidates: [],
            diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'extractor profile missing or disabled' }],
          };
        },
      };
    }
    return new OpenAICompatibleExtractor({ config: extractorProfile });
  };
  const populator = new MentionCandidatePopulator({ store: ctx.store });
  const metrics = new ExtractionMetrics();
  const extractionRunner = new ExtractionRunnerService({
    extractorFactory,
    populator,
    pipelinePath: ctx.schemaDir
      ? `${ctx.schemaDir}/registry/compile-pipelines/extraction-compile.yaml`
      : 'schema/registry/compile-pipelines/extraction-compile.yaml',
    libraryMatcher: (fileName, content) =>
      findMatchingLibraryExtractor({ fileName, contentPreview: content }),
    metrics,
  });

  // LLM client for lab-context resolve
  const aiConfig = ctx.appConfig?.ai;
  const inferenceConfig = aiConfig?.inference;
  const llmClient = inferenceConfig?.baseUrl
    ? {
        complete: async (args: { prompt: string; maxTokens?: number }) => {
          const response = await fetch(inferenceConfig.baseUrl!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(inferenceConfig.apiKey ? { Authorization: `Bearer ${inferenceConfig.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model: inferenceConfig.model,
              messages: [{ role: 'user', content: args.prompt }],
              max_tokens: args.maxTokens ?? 500,
            }),
          });
          const data = await response.json();
          return data.choices?.[0]?.message?.content ?? '';
        },
      }
    : {
        complete: async () => '',
      };

  // loadVerbDefinition wrapper
  const loadVerbDefinition = async (canonical: string) => {
    const env = await ctx.store.get('VERB-' + canonical.toUpperCase());
    return (env?.payload as { canonical: string; semanticInputs?: Array<{ name: string; derivedFrom: { input: string; fn: string }; required: boolean }> } | null) ?? null;
  };

  const projectionDeps = {
    recordStore: ctx.store,
    runChunkedExtraction: async (
      req: { target_kind: string; text: string; source: { kind: string; id: string } },
    ) => {
      const result = await extractionRunner.run({
        target_kind: req.target_kind,
        text: req.text,
        source: req.source,
      });
      return {
        candidates: result.candidates ?? [],
        diagnostics: result.diagnostics,
      };
    },
    runPromotionCompile,
    llmClient,
    ajvValidator: ctx.validator,
    buildSemanticKey,
    derivations,
    loadVerbDefinition,
  };

  const projectionService = new ProtocolIdeProjectionService(ctx.store, projectionDeps);
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
     * POST /protocol-ide/sessions/stream
     *
     * Same shape as createSession but streams progress as Server-Sent Events.
     * Routes the user's PDF + directive through the same chatbot-compile
     * pipeline the AI chat panel uses (extractor for the PDF, inference model
     * for the precompile pass), so the user sees real-time per-pass progress
     * instead of waiting silently.
     */
    async createSessionStream(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      const validation = validateIntakeRequest(request.body);
      if (!validation.valid) {
        reply.status(400);
        await reply.send({ error: 'INVALID_INTAKE', message: validation.error });
        return;
      }
      const intake = validation.request;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });
      const sendEvent = (event: ProtocolIdeStreamEvent) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          /* client disconnected — swallow */
        }
      };

      try {
        // 1. Bootstrap session record (fast, deterministic).
        sendEvent({ type: 'status', phase: 'bootstrap', message: 'Creating session record…' });
        const shell = await sessionService.bootstrapSession(intake);
        sendEvent({ type: 'phase_complete', phase: 'bootstrap', detail: shell.sessionId });

        // 2. Import source PDF (text extraction, evidence build).
        sendEvent({ type: 'status', phase: 'import', message: 'Importing source PDF (extracting text and evidence)…' });
        let sourceEvidenceRef: string | null = null;
        let importWarning: string | undefined;
        let pdfBuffer: Buffer | undefined;
        let pdfFileName: string | undefined;
        let pdfMediaType: string | undefined;
        try {
          const importReq: SourceImportRequest = {
            sessionId: shell.sessionId,
            sourceKind: intake.source.sourceKind,
            ...(intake.enableThinking !== undefined ? { enableThinking: intake.enableThinking } : {}),
          };
          if (intake.source.sourceKind === 'vendor_document') {
            importReq.vendor = {
              vendor: intake.source.vendor as string,
              title: intake.source.title,
              landingUrl: intake.source.landingUrl,
              ...(intake.source.pdfUrl !== undefined && { pdfUrl: intake.source.pdfUrl }),
              ...(intake.source.snippet !== undefined && { snippet: intake.source.snippet }),
            };
          } else if (intake.source.sourceKind === 'pasted_url') {
            importReq.pastedUrl = intake.source.url;
          } else if (intake.source.sourceKind === 'uploaded_pdf') {
            importReq.upload = {
              fileName: intake.source.fileName,
              mediaType: intake.source.mediaType,
              contentBase64: intake.source.contentBase64,
            };
            try {
              pdfBuffer = Buffer.from(intake.source.contentBase64, 'base64');
              pdfFileName = intake.source.fileName;
              pdfMediaType = intake.source.mediaType;
            } catch {
              /* leave undefined; chatbot-compile will run without an attachment */
            }
          }
          const result = await sourceImportService.importSource(importReq);
          sourceEvidenceRef = result.protocolImportRef ?? result.vendorDocumentRef ?? null;
          sendEvent({
            type: 'phase_complete',
            phase: 'import',
            detail: `${result.evidenceRefs?.length ?? 0} evidence snippets`,
          });
        } catch (err) {
          importWarning = err instanceof Error ? err.message : String(err);
          sendEvent({ type: 'warning', phase: 'import', message: importWarning });
        }

        // 3. Compile via chatbot-compile (replaces the stubbed projection).
        sendEvent({ type: 'status', phase: 'compile', message: 'Compiling via chatbot-compile pipeline…' });
        const deps = aiDeps?.current;
        let graphReviewRef: string | null = null;
        let projectionWarning: string | undefined;
        let eventCount = 0;

        if (!deps) {
          projectionWarning = 'AI runtime not initialized — skipping compile pipeline.';
          sendEvent({ type: 'warning', phase: 'compile', message: projectionWarning });
        } else {
          try {
            const compileResult = await runChatbotCompile({
              prompt: intake.directiveText,
              ...(pdfBuffer && pdfFileName && pdfMediaType
                ? { attachments: [{ name: pdfFileName, mime_type: pdfMediaType, content: pdfBuffer }] }
                : {}),
              deps: {
                extractionService: deps.extractionService,
                llmClient: deps.llmClient,
                searchLabwareByHint: createLabwareLookup(ctx.store),
              },
              ...(deps.model ? { model: deps.model } : {}),
              onPassEvent: (event) => {
                if (event.type !== 'pass_started') return;
                sendEvent({ type: 'status', phase: 'compile', message: `Running ${event.pass_id}…` });
              },
            });

            eventCount = compileResult.events.length;
            const errorCount = compileResult.diagnostics.filter((d) => d.severity === 'error').length;
            const warnCount = compileResult.diagnostics.filter((d) => d.severity === 'warning').length;
            sendEvent({
              type: 'phase_complete',
              phase: 'compile',
              detail: `outcome=${compileResult.outcome}, events=${eventCount}, errors=${errorCount}, warnings=${warnCount}`,
            });

            // Surface diagnostics as a chat-panel-compatible event so the same
            // renderer used in the labware editor works here.
            if (errorCount > 0 || warnCount > 0) {
              sendEvent({
                type: 'pipeline_diagnostics',
                outcome: compileResult.outcome,
                diagnostics: compileResult.diagnostics
                  .filter((d) => d.severity === 'error' || d.severity === 'warning')
                  .slice(0, 10)
                  .map((d) => ({
                    pass_id: d.pass_id,
                    code: d.code,
                    severity: d.severity,
                    message: d.message,
                  })),
              });
            }

            // Persist results onto the session record.
            graphReviewRef = `graph-${shell.sessionId}`;
            const sessionEnv = await sessionService.getSession(shell.sessionId);
            if (sessionEnv) {
              const payload = sessionEnv.payload as Record<string, unknown>;
              const now = new Date().toISOString();
              const updatedPayload: Record<string, unknown> = {
                ...payload,
                status: compileResult.outcome === 'error' ? 'projection_failed' : 'projected',
                latestEventGraphCacheKey: graphReviewRef,
                latestEventGraphRef: { kind: 'record', id: graphReviewRef, type: 'event-graph' },
                updatedAt: now,
              };
              await ctx.store.update({
                envelope: { ...sessionEnv, payload: updatedPayload, meta: { ...sessionEnv.meta, updatedAt: now } },
                message: `Update session ${shell.sessionId} with compile result`,
                skipLint: true,
              });
            }
          } catch (err) {
            projectionWarning = err instanceof Error ? err.message : String(err);
            sendEvent({ type: 'warning', phase: 'compile', message: projectionWarning });
          }
        }

        const result: ProtocolIdeSessionCreateResponse = {
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
        sendEvent({ type: 'done', result });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
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

    /**
     * POST /protocol-ide/sessions/:sessionId/lab-context-override
     *
     * Store manual lab context overrides on the session record.
     * These overrides take precedence over directive-driven overrides,
     * which take precedence over smart defaults.
     *
     * Body: { labwareKind?: string, plateCount?: number, sampleCount?: number }
     *
     * Returns `{ success: true }`.
     */
    async setProtocolIdeLabContextOverride(
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { labwareKind?: string; plateCount?: number; sampleCount?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true } | ApiError> {
      const { sessionId } = request.params;
      const { labwareKind, plateCount, sampleCount } = request.body;

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
        const now = new Date().toISOString();

        // Merge with existing overrides
        const existingOverrides = (payload.manualLabContextOverrides as Record<string, unknown>) ?? {};
        const updatedOverrides: Record<string, unknown> = { ...existingOverrides };

        if (labwareKind !== undefined) {
          updatedOverrides.labwareKind = labwareKind;
        }
        if (plateCount !== undefined) {
          updatedOverrides.plateCount = plateCount;
        }
        if (sampleCount !== undefined) {
          updatedOverrides.sampleCount = sampleCount;
        }

        const updatedPayload: Record<string, unknown> = {
          ...payload,
          manualLabContextOverrides: updatedOverrides,
          updatedAt: now,
        };

        const updatedEnvelope: RecordEnvelope = {
          ...envelope,
          payload: updatedPayload,
          meta: {
            ...envelope.meta,
            updatedAt: now,
          },
        };

        await ctx.store.update({
          envelope: updatedEnvelope,
          message: `Update session ${sessionId} with lab context overrides`,
          skipLint: true,
        });

        reply.status(200);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'LAB_CONTEXT_OVERRIDE_FAILED',
          message,
        };
      }
    },

    /**
     * POST /protocol-ide/sessions/:sessionId/select-variant
     *
     * Select an extraction variant during the candidate-review step.
     *
     * Body: { variantIndex: number }
     *
     * Validates that the index is within range of the current
     * extraction-draft's candidate count.  Sets session.selectedVariantIndex
     * and returns success.  The frontend then triggers a rerun which
     * proceeds past the pause.
     *
     * Returns `{ success: true }`.
     */
    async selectVariant(
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { variantIndex: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true } | ApiError> {
      const { sessionId } = request.params;
      const { variantIndex } = request.body;

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

        // Validate: only allow selection when in awaiting_variant_selection status
        const currentStatus = payload.status as string | undefined;
        if (currentStatus !== 'awaiting_variant_selection') {
          reply.status(400);
          return {
            error: 'NOT_IN_VARIANT_SELECTION',
            message: `Session is not in awaiting_variant_selection status (current: ${currentStatus})`,
          };
        }

        // Validate index is non-negative
        if (!Number.isInteger(variantIndex) || variantIndex < 0) {
          reply.status(400);
          return {
            error: 'INVALID_VARIANT_INDEX',
            message: 'variantIndex must be a non-negative integer',
          };
        }

        // Validate index is within range of candidates
        const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
        const candidateCount = candidates?.length ?? 0;
        if (variantIndex >= candidateCount) {
          reply.status(400);
          return {
            error: 'VARIANT_INDEX_OUT_OF_RANGE',
            message: `variantIndex ${variantIndex} is out of range (candidate count: ${candidateCount})`,
          };
        }

        const now = new Date().toISOString();

        const updatedPayload: Record<string, unknown> = {
          ...payload,
          selectedVariantIndex: variantIndex,
          updatedAt: now,
        };

        const updatedEnvelope: RecordEnvelope = {
          ...envelope,
          payload: updatedPayload,
          meta: {
            ...envelope.meta,
            updatedAt: now,
          },
        };

        await ctx.store.update({
          envelope: updatedEnvelope,
          message: `Update session ${sessionId} with selectedVariantIndex=${variantIndex}`,
          skipLint: true,
        });

        reply.status(200);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'VARIANT_SELECTION_FAILED',
          message,
        };
      }
    },
  };
}

export type ProtocolIdeHandlers = ReturnType<typeof createProtocolIdeHandlers>;
