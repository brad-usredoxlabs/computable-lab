/**
 * Run Execution API Routes
 *
 * Endpoints for managing run execution lifecycle:
 * planned → in_progress → completed, with step-level execution tracking
 * and deviation capture.
 *
 * Run record schema: studies/run.schema.yaml
 * Status enum: [ planned, in_progress, completed, aborted, failed, superseded ]
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { computeDiff, type EventDiff, type GraphEvent } from '../../utils/eventGraphDiff.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Error response shape. */
interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Request body for starting a run execution.
 */
interface StartRunRequest {
  /** Operator/user reference executing this run. */
  executedBy: string;
  /** ISO-8601 timestamp when execution started. */
  startedAt?: string;
}

/**
 * Request body for updating step execution metadata.
 */
interface ExecuteStepRequest {
  /** ISO-8601 timestamp when step execution started. */
  startedAt?: string;
  /** ISO-8601 timestamp when step execution completed. */
  completedAt?: string;
  /** Actual settings used during execution (may differ from planned). */
  settings?: Record<string, unknown>;
  /** Deviations from the planned protocol. */
  deviations?: Array<{
    /** Machine-readable deviation code. */
    code: string;
    /** Human-readable description. */
    message: string;
    /** Severity level. */
    severity?: 'info' | 'warning' | 'error';
    /** Operator who reported this deviation. */
    reportedBy?: string;
    /** ISO-8601 timestamp when the deviation was reported. */
    reportedAt?: string;
  }>;
}

/**
 * Request body for completing a run execution.
 */
interface CompleteRunRequest {
  /** ISO-8601 timestamp when execution completed. */
  completedAt?: string;
  /** Reference to the executed event graph record. */
  executedEventGraphId?: string;
}

/**
 * Request body for starting a step within a run.
 */
interface StartStepRequest {
  /** ISO-8601 timestamp when step execution started. */
  startedAt?: string;
  /** Operator/user reference executing this step. */
  executedBy?: string;
}

/**
 * Request body for completing a step within a run.
 */
interface CompleteStepRequest {
  /** ISO-8601 timestamp when step execution completed. */
  completedAt?: string;
  /** Operator/user reference completing this step. */
  executedBy?: string;
  /** Deviations from the planned protocol. */
  deviations?: Array<{
    /** Machine-readable deviation code. */
    deviationId: string;
    /** Human-readable description. */
    description: string;
    /** Severity level. */
    severity?: 'info' | 'warning' | 'critical';
    /** ISO-8601 timestamp when the deviation occurred. */
    occurredAt?: string;
    /** Whether the deviation has been resolved. */
    resolved?: boolean;
  }>;
}

/**
 * Request body for updating an event execution timestamp.
 */
interface UpdateEventTimestampRequest {
  /** ISO-8601 timestamp when the event started. */
  startedAt?: string;
  /** ISO-8601 timestamp when the event completed. */
  completedAt?: string;
}

