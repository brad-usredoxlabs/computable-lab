import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig, MaterialTrackingConfig } from '../../config/types.js';
import type { PolicyBundleService, PolicyBundle } from '../../policy/PolicyBundleService.js';

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
  ): Promise<{
    materialTracking: MaterialTrackingConfig;
    policyBundleId: string;
    activePolicyBundle: PolicyBundle | null;
  }>;
}

export function createLabSettingsHandlers(
  config?: AppConfig,
  bundleService?: PolicyBundleService
): LabSettingsHandlers {
  return {
    async getLabSettings(_request, reply) {
      const policyBundleId = config?.lab?.policyBundleId ?? 'POL-SANDBOX';
      const activePolicyBundle = bundleService?.getBundle(policyBundleId) ?? null;
      return reply.send({
        materialTracking: effectiveMaterialTracking(config),
        policyBundleId,
        activePolicyBundle,
      });
    },
  };
}
