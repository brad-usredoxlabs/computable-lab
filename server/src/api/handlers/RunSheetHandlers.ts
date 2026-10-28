/**
 * GC-12 (deliverable D) — RunSheetHandlers: the GC run-sheet "route glue if
 * needed" line, EARNED by the attach + Analyze flows.
 *
 * Two thin routes, exactly like the runWorkspaceHandlers conditional pattern
 * (routes.ts:418-423). They CALL the GC-4 shipped registration service
 * (server/src/storage/acquisitionPackage.ts) — they do NOT re-implement or
 * edit it (the spec's hard OUT-stop):
 *
 *   POST /acquisition-packages/register
 *     body = RegisterAcquisitionPackageInput (+ entryRef: the
 *     instrument-sequence-entry to attach). On success the glue PUTs
 *     `acquisitionPackageRef` onto the target entry via the SAME store the
 *     RecordHandlers use (the spec's "keep it in-handler" — routes.ts:238
 *     semantics untouched).
 *
 *   POST /acquisition-packages/:id/analysis-inputs
 *     the VERIFY-FIRST input resolution (packageAnalysisInputs —
 *     PACKAGE_HASH_DRIFT refused; the trust boundary bait #11 pins). Returns
 *     the pinned `{ signal, package }` data-reference input refs.
 *
 * AUTHORIZATION (fix-cycle-1 D1): both routes are WRITE/READ channels on
 * caller-supplied record ids, so they enforce the SAME gate the RecordHandlers
 * use — resolve the request user (ctx.localIdentityService.resolveRequestUser)
 * and require the access action on the target record via the shared
 * AuthorizationService (ctx.authorizationService.canAccess — the very service
 * RecordHandlers' local `canAccess` wraps). register = write on the target
 * entry; analysis-inputs = read on the target package. The gate runs BEFORE
 * any store write and (for register) BEFORE the ACQP package is minted, so an
 * unauthorized caller neither mints an orphan package nor mutates a record.
 * Deny shape is the existing error wire: 401 { error: 'UNAUTHENTICATED' } when
 * no user resolves, 403 { error: 'FORBIDDEN' } when the user lacks the action.
 * The record routes themselves (PUT /records/:id) are UNTOUCHED — this is the
 * SAME gate, not a new verb.
 *
 * Errors: AcquisitionPackageError tokens propagate VERBATIM as
 * `{ error: <TOKEN>, message }` (the same wire shape the signature/record
 * rejections use). The client (AcquisitionPackageClientError) recovers the
 * named token and renders the per-token named message (bait #6: every token
 * has an explicit surface, no conflation). Status mapping:
 *   DEVICE_MISSING → 400 (a config/mount issue, not a data issue);
 *   analysis-inputs FILE_MISSING → 404 (the package id does not resolve);
 *   everything else → 422.
 *
 * exactOptionalPropertyTypes (server tsconfig:13): optional input fields
 * (sampleRef/roles) are threaded with conditional spreads, never `{x: undefined}`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import {
  registerAcquisitionPackage,
  packageAnalysisInputs,
  AcquisitionPackageError,
  type RegisterAcquisitionPackageInput,
  type PackageFileRole,
} from '../../storage/acquisitionPackage.js';
import { StorageError } from '../../storage/types.js';
import type { AccessAction } from '../../security/AccessControlService.js';

/** The register body: the GC-4 RegisterAcquisitionPackageInput + the
 *  GC-12-added `entryRef` (the instrument-sequence-entry the package
 *  attaches to). deviceId is the CONFIG storage device id (from GET /config)
 *  — NEVER a mount path (bait #7).
 *
 *  fix-cycle-2 D4: the body is the service input VERBATIM (spec D4) —
 *  `roles` is typed as the service's own `PackageFileRole` map (imported,
 *  never re-declared) and `sourceRunRef` is accepted too, so the body
 *  contract and the RegisterAcquisitionPackageInput contract cannot drift
 *  apart again. */
interface RegisterBody {
  deviceId?: string;
  directoryKey?: string;
  roles?: Record<string, PackageFileRole>;
  sampleRef?: { kind: 'record'; id: string; type: string; label?: string };
  sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string };
  entryRef?: { kind: 'record'; id: string; type: string };
}

export interface RunSheetHandlers {
  register(request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply): Promise<unknown>;
  analysisInputs(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<unknown>;
}

/** True when the acquisition error is a config/mount issue (400) rather
 *  than a data issue (422/404). The client renders the NAMED token either
 *  way — the status is HTTP semantics, not the failure surface. */
function isConfigError(code: string): boolean {
  return code === 'PACKAGE_DEVICE_MISSING';
}

export function createRunSheetHandlers(ctx: AppContext): RunSheetHandlers {
  /**
   * The SAME request-user resolution the RecordHandlers use
   * (RecordHandlers.ts:319). A null userId means no resolvable local user —
   * the caller is unauthenticated (401). Never derived from the request body:
   * identity is server-resolved (the architecture of record's signer-identity
   * law applies to every write).
   */
  const resolveRequestUser = async (request: FastifyRequest): Promise<{ userId: string | null } | null> => {
    const user = await ctx.localIdentityService.resolveRequestUser(request);
    if (!user.userId) return null;
    return { userId: user.userId };
  };

  /**
   * The SAME authorization gate the RecordHandlers use (RecordHandlers.ts:329
   * wraps exactly this call). Reuses the shared AuthorizationService — one
   * truth, no second gate.
   */
  const canAccess = async (userId: string | null, action: AccessAction, record: Parameters<AppContext['authorizationService']['canAccess']>[2]): Promise<boolean> =>
    ctx.authorizationService.canAccess(userId, action, record);

  return {
    async register(request, reply) {
      const body = (request.body ?? {}) as RegisterBody;
      const entryId = body.entryRef?.id;

      if (!entryId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'entryRef is required — the instrument-sequence-entry the acquisition package attaches to.' };
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
      const directoryKey = typeof body.directoryKey === 'string' ? body.directoryKey.trim() : '';
      if (!deviceId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'deviceId is required — the CONFIG storage device id (from GET /config), never a mount path.' };
      }
      if (!directoryKey) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'directoryKey is required — the .D directory key relative to the device root.' };
      }

