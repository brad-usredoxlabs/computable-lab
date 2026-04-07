/**
 * ProtocolHandlers — HTTP handlers for protocol management.
 *
 * Provides endpoints for saving event graphs as protocols, loading protocols
 * for editing, and binding protocol roles to concrete instances (wizard flow).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
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

  return {
    /**
     * POST /protocols/from-event-graph
     * Save an event graph as a protocol record.
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
