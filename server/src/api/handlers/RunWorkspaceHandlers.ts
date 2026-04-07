import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppContext } from '../../server.js';
import { RunWorkspaceService, type AiContextTab } from '../../run-workspace/RunWorkspaceService.js';

const VALID_TABS = new Set<AiContextTab>(['overview', 'plan', 'biology', 'readouts', 'results', 'claims']);

export interface RunWorkspaceHandlers {
  getRunWorkspace(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
  getRunAnalysisBundle(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
  getRunAiContext(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { tab?: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
}

export function createRunWorkspaceHandlers(ctx: AppContext): RunWorkspaceHandlers {
  const service = new RunWorkspaceService(ctx.store);

  return {
    async getRunWorkspace(request, reply) {
      const workspace = await service.getRunWorkspace(request.params.id);
      if (!workspace) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      return workspace;
    },
    async getRunAnalysisBundle(request, reply) {
      const bundle = await service.getRunAnalysisBundle(request.params.id);
      if (!bundle) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      return bundle;
    },
    async getRunAiContext(request, reply) {
      const tab = (request.query.tab || 'overview') as AiContextTab;
      if (!VALID_TABS.has(tab)) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: `Invalid tab: ${tab}. Must be one of: ${Array.from(VALID_TABS).join(', ')}` };
      }
      const context = await service.getRunAiContext(request.params.id, tab);
      if (!context) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      return context;
    },
  };
}
