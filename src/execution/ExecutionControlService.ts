import type { AppContext } from '../server.js';
import { ExecutionError } from './ExecutionOrchestrator.js';
import { SidecarRunner } from './sidecar/SidecarRunner.js';
import { parseAssistCancelResponse, parseAssistStatusResponse } from './sidecar/BridgeContracts.js';
import { SidecarContractConformanceService } from './SidecarContractConformanceService.js';

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchLikeResponse>;

type RobotPlanPayload = {
  kind: 'robot-plan';
  id: string;
  targetPlatform?: 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
  plannedRunRef?: { kind: 'record' | 'ontology'; id: string };
};

type InstrumentLogPayload = {
  id: string;
  status: 'completed' | 'aborted' | 'error';
  startedAt?: string;
  completedAt?: string;
  plannedRunRef?: { id?: string };
  entries?: Array<{
    data?: Record<string, unknown>;
  }>;
};

type ExecutionRunPayload = {
  kind?: string;
  recordId?: string;
  robotPlanRef?: { id?: string };
  plannedRunRef?: { id?: string };
  status?: string;
  completedAt?: string;
  cancellationRequestedAt?: string;
  cancelResponse?: unknown;
};

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pickString(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const value of Object.values(obj)) {
    const nested = pickString(value, keys);
    if (nested) return nested;
  }
  return undefined;
}

function normalizeExternalStatus(status: string | undefined): 'executing' | 'completed' | 'failed' | 'unknown' {
  if (!status) return 'unknown';
  const s = status.toLowerCase();
  if (['running', 'queued', 'starting', 'finishing', 'paused'].includes(s)) return 'executing';
  if (['succeeded', 'completed', 'finished', 'success'].includes(s)) return 'completed';
  if (['failed', 'stopped', 'canceled', 'aborted', 'error'].includes(s)) return 'failed';
  return 'unknown';
}

export class ExecutionControlService {
  private readonly ctx: AppContext;
  private readonly fetchFn: FetchLike;
  private readonly sidecarRunner: SidecarRunner;
  private readonly sidecarContracts: SidecarContractConformanceService;

  constructor(ctx: AppContext, fetchFn?: FetchLike, sidecarRunner: SidecarRunner = new SidecarRunner()) {
    this.ctx = ctx;
    this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.sidecarRunner = sidecarRunner;
    this.sidecarContracts = new SidecarContractConformanceService(ctx);
  }

  private extractLogData(log: InstrumentLogPayload): Record<string, unknown> {
    const firstEntry = log.entries?.[0];
    return firstEntry?.data ?? {};
  }

  private async updatePlannedRunState(plannedRunId: string, state: 'executing' | 'completed' | 'failed'): Promise<void> {
    const env = await this.ctx.store.get(plannedRunId);
    if (!env) return;
    const payload = env.payload;
    if (!payload || typeof payload !== 'object') return;
    const rec = payload as Record<string, unknown>;
    if (rec['kind'] !== 'planned-run') return;
    await this.ctx.store.update({
      envelope: {
        recordId: env.recordId,
        schemaId: env.schemaId,
        payload: {
          ...rec,
          state,
        },
      },
      message: `Set ${plannedRunId} to ${state} on cancel`,
    });
  }

  private async markExecutionRunCanceled(robotPlanId: string, cancelResponse: unknown): Promise<void> {
    const runs = await this.ctx.store.list({ kind: 'execution-run', limit: 200 });
    const match = runs
      .map((env) => ({ env, payload: env.payload as ExecutionRunPayload }))
      .filter((x) => x.payload.robotPlanRef?.id === robotPlanId)
      .sort((a, b) => b.env.recordId.localeCompare(a.env.recordId))[0];
    if (!match) return;

    const payload = match.payload;
    const nextPayload: Record<string, unknown> = {
      ...(match.env.payload as Record<string, unknown>),
      status: 'canceled',
      completedAt: new Date().toISOString(),
      cancellationRequestedAt: new Date().toISOString(),
      cancelResponse,
    };
    await this.ctx.store.update({
      envelope: {
        recordId: match.env.recordId,
        schemaId: match.env.schemaId,
        payload: nextPayload,
      },
      message: `Mark ${match.env.recordId} canceled`,
    });

    const plannedRunId = payload.plannedRunRef?.id;
    if (plannedRunId) {
      await this.updatePlannedRunState(plannedRunId, 'failed');
    }
  }

