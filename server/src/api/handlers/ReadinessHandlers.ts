import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { buildReadinessReport, type ReadinessReport } from '../../readiness/ReadinessReportService.js';
import type { ApiError } from '../types.js';

export function createReadinessHandlers(ctx: AppContext) {
  return {
    async getReadinessReport(
      request: FastifyRequest<{
        Querystring: { plannedRunId?: string };
      }>,
      reply: FastifyReply,
    ): Promise<ReadinessReport | ApiError> {
      const plannedRunId = request.query.plannedRunId;

      if (!plannedRunId) {
        reply.status(400);
        return { error: 'MISSING_PLANNED_RUN_ID', message: 'plannedRunId query parameter is required' };
      }

      try {
        const report = await buildReadinessReport(plannedRunId, ctx.store);
        return report;
      } catch (err) {
        if (err instanceof Error && err.message === 'Planned run not found') {
          reply.status(404);
          return { error: 'PLANNED_RUN_NOT_FOUND', message: err.message };
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

export type ReadinessHandlers = ReturnType<typeof createReadinessHandlers>;
