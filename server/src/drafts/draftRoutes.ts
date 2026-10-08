import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../server.js';
import { FormDraftService, DraftError } from './FormDraftService.js';

export function registerDraftRoutes(app: FastifyInstance, ctx: AppContext) {
  for (const action of ['compile','accept'] as const) {
    app.post(`/drafts/${action}`, async (request, reply) => {
      try {
        const actor = await ctx.localIdentityService.resolveRequestUser(request);
        if (!actor.userId) throw new DraftError('Select or sign in as a user.',401);
        return await new FormDraftService(ctx,actor.userId)[action](request.body);
      } catch(error) {
        return reply.code(error instanceof DraftError ? error.status : 422).send({error:'DRAFT_FAILED',message:(error as Error).message});
      }
    });
  }
}
