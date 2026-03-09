import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PlatformRegistry } from '../../platform-registry/PlatformRegistry.js';

export interface PlatformHandlers {
  listPlatforms(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ platforms: ReturnType<PlatformRegistry['listPlatforms']> }>;
  getPlatform(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<{ platform: NonNullable<ReturnType<PlatformRegistry['getPlatform']>> } | { error: string; message: string }>;
}

export function createPlatformHandlers(platformRegistry: PlatformRegistry): PlatformHandlers {
  return {
    async listPlatforms() {
      return { platforms: platformRegistry.listPlatforms() };
    },

    async getPlatform(request, reply) {
      const platform = platformRegistry.getPlatform(request.params.id);
      if (!platform) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Platform not found: ${request.params.id}` };
      }
      return { platform };
    },
  };
}
