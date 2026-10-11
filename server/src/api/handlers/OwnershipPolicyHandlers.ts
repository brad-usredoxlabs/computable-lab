/**
 * OwnershipPolicyHandlers — GET/PUT /settings/ownership-policy (OWN-9, plan §T9).
 *
 * The ownership-policy document is a RECORD like any other, so its admin gate is
 * the record-scoped ACL on its OWN access-policy row (D7): canAccess(userId,
 * 'admin', record). No role strings, no role resolver, no identity special-cases
 * in this file — the only constants are the imported document identity ones.
 *
 * DEV-2 (orchestrator-mandated, QMS-8 FIX-RUN-1 defect-1 precedent): the shipped
 * LocalIdentityService resolves a request with NO credential to the first active
 * user, or to the bootstrap system admin (LocalIdentityService.ts:125-138). That
 * implicit fallback is NOT a credential for a privileged write, so PUT computes
 * hasCredential from the header trio FIRST and denies 403 before consulting
 * canAccess. A presented-but-unknown credential resolves to userId:null and then
 * fails closed through canAccess (policy exists -> !userId -> false,
 * AccessControlService.ts:66). GET stays ungated (orch adjudication OQ2: same as
 * GET /settings/lab; the document is committed seed data).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { LocalIdentityService } from '../../security/LocalIdentityService.js';
import type { AuthorizationService } from '../../security/AuthorizationService.js';
import {
  coerceOwnershipPolicy,
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
  type OwnershipPolicyService,
} from '../../security/OwnershipPolicyService.js';

export interface OwnershipPolicyHandlers {
  getOwnershipPolicy(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  putOwnershipPolicy(request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply): Promise<unknown>;
}

export function createOwnershipPolicyHandlers(deps: {
  store: RecordStore;
  service: OwnershipPolicyService;
  identityService: LocalIdentityService;
  authorizationService: AuthorizationService;
}): OwnershipPolicyHandlers {
  const { store, service, identityService, authorizationService } = deps;

  async function resolveDocument() {
    const doc = await service.activeLabPolicy();
    if (doc) return store.get(doc.recordId);
    return store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);   // LOAD-BEARING (AS-ORCH-L1-042):
    // activeLabPolicy() lists by kind and is blind to the seed-dir copy of OWN-LAB-DEFAULT at
    // boot, while get-by-ID finds it (orch runtime-proved 20261011T1025: GET
    // /api/records/OWN-LAB-DEFAULT -> 200). Without this fallback GET/PUT 404 on a boot-fresh
    // lane. Keep verbatim.
  }

  /** DEV-2 credential signal: the same header trio LabSettingsHandlers.ts:183-185
   *  accepts. An empty header value is NOT a credential (QMS-8 residual finding). */
  function hasCredential(request: FastifyRequest): boolean {
    const headerValue = (name: string): string | null => {
      const v = request.headers[name];
      if (typeof v === 'string') return v.length > 0 ? v : null;
      if (Array.isArray(v)) {
        const first = v[0];
        return typeof first === 'string' && first.length > 0 ? first : null;
      }
      return null;
    };
    return (
      headerValue('x-user-id') !== null ||
      headerValue('x-computable-user-id') !== null ||
      headerValue('x-cl-session') !== null
    );
  }

  return {
    /** GET /settings/ownership-policy — ungated (OQ2 adjudication; committed seed data). */
    async getOwnershipPolicy(_request, reply) {
      const record = await resolveDocument();
      const doc = await service.activeLabPolicy();
      if (!record) {
        reply.status(200);
        return { record: null, resolved: null, defaults: null };
      }
      // DEV-1 (orch-ratified): on a seed-blind boot activeLabPolicy() is null while the
      // by-id fallback above finds the record — coerce the found envelope so `resolved`
      // carries the honest origin view instead of null (AS-ORCH-L1-042). coerceOwnershipPolicy
      // returns null for malformed payloads, so the response shape is unchanged.
      return { record, resolved: doc ?? coerceOwnershipPolicy(record) };
    },

    /** PUT /settings/ownership-policy — replaces the document body (admin only, via the
     *  document's OWN access-policy ACL). */
    async putOwnershipPolicy(request, reply) {
      const credentialPresented = hasCredential(request);
      const record = await resolveDocument();
      if (!record) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: 'No ownership-policy document installed' };
      }
      if (!credentialPresented) {
        // DEV-2: fail closed BEFORE consulting canAccess — an implicit identity fallback
        // is not a credential for a privileged write (QMS-8 FIX-RUN-1 defect 1).
        reply.status(403);
        return {
          error: 'ACCESS_DENIED',
          message: 'Editing the ownership policy requires an identity credential (x-cl-session or x-user-id).',
        };
      }
      const user = await identityService.resolveRequestUser(request);
      if (!(await authorizationService.canAccess(user.userId, 'admin', record))) {
        reply.status(403);
        return { error: 'ACCESS_DENIED', message: `User ${user.userId ?? '(unknown)'} cannot edit the ownership policy` };
      }
      // DEV-3: RecordStore.validate takes a RecordEnvelope (store/types.ts:155), not
      // {schemaId, payload} — build the envelope the validator will check payload against.
      const validation = await store.validate({
        recordId: record.recordId,
        schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
        payload: request.body,
      });
      if (!validation.valid) {
        reply.status(422);
        return { error: 'INVALID_POLICY', validation };
      }
      const result = await store.update({
        envelope: { ...record, payload: request.body },
        message: 'Update ownership-policy',
      });
      if (!result.success) {
        reply.status(422);
        return {
          error: result.error ?? 'UPDATE_FAILED',
          ...(result.validation !== undefined ? { validation: result.validation } : {}),
        };
      }
      return { success: true, record: result.envelope ?? await store.get(record.recordId) };
    },
  };
}
