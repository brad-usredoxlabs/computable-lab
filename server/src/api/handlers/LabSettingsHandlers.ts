import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig, MaterialTrackingConfig } from '../../config/types.js';
import type { PolicyBundleService, PolicyBundle } from '../../policy/PolicyBundleService.js';
import type { ResolvedRequestUser } from '../../security/LocalIdentityService.js';
import { LOCAL_ADMIN_USER_ID } from '../../security/LocalIdentityService.js';
import type { RoleResolver } from '../../security/RoleResolver.js';
import type { AuditEventService } from '../../governance/AuditEventService.js';

function effectiveMaterialTracking(config?: AppConfig): MaterialTrackingConfig {
  return {
    mode: config?.lab?.materialTracking?.mode ?? 'relaxed',
    allowAdHocEventInstances: config?.lab?.materialTracking?.allowAdHocEventInstances ?? true,
  };
}

export interface LabSettingsResponse {
  materialTracking: MaterialTrackingConfig;
  policyBundleId: string;
  activePolicyBundle: PolicyBundle | null;
}

export interface LabSettingsHandlers {
  getLabSettings(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<LabSettingsResponse>;
  patchLabSettings(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ): Promise<LabSettingsResponse | { error: string; message: string }>;
}

export interface LabSettingsHandlerOptions {
  /**
   * LIVE accessor, not a snapshot (the server.ts:755 vendor-search pattern).
   * PATCH /api/config's onConfigUpdate REASSIGNS ctx.appConfig; a handler that
   * captured the config object at construction (the old
   * `createLabSettingsHandlers(ctx.appConfig, ...)` shape) keeps serving the
   * stale bundle after a successful write — the snapshot trap.
   */
  getAppConfig: () => AppConfig | undefined;
  bundleService?: PolicyBundleService;
  /**
   * Persistence reuses the PATCH /api/config writer (the ConfigHandlers
   * instance): merge + validateConfig + atomic writeConfigYaml (tmp+rename) +
   * in-memory reassign + onConfigUpdate. One writer instance = one in-memory
   * truth; a second writer would desync ConfigHandlers' internal copy.
   */
  patchConfig?: (
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) => Promise<unknown>;
  /**
   * Authz gate (QMS-8 spec DECISION): resolve the request user the way the
   * lifecycle handlers do, then require the admin role via the RoleResolver
   * used by lifecycle transitions. Fail closed: unresolvable identity is
   * non-admin.
   */
  resolveRequestUser?: (request: FastifyRequest) => Promise<ResolvedRequestUser | null>;
  roleResolver?: RoleResolver;
  /** Best-effort `policy_bundle_changed {from,to}` audit (docs §1 contract). */
  auditService?: AuditEventService;
}

export function createLabSettingsHandlers(
  options: LabSettingsHandlerOptions
): LabSettingsHandlers {
  const {
    getAppConfig,
    bundleService,
    patchConfig,
    resolveRequestUser,
    roleResolver,
    auditService,
  } = options;

  // Read the CURRENT config on every call (live accessor) so a bundle switch
  // is visible immediately — no restart, no stale boot snapshot.
  function labSettingsBody(): LabSettingsResponse {
    const config = getAppConfig();
    const policyBundleId = config?.lab?.policyBundleId ?? 'POL-SANDBOX';
    return {
      materialTracking: effectiveMaterialTracking(config),
      policyBundleId,
      activePolicyBundle: bundleService?.getBundle(policyBundleId) ?? null,
    };
  }

  return {
    async getLabSettings(_request, reply) {
      return reply.send(labSettingsBody());
    },

    async patchLabSettings(request, reply) {
      // -- Body guard: {policyBundleId: string} ONLY --------------------------
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Request body must be an object with only {policyBundleId}',
        });
      }
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'policyBundleId') {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: `PATCH /settings/lab accepts only {policyBundleId}; got: ${keys.length > 0 ? keys.join(', ') : '(empty body)'}`,
        });
      }
      const requested = (body as Record<string, unknown>).policyBundleId;
      if (typeof requested !== 'string' || requested.length === 0) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'policyBundleId must be a non-empty string',
        });
      }

      // -- Bundle registry is DATA: validate against the loaded catalog -------
      // (schema/core/policy-bundles/*.policy-bundle.yaml via listBundles —
      // never a hardcoded list in TS, never an unknown policy state.)
      const known = (bundleService?.listBundles() ?? []).map((b) => b.id);
      if (known.length > 0 && !known.includes(requested)) {
        return reply.status(400).send({
          error: 'UNKNOWN_POLICY_BUNDLE',
          message: `Unknown policy bundle ${requested}. Known bundles: ${known.join(', ')}`,
        });
      }

      // -- Authz gate (spec DECISION; docs §1 "admin-gated") -----------------
      // canAccess(userId,'admin',record) is record-scoped and a config write is
      // not a record, so this route gates on the role resolver the lifecycle
      // transitions use: admin-role grant (RoleResolver), or the system/local
      // admin identity. Fail closed. Denial shape: 403 {error:'FORBIDDEN',message}.
      const actor = resolveRequestUser ? await resolveRequestUser(request) : null;
      const userId = actor?.userId ?? null;
      let admin = actor?.isSystem === true || userId === LOCAL_ADMIN_USER_ID;
      if (!admin && userId && roleResolver) {
        admin = (await roleResolver.rolesFor(userId)).includes('admin');
      }
      if (!admin) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: `Policy bundle change forbidden: user ${userId ?? '(unauthenticated)'} does not hold the admin role.`,
        });
      }

      // -- Persist via the config-writer path (never hand-edit the YAML) ------
      if (!patchConfig) {
        return reply.status(503).send({
          error: 'CONFIG_WRITER_UNAVAILABLE',
          message: 'Lab settings persistence is not wired on this server.',
        });
      }
      const from = getAppConfig()?.lab?.policyBundleId ?? null;
      let statusCode = 200;
      let payload: unknown;
      const captureReply = {
        status(code: number) {
          statusCode = code;
          return captureReply;
        },
        send(sent: unknown) {
          payload = sent;
          return sent;
        },
      } as unknown as FastifyReply;
      try {
        await patchConfig(
          {
            body: { lab: { policyBundleId: requested } },
            headers: request.headers,
          } as unknown as FastifyRequest<{ Body: unknown }>,
          captureReply,
        );
      } catch (err) {
        return reply.status(500).send({
          error: 'CONFIG_UPDATE_FAILED',
          message: `Failed to update lab settings: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      if (statusCode >= 400) {
        const failure = payload as { error?: string; details?: Array<{ message?: string }> } | undefined;
        return reply.status(statusCode).send({
          error: failure?.error ?? 'CONFIG_UPDATE_FAILED',
          message: failure?.details?.[0]?.message ?? failure?.error ?? 'Failed to update lab settings',
        });
      }

      // -- Best-effort audit of the switch (never fails the write) ------------
      if (auditService) {
        try {
          await auditService.append({
            actor: userId ?? 'system',
            action: 'policy_bundle_changed',
            subjectType: 'config',
            subjectId: 'lab.policyBundleId',
            data: { from, to: requested },
          });
        } catch {
          // Audit is best-effort; a failed append never rolls back the write.
        }
      }

      // -- Response = the SAME body getLabSettings returns --------------------
      // (client setLabSettings(updated) at SettingsPage.tsx:96-97 assumes it),
      // computed from the LIVE config the writer just reassigned.
      return reply.send(labSettingsBody());
    },
  };
}
