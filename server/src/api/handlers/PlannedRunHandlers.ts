/**
 * PlannedRunHandlers — HTTP handlers for planned-run creation from local-protocol.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { PlannedRunFromLocalProtocolService } from '../../protocol/PlannedRunFromLocalProtocolService.js';
import { runRunPlanCompile } from '../../compiler/pipeline/runRunPlanCompile.js';

// ---------------------------------------------------------------------------
// Well-ID validation patterns per plate kind
// ---------------------------------------------------------------------------

const WELL_ID_PATTERNS: Record<string, RegExp> = {
  '96': /^[A-H](1[0-2]|[1-9])$/,
  '384': /^[A-P](1[0-9]|2[0-4]|[1-9])$/,
  '6': /^[A-B](1|2|3)$/,
};

/**
 * Lenient well-id pattern used when plate kind is unknown.
 */
const WELL_ID_LENIENT = /^[A-Z]\d+$/;

/**
 * Validate sample-map entries against a plate kind.
 *
 * Returns { ok: true } on success, or { ok: false, reason: string } on failure.
 *
 * When plateKind is unknown, defaults to the 96-well pattern (most common).
 */
export function validateSampleMapEntries(
  entries: Array<{ wellId: string; sampleLabel: string }>,
  plateKind?: string,
): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(entries)) {
    return { ok: false, reason: 'entries must be an array' };
  }

  // Default to 96-well pattern when plate kind is unknown (most common case)
  const pattern = plateKind ? WELL_ID_PATTERNS[plateKind] : WELL_ID_PATTERNS['96'];

  const seenWellIds = new Set<string>();

  for (const entry of entries) {
    // Check wellId pattern
    if (!pattern.test(entry.wellId)) {
      return {
        ok: false,
        reason: `well id '${entry.wellId}' does not match expected pattern`,
      };
    }

    // Check for duplicate wellId
    if (seenWellIds.has(entry.wellId)) {
      return {
        ok: false,
        reason: `duplicate well id '${entry.wellId}'`,
      };
    }
    seenWellIds.add(entry.wellId);

    // Check sampleLabel is non-empty
    if (!entry.sampleLabel || entry.sampleLabel.length === 0) {
      return {
        ok: false,
        reason: `sampleLabel for well '${entry.wellId}' must be non-empty`,
      };
    }
  }

  return { ok: true };
}

/**
 * Response shape for successful planned-run creation.
 */
export interface CreatePlannedRunResponse {
  plannedRunId: string;
  state: string;
}

/**
 * Request body for updating planned-run bindings.
 */
export interface UpdatePlannedRunBindingsRequest {
  labware?: Array<{ roleId: string; labwareInstanceRef: string }>;
  materials?: Array<{ roleId: string; materialInstanceRef: string }>;
  deckPlatformId?: string;
}

/**
 * Create planned-run handlers bound to the given AppContext.
 */
