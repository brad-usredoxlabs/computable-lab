/**
 * ProtocolHandlers — HTTP handlers for protocol management.
 *
 * Provides endpoints for saving event graphs as protocols, loading protocols
 * for editing, and binding protocol roles to concrete instances (wizard flow).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { resolveAiProfile } from '../../config/types.js';
import { ExecutionOrchestrator, ExecutionError } from '../../execution/ExecutionOrchestrator.js';
import {
  MaterialCompilerService,
  type MaterialCompilerPolicyProfile,
  type NormalizedMaterialIntentPayload,
} from '../../compiler/material/index.js';
import { ProtocolExtractionService, ProtocolExtractionError } from '../../protocol/ProtocolExtractionService.js';
import { importProtocolPdf as importProtocolPdfDocument, type ProtocolImportResponse } from '../../protocol/ProtocolImportService.js';
import {
  reviewProtocolForLab,
  type LabProtocolReviewRequest,
  type LabProtocolReviewResponse,
} from '../../protocol/ProtocolLabReviewService.js';
import {
  ProtocolAuthoringError,
  ProtocolAuthoringService,
  type ProtocolStructureSuggestion,
} from '../../protocol/ProtocolAuthoringService.js';
import {
  ProtocolContextError,
  ProtocolContextService,
} from '../../protocol/ProtocolContextService.js';

type ProtocolMaterialCompileRequest = {
  requests: Array<{
    nodeId: string;
    normalizedIntent: {
      domain: 'materials';
      intentId: string;
      version: string;
      summary: string;
      requiredFacts: string[];
      optionalFacts?: string[];
      assumptions?: string[];
      payload: NormalizedMaterialIntentPayload;
    };
    activeScope?: {
      organizationId: string;
      labId?: string;
      projectId?: string;
      runId?: string;
    };
    policyProfiles?: MaterialCompilerPolicyProfile[];
    persist?: boolean;
    actor?: string;
  }>;
};

function defaultMaterialPolicyProfiles(): MaterialCompilerPolicyProfile[] {
  return [{
    id: 'protocol-import-material-review',
    scope: 'organization',
    scopeId: 'default-org',
    description: 'Default TapTab material review policy for generic protocol drafts.',
    settings: {
      allowAutoCreate: 'confirm',
      allowSubstitutions: 'confirm',
      allowPlaceholders: 'allow',
      allowRemediation: 'allow',
      approvalAuthority: 'lab-manager',
    },
    materialSettings: {
      mode: 'semantic-planning',
      concentrationSemantics: 'formulation',
      clarificationBehavior: 'confirm-near-match',
      remediationBehavior: 'suggest',
    },
  }];
}

export function createProtocolHandlers(ctx: AppContext) {
  const orchestrator = new ExecutionOrchestrator(ctx);
  const extraction = new ProtocolExtractionService(ctx);
  const materialCompiler = new MaterialCompilerService(ctx.store);
  const aiProfile = ctx.appConfig?.ai ? resolveAiProfile(ctx.appConfig.ai) : undefined;
  const authoring = new ProtocolAuthoringService(ctx.store, aiProfile?.inference?.baseUrl ? {
    inferenceClient: createInferenceClient(aiProfile.inference),
    inferenceConfig: aiProfile.inference,
  } : {});
  const protocolContext = new ProtocolContextService(ctx.store);

  const handleProtocolContextError = (err: unknown, reply: FastifyReply): ApiError => {
    if (err instanceof ProtocolContextError) {
      reply.status(err.statusCode);
      return { error: err.code, message: err.message };
    }
    reply.status(500);
    return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
  };

  return {
    /**
     * GET /protocol-context?studyId=&experimentId=&runId=
     * Resolve protocol templates and run methods for the current workspace scope.
     */
    async getProtocolContext(
      request: FastifyRequest<{
        Querystring: { studyId?: string; experimentId?: string; runId?: string };
      }>,
      reply: FastifyReply,
    ) {
      try {
        reply.status(200);
        return await protocolContext.getContext(request.query ?? {});
      } catch (err) {
        return handleProtocolContextError(err, reply);
      }
    },

    /**
     * POST /protocol-actions/use-in-run
     * Create a planned-run and run-attached method event graph from a protocol.
     */
    async useProtocolInRun(
      request: FastifyRequest<{
        Body: {
          protocolId: string;
          runId: string;
          studyId?: string;
          experimentId?: string;
          title?: string;
          replace?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) {
      try {
        const body = request.body ?? {};
        const result = await protocolContext.useProtocolInRun({
          protocolId: body.protocolId,
          runId: body.runId,
          ...(body.studyId ? { studyId: body.studyId } : {}),
          ...(body.experimentId ? { experimentId: body.experimentId } : {}),
          ...(body.title ? { title: body.title } : {}),
          ...(body.replace !== undefined ? { replace: body.replace } : {}),
        });
        reply.status(201);
        return { success: true, ...result };
      } catch (err) {
        return handleProtocolContextError(err, reply);
      }
    },

    /**
     * POST /protocol-actions/specialize-for-experiment
     * Create an experiment-linked local-protocol from a project/global protocol.
     */
    async specializeForExperiment(
      request: FastifyRequest<{
        Body: { protocolId: string; studyId: string; experimentId: string; title?: string };
      }>,
      reply: FastifyReply,
    ) {
      try {
        const body = request.body ?? {};
        const envelope = await protocolContext.specializeForExperiment({
          protocolId: body.protocolId,
          studyId: body.studyId,
          experimentId: body.experimentId,
          ...(body.title ? { title: body.title } : {}),
        });
        reply.status(201);
        return { success: true, record: envelope };
      } catch (err) {
        return handleProtocolContextError(err, reply);
      }
    },

    /**
     * POST /protocol-actions/promote-to-project-template
     * Promote a run/planned-run/event-graph method to a project local-protocol template.
     */
    async promoteToProjectTemplate(
      request: FastifyRequest<{
        Body: { runId?: string; plannedRunId?: string; eventGraphId?: string; studyId?: string; title?: string };
      }>,
      reply: FastifyReply,
    ) {
      try {
        const body = request.body ?? {};
        const envelope = await protocolContext.promoteRunMethod({
          ...(body.runId ? { runId: body.runId } : {}),
          ...(body.plannedRunId ? { plannedRunId: body.plannedRunId } : {}),
          ...(body.eventGraphId ? { eventGraphId: body.eventGraphId } : {}),
          ...(body.studyId ? { studyId: body.studyId } : {}),
          ...(body.title ? { title: body.title } : {}),
        });
        reply.status(201);
        return { success: true, record: envelope };
      } catch (err) {
        return handleProtocolContextError(err, reply);
      }
    },

    /**
     * POST /protocols/from-event-graph
     * Save an event graph as a protocol record.
     * 
     * @deprecated Use POST /extraction/protocols/draft + POST /extraction/protocols/promote instead.
     * This method is kept for backward compatibility.
     */
    async saveFromEventGraph(
      request: FastifyRequest<{
        Body: {
          eventGraphId: string;
          title?: string;
          tags?: string[];
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; recordId?: string } | ApiError> {
      try {
        const saved = await extraction.saveFromEventGraph({
          eventGraphId: request.body.eventGraphId,
          ...(request.body.title !== undefined ? { title: request.body.title } : {}),
          ...(request.body.tags !== undefined ? { tags: request.body.tags } : {}),
        });
        reply.status(201);
        return { success: true, recordId: saved.recordId };
      } catch (err) {
        if (err instanceof ProtocolExtractionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /extraction/protocols/draft
     * Extract a protocol from an event graph and persist it as an extraction-draft.
     * Returns the draft recordId for subsequent review and promotion.
     */
    async extractProtocolDraft(
      request: FastifyRequest<{
        Body: {
          eventGraphId: string;
          title?: string;
          tags?: string[];
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; draftId?: string; candidateCount?: number } | ApiError> {
      try {
        const { recordId, draft } = await extraction.extractDraftFromEventGraph({
          eventGraphId: request.body.eventGraphId,
          ...(request.body.title !== undefined ? { title: request.body.title } : {}),
          ...(request.body.tags !== undefined ? { tags: request.body.tags } : {}),
        });
        reply.status(201);
        return { 
          success: true, 
          draftId: recordId,
          candidateCount: draft.candidates.length,
        };
      } catch (err) {
        if (err instanceof ProtocolExtractionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /extraction/protocols/:draftId/promote
     * Promote a candidate from an extraction-draft to a canonical protocol record.
     * Creates both the canonical protocol and an extraction-promotion audit record.
     */
    async promoteProtocolDraft(
      request: FastifyRequest<{
        Params: { draftId: string };
        Body: {
          candidateIndex?: number;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ 
      success: boolean; 
      canonicalRecordId?: string; 
      auditRecordId?: string;
      draftStatus?: string;
    } | ApiError> {
      try {
        const candidateIndex = request.body.candidateIndex ?? 0;
        const { canonicalRecordId, auditRecordId, draftStatus } = await extraction.promoteDraft(
          request.params.draftId,
          candidateIndex,
        );
        reply.status(201);
        return {
          success: true,
          canonicalRecordId,
          auditRecordId,
          draftStatus,
        };
      } catch (err) {
        if (err instanceof ProtocolExtractionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /protocols/:id/authoring-session
     * Link a canonical protocol to a Protocol IDE-style authoring sidecar.
     */
    async createAuthoringSession(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<{ success: true; protocolId: string; sessionId: string; status: string } | ApiError> {
      try {
        const result = await authoring.createAuthoringSession(request.params.id);
        reply.status(201);
        return result;
      } catch (err) {
        if (err instanceof ProtocolAuthoringError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /protocols/:id/suggest-structure
     * Return advisory structure suggestions without mutating roles or steps.
     */
    async suggestStructure(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<{ success: true; protocolId: string; suggestions: ProtocolStructureSuggestion[] } | ApiError> {
      try {
        const result = await authoring.suggestStructure(request.params.id);
        reply.status(200);
        return result;
      } catch (err) {
        if (err instanceof ProtocolAuthoringError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /protocols/:id/apply-suggestions
     * Apply only accepted advisory suggestions to canonical protocol roles/steps.
     */
    async applySuggestions(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          suggestions?: ProtocolStructureSuggestion[];
          acceptedSuggestions?: ProtocolStructureSuggestion[];
          acceptedSuggestionIds?: string[];
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; protocolId: string; applied: { materialRoles: number; equipmentRoles: number; steps: number }; protocol: unknown } | ApiError> {
      try {
        const body = request.body ?? {};
        const suggestions = Array.isArray(body.acceptedSuggestions)
          ? body.acceptedSuggestions
          : Array.isArray(body.suggestions)
            ? body.suggestions.filter((suggestion) => {
                if (!Array.isArray(body.acceptedSuggestionIds)) return true;
                return body.acceptedSuggestionIds.includes(suggestion.id);
              })
            : [];
        const result = await authoring.applySuggestions(request.params.id, suggestions);
        reply.status(200);
        return result;
      } catch (err) {
        if (err instanceof ProtocolAuthoringError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * GET /protocols/:id/load
     * Load a protocol for the editor (returns event graph shape).
     */
    async loadProtocol(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ protocol: unknown } | ApiError> {
      try {
        const protocol = await ctx.store.get(request.params.id);
        if (!protocol) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Protocol not found: ${request.params.id}`,
          };
        }
        return { protocol };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /protocols/:id/bind
     * Start wizard: bind abstract roles to concrete instances, creating a PlannedRun.
     */
    async bindProtocol(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          bindings?: {
            labware?: Array<{ roleId: string; labwareInstanceRef?: unknown }>;
            materials?: Array<{ roleId: string; materialRef?: unknown }>;
            instruments?: Array<{ roleId: string; instrumentRef?: unknown }>;
            parameters?: Array<{ name: string; value: unknown }>;
            executionPlanRef?: { kind?: string; id?: string; type?: string } | string;
          };
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; plannedRunId?: string } | ApiError> {
      try {
        const protocol = await ctx.store.get(request.params.id);
        if (!protocol) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Protocol not found: ${request.params.id}` };
        }

        const title = ((protocol.payload as Record<string, unknown>)['title'] as string | undefined) ?? request.params.id;
        const planned = await orchestrator.createPlannedRun({
          title: `${title} bound run`,
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: request.params.id, type: 'protocol' },
          bindings: request.body.bindings,
        });
        reply.status(201);
        return { success: true, plannedRunId: planned.recordId };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async importProtocolPdf(
      request: FastifyRequest<{
        Body: {
          fileName?: string;
          mediaType?: string;
          sizeBytes?: number;
          contentBase64?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<ProtocolImportResponse | ApiError> {
      try {
        const response = await importProtocolPdfDocument({
          fileName: request.body.fileName ?? '',
          contentBase64: request.body.contentBase64 ?? '',
          ...(request.body.mediaType !== undefined ? { mediaType: request.body.mediaType } : {}),
          ...(request.body.sizeBytes !== undefined ? { sizeBytes: request.body.sizeBytes } : {}),
        });
        reply.status(201);
        return response;
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async compileMaterialIntents(
      request: FastifyRequest<{ Body: ProtocolMaterialCompileRequest }>,
      reply: FastifyReply,
    ): Promise<{ success: true; results: Array<{ nodeId: string; result: Awaited<ReturnType<MaterialCompilerService['compile']>> }> } | ApiError> {
      try {
        if (!Array.isArray(request.body.requests) || request.body.requests.length === 0) {
          throw new Error('Provide at least one material compile request.');
        }

        const results = await Promise.all(request.body.requests.map(async (entry) => ({
          nodeId: entry.nodeId,
          result: await materialCompiler.compile({
            normalizedIntent: {
              domain: entry.normalizedIntent.domain,
              intentId: entry.normalizedIntent.intentId,
              version: entry.normalizedIntent.version,
              summary: entry.normalizedIntent.summary,
              requiredFacts: entry.normalizedIntent.requiredFacts,
              ...(entry.normalizedIntent.optionalFacts ? { optionalFacts: entry.normalizedIntent.optionalFacts } : {}),
              ...(entry.normalizedIntent.assumptions ? { assumptions: entry.normalizedIntent.assumptions } : {}),
              payload: entry.normalizedIntent.payload,
            },
            activeScope: entry.activeScope ?? { organizationId: 'default-org' },
            policyProfiles: entry.policyProfiles ?? defaultMaterialPolicyProfiles(),
            persist: entry.persist ?? false,
            actor: entry.actor ?? 'protocol-import',
          }),
        })));

        reply.status(200);
        return {
          success: true,
          results,
        };
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async reviewLabProtocol(
      request: FastifyRequest<{ Body: LabProtocolReviewRequest }>,
      reply: FastifyReply,
    ): Promise<LabProtocolReviewResponse | ApiError> {
      try {
        if (!request.body.document || !Array.isArray(request.body.document.steps)) {
          throw new Error('Provide a draft protocol document with steps for lab review.');
        }
        reply.status(200);
        return reviewProtocolForLab(request.body);
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export type ProtocolHandlers = ReturnType<typeof createProtocolHandlers>;
