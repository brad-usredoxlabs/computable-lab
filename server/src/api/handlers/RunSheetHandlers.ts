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
} from '../../storage/acquisitionPackage.js';
import { StorageError } from '../../storage/types.js';

/** The register body: the GC-4 RegisterAcquisitionPackageInput + the
 *  GC-12-added `entryRef` (the instrument-sequence-entry the package
 *  attaches to). deviceId is the CONFIG storage device id (from GET /config)
 *  — NEVER a mount path (bait #7). */
interface RegisterBody {
  deviceId?: string;
  directoryKey?: string;
  roles?: Record<string, string>;
  sampleRef?: { kind: 'record'; id: string; type: string; label?: string };
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
  return {
    async register(request, reply) {
      const body = (request.body ?? {}) as RegisterBody;
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
      const directoryKey = typeof body.directoryKey === 'string' ? body.directoryKey.trim() : '';
      const entryId = body.entryRef?.id;

      if (!deviceId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'deviceId is required — the CONFIG storage device id (from GET /config), never a mount path.' };
      }
      if (!directoryKey) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'directoryKey is required — the .D directory key relative to the device root.' };
      }
      if (!entryId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'entryRef is required — the instrument-sequence-entry the acquisition package attaches to.' };
      }

      // The GC-4 registration flow (CALL IT, don't edit it — spec OUT-stop).
      // Conditional spreads for optional fields (exactOptionalPropertyTypes).
      const input: RegisterAcquisitionPackageInput = {
        deviceId,
        directoryKey,
        ...(body.sampleRef ? { sampleRef: body.sampleRef } : {}),
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
      const existing = await ctx.store.get(entryId);
      if (!existing) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `instrument-sequence-entry not found: ${entryId}` };
      }
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
