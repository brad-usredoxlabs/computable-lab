/**
 * MCP tools for the robot execution pipeline and measurement ingest.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import type { RecordFilter } from '../../store/types.js';
import { ExecutionOrchestrator, ExecutionError } from '../../execution/ExecutionOrchestrator.js';
import { ExecutionControlService } from '../../execution/ExecutionControlService.js';
import { ExecutionPoller } from '../../execution/ExecutionPoller.js';
import { ExecutionMaterializer } from '../../execution/ExecutionMaterializer.js';
import { ExecutionRunService } from '../../execution/ExecutionRunService.js';
import { ExecutionTimelineService } from '../../execution/ExecutionTimelineService.js';
import { ExecutionCapabilitiesService } from '../../execution/ExecutionCapabilitiesService.js';
import { ExecutionRetryWorker } from '../../execution/ExecutionRetryWorker.js';
import { AdapterHealthService } from '../../execution/AdapterHealthService.js';
import { FailureRunbookService } from '../../execution/FailureRunbookService.js';
import { ExecutionIncidentService } from '../../execution/ExecutionIncidentService.js';
import { ExecutionIncidentWorker } from '../../execution/ExecutionIncidentWorker.js';
import { WorkerLeaseViewService } from '../../execution/WorkerLeaseViewService.js';
import { ExecutionOpsSnapshotService } from '../../execution/ExecutionOpsSnapshotService.js';
import { SidecarContractConformanceService } from '../../execution/SidecarContractConformanceService.js';
import { MeasurementService, MeasurementServiceError } from '../../measurement/MeasurementService.js';
import { MeasurementActiveControlService, MeasurementActiveControlError } from '../../measurement/MeasurementActiveControlService.js';
import { MeasurementParserValidationService } from '../../measurement/MeasurementParserValidationService.js';
import {
  AdapterParameterError,
  getActiveReadParameterShape,
  getExecuteParameterShape,
  listActiveReadTargets,
  listExecuteTargets,
  validateActiveReadParameters,
  validateExecuteParameters,
} from '../../execution/adapters/AdapterRuntimeSchemas.js';
import { AdapterRegistry } from '../../execution/adapters/AdapterRegistry.js';
import { PlateMapExporter } from '../../execution/PlateMapExporter.js';
import { ParserRegistry } from '../../measurement/parsers/ParserRegistry.js';
import { createExecutionProvider, resolveExecutionMode } from '../../execution/providers/createExecutionProvider.js';

export function registerExecutionTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const orchestrator = new ExecutionOrchestrator(ctx);
  const provider = createExecutionProvider(ctx);
  const controlService = new ExecutionControlService(ctx);
  const poller = new ExecutionPoller(ctx, controlService);
  const materializer = new ExecutionMaterializer(ctx);
  const executionRunService = new ExecutionRunService(ctx, provider, controlService);
  const retryWorker = new ExecutionRetryWorker(ctx, executionRunService);
  const timelineService = new ExecutionTimelineService(ctx, executionRunService);
  const capabilitiesService = new ExecutionCapabilitiesService();
  const adapterHealth = new AdapterHealthService();
  const runbook = new FailureRunbookService();
  const incidentService = new ExecutionIncidentService(ctx, adapterHealth);
  const incidentWorker = new ExecutionIncidentWorker(ctx, incidentService);
  const workerLeases = new WorkerLeaseViewService(ctx);
  const opsSnapshot = new ExecutionOpsSnapshotService(ctx, adapterHealth, incidentService, workerLeases);
  const sidecarConformance = new SidecarContractConformanceService(ctx);
  const measurementService = new MeasurementService(ctx);
  const measurementActiveControl = new MeasurementActiveControlService(ctx);
  const parserValidationService = new MeasurementParserValidationService(ctx);
  const adapterRegistry = new AdapterRegistry();
  const plateMapExporter = new PlateMapExporter(ctx);
  const parserRegistry = new ParserRegistry();

  // planned_run_create — Create a planned run with bindings
  dualRegister(server, registry,
    'planned_run_create',
    'Create a planned run from a protocol or event graph. Binds abstract roles to concrete instances.',
    {
      title: z.string().describe('Title for the planned run'),
      sourceType: z.enum(['protocol', 'event-graph']).describe('Source type'),
      sourceRef: z.object({
        kind: z.enum(['record', 'ontology']),
        id: z.string(),
        type: z.string().optional(),
      }).describe('Source reference to protocol or event graph'),
      bindings: z.record(z.string(), z.unknown()).optional().describe('Role bindings (labware, materials, instruments, parameters)'),
    },
    async (args) => {
      try {
        const result = await orchestrator.createPlannedRun({
          title: args.title,
          sourceType: args.sourceType,
          sourceRef: args.sourceRef,
          bindings: args.bindings,
        });
        return jsonResult({ success: true, recordId: result.recordId });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // planned_run_compile — Compile to robot plan
  dualRegister(server, registry,
    'planned_run_compile',
    'Compile a planned run to a platform-specific robot plan.',
    {
      plannedRunId: z.string().describe('Planned run recordId to compile'),
      targetPlatform: z.enum(['opentrons_ot2', 'opentrons_flex', 'integra_assist']).describe('Target robot platform'),
    },
    async (args) => {
      try {
        const result = await orchestrator.compilePlannedRun({
          plannedRunId: args.plannedRunId,
          targetPlatform: args.targetPlatform,
        });
        return jsonResult({ success: true, robotPlanId: result.robotPlanId });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // adapter_list — List known driver adapters
  dualRegister(server, registry,
    'adapter_list',
    'List known execution and measurement adapters with capability and maturity metadata.',
    {},
    async () => jsonResult({ adapters: adapterRegistry.list(), total: adapterRegistry.list().length })
  );

  // adapter_health_check — Adapter readiness and probe status
  dualRegister(server, registry,
    'adapter_health_check',
    'Check adapter readiness from configuration and optionally probe bridge endpoints.',
    {
      probe: z.boolean().optional().describe('When true, probe configured HTTP bridge URLs'),
    },
    async (args) => jsonResult({ health: await adapterHealth.check({ probe: args.probe === true }) })
  );

  // execution_failure_runbook — Failure code guidance
  dualRegister(server, registry,
    'execution_failure_runbook',
    'List failure runbook guidance entries or fetch one by failureCode.',
    {
      failureCode: z.string().optional().describe('Failure code to fetch'),
    },
    async (args) => {
      if (args.failureCode) {
        const entry = runbook.get(args.failureCode);
        if (!entry) {
          return errorResult(`NOT_FOUND: No runbook entry for failureCode: ${args.failureCode}`);
        }
        return jsonResult({ entry });
      }
      const entries = runbook.list();
      return jsonResult({ entries, total: entries.length });
    }
  );

  // execution_incidents_list — List incidents
  dualRegister(server, registry,
    'execution_incidents_list',
    'List execution incident records with optional status filter.',
    {
      status: z.enum(['open', 'acked', 'resolved']).optional().describe('Incident status filter'),
      limit: z.number().optional().describe('Maximum incidents to return (default 200)'),
    },
    async (args) => {
      const incidents = await incidentService.listIncidents({
        ...(args.status ? { status: args.status } : {}),
        limit: args.limit ?? 200,
      });
      return jsonResult({ incidents, total: incidents.length });
    }
  );

  // execution_incidents_scan — Create deduplicated incidents
  dualRegister(server, registry,
    'execution_incidents_scan',
    'Scan adapter/execution health and create deduplicated incident records.',
    {},
    async () => jsonResult({ summary: await incidentService.scanAndCreateIncidents() })
  );

  // execution_incident_ack — Acknowledge incident
  dualRegister(server, registry,
    'execution_incident_ack',
    'Acknowledge an open execution incident.',
    {
      incidentId: z.string().describe('Incident recordId'),
      notes: z.string().optional().describe('Optional operator note'),
    },
    async (args) => {
      try {
        const result = await incidentService.acknowledgeIncident(args.incidentId, args.notes);
        return jsonResult({ success: true, ...result });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_incident_resolve — Resolve incident
  dualRegister(server, registry,
    'execution_incident_resolve',
    'Resolve an execution incident after remediation.',
    {
      incidentId: z.string().describe('Incident recordId'),
      notes: z.string().optional().describe('Optional resolution note'),
    },
    async (args) => {
      try {
        const result = await incidentService.resolveIncident(args.incidentId, args.notes);
        return jsonResult({ success: true, ...result });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_incidents_summary — Aggregate incident counts
  dualRegister(server, registry,
    'execution_incidents_summary',
    'Get aggregated incident counts by status, severity, and incident type.',
    {},
    async () => jsonResult({ summary: await incidentService.summary() })
  );

  // execution_capabilities — Consolidated capability map
  dualRegister(server, registry,
    'execution_capabilities',
    'Get consolidated execution capability map including adapters, parsers, and runtime env contracts.',
    {},
    async () => jsonResult({
      capabilities: {
        ...capabilitiesService.getCapabilities(),
        provider: provider.descriptor(),
        executionMode: resolveExecutionMode(ctx),
      },
    })
  );

  // execution_parameter_schema — List runtime execute parameter schemas
  dualRegister(server, registry,
    'execution_parameter_schema',
    'List runtime parameter schema shapes for run-execute targets.',
    {},
    async () => {
      const targets = listExecuteTargets().map((target) => ({
        target,
        shape: getExecuteParameterShape(target),
      }));
      return jsonResult({ targets, total: targets.length });
    }
  );

  // execution_parameter_validate — Validate execute parameters
  dualRegister(server, registry,
    'execution_parameter_validate',
    'Validate adapter runtime parameters for robot plan execution.',
    {
      target: z.enum(['integra_assist', 'opentrons_ot2', 'opentrons_flex']).describe('Execution target platform'),
      parameters: z.record(z.string(), z.unknown()).optional().describe('Adapter runtime parameters to validate'),
    },
    async (args) => {
      try {
        const normalized = validateExecuteParameters(args.target, args.parameters ?? {});
        return jsonResult({ success: true, target: args.target, normalized });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // robot_plan_execute — Execute compiled plan via sidecar
  dualRegister(server, registry,
    'robot_plan_execute',
    'Execute a compiled robot plan via the configured sidecar adapter and emit an instrument-log record.',
    {
      robotPlanId: z.string().describe('Robot plan recordId'),
      parameters: z.record(z.string(), z.unknown()).optional().describe('Optional adapter-specific runtime parameters'),
    },
    async (args) => {
      try {
        const result = await provider.executeRobotPlan(args.robotPlanId, {
          ...(args.parameters !== undefined ? { parameters: args.parameters } : {}),
        });
        return jsonResult({ success: true, executionRunId: result.executionRunId, logId: result.logId, status: result.status });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_orchestrate — Compile/validate/execute in one call
  dualRegister(server, registry,
    'execution_orchestrate',
    'Guarded orchestration: optional planned-run compile, parameter validation, and execution.',
    {
      plannedRunId: z.string().optional().describe('Optional planned run recordId to compile first'),
      robotPlanId: z.string().optional().describe('Optional robot plan recordId to execute directly'),
      targetPlatform: z.enum(['integra_assist', 'opentrons_ot2', 'opentrons_flex']).optional().describe('Required when plannedRunId is used'),
      parameters: z.record(z.string(), z.unknown()).optional().describe('Adapter-specific runtime parameters'),
      dryRun: z.boolean().optional().describe('Validate only; do not execute'),
    },
    async (args) => {
      try {
        const hasPlanned = typeof args.plannedRunId === 'string' && args.plannedRunId.length > 0;
        const hasRobot = typeof args.robotPlanId === 'string' && args.robotPlanId.length > 0;
        if (!hasPlanned && !hasRobot) {
          return errorResult('BAD_REQUEST: plannedRunId or robotPlanId is required');
        }
        let robotPlanId = args.robotPlanId;
        let targetPlatform = args.targetPlatform;

        if (hasPlanned) {
          if (!targetPlatform) {
            return errorResult('BAD_REQUEST: targetPlatform is required when plannedRunId is provided');
          }
          const compiled = await orchestrator.compilePlannedRun({
            plannedRunId: args.plannedRunId!,
            targetPlatform,
          });
          robotPlanId = compiled.robotPlanId;
        } else if (robotPlanId) {
          const envelope = await ctx.store.get(robotPlanId);
          if (!envelope) {
            return errorResult(`NOT_FOUND: Robot plan not found: ${robotPlanId}`);
          }
          const payload = envelope.payload as { kind?: string; targetPlatform?: string };
          if (payload.kind !== 'robot-plan') {
            return errorResult(`BAD_REQUEST: ${robotPlanId} is not a robot-plan`);
          }
          if (payload.targetPlatform === 'integra_assist' || payload.targetPlatform === 'opentrons_ot2' || payload.targetPlatform === 'opentrons_flex') {
            targetPlatform = payload.targetPlatform;
          } else {
            return errorResult(`BAD_REQUEST: Unsupported robot-plan targetPlatform: ${String(payload.targetPlatform)}`);
          }
        }
        if (!robotPlanId || !targetPlatform) {
          return errorResult('BAD_REQUEST: Unable to resolve robotPlanId/targetPlatform');
        }

        const normalizedParameters = validateExecuteParameters(targetPlatform, args.parameters ?? {});
        if (args.dryRun === true) {
          return jsonResult({
            success: true,
            ...(args.plannedRunId ? { plannedRunId: args.plannedRunId } : {}),
            robotPlanId,
            targetPlatform,
            normalizedParameters,
            dryRun: true,
          });
        }
        const executed = await provider.executeRobotPlan(robotPlanId, {
          parameters: normalizedParameters,
        });
        return jsonResult({
          success: true,
          ...(args.plannedRunId ? { plannedRunId: args.plannedRunId } : {}),
          robotPlanId,
          targetPlatform,
          normalizedParameters,
          executionRunId: executed.executionRunId,
          logId: executed.logId,
          status: executed.status,
        });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // robot_plan_status — Fetch runtime status
  dualRegister(server, registry,
    'robot_plan_status',
    'Get runtime/external execution status for a compiled robot plan.',
    {
      robotPlanId: z.string().describe('Robot plan recordId'),
    },
    async (args) => {
      try {
        const status = await controlService.getRobotPlanStatus(args.robotPlanId);
        return jsonResult({ status });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // robot_plan_logs — List logs for a robot plan
  dualRegister(server, registry,
    'robot_plan_logs',
    'List instrument-log records associated with a robot plan.',
    {
      robotPlanId: z.string().describe('Robot plan recordId'),
      limit: z.number().optional().describe('Maximum logs to return (default 50)'),
    },
    async (args) => {
      try {
        const logs = await controlService.listRobotPlanLogs(args.robotPlanId, args.limit ?? 50);
        return jsonResult({ logs, total: logs.length });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_list — List execution-run tracking records
  dualRegister(server, registry,
    'execution_run_list',
    'List execution-run tracking records with optional status filter.',
    {
      status: z.enum(['running', 'completed', 'failed', 'canceled']).optional().describe('Execution-run status filter'),
      robotPlanId: z.string().optional().describe('Filter by robot plan recordId'),
      plannedRunId: z.string().optional().describe('Filter by planned run recordId'),
      offset: z.number().optional().describe('Offset for pagination (default 0)'),
      limit: z.number().optional().describe('Maximum records to return (default 50)'),
      sort: z.enum(['attempt_desc', 'attempt_asc', 'record_desc', 'record_asc']).optional().describe('Sort order (default record_desc)'),
    },
    async (args) => {
      try {
        const result = await executionRunService.listExecutionRunsPaged({
          ...(args.status ? { status: args.status } : {}),
          ...(args.robotPlanId ? { robotPlanId: args.robotPlanId } : {}),
          ...(args.plannedRunId ? { plannedRunId: args.plannedRunId } : {}),
          ...(args.sort ? { sort: args.sort } : {}),
          offset: args.offset ?? 0,
          limit: args.limit ?? 50,
        });
        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_get — Fetch execution-run by id
  dualRegister(server, registry,
    'execution_run_get',
    'Get a single execution-run tracking record.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const run = await ctx.store.get(args.executionRunId);
        if (!run) {
          return errorResult(`Execution run not found: ${args.executionRunId}`);
        }
        return jsonResult({ run });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_status — Resolve execution-run + runtime status
  dualRegister(server, registry,
    'execution_run_status',
    'Get merged execution-run and runtime status information.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const status = await executionRunService.getExecutionRunStatus(args.executionRunId);
        return jsonResult({ status });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_retry — Retry from prior execution run
  dualRegister(server, registry,
    'execution_run_retry',
    'Retry execution for the robot plan linked to a prior execution-run.',
    {
      executionRunId: z.string().describe('Execution-run recordId to retry'),
      force: z.boolean().optional().describe('Allow retry even if source execution-run is still running'),
    },
    async (args) => {
      try {
        const result = await executionRunService.retryExecutionRunWithOptions(args.executionRunId, {
          force: args.force === true,
        });
        return jsonResult({ success: true, ...result });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_resolve — Manual run resolution
  dualRegister(server, registry,
    'execution_run_resolve',
    'Manually resolve an execution-run state (completed/failed/canceled) with optional failure metadata.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
      status: z.enum(['completed', 'failed', 'canceled']).describe('Resolved status'),
      failureClass: z.enum(['transient', 'terminal', 'unknown']).optional().describe('Failure class'),
      failureCode: z.string().optional().describe('Machine-readable failure code'),
      retryRecommended: z.boolean().optional().describe('Retry recommendation override'),
      retryReason: z.string().optional().describe('Retry reason override'),
      notes: z.string().optional().describe('Operator notes'),
    },
    async (args) => {
      try {
        const result = await executionRunService.resolveExecutionRun(args.executionRunId, {
          status: args.status,
          ...(args.failureClass !== undefined ? { failureClass: args.failureClass } : {}),
          ...(args.failureCode !== undefined ? { failureCode: args.failureCode } : {}),
          ...(args.retryRecommended !== undefined ? { retryRecommended: args.retryRecommended } : {}),
          ...(args.retryReason !== undefined ? { retryReason: args.retryReason } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
        });
        return jsonResult({ success: true, ...result });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_cancel — Cancel by execution-run id
  dualRegister(server, registry,
    'execution_run_cancel',
    'Cancel execution by execution-run id.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const details = await executionRunService.cancelExecutionRun(args.executionRunId);
        return jsonResult({ success: true, details });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_lineage — Retry lineage
  dualRegister(server, registry,
    'execution_run_lineage',
    'Get retry lineage for an execution-run.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const lineage = await executionRunService.getExecutionRunLineage(args.executionRunId);
        return jsonResult(lineage);
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_latest — latest run for robot plan
  dualRegister(server, registry,
    'execution_run_latest',
    'Get latest execution-run for a robot plan.',
    {
      robotPlanId: z.string().describe('Robot plan recordId'),
    },
    async (args) => {
      try {
        const run = await executionRunService.getLatestExecutionRunForRobotPlan(args.robotPlanId);
        if (!run) {
          return errorResult(`No execution-runs for robot plan: ${args.robotPlanId}`);
        }
        return jsonResult({ run });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_event_graph — materialized event graph
  dualRegister(server, registry,
    'execution_run_event_graph',
    'Get materialized event graph for an execution-run if present.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const result = await executionRunService.getMaterializedEventGraph(args.executionRunId);
        if (!result) {
          return errorResult(`No materialized event graph for execution run: ${args.executionRunId}`);
        }
        return jsonResult(result);
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_run_timeline — execution/log/event timeline
  dualRegister(server, registry,
    'execution_run_timeline',
    'Get merged timeline for an execution-run, including run lifecycle, instrument logs, and materialized events.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const timeline = await timelineService.getTimeline(args.executionRunId);
        return jsonResult({ timeline });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // execution_poller_status — Poller status
  dualRegister(server, registry,
    'execution_poller_status',
    'Get background execution poller status.',
    {},
    async () => jsonResult({ status: poller.status() })
  );

  // execution_worker_leases — worker lease ownership/status
  dualRegister(server, registry,
    'execution_worker_leases',
    'List lease ownership and health status for execution poller, retry worker, and incident worker.',
    {
      workerId: z.enum(['execution-poller', 'retry-worker', 'incident-scanner']).optional().describe('Optional single worker filter'),
    },
    async (args) => jsonResult(await workerLeases.list({
      ...(args.workerId ? { workerId: args.workerId } : {}),
    }))
  );

  // execution_ops_snapshot — consolidated operations snapshot
  dualRegister(server, registry,
    'execution_ops_snapshot',
    'Get consolidated execution operations snapshot: backlog, incidents, adapter health, and worker leases.',
    {
      probeAdapters: z.boolean().optional().describe('When true, probe adapter bridge URLs'),
      workerId: z.enum(['execution-poller', 'retry-worker', 'incident-scanner']).optional().describe('Optional single worker filter for lease view'),
    },
    async (args) => jsonResult(await opsSnapshot.snapshot({
      probeAdapters: args.probeAdapters === true,
      ...(args.workerId ? { workerId: args.workerId } : {}),
    }))
  );

  // execution_sidecar_contracts — list contract manifest
  dualRegister(server, registry,
    'execution_sidecar_contracts',
    'List sidecar bridge contracts and schema IDs for Assist Plus and Gemini.',
    {},
    async () => jsonResult(sidecarConformance.manifest())
  );

  // execution_sidecar_contract_diagnostics — runtime readiness diagnostics
  dualRegister(server, registry,
    'execution_sidecar_contract_diagnostics',
    'Get sidecar contract diagnostics (strict mode, loaded schemas, missing contracts).',
    {},
    async () => jsonResult(sidecarConformance.diagnostics())
  );

  // execution_sidecar_contract_examples — list canonical samples
  dualRegister(server, registry,
    'execution_sidecar_contract_examples',
    'List canonical sample payloads for sidecar bridge contracts.',
    {
      contractId: z.string().optional().describe('Optional single contractId filter'),
    },
    async (args) => jsonResult(sidecarConformance.examples({
      ...(args.contractId ? { contractId: args.contractId } : {}),
    }))
  );

  // execution_sidecar_contract_self_test — run contract conformance checks
  dualRegister(server, registry,
    'execution_sidecar_contract_self_test',
    'Run sidecar contract conformance self-test against loaded schemas and parser rules.',
    {},
    async () => jsonResult(await sidecarConformance.selfTest())
  );

  // execution_sidecar_contract_self_test_persist — self-test + report record
  dualRegister(server, registry,
    'execution_sidecar_contract_self_test_persist',
    'Run sidecar contract self-test and persist a sidecar-contract-report record.',
    {
      profile: z.string().optional().describe('Optional profile label for report'),
      notes: z.string().optional().describe('Optional operator notes'),
    },
    async (args) => jsonResult(await sidecarConformance.selfTestAndPersist({
      ...(args.profile ? { profile: args.profile } : {}),
      ...(args.notes ? { notes: args.notes } : {}),
    }))
  );

  // execution_sidecar_contract_validate — validate payload against named contract
  dualRegister(server, registry,
    'execution_sidecar_contract_validate',
    'Validate an arbitrary payload against a sidecar contract schema by contractId.',
    {
      contractId: z.string().describe('Contract identifier from execution_sidecar_contracts'),
      payload: z.record(z.string(), z.unknown()).describe('Payload object to validate'),
    },
    async (args) => jsonResult(sidecarConformance.validatePayload(args.contractId, args.payload))
  );

  // execution_sidecar_contract_validate_batch — validate multiple payloads
  dualRegister(server, registry,
    'execution_sidecar_contract_validate_batch',
    'Validate multiple payloads against sidecar contract schemas.',
    {
      items: z.array(z.object({
        contractId: z.string(),
        payload: z.record(z.string(), z.unknown()),
      })).describe('List of contract payload validations'),
    },
    async (args) => jsonResult(sidecarConformance.validateBatch(args.items))
  );

  // execution_sidecar_contract_gate — readiness gate evaluation
  dualRegister(server, registry,
    'execution_sidecar_contract_gate',
    'Evaluate sidecar contract readiness gate conditions and return ready/not-ready.',
    {
      requireStrict: z.boolean().optional().describe('Require strict contract mode'),
      requireAllSchemasLoaded: z.boolean().optional().describe('Require all contract schemas loaded'),
      requireSelfTestPass: z.boolean().optional().describe('Require conformance self-test pass (default true)'),
    },
    async (args) => jsonResult(await sidecarConformance.gate({
      ...(args.requireStrict !== undefined ? { requireStrict: args.requireStrict } : {}),
      ...(args.requireAllSchemasLoaded !== undefined ? { requireAllSchemasLoaded: args.requireAllSchemasLoaded } : {}),
      ...(args.requireSelfTestPass !== undefined ? { requireSelfTestPass: args.requireSelfTestPass } : {}),
    }))
  );

  // execution_poller_start — Start background poller
  dualRegister(server, registry,
    'execution_poller_start',
    'Start background execution poller.',
    {
      intervalMs: z.number().optional().describe('Polling interval in milliseconds (default 15000)'),
      forceTakeover: z.boolean().optional().describe('Force lease takeover if another owner is active'),
    },
    async (args) => jsonResult({
      status: await poller.start(args.intervalMs ?? 15_000, {
        forceTakeover: args.forceTakeover === true,
      }),
    })
  );

  // execution_poller_takeover — force lease takeover
  dualRegister(server, registry,
    'execution_poller_takeover',
    'Force lease takeover and start background execution poller.',
    {
      intervalMs: z.number().optional().describe('Polling interval in milliseconds (default 15000)'),
    },
    async (args) => jsonResult({
      status: await poller.start(args.intervalMs ?? 15_000, {
        forceTakeover: true,
      }),
    })
  );

  // execution_poller_stop — Stop background poller
  dualRegister(server, registry,
    'execution_poller_stop',
    'Stop background execution poller.',
    {},
    async () => jsonResult({ status: await poller.stop() })
  );

  // execution_poller_poll_once — Run one poll cycle now
  dualRegister(server, registry,
    'execution_poller_poll_once',
    'Run one execution poll cycle immediately.',
    {
      limit: z.number().optional().describe('Maximum running execution records to scan (default 100)'),
    },
    async (args) => jsonResult({ summary: await poller.pollOnce(args.limit ?? 100) })
  );

  // execution_retry_worker_status — Retry worker status
  dualRegister(server, registry,
    'execution_retry_worker_status',
    'Get transient retry worker status.',
    {},
    async () => jsonResult({ status: retryWorker.status() })
  );

  // execution_incident_worker_status — Incident worker status
  dualRegister(server, registry,
    'execution_incident_worker_status',
    'Get incident scan worker status.',
    {},
    async () => jsonResult({ status: incidentWorker.status() })
  );

  // execution_incident_worker_start — Start incident worker
  dualRegister(server, registry,
    'execution_incident_worker_start',
    'Start incident scan worker interval loop.',
    {
      intervalMs: z.number().optional().describe('Worker interval in milliseconds (default 60000)'),
      forceTakeover: z.boolean().optional().describe('Force lease takeover if another owner is active'),
    },
    async (args) => jsonResult({
      status: await incidentWorker.start(args.intervalMs ?? 60_000, {
        forceTakeover: args.forceTakeover === true,
      }),
    })
  );

  // execution_incident_worker_takeover — force lease takeover
  dualRegister(server, registry,
    'execution_incident_worker_takeover',
    'Force lease takeover and start incident scan worker.',
    {
      intervalMs: z.number().optional().describe('Worker interval in milliseconds (default 60000)'),
    },
    async (args) => jsonResult({
      status: await incidentWorker.start(args.intervalMs ?? 60_000, {
        forceTakeover: true,
      }),
    })
  );

  // execution_incident_worker_stop — Stop incident worker
  dualRegister(server, registry,
    'execution_incident_worker_stop',
    'Stop incident scan worker.',
    {},
    async () => jsonResult({ status: await incidentWorker.stop() })
  );

  // execution_incident_worker_run_once — Run one incident scan cycle
  dualRegister(server, registry,
    'execution_incident_worker_run_once',
    'Run one incident scan cycle immediately.',
    {},
    async () => jsonResult({ summary: await incidentWorker.runOnce() })
  );

  // execution_retry_worker_start — Start transient retry worker
  dualRegister(server, registry,
    'execution_retry_worker_start',
    'Start transient retry worker interval loop.',
    {
      intervalMs: z.number().optional().describe('Worker interval in milliseconds (default 30000)'),
      forceTakeover: z.boolean().optional().describe('Force lease takeover if another owner is active'),
    },
    async (args) => jsonResult({
      status: await retryWorker.start(args.intervalMs ?? 30_000, {
        forceTakeover: args.forceTakeover === true,
      }),
    })
  );

  // execution_retry_worker_takeover — force lease takeover
  dualRegister(server, registry,
    'execution_retry_worker_takeover',
    'Force lease takeover and start transient retry worker.',
    {
      intervalMs: z.number().optional().describe('Worker interval in milliseconds (default 30000)'),
    },
    async (args) => jsonResult({
      status: await retryWorker.start(args.intervalMs ?? 30_000, {
        forceTakeover: true,
      }),
    })
  );

  // execution_retry_worker_stop — Stop transient retry worker
  dualRegister(server, registry,
    'execution_retry_worker_stop',
    'Stop transient retry worker.',
    {},
    async () => jsonResult({ status: await retryWorker.stop() })
  );

  // execution_retry_worker_run_once — Run one retry cycle
  dualRegister(server, registry,
    'execution_retry_worker_run_once',
    'Run one transient retry scan cycle immediately.',
    {
      limit: z.number().optional().describe('Maximum failed executions to consider (default 100)'),
    },
    async (args) => jsonResult({ summary: await retryWorker.runOnce(args.limit ?? 100) })
  );

  // execution_recovery_reconcile — Reconcile running executions
  dualRegister(server, registry,
    'execution_recovery_reconcile',
    'Reconcile running executions and force transitions for stale/unknown runs.',
    {
      limit: z.number().optional().describe('Maximum running execution records to scan (default 250)'),
    },
    async (args) => jsonResult({ summary: await poller.pollOnce(args.limit ?? 250) })
  );

  // execution_run_materialize — Materialize event graph
  dualRegister(server, registry,
    'execution_run_materialize',
    'Materialize an event-graph from a completed execution-run.',
    {
      executionRunId: z.string().describe('Execution-run recordId'),
    },
    async (args) => {
      try {
        const result = await materializer.materializeFromExecutionRun(args.executionRunId);
        return jsonResult({ success: true, eventGraphId: result.eventGraphId });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // robot_plan_cancel — Request cancel/stop
  dualRegister(server, registry,
    'robot_plan_cancel',
    'Request cancellation of an externally running robot plan (currently Opentrons run stop).',
    {
      robotPlanId: z.string().describe('Robot plan recordId'),
    },
    async (args) => {
      try {
        const details = await controlService.cancelRobotPlan(args.robotPlanId);
        return jsonResult({ success: true, details });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // measurement_ingest — Ingest instrument data
  dualRegister(server, registry,
    'measurement_ingest',
    'Ingest instrument output and create a measurement record from parser-ready raw files.',
    {
      instrumentRef: z.record(z.string(), z.unknown()).optional().describe('Instrument reference'),
      labwareInstanceRef: z.record(z.string(), z.unknown()).optional().describe('Labware instance reference'),
      eventGraphRef: z.record(z.string(), z.unknown()).optional().describe('Event graph reference'),
      readEventRef: z.string().optional().describe('Read event ID within the event graph'),
      parserId: z.string().optional().describe('Parser identifier to use'),
      rawData: z.record(z.string(), z.unknown()).optional().describe('Raw data descriptor, e.g., {path: \"records/inbox/file.csv\"}'),
    },
    async (args) => {
      try {
        const ingestArgs: {
          instrumentRef?: unknown;
          labwareInstanceRef?: unknown;
          eventGraphRef?: unknown;
          readEventRef?: string;
          parserId?: string;
          rawData?: unknown;
        } = {
          ...(args.instrumentRef !== undefined ? { instrumentRef: args.instrumentRef } : {}),
          ...(args.labwareInstanceRef !== undefined ? { labwareInstanceRef: args.labwareInstanceRef } : {}),
          ...(args.eventGraphRef !== undefined ? { eventGraphRef: args.eventGraphRef } : {}),
          ...(args.readEventRef !== undefined ? { readEventRef: args.readEventRef } : {}),
          ...(args.parserId !== undefined ? { parserId: args.parserId } : {}),
          ...(args.rawData !== undefined ? { rawData: args.rawData } : {}),
        };
        const result = await measurementService.ingest(ingestArgs);
        return jsonResult({ success: true, recordId: result.recordId });
      } catch (err) {
        if (err instanceof MeasurementServiceError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // measurement_active_read — Trigger active instrument read and ingest
  dualRegister(server, registry,
    'measurement_active_read',
    'Run an active instrument read via sidecar (Gemini/ABI/GC/IC) and ingest output into a measurement record.',
    {
      adapterId: z.enum(['molecular_devices_gemini', 'abi_7500_qpcr', 'agilent_6890n_gc', 'metrohm_761_ic']).describe('Active-read adapter identifier'),
      instrumentRef: z.record(z.string(), z.unknown()).optional().describe('Instrument reference'),
      labwareInstanceRef: z.record(z.string(), z.unknown()).optional().describe('Labware instance reference'),
      eventGraphRef: z.record(z.string(), z.unknown()).optional().describe('Event graph reference'),
      readEventRef: z.string().optional().describe('Read event ID within event graph'),
      parserId: z.string().optional().describe('Override parser identifier'),
      outputPath: z.string().optional().describe('Known raw output path to ingest'),
      parameters: z.record(z.string(), z.unknown()).optional().describe('Adapter-specific runtime parameters'),
    },
    async (args) => {
      try {
        const result = await measurementActiveControl.performActiveRead({
          adapterId: args.adapterId,
          ...(args.instrumentRef !== undefined ? { instrumentRef: args.instrumentRef } : {}),
          ...(args.labwareInstanceRef !== undefined ? { labwareInstanceRef: args.labwareInstanceRef } : {}),
          ...(args.eventGraphRef !== undefined ? { eventGraphRef: args.eventGraphRef } : {}),
          ...(args.readEventRef !== undefined ? { readEventRef: args.readEventRef } : {}),
          ...(args.parserId !== undefined ? { parserId: args.parserId } : {}),
          ...(args.outputPath !== undefined ? { outputPath: args.outputPath } : {}),
          ...(args.parameters !== undefined ? { parameters: args.parameters } : {}),
        });
        return jsonResult({ success: true, ...result });
      } catch (err) {
        if (err instanceof MeasurementActiveControlError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        if (err instanceof MeasurementServiceError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // measurement_active_read_schema — List active-read parameter schemas
  dualRegister(server, registry,
    'measurement_active_read_schema',
    'List runtime parameter schema shapes for active-read adapters.',
    {},
    async () => {
      const adapters = listActiveReadTargets().map((adapterId) => ({
        adapterId,
        shape: getActiveReadParameterShape(adapterId),
      }));
      return jsonResult({ adapters, total: adapters.length });
    }
  );

  // measurement_active_read_validate — Validate active-read parameters
  dualRegister(server, registry,
    'measurement_active_read_validate',
    'Validate runtime parameters for active-read adapter calls.',
    {
      adapterId: z.enum(['molecular_devices_gemini', 'abi_7500_qpcr', 'agilent_6890n_gc', 'metrohm_761_ic']).describe('Active-read adapter identifier'),
      parameters: z.record(z.string(), z.unknown()).optional().describe('Adapter runtime parameters'),
    },
    async (args) => {
      try {
        const normalized = validateActiveReadParameters(args.adapterId, args.parameters ?? {});
        return jsonResult({ success: true, adapterId: args.adapterId, normalized });
      } catch (err) {
        if (err instanceof AdapterParameterError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // measurement_parser_list — List available measurement parsers
  dualRegister(server, registry,
    'measurement_parser_list',
    'List available measurement parsers and aliases.',
    {},
    async () => jsonResult({ parsers: parserRegistry.list(), total: parserRegistry.list().length })
  );

  // measurement_parser_validate — Parse/validate without persisting
  dualRegister(server, registry,
    'measurement_parser_validate',
    'Validate parser output for a raw data file without writing a measurement record.',
    {
      parserId: z.string().describe('Parser identifier to use'),
      path: z.string().describe('Repository-relative file path to raw data'),
    },
    async (args) => {
      try {
        const result = await parserValidationService.validate(args);
        return jsonResult({ result });
      } catch (err) {
        if (err instanceof MeasurementServiceError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // measurement_query — Query measurement by well/channel
  dualRegister(server, registry,
    'measurement_query',
    'Query measurement data for specific wells and/or channels.',
    {
      measurementId: z.string().describe('Measurement recordId'),
      well: z.string().optional().describe('Well address to filter by (e.g., "A1")'),
      channelId: z.string().optional().describe('Channel ID to filter by'),
    },
    async (args) => {
      try {
        const envelope = await ctx.store.get(args.measurementId);
        if (!envelope) {
          return errorResult(`Measurement not found: ${args.measurementId}`);
        }

        const payload = envelope.payload as { data?: Array<{ well: string; channelId?: string }> };
        let data = payload.data ?? [];

        if (args.well !== undefined) {
          data = data.filter((d) => d.well === args.well);
        }
        if (args.channelId !== undefined) {
          data = data.filter((d) => d.channelId === args.channelId);
        }

        return jsonResult({ measurementId: args.measurementId, data, total: data.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // plate_map_export — Export plate map CSV
  dualRegister(server, registry,
    'plate_map_export',
    'Export a plate map as CSV/TSV from an event graph by replaying add-material and transfer events.',
    {
      eventGraphId: z.string().describe('Event graph ID to export'),
      labwareId: z.string().optional().describe('Specific labware to export (default: all)'),
      format: z.enum(['csv', 'tsv']).optional().describe('Export format (default: csv)'),
    },
    async (args) => {
      try {
        const format = args.format === 'tsv' ? 'tsv' : 'csv';
        const exportArgs: { eventGraphId: string; labwareId?: string; format?: 'csv' | 'tsv' } = {
          eventGraphId: args.eventGraphId,
          format,
          ...(args.labwareId !== undefined ? { labwareId: args.labwareId } : {}),
        };
        const content = await plateMapExporter.export(exportArgs);
        return jsonResult({ format, content });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // planned_run_list — List planned runs
  dualRegister(server, registry,
    'planned_run_list',
    'List planned run records with optional state filter.',
    {
      state: z.string().optional().describe('Filter by state (draft, ready, executing, completed, failed)'),
      limit: z.number().optional().describe('Maximum records to return (default 50)'),
    },
    async (args) => {
      try {
        const filter: RecordFilter = {
          kind: 'planned-run',
          limit: args.limit ?? 50,
        };
        const records = await ctx.store.list(filter);
        // Client-side state filter (store doesn't support custom field filters)
        let filtered = records;
        if (args.state !== undefined) {
          filtered = records.filter((r) => {
            const payload = r.payload as { state?: string };
            return payload.state === args.state;
          });
        }
        return jsonResult({ records: filtered, total: filtered.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // planned_run_logs — List instrument logs for a planned run
  dualRegister(server, registry,
    'planned_run_logs',
    'List instrument-log records associated with a planned run.',
    {
      plannedRunId: z.string().describe('Planned run recordId'),
      limit: z.number().optional().describe('Maximum logs to return (default 50)'),
    },
    async (args) => {
      try {
        const logs = await ctx.store.list({ kind: 'instrument-log', limit: args.limit ?? 50 });
        const filtered = logs.filter((log) => {
          const payload = log.payload as { plannedRunRef?: { id?: string } };
          return payload.plannedRunRef?.id === args.plannedRunId;
        });
        return jsonResult({ logs: filtered, total: filtered.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