export function createPlannedRunHandlers(ctx: AppContext) {
  const service = new PlannedRunFromLocalProtocolService(ctx.store);

  return {
    /**
     * POST /runs/from-local-protocol
     *
     * Create a planned-run draft from a local-protocol record.
     *
     * Body: { localProtocolRef: string, title?: string }
     *
     * Returns { plannedRunId, state } on success (201).
     * Returns 400 when localProtocolRef is missing or the resolved record
     * is not a local-protocol.
     * Returns 404 when the local-protocol record is not found.
     */
    async createFromLocalProtocol(
      request: FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>,
      reply: FastifyReply,
    ): Promise<CreatePlannedRunResponse | ApiError> {
      const { localProtocolRef, title } = request.body ?? {};
      const result = await service.createFromLocalProtocol(
        localProtocolRef,
        title ? { title } : {},
      );

      if (!result.ok) {
        reply.status(result.status);
        return {
          error: 'CREATE_PLANNED_RUN_FAILED',
          message: result.reason,
        };
      }

      reply.status(201);
      return {
        plannedRunId: result.plannedRunRef,
        state: 'draft',
      };
    },

    /**
     * POST /runs/:id/bindings
     *
     * Update bindings on a planned-run.
     *
     * Body: { labware?: [{ roleId, labwareInstanceRef }], materials?: [{ roleId, materialInstanceRef }], deckPlatformId?: string }
     *
     * Returns { success: true } on success (200).
     * Returns 404 when the planned-run is not found.
     * Returns 400 when the record is not a planned-run.
     */
    async updateBindings(
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdatePlannedRunBindingsRequest;
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true } | ApiError> {
      const { id } = request.params;
      const { labware, materials, deckPlatformId } = request.body ?? {};

      // Get the planned-run record
      const record = await ctx.store.getRecord(id);
      if (!record) {
        reply.status(404);
        return {
          error: 'PLANNED_RUN_NOT_FOUND',
          message: `Planned-run '${id}' not found`,
        };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'planned-run') {
        reply.status(400);
        return {
          error: 'NOT_A_PLANNED_RUN',
          message: `Record '${id}' is not a planned-run`,
        };
      }

      // Update bindings
      const existingBindings = (payload.bindings as Record<string, unknown>) ?? {};
      const updatedBindings: Record<string, unknown> = { ...existingBindings };

      if (labware && labware.length > 0) {
        const existingLabware = (updatedBindings.labware as Array<Record<string, unknown>>) ?? [];
        // Replace bindings for the given roleIds
        const labwareRoleIds = new Set(labware.map((b) => b.roleId));
        const filteredLabware = existingLabware.filter(
          (b: Record<string, unknown>) => !labwareRoleIds.has(b.roleId),
        );
        for (const binding of labware) {
          filteredLabware.push({
            roleId: binding.roleId,
            labwareInstanceRef: { kind: 'record', id: binding.labwareInstanceRef },
          });
        }
        updatedBindings.labware = filteredLabware;
      }

      if (materials && materials.length > 0) {
        const existingMaterials = (updatedBindings.materials as Array<Record<string, unknown>>) ?? [];
        const materialRoleIds = new Set(materials.map((b) => b.roleId));
        const filteredMaterials = existingMaterials.filter(
          (b: Record<string, unknown>) => !materialRoleIds.has(b.roleId),
        );
        for (const binding of materials) {
          filteredMaterials.push({
            roleId: binding.roleId,
            materialRef: { kind: 'record', id: binding.materialInstanceRef },
          });
        }
        updatedBindings.materials = filteredMaterials;
      }

      payload.bindings = updatedBindings;

      // Update deckPlatformId if provided
      if (deckPlatformId !== undefined) {
        payload.deckPlatformId = deckPlatformId;
      }

      // Save the updated record
      await ctx.store.updateRecord(id, payload);

      reply.status(200);
      return { success: true };
    },

    /**
     * POST /runs/:id/sample-map
     *
     * Set the sample-map (well-to-sample-label binding) on a planned-run.
     *
     * Body: { mode: 'implicit' } | { mode: 'csv'; entries: [{ wellId, sampleLabel }] }
     *
     * Returns { success: true, mode, entryCount } on success (200).
     * Returns 404 when the planned-run is not found.
     * Returns 400 when validation fails.
     */
    async setSampleMap(
      request: FastifyRequest<{
        Params: { id: string };
        Body:
          | { mode: 'implicit' }
          | { mode: 'csv'; entries: Array<{ wellId: string; sampleLabel: string }> };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; mode: string; entryCount: number } | ApiError> {
      const { id } = request.params;
      const body = request.body;

      // Load planned-run
      const plannedRunEnvelope = await ctx.store.get(id);
      if (!plannedRunEnvelope || (plannedRunEnvelope.payload as Record<string, unknown>).kind !== 'planned-run') {
        reply.status(404);
        return {
          error: 'PLANNED_RUN_NOT_FOUND',
          message: `planned-run ${id} not found`,
        };
      }

      if (body.mode === 'implicit') {
        // Clear the sampleMap field
        const updated = { ...(plannedRunEnvelope.payload as Record<string, unknown>) };
        delete updated.sampleMap;
        await ctx.store.update({
          envelope: { ...plannedRunEnvelope, payload: updated },
          message: 'sample-map: implicit',
        });
        reply.status(200);
        return { success: true, mode: 'implicit', entryCount: 0 };
      }

      if (body.mode === 'csv') {
        const validation = validateSampleMapEntries(body.entries);
        if (!validation.ok) {
          reply.status(400);
          return {
            error: 'INVALID_SAMPLE_MAP',
            message: validation.reason,
          };
        }
        const updated = { ...(plannedRunEnvelope.payload as Record<string, unknown>), sampleMap: body.entries };
        await ctx.store.update({
          envelope: { ...plannedRunEnvelope, payload: updated },
          message: 'sample-map: csv',
        });
        reply.status(200);
        return { success: true, mode: 'csv', entryCount: body.entries.length };
      }

      reply.status(400);
      return {
        error: 'INVALID_MODE',
        message: 'mode must be implicit or csv',
      };
    },
    /**
     * POST /runs/:id/compile
     *
     * Run the run-plan-compile pipeline on a planned-run.
     *
     * Returns { status, diagnostics, eventGraphRef } on success (200).
     * Returns 404 when the planned-run is not found.
     * Returns 400 when the record is not a planned-run.
     */
    async compileRunPlan(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: string; diagnostics: unknown[]; eventGraphRef?: string } | ApiError> {
      const { id } = request.params;

      // Get the planned-run record
      const record = await ctx.store.get(id);
      if (!record) {
        reply.status(404);
        return {
          error: 'PLANNED_RUN_NOT_FOUND',
          message: `Planned-run '${id}' not found`,
        };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'planned-run') {
        reply.status(400);
        return {
          error: 'NOT_A_PLANNED_RUN',
          message: `Record '${id}' is not a planned-run`,
        };
      }

      // Run the compile pipeline
      const result = await runRunPlanCompile({
        plannedRunRef: id,
        recordStore: ctx.store,
      });

      reply.status(200);
      return {
        status: result.runPlanCompileResult.status,
        diagnostics: result.runPlanCompileResult.diagnostics,
        eventGraphRef: result.eventGraphRef,
      };
    },
  };
}

export type PlannedRunHandlers = ReturnType<typeof createPlannedRunHandlers>;