  private async markLatestLogAborted(robotPlanId: string): Promise<void> {
    const logs = await this.listRobotPlanLogs(robotPlanId, 1);
    const latest = logs[0];
    if (!latest) return;
    const payloadObj = latest.payload as unknown;
    if (!payloadObj || typeof payloadObj !== 'object') return;
    const record = payloadObj as Record<string, unknown>;
    const updated: Record<string, unknown> = {
      ...record,
      status: 'aborted',
      completedAt: new Date().toISOString(),
    };
    await this.ctx.store.update({
      envelope: {
        recordId: latest.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml',
        payload: updated,
      },
      message: `Mark ${latest.recordId} aborted`,
      skipValidation: true,
      skipLint: true,
    });
  }

  private sortLogsNewestFirst(logs: Array<{ payload: InstrumentLogPayload; recordId: string }>): Array<{ payload: InstrumentLogPayload; recordId: string }> {
    return logs.sort((a, b) => {
      const aTime = a.payload.completedAt ?? a.payload.startedAt ?? '';
      const bTime = b.payload.completedAt ?? b.payload.startedAt ?? '';
      return bTime.localeCompare(aTime) || b.recordId.localeCompare(a.recordId);
    });
  }

  private async getRobotPlanAndLogs(robotPlanId: string): Promise<{
    plannedRunId?: string;
    targetPlatform?: 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
    logs: Array<{ payload: InstrumentLogPayload; recordId: string }>;
  }> {
    const robotPlanEnvelope = await this.ctx.store.get(robotPlanId);
    if (!robotPlanEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Robot plan not found: ${robotPlanId}`, 404);
    }
    const robotPlan = robotPlanEnvelope.payload as RobotPlanPayload;
    if (robotPlan.kind !== 'robot-plan') {
      throw new ExecutionError('BAD_REQUEST', `${robotPlanId} is not a robot-plan`, 400);
    }

    const plannedRunId = robotPlan.plannedRunRef?.kind === 'record' ? robotPlan.plannedRunRef.id : undefined;
    const rawLogs = await this.ctx.store.list({ kind: 'instrument-log', limit: 200 });
    const logs = rawLogs
      .map((env) => ({ recordId: env.recordId, payload: env.payload as InstrumentLogPayload }))
      .filter((log) => {
        const data = this.extractLogData(log.payload);
        const logRobotPlanId = typeof data['robotPlanId'] === 'string' ? data['robotPlanId'] : undefined;
        if (logRobotPlanId === robotPlanId) return true;
        return plannedRunId !== undefined && log.payload.plannedRunRef?.id === plannedRunId;
      });
    return {
      ...(plannedRunId ? { plannedRunId } : {}),
      ...(robotPlan.targetPlatform ? { targetPlatform: robotPlan.targetPlatform } : {}),
      logs: this.sortLogsNewestFirst(logs),
    };
  }

  async getRobotPlanStatus(robotPlanId: string): Promise<Record<string, unknown>> {
    const { plannedRunId, targetPlatform, logs } = await this.getRobotPlanAndLogs(robotPlanId);
    if (logs.length === 0) {
      return {
        robotPlanId,
        ...(plannedRunId ? { plannedRunId } : {}),
        hasExecution: false,
        normalizedStatus: 'not_started',
      };
    }

    const latest = logs[0];
    if (!latest) {
      return {
        robotPlanId,
        ...(plannedRunId ? { plannedRunId } : {}),
        hasExecution: false,
        normalizedStatus: 'not_started',
      };
    }
    const data = this.extractLogData(latest.payload);
    const mode = typeof data['executionMode'] === 'string' ? data['executionMode'] : undefined;
    const runId = typeof data['opentronsRunId'] === 'string' ? data['opentronsRunId'] : undefined;
    const assistRunId = typeof data['assistRunId'] === 'string' ? data['assistRunId'] : undefined;
    const protocolId = typeof data['opentronsProtocolId'] === 'string' ? data['opentronsProtocolId'] : undefined;

    let externalStatus: string | undefined;
    if (runId && (mode === 'opentrons_http' || mode === 'opentrons_http_two_step')) {
      const statusUrl = process.env['LABOS_OPENTRONS_STATUS_URL_TEMPLATE'];
      const baseUrl = process.env['LABOS_OPENTRONS_BASE_URL'];
      const url = statusUrl
        ? statusUrl.replace('{runId}', runId)
        : baseUrl
          ? `${baseUrl.replace(/\/+$/, '')}/runs/${encodeURIComponent(runId)}`
          : undefined;
      if (url) {
        const token = process.env['LABOS_OPENTRONS_API_TOKEN'];
        const headers: Record<string, string> = {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
        const resp = await this.fetchFn(url, { method: 'GET', headers });
        const text = await resp.text();
        if (resp.ok) {
          const json = parseJsonMaybe(text);
          externalStatus = pickString(json, ['status', 'runStatus']);
        }
      }
    }
    if (assistRunId && mode === 'integra_http') {
      const statusUrlTemplate = process.env['LABOS_INTEGRA_ASSIST_STATUS_URL_TEMPLATE'];
      const baseUrl = process.env['LABOS_INTEGRA_ASSIST_BASE_URL'];
      const url = statusUrlTemplate
        ? statusUrlTemplate.replace('{runId}', assistRunId)
        : baseUrl
          ? `${baseUrl.replace(/\/+$/, '')}/runs/${encodeURIComponent(assistRunId)}`
          : undefined;
      if (url) {
        const token = process.env['LABOS_INTEGRA_ASSIST_API_TOKEN'];
        const headers: Record<string, string> = {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
        const resp = await this.fetchFn(url, { method: 'GET', headers });
        const text = await resp.text();
        if (resp.ok) {
          try {
            const parsed = parseAssistStatusResponse(text);
            externalStatus = parsed.status;
          } catch (err) {
            throw new ExecutionError('EXTERNAL_ERROR', err instanceof Error ? err.message : String(err), 502);
          }
        }
      }
    }

    const normalizedStatus = externalStatus
      ? normalizeExternalStatus(externalStatus)
      : latest.payload.status === 'completed'
        ? 'completed'
        : latest.payload.status === 'error' || latest.payload.status === 'aborted'
          ? 'failed'
          : 'unknown';

    return {
      robotPlanId,
      ...(plannedRunId ? { plannedRunId } : {}),
      hasExecution: true,
      lastLogId: latest.recordId,
      ...(mode ? { executionMode: mode } : {}),
      ...(targetPlatform ? { targetPlatform } : {}),
      ...(runId ? { opentronsRunId: runId } : {}),
      ...(assistRunId ? { assistRunId } : {}),
      ...(protocolId ? { opentronsProtocolId: protocolId } : {}),
      ...(externalStatus ? { externalStatus } : {}),
      normalizedStatus,
      logStatus: latest.payload.status,
    };
  }

  async listRobotPlanLogs(robotPlanId: string, limit: number = 50): Promise<Array<{ recordId: string; payload: InstrumentLogPayload }>> {
    const { logs } = await this.getRobotPlanAndLogs(robotPlanId);
    return logs.slice(0, limit);
  }

  async cancelRobotPlan(robotPlanId: string): Promise<Record<string, unknown>> {
    const status = await this.getRobotPlanStatus(robotPlanId);
    const runId = typeof status['opentronsRunId'] === 'string' ? status['opentronsRunId'] : undefined;
    const assistRunId = typeof status['assistRunId'] === 'string' ? status['assistRunId'] : undefined;
    if (runId) {
      const baseUrl = process.env['LABOS_OPENTRONS_BASE_URL'];
      if (!baseUrl) {
        throw new ExecutionError('BAD_REQUEST', 'LABOS_OPENTRONS_BASE_URL is required for cancel', 400);
      }
      const actionUrl = `${baseUrl.replace(/\/+$/, '')}/runs/${encodeURIComponent(runId)}/actions`;
      const token = process.env['LABOS_OPENTRONS_API_TOKEN'];
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
      const response = await this.fetchFn(actionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ actionType: 'stop' }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new ExecutionError('EXTERNAL_ERROR', `Cancel failed (${response.status}): ${text}`, 502);
      }
      const cancelResponse = parseJsonMaybe(text) ?? text;
      await this.markExecutionRunCanceled(robotPlanId, cancelResponse);
      await this.markLatestLogAborted(robotPlanId);

      return {
        robotPlanId,
        opentronsRunId: runId,
        cancelRequested: true,
        response: cancelResponse,
      };
    }
    if (assistRunId) {
      const cancelUrlTemplate = process.env['LABOS_INTEGRA_ASSIST_CANCEL_URL_TEMPLATE'];
      const baseUrl = process.env['LABOS_INTEGRA_ASSIST_BASE_URL'];
      const url = cancelUrlTemplate
        ? cancelUrlTemplate.replace('{runId}', assistRunId)
        : baseUrl
          ? `${baseUrl.replace(/\/+$/, '')}/runs/${encodeURIComponent(assistRunId)}/cancel`
          : undefined;
      if (!url) {
        throw new ExecutionError('BAD_REQUEST', 'INTEGRA cancel URL is not configured', 400);
      }
      const token = process.env['LABOS_INTEGRA_ASSIST_API_TOKEN'];
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
      const cancelPayload = { actionType: 'stop' };
      const contractCheck = this.sidecarContracts.validatePayloadIfSchemaAvailable(
        'integra_assist.cancel.request',
        cancelPayload,
      );
      if (contractCheck.checked && !contractCheck.valid) {
        throw new ExecutionError('BAD_REQUEST', 'INTEGRA cancel payload failed sidecar contract validation', 400);
      }
      const resp = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(cancelPayload),
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new ExecutionError('EXTERNAL_ERROR', `INTEGRA cancel failed (${resp.status}): ${text}`, 502);
      }
      let cancelResponse: unknown;
      try {
        const parsed = parseAssistCancelResponse(text);
        cancelResponse = {
          contractVersion: parsed.contractVersion,
          runId: parsed.runId,
          status: parsed.status,
          legacy: parsed.legacy,
        };
      } catch (err) {
        throw new ExecutionError('BAD_SIDECAR_RESPONSE', err instanceof Error ? err.message : String(err), 502);
      }
      await this.markExecutionRunCanceled(robotPlanId, cancelResponse);
      await this.markLatestLogAborted(robotPlanId);
      return {
        robotPlanId,
        assistRunId,
        cancelRequested: true,
        response: cancelResponse,
      };
    }
    const targetPlatform = status['targetPlatform'];
    if (targetPlatform !== 'integra_assist' && targetPlatform !== 'opentrons_ot2' && targetPlatform !== 'opentrons_flex') {
      throw new ExecutionError('BAD_REQUEST', `No cancellable external run found for ${robotPlanId}`, 400);
    }

    const env = targetPlatform === 'integra_assist'
      ? {
          cmd: process.env['LABOS_SIDECAR_INTEGRA_ASSIST_CANCEL_CMD'] ?? 'echo',
          args: (process.env['LABOS_SIDECAR_INTEGRA_ASSIST_CANCEL_ARGS'] ?? 'AssistPlus cancel stub').split(' ').filter(Boolean),
        }
      : targetPlatform === 'opentrons_flex'
        ? {
            cmd: process.env['LABOS_SIDECAR_OPENTRONS_FLEX_CANCEL_CMD'] ?? 'echo',
            args: (process.env['LABOS_SIDECAR_OPENTRONS_FLEX_CANCEL_ARGS'] ?? 'Opentrons Flex cancel stub').split(' ').filter(Boolean),
          }
        : {
            cmd: process.env['LABOS_SIDECAR_OPENTRONS_OT2_CANCEL_CMD'] ?? 'echo',
            args: (process.env['LABOS_SIDECAR_OPENTRONS_OT2_CANCEL_ARGS'] ?? 'Opentrons OT2 cancel stub').split(' ').filter(Boolean),
          };

    const run = await this.sidecarRunner.run({
      target: targetPlatform,
      command: env.cmd,
      args: [...env.args, robotPlanId],
      timeoutMs: 30_000,
    });
    if (!run.ok) {
      throw new ExecutionError('EXTERNAL_ERROR', `Cancel sidecar failed (${targetPlatform}): ${run.stderr || run.stdout}`, 502);
    }
    const response = parseJsonMaybe(run.stdout) ?? run.stdout;
    await this.markExecutionRunCanceled(robotPlanId, response);
    await this.markLatestLogAborted(robotPlanId);
    return {
      robotPlanId,
      cancelRequested: true,
      mode: 'sidecar_cancel',
      targetPlatform,
      response,
    };
  }
}
