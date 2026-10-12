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
  /** Registry catalog (schema/core/policy-bundles/*.policy-bundle.yaml) — data, never hardcoded. */
  availablePolicyBundles: Array<{ id: string; label: string; level: number; description?: string }>;
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
   * non-admin. FIX-RUN-1: fail closed ALSO for a request that presents no
   * credential at all — the shipped LocalIdentityService resolves a headerless
   * request to the first active user or the bootstrap USR-LOCAL-ADMIN
   * (isSystem:true); that implicit fallback is NOT a credential for a
   * privileged config write (adversarial defect 1).
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
      availablePolicyBundles: (bundleService?.listBundles() ?? []).map(
        ({ id, label, level, description }) =>
          description === undefined ? { id, label, level } : { id, label, level, description },
      ),
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
      // FIX-RUN-1 (defect 2): the refusal is UNCONDITIONAL. The old
      // `known.length > 0 &&` escape skipped validation when the registry was
      // empty/absent and persisted an unknown policy state. An empty registry
      // knows nothing, so it refuses EVERY id.
      const known = (bundleService?.listBundles() ?? []).map((b) => b.id);
      if (!known.includes(requested)) {
        return reply.status(400).send({
          error: 'UNKNOWN_POLICY_BUNDLE',
          message: known.length > 0
            ? `Unknown policy bundle ${requested}. Known bundles: ${known.join(', ')}`
            : `Unknown policy bundle ${requested}. No policy bundles are loaded on this server; refusing to persist an unknown policy state.`,
        });
      }

      // -- Authz gate (spec DECISION; docs §1 "admin-gated") -----------------
      // canAccess(userId,'admin',record) is record-scoped and a config write is
      // not a record, so this route gates on the role resolver the lifecycle
      // transitions use: admin-role grant (RoleResolver), or the system/local
      // admin identity. Fail closed. Denial shape: 403 {error:'FORBIDDEN',message}.
      //
      // FIX-RUN-1 (defect 1, BLOCKER): the gate must fail closed for a request
      // that presents NO credential. The shipped LocalIdentityService resolves
      // a headerless request to the first active user, or to the bootstrap
      // USR-LOCAL-ADMIN with isSystem:true when that is the only active user
      // (LocalIdentityService.ts:125-138) — a normal fresh-install state. That
      // implicit fallback is not a credential: without an explicit identity
      // signal (x-cl-session / x-user-id / x-computable-user-id) the route
      // denies 403 BEFORE consulting the resolver, so the isSystem arm is only
      // ever reachable for a request that actually presented one.
      // FIX-RUN-1 (defect 4): a resolver exception denies 403 FORBIDDEN too —
      // the denial shape is preserved on the error path, never a 500.
      //
      // Residual hardening (found by the residual tests below): the shipped
      // resolver treats an EMPTY header value and an INVALID session token as
      // "no signal" and falls through to the bootstrap fallback
      // (LocalIdentityService.ts:85-96, :98-123, :125-138). A grant is only
      // ever given when the resolved identity is attributable to a credential
      // the request actually presented:
      //  - the isSystem arm requires an explicit non-empty x-user-id /
      //    x-computable-user-id (the shipped resolver only returns
      //    isSystem:true via ensureLocalAdminUser for an explicit
      //    x-user-id: USR-LOCAL-ADMIN on a bootstrap-only store);
      //  - the localAdmin arm accepts a session-authenticated USR-LOCAL-ADMIN
      //    (the shipped session path always returns isSystem:false,
      //    LocalIdentityService.ts:89 — an isSystem:true result on a
      //    session-only request can only be the fallback, so it denies);
      //  - a failed/absent credential never reaches the role arm's fallback
      //    identity as a system grant.
      const headerValue = (name: string): string | null => {
        const v = request.headers[name];
        if (typeof v === 'string') return v.length > 0 ? v : null;
        if (Array.isArray(v)) {
          const first = v[0];
          return typeof first === 'string' && first.length > 0 ? first : null;
        }
        return null;
      };
      const explicitUserHeader =
        headerValue('x-user-id') ?? headerValue('x-computable-user-id');
      const sessionHeader = headerValue('x-cl-session');
      const hasCredential = explicitUserHeader !== null || sessionHeader !== null;

      let actor: ResolvedRequestUser | null = null;
      if (hasCredential) {
        try {
          actor = resolveRequestUser ? await resolveRequestUser(request) : null;
        } catch {
          actor = null;
        }
      }
      const userId = actor?.userId ?? null;
      const systemArm = explicitUserHeader !== null && actor?.isSystem === true;
      const localAdminArm =
        userId === LOCAL_ADMIN_USER_ID &&
        (explicitUserHeader !== null || (sessionHeader !== null && actor?.isSystem === false));
      let admin = systemArm || localAdminArm;
      if (!admin && userId && roleResolver) {
        admin = (await roleResolver.rolesFor(userId)).includes('admin');
      }
      if (!admin) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: hasCredential
            ? `Policy bundle change forbidden: user ${userId ?? '(unauthenticated)'} does not hold the admin role.`
            : 'Policy bundle change forbidden: the request presents no identity credential (x-cl-session or x-user-id).',
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
