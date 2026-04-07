import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig, MaterialTrackingConfig } from '../../config/types.js';

function effectiveMaterialTracking(config?: AppConfig): MaterialTrackingConfig {
  return {
    mode: config?.lab?.materialTracking?.mode ?? 'relaxed',
    allowAdHocEventInstances: config?.lab?.materialTracking?.allowAdHocEventInstances ?? true,
  };
}

export interface LabSettingsHandlers {
  getLabSettings(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ materialTracking: MaterialTrackingConfig }>;
}

export function createLabSettingsHandlers(config?: AppConfig): LabSettingsHandlers {
  return {
    async getLabSettings(_request, reply) {
      return reply.send({
        materialTracking: effectiveMaterialTracking(config),
      });
    },
  };
}