      // The target entry must resolve BEFORE we mint anything (a missing
      // target is a 404, and we never mint an orphan package for one).
      const existing = await ctx.store.get(entryId);
      if (!existing) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `instrument-sequence-entry not found: ${entryId}` };
      }

      // AUTH (fix-cycle-1 D1): the SAME gate RecordHandlers.updateRecord
      // applies — resolve the request user (401 when none), then require
      // WRITE on the target entry (403 when denied). The order mirrors the
      // record update route (404 → 401 → 403). Denied BEFORE the package is
      // minted and BEFORE the store.update — no orphan package, no mutation.
      const user = await resolveRequestUser(request);
      if (!user) {
        reply.status(401);
        return { error: 'UNAUTHENTICATED', message: 'A valid local user is required to attach an acquisition package.' };
      }
      if (!(await canAccess(user.userId, 'write', existing))) {
        reply.status(403);
        return { error: 'FORBIDDEN', message: `User ${user.userId} cannot attach an acquisition package to ${entryId}` };
      }

      // The GC-4 registration flow (CALL IT, don't edit it — spec OUT-stop).
      // Conditional spreads for optional fields (exactOptionalPropertyTypes):
      // the body is RegisterAcquisitionPackageInput verbatim (spec D4), so
      // every documented field is forwarded — roles and sourceRunRef
      // included — or omitted entirely (never `{x: undefined}`).
      const input: RegisterAcquisitionPackageInput = {
        deviceId,
        directoryKey,
        ...(body.sampleRef ? { sampleRef: body.sampleRef } : {}),
        ...(body.roles ? { roles: body.roles } : {}),
        ...(body.sourceRunRef ? { sourceRunRef: body.sourceRunRef } : {}),
      };
      let result;
      try {
        result = await registerAcquisitionPackage(ctx, input);
      } catch (e) {
        if (e instanceof AcquisitionPackageError) {
          reply.code(isConfigError(e.code) ? 400 : 422);
          return { error: e.code, message: e.message };
        }
        // The provider layer surfaces an UNCONFIGURED device id as a
        // StorageError (NOT_FOUND) BEFORE any device config lookup (GC-4
        // D6 step 1). The run-sheet failure surface for that is the NAMED
        // token PACKAGE_DEVICE_MISSING — the honest "the storage device is
        // not configured (or not mounted)" cause, never a generic 500.
        if (e instanceof StorageError) {
          reply.code(400);
          return { error: 'PACKAGE_DEVICE_MISSING', message: e.message };
        }
        throw e;
      }

      // Attach (the GC-12 glue's earned job): PUT acquisitionPackageRef onto
      // the target entry via the SAME store the RecordHandlers use. The entry
      // `state` is unchanged, so no registry-ops lifecycle transition fires —
      // store.update validates+lints the (still-valid) payload and writes.
      // (The write access was already proven above, so this is the SAME gate,
      // not a new update channel.)
      const payload = { ...(existing.payload as Record<string, unknown>) };
      payload.acquisitionPackageRef = { kind: 'record', id: result.packageRecordId, type: 'acquisition-package' };
      const put = await ctx.store.update({
        envelope: {
          recordId: existing.recordId,
          schemaId: existing.schemaId,
          payload,
          ...(existing.meta !== undefined ? { meta: existing.meta } : {}),
        },
        message: `Attach acquisition package ${result.packageRecordId} to ${entryId}`,
      });
      if (!put.success) {
        reply.status(400);
        const detail = put.validation?.errors?.[0]?.message;
        return { error: 'ATTACH_FAILED', message: detail ?? `Failed to attach the acquisition package to ${entryId}` };
      }
      return {
        packageRecordId: result.packageRecordId,
        packagePayload: result.packagePayload,
        entryRecordId: existing.recordId,
      };
    },

    async analysisInputs(request, reply) {
      const id = request.params.id;

      // AUTH (fix-cycle-1 D1): resolve the request user (401 when absent).
      const user = await resolveRequestUser(request);
      if (!user) {
        reply.status(401);
        return { error: 'UNAUTHENTICATED', message: 'A valid local user is required to resolve acquisition-package inputs.' };
      }

      // AUTH (fix-cycle-1 D1): the caller needs READ on the target package.
      // A MISSING package is NOT a FORBIDDEN — it falls through to the
      // service's named PACKAGE_FILE_MISSING 404 (the pre-existing contract),
      // so the gate only denies a RESOLVED package the user cannot read.
      const pkg = await ctx.store.get(id);
      if (pkg && !(await canAccess(user.userId, 'read', pkg))) {
        reply.status(403);
        return { error: 'FORBIDDEN', message: `User ${user.userId} cannot read acquisition-package ${id}` };
      }

      try {
        // VERIFY-FIRST (bait #11): the server re-verifies the package (hash
        // drift refused) and returns the pinned input refs. The client's
        // Analyze flow calls THIS route — never client-side input resolution.
        const inputs = await packageAnalysisInputs(ctx, id);
        return { signal: inputs.signal, package: inputs.package };
      } catch (e) {
        if (e instanceof AcquisitionPackageError) {
          reply.code(e.code === 'PACKAGE_FILE_MISSING' ? 404 : 422);
          return { error: e.code, message: e.message };
        }
        throw e;
      }
    },
  };
}
