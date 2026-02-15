/**
 * ExecutionHandlers — Stub HTTP handlers for the robot execution pipeline.
 *
 * Provides endpoints for creating planned runs, compiling them to robot plans,
 * and retrieving compiled artifacts.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';

export function createExecutionHandlers(ctx: AppContext) {
  return {
    /**
     * POST /planned-runs
     * Create a planned run (from protocol or event graph).
     */
    async createPlannedRun(
      _request: FastifyRequest<{
        Body: {
          title: string;
          sourceType: 'protocol' | 'event-graph';
          sourceRef: { kind: string; id: string; type?: string };
          bindings?: unknown;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; recordId?: string } | ApiError> {
      // TODO: Implement planned run creation
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Planned run creation is not yet implemented.',
      };
    },

    /**
     * GET /planned-runs/:id
     * Get a planned run by ID.
     */
    async getPlannedRun(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ record: unknown } | ApiError> {
      const { id } = request.params;
      try {
        const envelope = await ctx.store.get(id);
        if (!envelope) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Planned run not found: ${id}` };
        }
        return { record: envelope };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /planned-runs/:id/compile
     * Compile a planned run to a robot plan.
     */
    async compilePlannedRun(
      _request: FastifyRequest<{
        Params: { id: string };
        Body: {
          targetPlatform: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; robotPlanId?: string } | ApiError> {
      // TODO: Implement robot plan compilation (translator logic)
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Robot plan compilation is not yet implemented.',
      };
    },

    /**
     * GET /robot-plans/:id
     * Get a compiled robot plan.
     */
    async getRobotPlan(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ record: unknown } | ApiError> {
      const { id } = request.params;
      try {
        const envelope = await ctx.store.get(id);
        if (!envelope) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Robot plan not found: ${id}` };
        }
        return { record: envelope };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /robot-plans/:id/artifact
     * Download generated code/config for a robot plan.
     */
    async getRobotPlanArtifact(
      _request: FastifyRequest<{
        Params: { id: string };
        Querystring: { role?: string };
      }>,
      reply: FastifyReply,
    ): Promise<ApiError> {
      // TODO: Implement artifact download
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Robot plan artifact download is not yet implemented.',
      };
    },
  };
}

export type ExecutionHandlers = ReturnType<typeof createExecutionHandlers>;
