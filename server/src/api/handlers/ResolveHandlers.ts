/**
 * ResolveHandlers — HTTP surface for the resolve() spine.
 *
 * POST /resolve { term, surface?, kinds?, level?, limit? }
 *   → { candidates: RankedCandidate[] }
 *
 * Backs the UI slash menu, the TapTab copilot, and any client that needs
 * ontology-grounded term resolution. Same spine the MCP tool and the compiler
 * use, so every surface agrees on what a term resolves to.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ResolveSpine, MaterialLevel } from '../../resolve/index.js';
import type { ApiError } from '../types.js';

export interface ResolveRequestBody {
  term: string;
  surface?: string;
  kinds?: string[];
  level?: MaterialLevel;
  limit?: number;
  /**
   * When true, skip remote tiers (OLS4, vendor) and return only
   * tier-1 (records) + tier-2 (on-box OAK). Used by the slash menu's
   * progressive first paint so the user sees local results in
   * <100ms; a follow-up call without this flag streams the slower
   * remote tiers in.
   */
  localOnly?: boolean;
}

export function createResolveHandlers(spine: ResolveSpine) {
  return {
    /** POST /resolve */
    async resolveTerm(
      request: FastifyRequest<{ Body: ResolveRequestBody }>,
      reply: FastifyReply,
    ): Promise<{ candidates: Awaited<ReturnType<ResolveSpine['resolve']>> } | ApiError> {
      const body = request.body ?? ({} as ResolveRequestBody);
      const term = (body.term ?? '').trim();

      if (!term) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Body field "term" is required.' };
      }

      const candidates = await spine.resolve(term, {
        ...(body.surface ? { surface: body.surface } : {}),
        ...(body.kinds ? { kinds: body.kinds } : {}),
        ...(body.level ? { level: body.level } : {}),
        ...(body.limit ? { limit: body.limit } : {}),
        ...(body.localOnly ? { localOnly: true } : {}),
      });

      return { candidates };
    },
  };
}

export type ResolveHandlers = ReturnType<typeof createResolveHandlers>;
