import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import type { RecordStore } from '../../store/types.js';
import type { RoleResolver } from '../../security/RoleResolver.js';
import type { ResolvedRequestUser } from '../../security/LocalIdentityService.js';

export interface LifecycleHandlerOptions {
  engine: LifecycleEngine;
  store: RecordStore;
  roleResolver: RoleResolver;
  resolveRequestUser: (request: FastifyRequest, reply: FastifyReply) => Promise<ResolvedRequestUser | null>;
}

export function createLifecycleHandlers(options: LifecycleHandlerOptions) {
  const { engine, store, roleResolver, resolveRequestUser } = options;

  return {
    /**
     * GET /lifecycle/:lifecycleId/transitions?recordId=:id
     *
     * Preview runs PERMISSIVE (enforceTransitionRoles: false): `allowed`
     * reflects guard evaluation only, never role grants. The write path
     * (record update) enforces transition roles per the active policy bundle
     * and can still deny a transition this preview shows as allowed — a
     * button click surfacing a server 422 is the designed behavior. We never
     * fake a permissive-looking preview by hiding transitions the actor might
     * not hold a grant for.
     */
    async getTransitions(
      request: FastifyRequest<{ Params: { lifecycleId: string }; Querystring: { recordId?: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      const user = await resolveRequestUser(request, reply);
      if (!user?.userId) {
        reply.status(401);
        return { error: 'UNAUTHENTICATED', message: 'A valid local user is required' };
      }
      const { lifecycleId } = request.params;
      if (!engine.isLoaded(lifecycleId)) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Lifecycle not loaded: ${lifecycleId}` };
      }

      let state = 'draft';
      let payload: Record<string, unknown> = {};
      if (request.query.recordId) {
        const record = await store.get(request.query.recordId);
        if (!record) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Record not found: ${request.query.recordId}` };
        }
        payload = (record.payload ?? {}) as Record<string, unknown>;
        state = String(payload.state ?? payload.status ?? 'draft');
      }

      const roleAssignments: Record<string, string> = {};
      if (typeof payload.createdBy === 'string') roleAssignments.author = payload.createdBy;
      const actorRoles = await roleResolver.rolesFor(user.userId, lifecycleId);

      const transitions = engine.getValidTransitions(lifecycleId, state, {
        recordId: request.query.recordId ?? 'unbound',
        currentActorId: user.userId,
        roleAssignments,
        actorRoles,
        enforceTransitionRoles: false,
        fields: payload,
        presentedSignatures: [],
      });
      return reply.send({ lifecycleId, state, transitions });
    },
  };
}
export type LifecycleHandlers = ReturnType<typeof createLifecycleHandlers>;
