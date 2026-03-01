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
import { ProtocolExtractionService, ProtocolExtractionError } from '../../protocol/ProtocolExtractionService.js';

export function createProtocolHandlers(ctx: AppContext) {
  const orchestrator = new ExecutionOrchestrator(ctx);
  const extraction = new ProtocolExtractionService(ctx);

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
  };
}

export type ProtocolHandlers = ReturnType<typeof createProtocolHandlers>;
