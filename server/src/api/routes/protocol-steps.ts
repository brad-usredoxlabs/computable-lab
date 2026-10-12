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
import { checkRealizationProposal } from './RealizationCompileGate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reference to a graph-component-instance or committed event-graph realization. */
interface SubGraphRef {
  kind: 'record';
  type: 'graph-component-instance' | 'event-graph';
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

/**
 * Validate a cycling-program settings value against the declarative profile
 * shape: `{ initial: { temperature_c, duration_sec }, cycles: { count,
 * steps: [{ temperature_c, duration_sec }] } }`. Returns a human message when
 * the value structurally resembles a cycling program but is malformed; null
 * when it is absent/valid (non-program settings are untouched).
 */
function cyclingProgramError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  // Not a cycling program (e.g. a plain temperature or duration) → leave alone.
  if (!('initial' in v) && !('cycles' in v)) return null
  const isNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n)

  const initial = v.initial as Record<string, unknown> | null
  if (typeof initial !== 'object' || initial === null || !isNum(initial.temperature_c) || !isNum(initial.duration_sec)) {
    return 'cycling program initial hold must have numeric temperature_c and duration_sec'
  }
  const cycles = v.cycles as Record<string, unknown> | null
  if (typeof cycles !== 'object' || cycles === null || !isNum(cycles.count) || (cycles.count as number) <= 0) {
    return 'cycling program cycles.count must be a positive number'
  }
  if (!Array.isArray(cycles.steps) || cycles.steps.length < 1) {
    return 'cycling program cycles.steps must contain at least one step'
  }
  for (const stepRaw of cycles.steps) {
    const step = stepRaw as Record<string, unknown> | null
    if (typeof step !== 'object' || step === null || !isNum(step.temperature_c) || !isNum(step.duration_sec)) {
      return 'each cycling program step must have numeric temperature_c and duration_sec'
    }
  }
  return null
}

/** Scan equipment settings for the first malformed cycling program. */
function findMalformedCyclingPrograms(equipments: unknown[]): string | null {
  for (const raw of equipments) {
    if (typeof raw !== 'object' || raw === null) continue
    const settings = (raw as Record<string, unknown>).settings
    if (typeof settings !== 'object' || settings === null) continue
    for (const value of Object.values(settings as Record<string, unknown>)) {
      const err = cyclingProgramError(value)
      if (err) return err
    }
  }
  return null
}

/**
 * Content-lock gate (PROTO-AI-5 G2). Lifecycle states whose payload content
 * is immutable once controlled. This mirrors the human editor's client rule
 * (`app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45`), the
 * PUT handler lock (`RecordHandlers.ts:798` `CONTROLLED_RECORD_LOCKED`, 409),
 * and the store lock (`RecordStoreImpl.ts:661`) — the SAME semantics and code
 * at every layer; the step endpoints were the one path missing the route-level
 * check (the store refused the write but the endpoint still answered 200).
 */
const CONTENT_LOCKED_STATES = ['approved', 'effective', 'superseded', 'archived'];
function contentLocked(payload: Record<string, unknown>): boolean {
  return Boolean(payload.lifecycleId) && CONTENT_LOCKED_STATES.includes(String(payload.state));
}

/** The lock denial in the existing 409 CONTROLLED_RECORD_LOCKED shape. */
function controlledLockedReply(): ErrorResponse {
  return {
    error: 'CONTROLLED_RECORD_LOCKED',
    message: 'Create a new draft to edit an approved or effective document.',
  };
}

/** Result of ctx.store.update — the value previously discarded (G5). */
type StoreUpdateResult = Awaited<ReturnType<AppContext['store']['update']>>;

/**
 * Surface a store refusal as a real failure response instead of a false 200
 * (PROTO-AI-5 G5). Mirrors the EXISTING failure mapping in
 * `RecordHandlers.updateRecord` (`RecordHandlers.ts:864-897`): validation
 * failure → 422, lint failure → 422, controlled-lock → 409, SHA mismatch →
 * 409 with the original conflict string, anything else → 400 with the store's
 * error. Returns null when the store accepted the write. No new mechanism:
 * the PUT path already speaks this mapping.
 */