/** Run payload type for type-safe access. */
interface RunPayload {
  kind: string;
  recordId: string;
  title?: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  executedBy?: string;
  plannedEventGraphId?: string;
  executedEventGraphId?: string;
  executionTracking?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the run is in an expected status for the requested action.
 * Returns { ok: true } or { ok: false, error, message }.
 */
function validateTransition(
  currentStatus: string,
  expectedStatuses: string[],
  action: string,
  runId: string,
): { ok: true } | { ok: false; error: string; message: string } {
  if (!expectedStatuses.includes(currentStatus)) {
    return {
      ok: false,
      error: 'INVALID_STATE_TRANSITION',
      message: `Cannot ${action}: run '${runId}' is in status '${currentStatus}', expected one of [${expectedStatuses.join(', ')}]`,
    };
  }
  return { ok: true };
}

/**
 * Generate a planned event graph record ID for a run.
 */
function generatePlannedEventGraphId(runId: string): string {
  return `EVG-planned-${runId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
}

/**
 * Generate an executed event graph record ID for a run.
 */
function generateExecutedEventGraphId(runId: string): string {
  return `EVG-executed-${runId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Register run execution routes.
 *
 * All endpoints live under /api/runs/:runId/
 */
export function registerRunExecutionRoutes(
  fastify: FastifyInstance,
  ctx: AppContext,
) {
  // ========================================================================
  // POST /api/runs/:runId/start
  // ========================================================================
  /**
   * Start run execution.
   *
   * Transitions the run from 'planned' to 'in_progress'.
   * Sets executedBy, startedAt, and creates a planned event graph ID if not
   * already present.
   *
   * Body: { executedBy: string, startedAt?: string }
   * Returns: { success: true, run: { recordId, status, executedBy, startedAt, plannedEventGraphId } }
   */
  fastify.post<
    { Params: { runId: string }; Body: StartRunRequest },
    { success: true; run: Record<string, unknown> } | ErrorResponse
  >(
    '/runs/:runId/start',
    async (
      request: FastifyRequest<{ Params: { runId: string }; Body: StartRunRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const body = request.body ?? {};

        // Validate required fields
        if (!body.executedBy) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'executedBy is required' };
        }

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate state transition
        const transition = validateTransition(
          payload.status,
          ['planned'],
          'start run',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Build updated payload
        const updated: RunPayload = { ...payload };
        updated.status = 'in_progress';
        updated.executedBy = body.executedBy;
        updated.startedAt = body.startedAt ?? new Date().toISOString();

        // Initialize executionTracking
        if (!updated.executionTracking) {
          updated.executionTracking = {
            startedAt: updated.startedAt,
            executedBy: body.executedBy,
            currentEventIndex: 0,
            totalEvents: 0,
            completedEvents: 0,
            deviationCount: 0,
          };
        }

        // Generate plannedEventGraphId if not already set
        if (!updated.plannedEventGraphId) {
          updated.plannedEventGraphId = generatePlannedEventGraphId(runId);
        }

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload: updated },
          message: `Start execution of run '${runId}' by ${body.executedBy}`,
        });

        reply.status(200);
        return {
          success: true,
          run: {
            recordId: updated.recordId,
            status: updated.status,
            executedBy: updated.executedBy,
            startedAt: updated.startedAt,
            plannedEventGraphId: updated.plannedEventGraphId,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, `Error starting run: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start run execution',
        };
      }
    },
  );

  // ========================================================================
  // PATCH /api/runs/:runId/steps/:stepId/execute
  // ========================================================================
  /**
   * Update step execution metadata.
   *
   * Captures execution timestamps, settings changes, and deviations for a
   * specific step within a run. Updates the run's executionTracking counters.
   *
   * Body: { startedAt?: string, completedAt?: string, settings?: object, deviations?: array }
   * Returns: { success: true, stepId: string }
   */
  fastify.patch<
    { Params: { runId: string; stepId: string }; Body: ExecuteStepRequest },
    { success: true; stepId: string } | ErrorResponse
  >(
    '/runs/:runId/steps/:stepId/execute',
    async (
      request: FastifyRequest<{ Params: { runId: string; stepId: string }; Body: ExecuteStepRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const stepId = request.params.stepId;
        const body = request.body ?? {};

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in_progress
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'update step execution',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Initialize executionTracking if needed
        const tracking = (payload.executionTracking as Record<string, unknown>) ?? {};
        const updatedTracking: Record<string, unknown> = { ...tracking };

        // Store step-level execution metadata under stepExecution[stepId]
        const stepExecutions = (updatedTracking.stepExecution as Record<string, unknown>) ?? {};
        const stepMeta: Record<string, unknown> = (stepExecutions[stepId] as Record<string, unknown>) ?? {};

        // Merge startedAt/completedAt
        if (body.startedAt !== undefined) {
          stepMeta.startedAt = body.startedAt;
        }
        if (body.completedAt !== undefined) {
          stepMeta.completedAt = body.completedAt;
          // Increment completed event counter
          updatedTracking.completedEvents =
            (typeof updatedTracking.completedEvents === 'number' ? updatedTracking.completedEvents : 0) + 1;
        }

        // Merge settings
        if (body.settings !== undefined) {
          stepMeta.settings = body.settings;
        }

        // Merge deviations
        if (body.deviations && body.deviations.length > 0) {
          const existingDeviations: Array<unknown> = Array.isArray(stepMeta.deviations)
            ? stepMeta.deviations
            : [];
          stepMeta.deviations = [...existingDeviations, ...body.deviations];

          // Count deviations
          const totalDeviations =
            (typeof updatedTracking.deviationCount === 'number' ? updatedTracking.deviationCount : 0) + body.deviations.length;
          updatedTracking.deviationCount = totalDeviations;
        }

        // Write back step execution metadata
        stepExecutions[stepId] = stepMeta;
        updatedTracking.stepExecution = stepExecutions;
        payload.executionTracking = updatedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Update step '${stepId}' execution in run '${runId}'`,
        });

        reply.status(200);
        return { success: true, stepId };
      } catch (error) {
        fastify.log.error({ error }, `Error updating step execution: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update step execution',
        };
      }
    },
  );

  // ========================================================================
  // POST /api/runs/:runId/complete
  // ========================================================================
  /**
   * Complete run execution.
   *
   * Transitions the run from 'in_progress' to 'completed'.
   * Sets completedAt, executedEventGraphId, and finalizes executionTracking.
   *
   * Body: { completedAt?: string, executedEventGraphId?: string }
   * Returns: { success: true, run: { recordId, status, completedAt, executedEventGraphId } }
   */
  fastify.post<
    { Params: { runId: string }; Body: CompleteRunRequest },
    { success: true; run: Record<string, unknown> } | ErrorResponse
  >(
    '/runs/:runId/complete',
    async (
      request: FastifyRequest<{ Params: { runId: string }; Body: CompleteRunRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const body = request.body ?? {};

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate state transition
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'complete run',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Build updated payload
        const updated: RunPayload = { ...payload };
        updated.status = 'completed';

        const completedAt = body.completedAt ?? new Date().toISOString();
        updated.endedAt = completedAt;

        // Set executedEventGraphId
        if (body.executedEventGraphId) {
          updated.executedEventGraphId = body.executedEventGraphId;
        } else if (!updated.executedEventGraphId) {
          updated.executedEventGraphId = generateExecutedEventGraphId(runId);
        }

        // Finalize executionTracking
        const tracking = (updated.executionTracking as Record<string, unknown>) ?? {};
        const finalizedTracking: Record<string, unknown> = { ...tracking };
        finalizedTracking.completedAt = completedAt;
        updated.executionTracking = finalizedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload: updated },
          message: `Complete execution of run '${runId}'`,
        });

        reply.status(200);
        return {
          success: true,
          run: {
            recordId: updated.recordId,
            status: updated.status,
            startedAt: updated.startedAt,
            completedAt,
            endedAt: updated.endedAt,
            executedBy: updated.executedBy,
            executedEventGraphId: updated.executedEventGraphId,
            plannedEventGraphId: updated.plannedEventGraphId,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, `Error completing run: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to complete run execution',
        };
      }
    },
  );

  // ========================================================================
  // POST /api/runs/:runId/step/:stepId/start
  // ========================================================================
  /**
   * Record step start timestamp.
   *
   * Records when a specific step within a run started executing.
   * Updates executionTracking.stepExecution[stepId].startedAt.
   *
   * Body: { startedAt?: string, executedBy?: string }
   * Returns: { success: true, stepId: string, startedAt: string }
   */
  fastify.post<
    { Params: { runId: string; stepId: string }; Body: StartStepRequest },
    { success: true; stepId: string; startedAt: string } | ErrorResponse
  >(
    '/runs/:runId/step/:stepId/start',
    async (
      request: FastifyRequest<{ Params: { runId: string; stepId: string }; Body: StartStepRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const stepId = request.params.stepId;
        const body = request.body ?? {};

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in_progress
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'start step execution',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        const startedAt = body.startedAt ?? new Date().toISOString();

        // Initialize executionTracking if needed
        const tracking = (payload.executionTracking as Record<string, unknown>) ?? {};
        const updatedTracking: Record<string, unknown> = { ...tracking };

        // Store step start under stepExecution[stepId]
        const stepExecutions = (updatedTracking.stepExecution as Record<string, unknown>) ?? {};
        const stepMeta: Record<string, unknown> = (stepExecutions[stepId] as Record<string, unknown>) ?? {};
        stepMeta.startedAt = startedAt;
        if (body.executedBy) {
          stepMeta.executedBy = body.executedBy;
        }

        stepExecutions[stepId] = stepMeta;
        updatedTracking.stepExecution = stepExecutions;
        payload.executionTracking = updatedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Step '${stepId}' started in run '${runId}' at ${startedAt}`,
        });

        reply.status(200);
        return { success: true, stepId, startedAt };
      } catch (error) {
        fastify.log.error({ error }, `Error starting step: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record step start',
        };
      }
    },
  );

  // ========================================================================
  // POST /api/runs/:runId/step/:stepId/complete
  // ========================================================================
  /**
   * Record step completion with optional deviations.
   *
   * Records when a specific step within a run completed, with optional
   * deviation capture. Updates executionTracking.stepExecution[stepId].
   *
   * Body: { completedAt?: string, executedBy?: string, deviations?: array }
   * Returns: { success: true, stepId: string, completedAt: string, deviations: number }
   */
  fastify.post<
    { Params: { runId: string; stepId: string }; Body: CompleteStepRequest },
    { success: true; stepId: string; completedAt: string; deviations: number } | ErrorResponse
  >(
    '/runs/:runId/step/:stepId/complete',
    async (
      request: FastifyRequest<{ Params: { runId: string; stepId: string }; Body: CompleteStepRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const stepId = request.params.stepId;
        const body = request.body ?? {};

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in_progress
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'complete step execution',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        const completedAt = body.completedAt ?? new Date().toISOString();

        // Initialize executionTracking if needed
        const tracking = (payload.executionTracking as Record<string, unknown>) ?? {};
        const updatedTracking: Record<string, unknown> = { ...tracking };

        // Store step completion under stepExecution[stepId]
        const stepExecutions = (updatedTracking.stepExecution as Record<string, unknown>) ?? {};
        const stepMeta: Record<string, unknown> = (stepExecutions[stepId] as Record<string, unknown>) ?? {};
        stepMeta.completedAt = completedAt;
        if (body.executedBy) {
          stepMeta.executedBy = body.executedBy;
        }

        // Track deviations
        let deviationsCount = 0;
        if (body.deviations && body.deviations.length > 0) {
          const existingDeviations: Array<unknown> = Array.isArray(stepMeta.deviations)
            ? stepMeta.deviations
            : [];
          stepMeta.deviations = [...existingDeviations, ...body.deviations];
          deviationsCount = body.deviations.length;

          // Update run-level deviation counter
          updatedTracking.deviationCount =
            (typeof updatedTracking.deviationCount === 'number' ? updatedTracking.deviationCount : 0) + deviationsCount;
        }

        // Increment completed event counter
        updatedTracking.completedEvents =
          (typeof updatedTracking.completedEvents === 'number' ? updatedTracking.completedEvents : 0) + 1;

        stepExecutions[stepId] = stepMeta;
        updatedTracking.stepExecution = stepExecutions;
        payload.executionTracking = updatedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Step '${stepId}' completed in run '${runId}' at ${completedAt}`,
        });

        reply.status(200);
        return { success: true, stepId, completedAt, deviations: deviationsCount };
      } catch (error) {
        fastify.log.error({ error }, `Error completing step: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record step completion',
        };
      }
    },
  );

  // ========================================================================
  // PATCH /api/runs/:runId/event/:eventId/timestamp
  // ========================================================================
  /**
   * Update event execution timestamp.
   *
   * Updates the execution timestamp(s) for a specific event within a run.
   * Supports updating startedAt and/or completedAt independently.
   *
   * Body: { startedAt?: string, completedAt?: string }
   * Returns: { success: true, eventId: string, startedAt?: string, completedAt?: string }
   */
  fastify.patch<
    { Params: { runId: string; eventId: string }; Body: UpdateEventTimestampRequest },
    { success: true; eventId: string; startedAt?: string; completedAt?: string } | ErrorResponse
  >(
    '/runs/:runId/event/:eventId/timestamp',
    async (
      request: FastifyRequest<{ Params: { runId: string; eventId: string }; Body: UpdateEventTimestampRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const eventId = request.params.eventId;
        const body = request.body ?? {};

        // Validate at least one timestamp is provided
        if (body.startedAt === undefined && body.completedAt === undefined) {
          reply.status(400);
          return {
            error: 'MISSING_FIELD',
            message: 'At least one of startedAt or completedAt must be provided',
          };
        }

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in_progress
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'update event timestamp',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Initialize executionTracking if needed
        const tracking = (payload.executionTracking as Record<string, unknown>) ?? {};
        const updatedTracking: Record<string, unknown> = { ...tracking };

        // Store event timestamp under stepExecution[eventId] (events map to steps in execution tracking)
        const stepExecutions = (updatedTracking.stepExecution as Record<string, unknown>) ?? {};
        const eventMeta: Record<string, unknown> = (stepExecutions[eventId] as Record<string, unknown>) ?? {};

        if (body.startedAt !== undefined) {
          eventMeta.startedAt = body.startedAt;
        }
        if (body.completedAt !== undefined) {
          eventMeta.completedAt = body.completedAt;
          // Increment completed event counter if this is a new completion
          if (!eventMeta.completedAt) {
            updatedTracking.completedEvents =
              (typeof updatedTracking.completedEvents === 'number' ? updatedTracking.completedEvents : 0) + 1;
          }
        }

        stepExecutions[eventId] = eventMeta;
        updatedTracking.stepExecution = stepExecutions;
        payload.executionTracking = updatedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Update event '${eventId}' timestamp in run '${runId}'`,
        });

        reply.status(200);
        const response: { success: true; eventId: string; startedAt?: string; completedAt?: string } = {
          success: true,
          eventId,
        };
        if (body.startedAt !== undefined) response.startedAt = body.startedAt;
        if (body.completedAt !== undefined) response.completedAt = body.completedAt;
        return response;
      } catch (error) {
        fastify.log.error({ error }, `Error updating event timestamp: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update event timestamp',
        };
      }
    },
  );

  // ========================================================================
  // POST /api/runs/:runId/settings
  // ========================================================================
  /**
   * Save a setting value for a step in a run.
   *
   * Stores operator-provided setting overrides in the run's executionSettings
   * under executionSettings[stepId][settingId]. Used to capture what values
   * an operator actually used during execution (may differ from protocol defaults).
   *
   * Body: { stepId: string, settingId: string, value: unknown }
   * Returns: { success: true, stepId: string, settingId: string, value: unknown }
   */
  fastify.post<
    { Params: { runId: string }; Body: { stepId: string; settingId: string; value: unknown } },
    { success: true; stepId: string; settingId: string; value: unknown } | ErrorResponse
  >(
    '/runs/:runId/settings',
    async (
      request: FastifyRequest<{ Params: { runId: string }; Body: { stepId: string; settingId: string; value: unknown } }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const body = request.body ?? {};

        // Validate required fields
        if (!body.stepId) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'stepId is required' };
        }
        if (!body.settingId) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'settingId is required' };
        }

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in_progress
        const transition = validateTransition(
          payload.status,
          ['in_progress'],
          'save setting',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Initialize executionSettings if needed
        const executionSettings = (payload.executionSettings as Record<string, Record<string, unknown>>) ?? {};
        const stepSettings = (executionSettings[body.stepId] as Record<string, unknown>) ?? {};
        stepSettings[body.settingId] = body.value;
        executionSettings[body.stepId] = stepSettings;
        payload.executionSettings = executionSettings;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Set setting '${body.settingId}' for step '${body.stepId}' in run '${runId}'`,
        });

        reply.status(200);
        return {
          success: true,
          stepId: body.stepId,
          settingId: body.settingId,
          value: body.value,
        };
      } catch (error) {
        fastify.log.error({ error }, `Error saving setting: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to save setting',
        };
      }
    },
  );

  // ========================================================================
  // Deviation tracking types
  // ========================================================================

  /** Deviation record for a run. */
  interface DeviationRecord {
    /** Unique deviation identifier. */
    deviationId: string;
    /** Human-readable description of the deviation. */
    description: string;
    /** Machine-readable deviation code. */
    code?: string;
    /** Severity level. */
    severity: 'info' | 'warning' | 'error' | 'critical';
    /** Event/step this deviation relates to. */
    eventId?: string;
    /** ISO-8601 timestamp when deviation was recorded. */
    recordedAt: string;
    /** ISO-8601 timestamp when deviation occurred. */
    occurredAt?: string;
    /** Operator who reported this deviation. */
    reportedBy?: string;
    /** Whether the deviation has been resolved. */
    resolved?: boolean;
    /** Resolution notes. */
    resolutionNotes?: string;
  }

  /** Request body for creating a deviation record. */
  interface CreateDeviationRequest {
    deviationId: string;
    description: string;
    code?: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    eventId?: string;
    occurredAt?: string;
    reportedBy?: string;
  }

  /** Request body for updating a deviation record. */
  interface UpdateDeviationRequest {
    resolved?: boolean;
    resolutionNotes?: string;
    description?: string;
  }

  // ========================================================================
  // POST /api/runs/:runId/deviations
  // ========================================================================
  /**
   * Store a deviation record for a run.
   *
   * Appends the deviation to the run's deviationHistory array and increments
   * the deviation counter in executionTracking.
   *
   * Body: { deviationId, description, severity, ... }
   * Returns: { success: true, deviation: DeviationRecord }
   */
  fastify.post<
    { Params: { runId: string }; Body: CreateDeviationRequest },
    { success: true; deviation: DeviationRecord } | ErrorResponse
  >(
    '/runs/:runId/deviations',
    async (
      request: FastifyRequest<{ Params: { runId: string }; Body: CreateDeviationRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const body = request.body ?? {};

        // Validate required fields
        if (!body.deviationId) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'deviationId is required' };
        }
        if (!body.description) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'description is required' };
        }
        if (!body.severity) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: 'severity is required' };
        }

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Validate that the run is in a mutable state
        const transition = validateTransition(
          payload.status,
          ['planned', 'in_progress'],
          'add deviation',
          runId,
        );
        if (!transition.ok) {
          reply.status(400);
          return transition;
        }

        // Build deviation record
        const deviation: DeviationRecord = {
          deviationId: body.deviationId,
          description: body.description,
          severity: body.severity,
          recordedAt: new Date().toISOString(),
          resolved: false,
          ...(body.code && { code: body.code }),
          ...(body.eventId && { eventId: body.eventId }),
          ...(body.occurredAt && { occurredAt: body.occurredAt }),
          ...(body.reportedBy && { reportedBy: body.reportedBy }),
        };

        // Append to deviationHistory
        const deviationHistory: Array<DeviationRecord> =
          Array.isArray(payload.deviationHistory) ? (payload.deviationHistory as Array<DeviationRecord>) : [];
        deviationHistory.push(deviation);
        payload.deviationHistory = deviationHistory;

        // Update deviation counter in executionTracking
        const tracking = (payload.executionTracking as Record<string, unknown>) ?? {};
        const updatedTracking: Record<string, unknown> = { ...tracking };
        updatedTracking.deviationCount =
          (typeof updatedTracking.deviationCount === 'number' ? updatedTracking.deviationCount : 0) + 1;
        payload.executionTracking = updatedTracking;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Deviation '${body.deviationId}' added to run '${runId}'`,
        });

        reply.status(200);
        return { success: true, deviation };
      } catch (error) {
        fastify.log.error({ error }, `Error adding deviation: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add deviation',
        };
      }
    },
  );

  // ========================================================================
  // PATCH /api/runs/:runId/deviations/:deviationId
  // ========================================================================
  /**
   * Update a deviation record (e.g., mark as resolved).
   *
   * Body: { resolved?: boolean, resolutionNotes?: string, description?: string }
   * Returns: { success: true, deviation: DeviationRecord }
   */
  fastify.patch<
    { Params: { runId: string; deviationId: string }; Body: UpdateDeviationRequest },
    { success: true; deviation: DeviationRecord } | ErrorResponse
  >(
    '/runs/:runId/deviations/:deviationId',
    async (
      request: FastifyRequest<{ Params: { runId: string; deviationId: string }; Body: UpdateDeviationRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;
        const deviationId = request.params.deviationId;
        const body = request.body ?? {};

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        // Find the deviation in history
        const deviationHistory: Array<DeviationRecord> =
          Array.isArray(payload.deviationHistory) ? (payload.deviationHistory as Array<DeviationRecord>) : [];
        const idx = deviationHistory.findIndex((d: DeviationRecord) => d.deviationId === deviationId);
        if (idx === -1) {
          reply.status(404);
          return { error: 'DEVIATION_NOT_FOUND', message: `Deviation '${deviationId}' not found in run '${runId}'` };
        }

        // Apply updates
        const deviation = deviationHistory[idx]!;
        if (body.resolved !== undefined) deviation.resolved = body.resolved;
        if (body.resolutionNotes !== undefined) deviation.resolutionNotes = body.resolutionNotes;
        if (body.description !== undefined) deviation.description = body.description;
        deviationHistory[idx] = deviation;

        // Save updated run record
        await ctx.store.update({
          envelope: { ...record, payload },
          message: `Deviation '${deviationId}' updated in run '${runId}'`,
        });

        reply.status(200);
        return { success: true, deviation };
      } catch (error) {
        fastify.log.error({ error }, `Error updating deviation: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update deviation',
        };
      }
    },
  );

  // ========================================================================
  // GET /api/runs/:runId/deviations
  // ========================================================================
  /**
   * Retrieve all deviation records for a run.
   *
   * Supports optional filtering by severity and resolved status.
   *
   * Query: { severity?: string, resolved?: boolean }
   * Returns: { deviations: DeviationRecord[], total: number, filtered: number }
   */
  fastify.get<
    { Params: { runId: string }; Querystring: { severity?: string; resolved?: string } },
    { deviations: DeviationRecord[]; total: number; filtered: number } | ErrorResponse
  >(
    '/runs/:runId/deviations',
    async (
      request: FastifyRequest<{ Params: { runId: string }; Querystring: { severity?: string; resolved?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        const deviationHistory: Array<DeviationRecord> =
          Array.isArray(payload.deviationHistory) ? (payload.deviationHistory as Array<DeviationRecord>) : [];

        const total = deviationHistory.length;
        let filtered: DeviationRecord[] = deviationHistory;

        // Apply severity filter
        if (request.query.severity) {
          filtered = filtered.filter((d: DeviationRecord) => d.severity === request.query.severity);
        }

        // Apply resolved filter
        if (request.query.resolved !== undefined) {
          const resolved = request.query.resolved === 'true';
          filtered = filtered.filter((d: DeviationRecord) => d.resolved === resolved);
        }

        reply.status(200);
        return {
          deviations: filtered,
          total,
          filtered: filtered.length,
        };
      } catch (error) {
        fastify.log.error({ error }, `Error getting deviations: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get deviations',
        };
      }
    },
  );

  // ========================================================================
  // GET /api/runs/:runId/deviations/diff
  // ========================================================================
  /**
   * Compute planned vs executed event graph diff.
   *
   * Loads the planned and executed event graphs referenced by this run and
   * compares their events. Returns an array of EventDiff entries showing
   * modified, added, and removed events.
   *
   * Returns: { diffs: EventDiff[], plannedEventGraphId?: string, executedEventGraphId?: string }
   */
  fastify.get<
    { Params: { runId: string } },
    { diffs: EventDiff[]; plannedEventGraphId?: string; executedEventGraphId?: string } | ErrorResponse
  >(
    '/runs/:runId/deviations/diff',
    async (
      request: FastifyRequest<{ Params: { runId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const runId = request.params.runId;

        // Load the run record
        const record = await ctx.store.get(runId);
        if (!record) {
          reply.status(404);
          return { error: 'RUN_NOT_FOUND', message: `Run '${runId}' not found` };
        }

        const payload = record.payload as RunPayload;
        if (payload.kind !== 'run') {
          reply.status(400);
          return { error: 'NOT_A_RUN', message: `Record '${runId}' is not a run` };
        }

        const plannedId = payload.plannedEventGraphId;
        const executedId = payload.executedEventGraphId;

        if (!plannedId) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: `Run '${runId}' has no plannedEventGraphId` };
        }
        if (!executedId) {
          reply.status(400);
          return { error: 'MISSING_FIELD', message: `Run '${runId}' has no executedEventGraphId` };
        }

        // Load planned event graph
        const plannedRecord = await ctx.store.get(plannedId);
        if (!plannedRecord) {
          reply.status(404);
          return { error: 'GRAPH_NOT_FOUND', message: `Planned event graph '${plannedId}' not found` };
        }

        // Load executed event graph
        const executedRecord = await ctx.store.get(executedId);
        if (!executedRecord) {
          reply.status(404);
          return { error: 'GRAPH_NOT_FOUND', message: `Executed event graph '${executedId}' not found` };
        }

        const plannedGraph = plannedRecord.payload as { events?: GraphEvent[] };
        const executedGraph = executedRecord.payload as { events?: GraphEvent[] };

        // Compute diff
        const diffs = computeDiff(plannedGraph, executedGraph);

        reply.status(200);
        return {
          diffs,
          plannedEventGraphId: plannedId,
          executedEventGraphId: executedId,
        };
      } catch (error) {
        fastify.log.error({ error }, `Error computing diff: ${error}`);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compute diff',
        };
      }
    },
  );
}
