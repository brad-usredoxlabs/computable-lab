/**
 * AnalysisHandlers — HTTP bridge for analysis record CRUD + run execution.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import {
  AnalysisService,
  AnalysisServiceError,
  type CreateRevisionInput,
  type CreateRunInput,
} from '../../analysis/analysisService.js';
import { AnalysisRunner } from '../../analysis/analysisRunner.js';

export function createAnalysisHandlers(ctx: AppContext) {
  const service = new AnalysisService(ctx);

  function error(reply: FastifyReply, err: unknown, defaultStatus = 500) {
    if (err instanceof AnalysisServiceError) {
      reply.status(err.statusCode);
      return { error: err.code, message: err.message };
    }
    reply.status(defaultStatus);
    return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
  }

  return {
    async createRevision(
      request: FastifyRequest<{ Body: CreateRevisionInput }>,
      reply: FastifyReply,
    ) {
      try {
        const { recordId, payload } = await service.createRevision(request.body);
        reply.status(201);
        return { success: true, recordId, revision: payload };
      } catch (err) {
        return error(reply, err);
      }
    },

    async getRevision(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const env = await service.getRevision(request.params.id);
      if (!env) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `revision not found: ${request.params.id}` };
      }
      return { record: env };
    },

    async listRevisions(_req: FastifyRequest): Promise<{ revisions: import('../../types/RecordEnvelope.js').RecordEnvelope[]; total: number }> {
      const revisions = await service.list('analysis-revision');
      return { revisions, total: revisions.length };
    },

    async createRun(
      request: FastifyRequest<{ Body: CreateRunInput }>,
      reply: FastifyReply,
    ) {
      try {
        const { recordId, payload } = await service.createRun(request.body);
        reply.status(201);
        return { success: true, recordId, run: payload };
      } catch (err) {
        return error(reply, err);
      }
    },

    async getRun(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const env = await service.getRun(request.params.id);
      if (!env) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `run not found: ${request.params.id}` };
      }
      return { record: env };
    },

    async listRuns(_req: FastifyRequest): Promise<{ runs: import('../../types/RecordEnvelope.js').RecordEnvelope[]; total: number }> {
      const runs = await service.list('analysis-run');
      return { runs, total: runs.length };
    },

    async executeRun(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const runner = new AnalysisRunner(ctx);
      try {
        const result = await runner.executeRun(request.params.id);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof AnalysisServiceError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export type AnalysisHandlers = ReturnType<typeof createAnalysisHandlers>;