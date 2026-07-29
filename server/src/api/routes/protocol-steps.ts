/**
 * Protocol Steps API Routes
 *
 * Endpoints for managing protocol steps and their sub-graphs.
 * These enable the frontend Protocol tab to fetch, display, and edit
 * step information including subGraphRef, settings, and executionMeta.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { StepGraphCompiler } from '../../protocol/StepGraphCompiler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reference to a graph-component-instance (sub-event-graph for a step). */
interface SubGraphRef {
  kind: 'record';
  type: 'graph-component-instance';
  id: string;
}

/** A setting that can be adjusted at execution time. */
interface Setting {
  settingId: string;
  label: string;
  type: string;
  description?: string;
  defaultValue?: unknown;
  isControlled?: boolean;
  isVariable?: boolean;
  unit?: string;
  enum?: unknown[];
  constraints?: Record<string, unknown>;
}

/** Runtime execution tracking for a step. */
interface ExecutionMeta {
  startedAt?: string;
  completedAt?: string;
  executedBy?: string;
  deviations?: Array<{
    deviationId: string;
    description: string;
    severity?: 'info' | 'warning' | 'critical';
    occurredAt?: string;
    resolved?: boolean;
  }>;
}

/** A single protocol step (as stored in the protocol record). */
interface ProtocolStep {
  stepId: string;
  label: string;
  ordinal: number;
  kind: 'add_material' | 'transfer' | 'mix' | 'wash' | 'incubate' | 'read' | 'harvest' | 'other';
  description?: string;
  notes?: string;
  phaseId?: string;
  subGraphRef?: SubGraphRef;
  settings?: Setting[];
  executionMeta?: ExecutionMeta;
  isOptional?: boolean;
  semanticVerb?: unknown;
  methodRequirement?: unknown;
  executionPreference?: unknown;
  plannedOffset?: string;
  // Step-kind-specific fields (carried through from the original step)
  [key: string]: unknown;
}

/** GET /:id/steps response */
interface StepsResponse {
  steps: ProtocolStep[];
}

/** GET /:id/steps/:stepId response */
interface StepResponse {
  step: ProtocolStep;
}

/** GET /:id/steps/:stepId/settings response */
interface SettingsResponse {
  settings: Setting[];
}

/** PATCH /:id/steps/:stepId/settings request body */
interface UpdateSettingsRequest {
  settings: Setting[];
}

/** PATCH /:id/steps/:stepId request body (partial step update) */
interface UpdateStepRequest {
  label?: string;
  description?: string;
  ordinal?: number;
  isOptional?: boolean;
  phaseId?: string;
  subGraphRef?: SubGraphRef | null;
  settings?: Setting[] | null;
  executionMeta?: ExecutionMeta | null;
  notes?: string;
  /** When creating a brand-new step via PATCH (idempotent upsert), these required fields set the step identity. */
  kind?: 'add_material' | 'transfer' | 'mix' | 'wash' | 'incubate' | 'read' | 'harvest' | 'other';
  // Allow arbitrary step-kind-specific fields for flexibility
  [key: string]: unknown;
}

/** POST /:id/steps request body */
interface CreateStepRequest {
  stepId: string;
  label: string;
  ordinal: number;
  kind: 'add_material' | 'transfer' | 'mix' | 'wash' | 'incubate' | 'read' | 'harvest' | 'other';
  description?: string;
  notes?: string;
  phaseId?: string;
  subGraphRef?: SubGraphRef;
  settings?: Setting[];
  isOptional?: boolean;
}

/** Error response */
interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a step by stepId inside the protocol's steps array.
 * Returns { step, index } or null.
 */
function findStep(steps: ProtocolStep[] | undefined, stepId: string):
  | { step: ProtocolStep; index: number }
  | null {
  if (!Array.isArray(steps)) return null;
  const index = steps.findIndex((s) => s.stepId === stepId);
  if (index < 0) return null;
  const step = steps[index];
  if (!step) return null;
  return { step, index };
}

/**
 * Rebuild contiguous ordinals after a step deletion.
 * Steps are sorted by ordinal ascending, then re-numbered 1..N.
 */