function surfaceStoreFailure(reply: FastifyReply, result: StoreUpdateResult): ErrorResponse | null {
  if (result.success) return null;
  if (result.validation && !result.validation.valid) {
    reply.status(422);
    const first = result.validation.errors?.[0];
    return {
      error: 'VALIDATION_FAILED',
      message: first ? `${first.path}: ${first.message}` : 'Schema validation rejected the update',
    };
  }
  if (result.lint && !result.lint.valid) {
    reply.status(422);
    return { error: 'LINT_FAILED', message: result.error ?? 'Lint rejected the update' };
  }
  if (result.error?.includes('CONTROLLED_RECORD_LOCKED')) {
    reply.status(409);
    return { error: 'CONTROLLED_RECORD_LOCKED', message: result.error };
  }
  if (result.error?.includes('SHA mismatch')) {
    // Stale expectedSha conflict stays a conflict with its original string
    // (same treatment as RecordHandlers.ts:885-891).
    reply.status(409);
    return { error: result.error, message: result.error };
  }
  reply.status(400);
  return { error: result.error ?? 'STORE_UPDATE_FAILED', message: result.error ?? 'Store refused the update' };
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
      // G2 content-lock gate — mirrors the client rule (protocolStepEditing.ts:45)
      // and the PUT handler lock (RecordHandlers.ts:798). Route-level so the
      // response tells the truth, not just the store backstop.
      if (contentLocked(payload)) {
        reply.status(409);
        return controlledLockedReply();
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

      // Save updated protocol record. G5: the store result is NOT discarded —
      // a refusal (Ajv / controlled lock) must answer with its real failure,
      // not a false 200. Mirrors RecordHandlers.updateRecord's mapping.
      const update = await ctx.store.update({
        envelope: { ...record, payload },
        message: `Update step '${stepId}' in protocol '${protocolId}'`,
      });
      const failure = surfaceStoreFailure(reply, update);
      if (failure) return failure;

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
      // G2 content-lock gate (see PATCH step above for the mirrored pattern).
      if (contentLocked(payload)) {
        reply.status(409);
        return controlledLockedReply();
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

      // Save updated protocol record. G5: surface the store result (see PATCH step).
      const update = await ctx.store.update({
        envelope: { ...record, payload },
        message: `Add step '${body.stepId}' to protocol '${protocolId}'`,
      });
      const failure = surfaceStoreFailure(reply, update);
      if (failure) return failure;

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
      // G2 content-lock gate (see PATCH step above for the mirrored pattern).
      if (contentLocked(payload)) {
        reply.status(409);
        return controlledLockedReply();
      }

      const steps = (payload.steps as ProtocolStep[]) ?? [];
      const result = findStep(steps, stepId);

      if (!result) {
        reply.status(404);
        return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
      }

      // G3 ≥1-step gate. Mirrors the client delete order (protocolStepEditing.ts:90
      // counts BEFORE executedness) and the schema authority's minItems:1
      // (`schema/workflow/protocol.schema.yaml:301-303`) with a stable code
      // instead of a swallowed Ajv 422.
      if (steps.length <= 1) {
        reply.status(422);
        return {
          error: 'MIN_STEPS_REMAIN',
          message: `A protocol needs at least one step. Add another step before deleting '${stepId}'`,
        };
      }

      // Prevent deletion if the step has been executed. PROTO-AI-5 symmetry
      // rule: the STRICTER client rule (startedAt OR completedAt,
      // protocolStepEditing.ts:91-92) is the target; the old route checked
      // startedAt only. Same code/message shape as before (startedAt refusal
      // is byte-compatible).
      if (result.step.executionMeta && (result.step.executionMeta.startedAt || result.step.executionMeta.completedAt)) {
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

      // Save updated protocol record. G5: surface the store result (see PATCH step).
      const update = await ctx.store.update({
        envelope: { ...record, payload },
        message: `Delete step '${stepId}' from protocol '${protocolId}'`,
      });
      const failure = surfaceStoreFailure(reply, update);
      if (failure) return failure;

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

      // Prefer the COMMITTED realization (concept → realization): if the step's
      // subGraphRef points at an event-graph, return its concrete events/labwares.
      // Fall back to compiling the step template on demand.
      const subGraphRef = result.step?.subGraphRef;
      if (subGraphRef && subGraphRef.type === 'event-graph' && subGraphRef.id) {
        const realization = await ctx.store.get(subGraphRef.id);
        const rp = realization?.payload as Record<string, unknown> | null;
        if (rp && rp.kind === 'event-graph') {
          return {
            graph: {
              id: subGraphRef.id,
              name: rp.name ?? `${result.step.label} realization`,
              events: Array.isArray(rp.events) ? rp.events : [],
              labwares: Array.isArray(rp.labwares) ? rp.labwares : [],
            },
          };
        }
      }

      // Compile the step into a sub-graph (derived realization).
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
      // G2 content-lock gate (see PATCH step above for the mirrored pattern).
      if (contentLocked(payload)) {
        reply.status(409);
        return controlledLockedReply();
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

      // G5: surface the store result — invalid settings fail at store Ajv and
      // must NOT be swallowed into a false 200.
      const update = await ctx.store.update({
        envelope: { ...record, payload },
        message: `Update settings for step '${stepId}' in protocol '${protocolId}'`,
      });
      const failure = surfaceStoreFailure(reply, update);
      if (failure) return failure;

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

  // ========================================================================
  // POST /api/protocols/:protocolId/steps/:stepId/subgraph
  // Commit a step's REALIZATION: mint an event-graph from the concrete
  // {events, labwares} and point the step's subGraphRef at it (concept →
  // realization). Replaces any prior committed realization.
  // ========================================================================
  fastify.post<{
    Params: { protocolId: string; stepId: string };
    Body: { events?: unknown[]; labwares?: unknown[]; equipments?: unknown[] };
  }>(
    '/protocols/:protocolId/steps/:stepId/subgraph',
    async (
      request: FastifyRequest<{ Params: { protocolId: string; stepId: string }; Body: { events?: unknown[]; labwares?: unknown[]; equipments?: unknown[] } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { protocolId, stepId } = request.params;
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
        // G2 content-lock gate: committing a realization PATCHes the step's
        // subGraphRef — a content edit like any other (see PATCH step above).
        if (contentLocked(payload)) {
          reply.status(409);
          return controlledLockedReply();
        }
        const steps = (payload.steps as ProtocolStep[]) ?? [];
        const result = findStep(steps, stepId);
        if (!result) {
          reply.status(404);
          return { error: 'STEP_NOT_FOUND', message: `Step '${stepId}' not found in protocol '${protocolId}'` };
        }

        // ---- Deterministic compile-before-commit gate (Phase 4A) -------------
        // Run the reviewed proposal through the declarative event-graph schema
        // (Ajv) + lint + reference-connectivity checks BEFORE marking it
        // accepted. A failing proposal keeps the draft; it is NOT minted or
        // committed, so the UI never flips to "accepted" on an invalid graph.
        // First-class equipment (EQP- record or mint) is declared alongside
        // labware so the event-graph's labwares[] carries it with its settings.
        const labwares = Array.isArray(body.labwares) ? body.labwares : ([] as unknown[])
        const equipments = Array.isArray(body.equipments) ? body.equipments : ([] as unknown[])

        // ---- Cyclic-program settings gate ---------------------------------
        // A thermocycler's `settings[<key>].valueType === 'profile'` value must
        // match the declarative cycling-program shape (initial hold; cycles with
        // a positive count and >=1 {temperature_c, duration_sec} steps). A
        // malformed program is not accepted — the draft is preserved.
        const profileFinding = findMalformedCyclingPrograms(equipments)
        if (profileFinding) {
          reply.status(422);
          return {
            error: 'REALIZATION_NOT_ACCEPTED',
            message: 'Step realization contains a malformed cycling program (a profile setting must have an initial hold + positive cycle count + >=1 steps with temperature_c/duration_sec); the draft is preserved.',
            findings: [{ severity: 'error', code: 'malformed-cycling-program', message: profileFinding, path: '/equipments' }],
          };
        }

        const evento = {
          events: Array.isArray(body.events) ? body.events : ([] as unknown[]),
          // Equipment entries become `kind:'equipment'` labwares entries keyed
          // by equipmentId (so event refs connect and the machinery declares
          // them), carrying settings — never labware geometry.
          labwares: [
            ...labwares,
            ...equipments.map((raw) => {
              const eq = (raw as Record<string, unknown> & { equipmentId?: string })
              const id = typeof eq.equipmentId === 'string' ? eq.equipmentId : (eq.labwareId as string | undefined)
              return {
                kind: 'equipment',
                labwareId: id ?? `eqp:${Date.now().toString(36)}`,
                ...(id ? { equipmentId: id } : {}),
                ...(typeof eq.recordId === 'string' ? { recordId: eq.recordId } : {}),
                ...(typeof eq.name === 'string' ? { name: eq.name } : {}),
                ...(typeof eq.instrumentKind === 'string' ? { instrumentKind: eq.instrumentKind } : {}),
                ...((eq.settings && typeof eq.settings === 'object') ? { settings: eq.settings } : {}),
              }
            }),
          ],
        };
        const gateDeps = {
          // Adapters over the SINGLE validation authority (Ajv) and the
          // declarative lint engine. No second validator is introduced.
          // `await` tolerates both the synchronous AjvValidator and async mocks.
          validate: async (data: unknown, schemaId: string) => {
            const r = await ctx.validator.validate(data, schemaId);
            return { valid: r.valid, errors: r.errors ?? [] };
          },
          lint: async (data: unknown, schemaId: string) => {
            const r = await ctx.lintEngine.lint(data, schemaId);
            return { valid: r.valid, errors: (r.violations ?? []).map((v) => ({ path: v.path ?? '/', message: v.message })) };
          },
        };
        // The exact event-graph payload this commit WILL persist. The gate
        // validates THIS shape (schema + lint), so "accepted" means the persisted
        // record is valid — not just the bare proposal.
        const realizationId = `EVG-STEP-${stepId}-${Date.now().toString(36)}`;
        const now = new Date().toISOString();
        const eventGraphPayload = {
          kind: 'event-graph',
          recordId: realizationId,
          id: realizationId,
          name: `${result.step.label ?? 'Step'} realization`,
          events: evento.events,
          labwares: evento.labwares,
          status: 'filed',
          createdAt: now,
          updatedAt: now,
        };
        const gate = await checkRealizationProposal(
          evento.events as { eventId: string; details?: Record<string, unknown> }[],
          evento.labwares as { labwareId: string }[],
          gateDeps,
          eventGraphPayload,
        );
        if (!gate.valid) {
          reply.status(422);
          return {
            error: 'REALIZATION_NOT_ACCEPTED',
            message: 'Step realization failed the deterministic schema/lint/reference gate; the draft is preserved.',
            findings: gate.findings,
          };
        }
        // Commit the REVIEWED realization (the gate does not mutate the proposal).
        eventGraphPayload.events = gate.events;
        eventGraphPayload.labwares = gate.labwares;
        const eventGraphEnvelope = {
          recordId: realizationId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
          payload: eventGraphPayload,
          meta: { createdAt: now, updatedAt: now },
        };
        const created = await ctx.store.create({ envelope: eventGraphEnvelope, message: `Realize step '${stepId}' as ${realizationId}` });
        if (!created.success) {
          reply.status(422);
          return { error: 'CREATE_FAILED', message: created.error ?? 'Failed to create realization event-graph' };
        }

        // Point the step at its realization.
        const subGraphRef = { kind: 'record' as const, id: realizationId, type: 'event-graph' as const };
        result.step = { ...result.step, subGraphRef };
        steps[result.index] = result.step;
        payload.steps = steps;
        // G5: the realization-create result was already surfaced; the protocol
        // PATCH that points the step at it must surface a refusal too, not a
        // false 200 claiming the ref was committed.
        const refUpdate = await ctx.store.update({
          envelope: { ...record, payload },
          message: `Commit realization ${realizationId} to step '${stepId}' in protocol '${protocolId}'`,
        });
        const refFailure = surfaceStoreFailure(reply, refUpdate);
        if (refFailure) return refFailure;

        return { subGraphRef, realizationId };
      } catch (error) {
        console.error('Error committing step realization:', error);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to commit step realization',
        };
      }
    },
  );
}
