/**
 * ExecutionHandlers — Stub HTTP handlers for the robot execution pipeline.
 *
 * Provides endpoints for creating planned runs, compiling them to robot plans,
 * and retrieving compiled artifacts.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { ExecutionOrchestrator, ExecutionError } from '../../execution/ExecutionOrchestrator.js';
import { AdapterRegistry } from '../../execution/adapters/AdapterRegistry.js';
import { ExecutionControlService } from '../../execution/ExecutionControlService.js';
import { ExecutionPoller } from '../../execution/ExecutionPoller.js';
import { ExecutionMaterializer } from '../../execution/ExecutionMaterializer.js';
import { ExecutionRunService } from '../../execution/ExecutionRunService.js';
import { ExecutionTimelineService } from '../../execution/ExecutionTimelineService.js';
import { MeasurementParserValidationService } from '../../measurement/MeasurementParserValidationService.js';
import { ExecutionCapabilitiesService } from '../../execution/ExecutionCapabilitiesService.js';
import { validateExecuteParameters, listExecuteTargets, getExecuteParameterShape } from '../../execution/adapters/AdapterRuntimeSchemas.js';
import { ExecutionRetryWorker } from '../../execution/ExecutionRetryWorker.js';
import { AdapterHealthService } from '../../execution/AdapterHealthService.js';
import { FailureRunbookService } from '../../execution/FailureRunbookService.js';
import { ExecutionIncidentService } from '../../execution/ExecutionIncidentService.js';
import { ExecutionIncidentWorker } from '../../execution/ExecutionIncidentWorker.js';
import { WorkerLeaseViewService } from '../../execution/WorkerLeaseViewService.js';
import { ExecutionOpsSnapshotService } from '../../execution/ExecutionOpsSnapshotService.js';
import { SidecarContractConformanceService } from '../../execution/SidecarContractConformanceService.js';
import { createExecutionProvider, resolveExecutionMode } from '../../execution/providers/createExecutionProvider.js';
import { ExecutionTaskService } from '../../execution/ExecutionTaskService.js';

export function createExecutionHandlers(ctx: AppContext) {
  const orchestrator = new ExecutionOrchestrator(ctx);
  const provider = createExecutionProvider(ctx);
  const adapterRegistry = new AdapterRegistry();
  const controlService = new ExecutionControlService(ctx);
  const poller = new ExecutionPoller(ctx, controlService);
  const materializer = new ExecutionMaterializer(ctx);
  const executionRunService = new ExecutionRunService(ctx, provider, controlService);
  const timelineService = new ExecutionTimelineService(ctx, executionRunService);
  const parserValidationService = new MeasurementParserValidationService(ctx);
  const capabilitiesService = new ExecutionCapabilitiesService();
  const retryWorker = new ExecutionRetryWorker(ctx, executionRunService);
  const adapterHealth = new AdapterHealthService();
  const runbook = new FailureRunbookService();
  const incidents = new ExecutionIncidentService(ctx, adapterHealth);
  const incidentWorker = new ExecutionIncidentWorker(ctx, incidents);
  const workerLeases = new WorkerLeaseViewService(ctx);
  const opsSnapshot = new ExecutionOpsSnapshotService(ctx, adapterHealth, incidents, workerLeases);
  const sidecarConformance = new SidecarContractConformanceService(ctx);
  const taskService = new ExecutionTaskService(ctx);
  void poller.restore().catch(() => undefined);
  void retryWorker.restore().catch(() => undefined);
  void incidentWorker.restore().catch(() => undefined);

  function parseExecutorTokenScopes(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    const raw = process.env['CL_EXECUTOR_TOKENS'];
    if (!raw) return map;
    const entries = raw.split(';').map((v) => v.trim()).filter(Boolean);
    for (const entry of entries) {
      const [token, scopesPart] = entry.split('=', 2);
      if (!token) continue;
      const scopes = new Set(
        (scopesPart ?? '*')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
      map.set(token, scopes.size > 0 ? scopes : new Set(['*']));
    }
    return map;
  }

  function authenticateExecutor(request: FastifyRequest, adapterId?: string): { authorized: boolean; token?: string; scopes?: Set<string> } {
    const configured = parseExecutorTokenScopes();
    if (configured.size === 0) {
      return { authorized: true, scopes: new Set(['*']) };
    }
    const header = request.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return { authorized: false };
    }
    const token = header.slice(7).trim();
    const scopes = configured.get(token);
    if (!scopes) {
      return { authorized: false };
    }
    if (adapterId) {
      const normalized = adapterId.toLowerCase();
      if (!scopes.has('*') && !scopes.has(normalized)) {
        return { authorized: false };
      }
    }
    return { authorized: true, token, scopes };
  }

  function isTargetPlatform(value: string): value is 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist' {
    return value === 'opentrons_ot2' || value === 'opentrons_flex' || value === 'integra_assist';
  }

  return {
    /**
     * GET /execution-runs
     * List execution-run records.
     */
    async listExecutionRuns(
      request: FastifyRequest<{
        Querystring: {
          status?: string;
          robotPlanId?: string;
          plannedRunId?: string;
          limit?: string;
          offset?: string;
          sort?: 'attempt_desc' | 'attempt_asc' | 'record_desc' | 'record_asc';
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ runs: unknown[]; total: number; offset: number; limit: number } | ApiError> {
      try {
        const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? Number.parseInt(request.query.offset, 10) : 0;
        const result = await executionRunService.listExecutionRunsPaged({
          ...(request.query.status ? { status: request.query.status } : {}),
          ...(request.query.robotPlanId ? { robotPlanId: request.query.robotPlanId } : {}),
          ...(request.query.plannedRunId ? { plannedRunId: request.query.plannedRunId } : {}),
          ...(request.query.sort ? { sort: request.query.sort } : {}),
          offset: Number.isFinite(offset) ? offset : 0,
          limit: Number.isFinite(limit) ? limit : 50,
        });
        return result;
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/:id
     * Get an execution-run record.
     */
    async getExecutionRun(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ run: unknown } | ApiError> {
      try {
        const env = await ctx.store.get(request.params.id);
        if (!env) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Execution run not found: ${request.params.id}` };
        }
        return { run: env };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/:id/status
     * Resolve execution-run + runtime status view.
     */
    async getExecutionRunStatus(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await executionRunService.getExecutionRunStatus(request.params.id);
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-runs/:id/retry
     * Retry execution for the robot plan referenced by an execution-run.
     */
    async retryExecutionRun(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { force?: boolean };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; executionRunId: string; logId?: string; taskId?: string; status: 'queued' | 'completed' | 'error' } | ApiError> {
      try {
        const result = await executionRunService.retryExecutionRunWithOptions(request.params.id, {
          force: request.body?.force === true,
        });
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-runs/:id/resolve
     * Manually resolve/override execution-run terminal state.
     */
    async resolveExecutionRun(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          status: 'completed' | 'failed' | 'canceled';
          failureClass?: 'transient' | 'terminal' | 'unknown';
          failureCode?: string;
          retryRecommended?: boolean;
          retryReason?: string;
          notes?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; executionRunId?: string; status?: string } | ApiError> {
      try {
        const result = await executionRunService.resolveExecutionRun(request.params.id, request.body);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/latest
     * Get the latest execution-run for a robot plan.
     */
    async getLatestExecutionRun(
      request: FastifyRequest<{
        Querystring: { robotPlanId: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ run: unknown } | ApiError> {
      try {
        if (!request.query.robotPlanId) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'robotPlanId is required' };
        }
        const run = await executionRunService.getLatestExecutionRunForRobotPlan(request.query.robotPlanId);
        if (!run) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `No execution-runs for robot plan: ${request.query.robotPlanId}` };
        }
        return { run };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/:id/event-graph
     * Fetch materialized event graph for an execution-run if available.
     */
    async getExecutionRunEventGraph(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ eventGraphId: string; record: unknown } | ApiError> {
      try {
        const result = await executionRunService.getMaterializedEventGraph(request.params.id);
        if (!result) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `No materialized event graph for execution run: ${request.params.id}` };
        }
        return result;
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/:id/timeline
     * Build unified timeline for execution run.
     */
    async getExecutionRunTimeline(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ timeline: Record<string, unknown> } | ApiError> {
      try {
        const timeline = await timelineService.getTimeline(request.params.id);
        return { timeline };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-runs/:id/cancel
     * Cancel execution by execution-run id.
     */
    async cancelExecutionRun(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; details: Record<string, unknown> } | ApiError> {
      try {
        const details = await executionRunService.cancelExecutionRun(request.params.id);
        return { success: true, details };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution-runs/:id/lineage
     * Get retry lineage chain for an execution-run.
     */
    async getExecutionRunLineage(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ lineage: unknown[]; total: number } | ApiError> {
      try {
        const result = await executionRunService.getExecutionRunLineage(request.params.id);
        return result;
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-plans/validate
     * Validate an execution-plan against its referenced environment and event graph.
     */
    async validateExecutionPlan(
      request: FastifyRequest<{
        Body: { executionPlanId: string };
      }>,
      reply: FastifyReply,
    ): Promise<{
      success: boolean;
      executionPlanId?: string;
      executionEnvironmentId?: string;
      eventGraphId?: string;
      validation?: { valid: boolean; issues: unknown[] };
    } | ApiError> {
      try {
        if (!request.body?.executionPlanId) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'executionPlanId is required' };
        }
        const result = await orchestrator.validateExecutionPlan({
          executionPlanId: request.body.executionPlanId,
        });
        return {
          success: true,
          executionPlanId: result.executionPlanId,
          executionEnvironmentId: result.executionEnvironmentId,
          eventGraphId: result.eventGraphId,
          validation: result.validation,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-plans/:id/emit
     * Emit target-specific robot artifacts from a validated execution-plan.
     */
    async emitExecutionPlan(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { targetPlatform: string };
      }>,
      reply: FastifyReply,
    ): Promise<{
      success: boolean;
      executionPlanId?: string;
      robotPlanId?: string;
      artifacts?: unknown[];
    } | ApiError> {
      const targetPlatform = request.body?.targetPlatform;
      if (!targetPlatform || !isTargetPlatform(targetPlatform)) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: `Unsupported targetPlatform: ${String(targetPlatform)}`,
        };
      }

      try {
        const result = await orchestrator.emitExecutionPlan({
          executionPlanId: request.params.id,
          targetPlatform,
        });
        return {
          success: true,
          executionPlanId: result.executionPlanId,
          robotPlanId: result.robotPlanId,
          artifacts: result.artifacts,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /planned-runs
     * Create a planned run (from protocol or event graph).
     */
    async createPlannedRun(
      request: FastifyRequest<{
        Body: {
          title: string;
          sourceType: 'protocol' | 'event-graph';
          sourceRef: { kind: string; id: string; type?: string };
          bindings?: unknown;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; recordId?: string } | ApiError> {
      try {
        const result = await orchestrator.createPlannedRun(request.body);
        reply.status(201);
        return {
          success: true,
          recordId: result.recordId,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /planned-runs/:id
     * Get a planned run by ID.
     */
    async getPlannedRun(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ record: unknown } | ApiError> {
      const { id } = request.params;
      try {
        const envelope = await ctx.store.get(id);
        if (!envelope) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Planned run not found: ${id}` };
        }
        return { record: envelope };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /planned-runs/:id/logs
     * List instrument logs associated with a planned run.
     */
    async listPlannedRunLogs(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ logs: unknown[]; total: number } | ApiError> {
      try {
        const plannedRunId = request.params.id;
        const logs = await ctx.store.list({ kind: 'instrument-log' });
        const filtered = logs.filter((log) => {
          const payload = log.payload as { plannedRunRef?: { id?: string } };
          return payload.plannedRunRef?.id === plannedRunId;
        });
        return { logs: filtered, total: filtered.length };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /planned-runs/:id/compile
     * Compile a planned run to a robot plan.
     */
    async compilePlannedRun(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          targetPlatform: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; robotPlanId?: string } | ApiError> {
      const targetPlatform = request.body.targetPlatform;
      if (!isTargetPlatform(targetPlatform)) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: `Unsupported targetPlatform: ${targetPlatform}`,
        };
      }

      try {
        const result = await orchestrator.compilePlannedRun({
          plannedRunId: request.params.id,
          targetPlatform,
        });
        return { success: true, robotPlanId: result.robotPlanId };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /robot-plans/:id
     * Get a compiled robot plan.
     */
    async getRobotPlan(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ record: unknown } | ApiError> {
      const { id } = request.params;
      try {
        const envelope = await ctx.store.get(id);
        if (!envelope) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Robot plan not found: ${id}` };
        }
        return { record: envelope };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /robot-plans/:id/artifact
     * Download generated code/config for a robot plan.
     */
    async getRobotPlanArtifact(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { role?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ role: string; uri: string; filename: string; content: string } | ApiError> {
      try {
        const artifact = await orchestrator.getRobotPlanArtifact(request.params.id, request.query.role);
        reply.header('content-type', artifact.mimeType);
        reply.header('content-disposition', `attachment; filename="${artifact.filename}"`);
        return {
          role: artifact.role,
          uri: artifact.uri,
          filename: artifact.filename,
          content: artifact.content,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /robot-plans/:id/execute
     * Execute a compiled robot plan through a sidecar adapter.
     */
    async executeRobotPlan(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { parameters?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; executionRunId: string; logId?: string; taskId?: string; status: 'queued' | 'completed' | 'error' } | ApiError> {
      try {
        const result = await provider.executeRobotPlan(request.params.id, {
          ...(request.body?.parameters ? { parameters: request.body.parameters } : {}),
        });
        return {
          success: true,
          executionRunId: result.executionRunId,
          ...(result.logId ? { logId: result.logId } : {}),
          ...(result.taskId ? { taskId: result.taskId } : {}),
          status: result.status,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/orchestrate
     * Guarded orchestration: optional compile, parameter validation, and execute.
     */
    async orchestrateExecution(
      request: FastifyRequest<{
        Body: {
          plannedRunId?: string;
          robotPlanId?: string;
          targetPlatform?: 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
          parameters?: Record<string, unknown>;
          dryRun?: boolean;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{
      success: boolean;
      plannedRunId?: string;
      robotPlanId?: string;
      targetPlatform?: string;
      normalizedParameters?: Record<string, unknown>;
      executionRunId?: string;
      logId?: string;
      status?: 'queued' | 'completed' | 'error';
      taskId?: string;
      dryRun?: boolean;
    } | ApiError> {
      try {
        const hasPlanned = typeof request.body.plannedRunId === 'string' && request.body.plannedRunId.length > 0;
        const hasRobot = typeof request.body.robotPlanId === 'string' && request.body.robotPlanId.length > 0;
        if (!hasPlanned && !hasRobot) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'plannedRunId or robotPlanId is required' };
        }
        let robotPlanId = request.body.robotPlanId;
        let targetPlatform = request.body.targetPlatform;

        if (hasPlanned) {
          if (!targetPlatform) {
            reply.status(400);
            return { error: 'BAD_REQUEST', message: 'targetPlatform is required when plannedRunId is provided' };
          }
          const compiled = await orchestrator.compilePlannedRun({
            plannedRunId: request.body.plannedRunId!,
            targetPlatform,
          });
          robotPlanId = compiled.robotPlanId;
        } else if (robotPlanId) {
          const envelope = await ctx.store.get(robotPlanId);
          if (!envelope) {
            reply.status(404);
            return { error: 'NOT_FOUND', message: `Robot plan not found: ${robotPlanId}` };
          }
          const payload = envelope.payload as { kind?: string; targetPlatform?: string };
          if (payload.kind !== 'robot-plan') {
            reply.status(400);
            return { error: 'BAD_REQUEST', message: `${robotPlanId} is not a robot-plan` };
          }
          if (payload.targetPlatform === 'integra_assist' || payload.targetPlatform === 'opentrons_ot2' || payload.targetPlatform === 'opentrons_flex') {
            targetPlatform = payload.targetPlatform;
          } else {
            reply.status(400);
            return { error: 'BAD_REQUEST', message: `Unsupported robot-plan targetPlatform: ${String(payload.targetPlatform)}` };
          }
        }
        if (!robotPlanId || !targetPlatform) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'Unable to resolve robotPlanId/targetPlatform' };
        }

        const normalizedParameters = validateExecuteParameters(targetPlatform, request.body.parameters ?? {});
        if (request.body.dryRun === true) {
          return {
            success: true,
            ...(request.body.plannedRunId ? { plannedRunId: request.body.plannedRunId } : {}),
            robotPlanId,
            targetPlatform,
            normalizedParameters,
            dryRun: true,
          };
        }

        const executed = await provider.executeRobotPlan(robotPlanId, {
          parameters: normalizedParameters,
        });
        return {
          success: true,
          ...(request.body.plannedRunId ? { plannedRunId: request.body.plannedRunId } : {}),
          robotPlanId,
          targetPlatform,
          normalizedParameters,
          executionRunId: executed.executionRunId,
          ...(executed.logId ? { logId: executed.logId } : {}),
          ...(executed.taskId ? { taskId: executed.taskId } : {}),
          status: executed.status,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /robot-plans/:id/status
     * Get latest execution/runtime status for a robot plan.
     */
    async getRobotPlanStatus(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await controlService.getRobotPlanStatus(request.params.id);
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /robot-plans/:id/logs
     * List execution logs associated with a robot plan.
     */
    async listRobotPlanLogs(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ logs: unknown[]; total: number } | ApiError> {
      try {
        const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 50;
        const logs = await controlService.listRobotPlanLogs(request.params.id, Number.isFinite(limit) ? limit : 50);
        return { logs, total: logs.length };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/poller/poll-once
     * Run one poll cycle for currently running execution-runs.
     */
    async pollOnce(
      request: FastifyRequest<{
        Body: { limit?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        const summary = await poller.pollOnce(request.body?.limit ?? 100);
        return { summary };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/recovery/reconcile
     * Reconcile running executions and force state transitions for stale/unknown runs.
     */
    async reconcileRecovery(
      request: FastifyRequest<{
        Body: { limit?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        const summary = await poller.pollOnce(request.body?.limit ?? 250);
        return { summary };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/poller/start
     * Start background poller interval.
     */
    async startPoller(
      request: FastifyRequest<{
        Body: { intervalMs?: number; forceTakeover?: boolean };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await poller.start(request.body?.intervalMs ?? 15_000, {
          forceTakeover: request.body?.forceTakeover === true,
        });
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/poller/takeover
     * Force acquire poller lease and start background loop.
     */
    async takeoverPoller(
      request: FastifyRequest<{
        Body: { intervalMs?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await poller.start(request.body?.intervalMs ?? 15_000, {
          forceTakeover: true,
        });
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/poller/stop
     * Stop background poller.
     */
    async stopPoller(): Promise<{ status: Record<string, unknown> }> {
      return { status: await poller.stop() };
    },

    /**
     * GET /execution/poller/status
     * Poller runtime status.
     */
    async pollerStatus(): Promise<{ status: Record<string, unknown> }> {
      return { status: poller.status() };
    },

    /**
     * GET /execution/workers/leases
     * List current worker lease ownership/status for poller/retry/incident workers.
     */
    async workerLeases(
      request: FastifyRequest<{
        Querystring: { workerId?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ leases: Array<Record<string, unknown>>; total: number; timestamp: string } | ApiError> {
      try {
        return await workerLeases.list({
          ...(request.query.workerId ? { workerId: request.query.workerId } : {}),
        });
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/ops/snapshot
     * Consolidated operational snapshot for worker leases, incidents, adapter health, and execution backlog.
     */
    async getOpsSnapshot(
      request: FastifyRequest<{
        Querystring: { probeAdapters?: string; workerId?: string };
      }>,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        const probeAdapters = request.query.probeAdapters === 'true' || request.query.probeAdapters === '1';
        return await opsSnapshot.snapshot({
          probeAdapters,
          ...(request.query.workerId ? { workerId: request.query.workerId } : {}),
        });
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/sidecar/contracts
     * List versioned sidecar contracts and schema IDs.
     */
    async listSidecarContracts(): Promise<{ contractVersion: string; contracts: Array<Record<string, unknown>>; total: number }> {
      return sidecarConformance.manifest();
    },

    /**
     * GET /execution/sidecar/contracts/diagnostics
     * Runtime diagnostics for sidecar contract readiness.
     */
    async sidecarContractDiagnostics(): Promise<Record<string, unknown>> {
      return sidecarConformance.diagnostics();
    },

    /**
     * GET /execution/sidecar/contracts/examples
     * Return canonical sample payloads for sidecar contracts.
     */
    async listSidecarContractExamples(
      request: FastifyRequest<{
        Querystring: { contractId?: string };
      }>,
    ): Promise<{ contractVersion: string; contracts: Array<Record<string, unknown>>; total: number }> {
      return sidecarConformance.examples({
        ...(request.query.contractId ? { contractId: request.query.contractId } : {}),
      });
    },

    /**
     * POST /execution/sidecar/contracts/self-test
     * Execute sidecar contract conformance self-test against schemas and parsers.
     */
    async sidecarContractSelfTest(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        return await sidecarConformance.selfTest();
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/sidecar/contracts/self-test/persist
     * Run sidecar contract self-test and persist report record.
     */
    async sidecarContractSelfTestPersist(
      request: FastifyRequest<{
        Body: { profile?: string; notes?: string };
      }>,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        return await sidecarConformance.selfTestAndPersist({
          ...(request.body?.profile ? { profile: request.body.profile } : {}),
          ...(request.body?.notes ? { notes: request.body.notes } : {}),
        });
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/sidecar/contracts/validate
     * Validate a provided payload against a named sidecar contract schema.
     */
    async validateSidecarContract(
      request: FastifyRequest<{
        Body: { contractId: string; payload: unknown };
      }>,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        const result = sidecarConformance.validatePayload(request.body.contractId, request.body.payload);
        if (result['valid'] !== true) {
          reply.status(400);
        }
        return result;
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/sidecar/contracts/validate-batch
     * Validate multiple payloads against named sidecar contracts.
     */
    async validateSidecarContractBatch(
      request: FastifyRequest<{
        Body: { items: Array<{ contractId: string; payload: unknown }> };
      }>,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        const result = sidecarConformance.validateBatch(request.body.items ?? []);
        if ((result['failed'] as number) > 0) {
          reply.status(400);
        }
        return result;
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/sidecar/contracts/gate
     * Evaluate sidecar contract readiness gate conditions.
     */
    async sidecarContractGate(
      request: FastifyRequest<{
        Body: {
          requireStrict?: boolean;
          requireAllSchemasLoaded?: boolean;
          requireSelfTestPass?: boolean;
        };
      }>,
      reply: FastifyReply,
    ): Promise<Record<string, unknown> | ApiError> {
      try {
        const result = await sidecarConformance.gate({
          ...(request.body?.requireStrict !== undefined ? { requireStrict: request.body.requireStrict } : {}),
          ...(request.body?.requireAllSchemasLoaded !== undefined ? { requireAllSchemasLoaded: request.body.requireAllSchemasLoaded } : {}),
          ...(request.body?.requireSelfTestPass !== undefined ? { requireSelfTestPass: request.body.requireSelfTestPass } : {}),
        });
        if (result['ready'] !== true) {
          reply.status(409);
        }
        return result;
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/retry-worker/status
     * Retry worker runtime status.
     */
    async retryWorkerStatus(): Promise<{ status: Record<string, unknown> }> {
      return { status: retryWorker.status() };
    },

    /**
     * POST /execution/retry-worker/start
     * Start transient retry worker.
     */
    async startRetryWorker(
      request: FastifyRequest<{
        Body: { intervalMs?: number; forceTakeover?: boolean };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await retryWorker.start(request.body?.intervalMs ?? 30_000, {
          forceTakeover: request.body?.forceTakeover === true,
        });
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/retry-worker/takeover
     * Force acquire retry worker lease and start loop.
     */
    async takeoverRetryWorker(
      request: FastifyRequest<{
        Body: { intervalMs?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await retryWorker.start(request.body?.intervalMs ?? 30_000, {
          forceTakeover: true,
        });
        return { status };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/retry-worker/stop
     * Stop transient retry worker.
     */
    async stopRetryWorker(): Promise<{ status: Record<string, unknown> }> {
      return { status: await retryWorker.stop() };
    },

    /**
     * POST /execution/retry-worker/run-once
     * Run one transient retry scan cycle immediately.
     */
    async runRetryWorkerOnce(
      request: FastifyRequest<{
        Body: { limit?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        const summary = await retryWorker.runOnce(request.body?.limit ?? 100);
        return { summary };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /measurements/validate-parser
     * Validate parser output for a raw data file without persisting measurement.
     */
    async validateMeasurementParser(
      request: FastifyRequest<{
        Body: { parserId: string; path: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ result: Record<string, unknown> } | ApiError> {
      try {
        const result = await parserValidationService.validate(request.body);
        return { result };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-runs/:id/materialize
     * Materialize an event-graph from a completed execution-run.
     */
    async materializeExecutionRun(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; eventGraphId: string } | ApiError> {
      try {
        const result = await materializer.materializeFromExecutionRun(request.params.id);
        return { success: true, eventGraphId: result.eventGraphId };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /robot-plans/:id/cancel
     * Request cancellation of a running external execution.
     */
    async cancelRobotPlan(
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; details: Record<string, unknown> } | ApiError> {
      try {
        const details = await controlService.cancelRobotPlan(request.params.id);
        return {
          success: true,
          details,
        };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/adapters
     * List known execution/measurement adapter descriptors.
     */
    async listAdapters(): Promise<{ adapters: unknown[]; total: number }> {
      const adapters = adapterRegistry.list();
      return {
        adapters,
        total: adapters.length,
      };
    },

    /**
     * GET /execution/capabilities
     * Consolidated runtime capability map.
     */
    async getCapabilities(): Promise<{ capabilities: Record<string, unknown> }> {
      return {
        capabilities: {
          ...capabilitiesService.getCapabilities(),
          provider: provider.descriptor(),
          executionMode: resolveExecutionMode(ctx),
        },
      };
    },

    /**
     * GET /execution/health/adapters
     * Adapter health and readiness status.
     */
    async getAdapterHealth(
      request: FastifyRequest<{
        Querystring: { probe?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ health: Record<string, unknown> } | ApiError> {
      try {
        const probe = request.query.probe === 'true';
        const health = await adapterHealth.check({ probe });
        return { health };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/failure-runbook
     * List or fetch runbook guidance by failure code.
     */
    async getFailureRunbook(
      request: FastifyRequest<{
        Querystring: { failureCode?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ entry?: unknown; entries?: unknown[]; total?: number } | ApiError> {
      try {
        if (request.query.failureCode) {
          const entry = runbook.get(request.query.failureCode);
          if (!entry) {
            reply.status(404);
            return { error: 'NOT_FOUND', message: `No runbook entry for failureCode: ${request.query.failureCode}` };
          }
          return { entry };
        }
        const entries = runbook.list();
        return { entries, total: entries.length };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/parameters/schema
     * Return supported run-execute parameter schemas by adapter target.
     */
    async getExecutionParameterSchemas(): Promise<{ targets: Array<{ target: string; shape: Record<string, string> }>; total: number }> {
      const targets = listExecuteTargets().map((target) => ({
        target,
        shape: getExecuteParameterShape(target),
      }));
      return { targets, total: targets.length };
    },

    /**
     * POST /execution/parameters/validate
     * Validate adapter runtime parameters without execution.
     */
    async validateExecutionParameters(
      request: FastifyRequest<{
        Body: {
          target: 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
          parameters?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; target?: string; normalized?: Record<string, unknown> } | ApiError> {
      try {
        const normalized = validateExecuteParameters(request.body.target, request.body.parameters ?? {});
        return { success: true, target: request.body.target, normalized };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution-tasks/claim
     * Claim queued execution tasks for an executor worker.
     */
    async claimExecutionTasks(
      request: FastifyRequest<{
        Body: {
          executorId: string;
          capabilities?: string[];
          maxTasks?: number;
          leaseDurationMs?: number;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; tasks?: unknown[]; claimed?: number } | ApiError> {
      try {
        const auth = authenticateExecutor(request);
        if (!auth.authorized) {
          reply.status(401);
          return { error: 'UNAUTHORIZED', message: 'Missing or invalid executor bearer token' };
        }
        const requestedCapabilities = request.body.capabilities ?? [];
        const effectiveCapabilities = (() => {
          if (!auth.scopes || auth.scopes.has('*')) return requestedCapabilities;
          if (requestedCapabilities.length === 0) return Array.from(auth.scopes);
          const allowed = new Set(Array.from(auth.scopes).map((s) => s.toLowerCase()));
          return requestedCapabilities.filter((c) => allowed.has(c.toLowerCase()));
        })();
        const result = await taskService.claimTasks({
          executorId: request.body.executorId,
          capabilities: effectiveCapabilities,
          ...(request.body.maxTasks !== undefined ? { maxTasks: request.body.maxTasks } : {}),
          ...(request.body.leaseDurationMs !== undefined ? { leaseDurationMs: request.body.leaseDurationMs } : {}),
        });
        return { success: true, tasks: result.tasks, claimed: result.claimed };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /execution-tasks/:id/heartbeat
     * Renew task lease and update running progress.
     */
    async heartbeatExecutionTask(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          executorId: string;
          sequence: number;
          at?: string;
          status?: 'claimed' | 'running';
          progress?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; accepted?: boolean; task?: unknown } | ApiError> {
      try {
        const scope = await taskService.getTaskScope(request.params.id);
        const auth = authenticateExecutor(request, scope.adapterId);
        if (!auth.authorized) {
          reply.status(403);
          return { error: 'FORBIDDEN', message: 'Executor token is missing or not scoped for this adapter' };
        }
        const result = await taskService.heartbeat(request.params.id, request.body);
        return { success: true, accepted: result.accepted, task: result.task };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /execution-tasks/:id/logs
     * Append executor log entries using monotonic sequence idempotency.
     */
    async appendExecutionTaskLogs(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          executorId: string;
          sequence: number;
          entries: Array<{
            timestamp?: string;
            level?: string;
            code?: string;
            message: string;
            data?: Record<string, unknown>;
          }>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; accepted?: boolean; logId?: string; task?: unknown } | ApiError> {
      try {
        const scope = await taskService.getTaskScope(request.params.id);
        const auth = authenticateExecutor(request, scope.adapterId);
        if (!auth.authorized) {
          reply.status(403);
          return { error: 'FORBIDDEN', message: 'Executor token is missing or not scoped for this adapter' };
        }
        const result = await taskService.appendLogs(request.params.id, request.body);
        return { success: true, accepted: result.accepted, ...(result.logId ? { logId: result.logId } : {}), task: result.task };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /execution-tasks/:id/status
     * Update task/execution status projection.
     */
    async updateExecutionTaskStatus(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          executorId: string;
          sequence: number;
          status: 'running' | 'failed' | 'completed' | 'canceled' | 'cancel_requested';
          at?: string;
          failure?: { code?: string; class?: 'transient' | 'terminal' | 'unknown'; message?: string };
          external?: { runId?: string; protocolId?: string; rawStatus?: string };
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; accepted?: boolean; task?: unknown } | ApiError> {
      try {
        const scope = await taskService.getTaskScope(request.params.id);
        const auth = authenticateExecutor(request, scope.adapterId);
        if (!auth.authorized) {
          reply.status(403);
          return { error: 'FORBIDDEN', message: 'Executor token is missing or not scoped for this adapter' };
        }
        const result = await taskService.updateStatus(request.params.id, request.body);
        return { success: true, accepted: result.accepted, task: result.task };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * POST /execution-tasks/:id/complete
     * Mark task terminal with completion payload.
     */
    async completeExecutionTask(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          executorId: string;
          sequence: number;
          finalStatus: 'completed' | 'failed' | 'canceled';
          startedAt?: string;
          completedAt?: string;
          artifacts?: Array<{ role: string; uri: string; sha256?: string; mimeType?: string }>;
          measurements?: Array<Record<string, unknown>>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; accepted?: boolean; task?: unknown } | ApiError> {
      try {
        const scope = await taskService.getTaskScope(request.params.id);
        const auth = authenticateExecutor(request, scope.adapterId);
        if (!auth.authorized) {
          reply.status(403);
          return { error: 'FORBIDDEN', message: 'Executor token is missing or not scoped for this adapter' };
        }
        const result = await taskService.complete(request.params.id, request.body);
        return { success: true, accepted: result.accepted, task: result.task };
      } catch (err) {
        if (err instanceof ExecutionError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /**
     * GET /execution/incidents
     * List execution incidents.
     */
    async listIncidents(
      request: FastifyRequest<{
        Querystring: { status?: 'open' | 'acked' | 'resolved'; limit?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ incidents: unknown[]; total: number } | ApiError> {
      try {
        const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 200;
        const result = await incidents.listIncidents({
          ...(request.query.status ? { status: request.query.status } : {}),
          limit: Number.isFinite(limit) ? limit : 200,
        });
        return { incidents: result, total: result.length };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/incidents/scan
     * Scan runtime state and create deduplicated incident records.
     */
    async scanIncidents(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        const summary = await incidents.scanAndCreateIncidents();
        return { summary };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/incidents/:id/ack
     * Acknowledge an open incident.
     */
    async acknowledgeIncident(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { notes?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; incidentId?: string; status?: string } | ApiError> {
      try {
        const result = await incidents.acknowledgeIncident(request.params.id, request.body?.notes);
        return { success: true, incidentId: result.incidentId, status: result.status };
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/incidents/:id/resolve
     * Resolve an incident after remediation.
     */
    async resolveIncident(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { notes?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; incidentId?: string; status?: string } | ApiError> {
      try {
        const result = await incidents.resolveIncident(request.params.id, request.body?.notes);
        return { success: true, incidentId: result.incidentId, status: result.status };
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/incidents/summary
     * Aggregate incident counts by status/severity/type.
     */
    async incidentSummary(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        return { summary: await incidents.summary() };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * GET /execution/incidents/worker/status
     * Incident worker status.
     */
    async incidentWorkerStatus(): Promise<{ status: Record<string, unknown> }> {
      return { status: incidentWorker.status() };
    },

    /**
     * POST /execution/incidents/worker/start
     * Start incident scan worker.
     */
    async startIncidentWorker(
      request: FastifyRequest<{
        Body: { intervalMs?: number; forceTakeover?: boolean };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await incidentWorker.start(request.body?.intervalMs ?? 60_000, {
          forceTakeover: request.body?.forceTakeover === true,
        });
        return { status };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/incidents/worker/takeover
     * Force acquire incident worker lease and start loop.
     */
    async takeoverIncidentWorker(
      request: FastifyRequest<{
        Body: { intervalMs?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ status: Record<string, unknown> } | ApiError> {
      try {
        const status = await incidentWorker.start(request.body?.intervalMs ?? 60_000, {
          forceTakeover: true,
        });
        return { status };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /execution/incidents/worker/stop
     * Stop incident scan worker.
     */
    async stopIncidentWorker(): Promise<{ status: Record<string, unknown> }> {
      return { status: await incidentWorker.stop() };
    },

    /**
     * POST /execution/incidents/worker/run-once
     * Execute one incident scan cycle now.
     */
    async runIncidentWorkerOnce(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<{ summary: Record<string, unknown> } | ApiError> {
      try {
        const summary = await incidentWorker.runOnce();
        return { summary };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export type ExecutionHandlers = ReturnType<typeof createExecutionHandlers>;