function rebuildOrdinals(steps: ProtocolStep[]): ProtocolStep[] {
  const sorted = [...steps].sort((a, b) => a.ordinal - b.ordinal);
  return sorted.map((s, i) => ({ ...s, ordinal: i + 1 }));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Register protocol steps routes.
 *
 * All endpoints live under /api/protocols/:protocolId/steps.
 */
export function registerProtocolStepsRoutes(
  fastify: FastifyInstance,
  ctx: AppContext,
) {
  // ========================================================================
  // GET /api/protocols/:protocolId/steps
  // ========================================================================
  fastify.get<
    { Params: { protocolId: string } },
    StepsResponse | ErrorResponse
  >('/protocols/:protocolId/steps', async (
    request: FastifyRequest<{ Params: { protocolId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      return { steps };
    } catch (error) {
      console.error('Error fetching protocol steps:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch protocol steps',
      };
    }
  });

  // ========================================================================
  // GET /api/protocols/:protocolId/steps/:stepId
  // ========================================================================
  fastify.get<
    { Params: { protocolId: string; stepId: string } },
    StepResponse | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const result = findStep(payload.steps as ProtocolStep[] | undefined, stepId);
      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      return { step: result.step };
    } catch (error) {
      console.error('Error fetching protocol step:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch protocol step',
      };
    }
  });

  // ========================================================================
  // PATCH /api/protocols/:protocolId/steps/:stepId
  // ========================================================================
  fastify.patch<
    { Params: { protocolId: string; stepId: string }; Body: UpdateStepRequest },
    StepResponse | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string }; Body: UpdateStepRequest }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;
      const body = request.body ?? {};

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);

      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      // Build updated step by merging incoming fields onto the existing step
      const updatedStep: ProtocolStep = { ...result.step };

      // Shallow-merge all provided scalar fields
      const scalarKeys: (keyof ProtocolStep)[] = [
        'label', 'description', 'ordinal', 'notes', 'phaseId', 'isOptional',
        'subGraphRef', 'settings', 'executionMeta', 'kind', 'plannedOffset',
      ];
      for (const key of scalarKeys) {
        if (body[key] !== undefined) {
          (updatedStep as Record<string, unknown>)[key] = body[key];
        }
      }

      // Merge/replace step-kind-specific fields (target, wells, material, volume_uL, etc.)
      const kindSpecificKeys = [
        'target', 'source', 'wells', 'material', 'volume_uL', 'cycles',
        'washVolume_uL', 'duration_min', 'temperature_C', 'modality',
        'channels', 'instrumentRole', 'mappingHint', 'producesArtifactId',
        'semanticVerb', 'methodRequirement', 'executionPreference',
      ];
      for (const key of kindSpecificKeys) {
        if (body[key] !== undefined) {
          (updatedStep as Record<string, unknown>)[key] = body[key];
        }
      }

      // Write back
      steps[result.index] = updatedStep;
      payload.steps = steps;

      // Save updated protocol record
      await ctx.store.update({
        envelope: { ...record, payload },
        message: `Update step '${stepId}' in protocol '${protocolId}'`,
      });

      return { step: updatedStep };
    } catch (error) {
      console.error('Error updating protocol step:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update protocol step',
      };
    }
  });

  // ========================================================================
  // POST /api/protocols/:protocolId/steps
  // ========================================================================
  fastify.post<
    { Params: { protocolId: string }; Body: CreateStepRequest },
    StepResponse | ErrorResponse
  >('/protocols/:protocolId/steps', async (
    request: FastifyRequest<{ Params: { protocolId: string }; Body: CreateStepRequest }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const body = request.body;

      // Validate required fields
      if (!body.stepId) {
        reply.status(400);
        return { error: 'MISSING_FIELD', message: 'stepId is required' };
      }
      if (!body.label) {
        reply.status(400);
        return { error: 'MISSING_FIELD', message: 'label is required' };
      }
      if (typeof body.ordinal !== 'number' || body.ordinal < 1) {
        reply.status(400);
        return { error: 'INVALID_ORDINAL', message: 'ordinal must be a positive integer' };
      }

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];

      // Check for duplicate stepId
      if (findStep(steps, body.stepId)) {
        reply.status(400);
        return { error: 'DUPLICATE_STEP_ID', message: `Step '${body.stepId}' already exists in protocol '${protocolId}'` };
      }

      // Build new step
      const newStep: ProtocolStep = {
        stepId: body.stepId,
        label: body.label,
        ordinal: body.ordinal,
        kind: body.kind ?? 'other',
        ...(body.description ? { description: body.description } : {}),
        ...(body.notes ? { notes: body.notes } : {}),
        ...(body.phaseId ? { phaseId: body.phaseId } : {}),
        ...(body.subGraphRef ? { subGraphRef: body.subGraphRef } : {}),
        ...(body.settings ? { settings: body.settings } : {}),
        ...(body.isOptional !== undefined ? { isOptional: body.isOptional } : {}),
      };

      // Add to steps array and re-sort by ordinal
      steps.push(newStep);
      const sortedSteps = [...steps].sort((a, b) => a.ordinal - b.ordinal);

      payload.steps = sortedSteps;

      // Save updated protocol record
      await ctx.store.update({
        envelope: { ...record, payload },
        message: `Add step '${body.stepId}' to protocol '${protocolId}'`,
      });

      return { step: newStep };
    } catch (error) {
      console.error('Error creating protocol step:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create protocol step',
      };
    }
  });

  // ========================================================================
  // DELETE /api/protocols/:protocolId/steps/:stepId
  // ========================================================================
  fastify.delete<
    { Params: { protocolId: string; stepId: string } },
    { success: true; deletedStepId: string } | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);

      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      // Prevent deletion if the step has been executed (has executionMeta with timestamps)
      if (result.step.executionMeta && result.step.executionMeta.startedAt) {
        reply.status(400);
        return {
          error: 'STEP_ALREADY_EXECUTED',
          message: `Step '${stepId}' cannot be deleted — it has already been executed`,
        };
      }

      // Remove step and rebuild ordinals
      const remaining = steps.filter((s) => s.stepId !== stepId);
      const renumbered = rebuildOrdinals(remaining);

      payload.steps = renumbered;

      // Save updated protocol record
      await ctx.store.update({
        envelope: { ...record, payload },
        message: `Delete step '${stepId}' from protocol '${protocolId}'`,
      });

      return { success: true, deletedStepId: stepId };
    } catch (error) {
      console.error('Error deleting protocol step:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete protocol step',
      };
    }
  });

  // ========================================================================
  // GET /api/protocols/:protocolId/steps/:stepId/graph
  // ========================================================================
  fastify.get<
    { Params: { protocolId: string; stepId: string } },
    { graph: unknown } | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId/graph', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);
      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      // Compile the step into a sub-graph
      const compiler = new StepGraphCompiler();
      const bindings = request.query as Record<string, unknown>;
      const compiled = compiler.compileStepToGraph(result.step as any, bindings);

      return { graph: compiled.graph };
    } catch (error) {
      console.error('Error compiling step graph:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to compile step graph',
      };
    }
  });

  // ========================================================================
  // GET /api/protocols/:protocolId/steps/:stepId/settings
  // ========================================================================
  fastify.get<
    { Params: { protocolId: string; stepId: string } },
    SettingsResponse | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId/settings', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);
      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      return { settings: result.step.settings ?? [] };
    } catch (error) {
      console.error('Error fetching step settings:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch step settings',
      };
    }
  });

  // ========================================================================
  // PATCH /api/protocols/:protocolId/steps/:stepId/settings
  // ========================================================================
  fastify.patch<
    { Params: { protocolId: string; stepId: string }; Body: UpdateSettingsRequest },
    SettingsResponse | ErrorResponse
  >('/protocols/:protocolId/steps/:stepId/settings', async (
    request: FastifyRequest<{ Params: { protocolId: string; stepId: string }; Body: UpdateSettingsRequest }>,
    reply: FastifyReply,
  ) => {
    try {
      const protocolId = request.params.protocolId;
      const stepId = request.params.stepId;
      const body = request.body;

      const record = await ctx.store.get(protocolId);
      if (!record) {
        reply.status(404);
        return { error: 'PROTOCOL_NOT_FOUND', message: `Protocol '${protocolId}' not found` };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'protocol') {
        reply.status(400);
        return { error: 'NOT_A_PROTOCOL', message: `Record '${protocolId}' is not a protocol` };
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);
      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      // Update settings on the step
      result.step.settings = body.settings ?? [];
      payload.steps = steps;

      await ctx.store.update({
        envelope: { ...record, payload },
        message: `Update settings for step '${stepId}' in protocol '${protocolId}'`,
      });

      return { settings: result.step.settings ?? [] };
    } catch (error) {
      console.error('Error updating step settings:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update step settings',
      };
    }
  });
}
