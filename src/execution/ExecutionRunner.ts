import { ExecutionError } from './ExecutionOrchestrator.js';
import type { AppContext } from '../server.js';
import { SidecarRunner } from './sidecar/SidecarRunner.js';
import { ExecutionMaterializer } from './ExecutionMaterializer.js';
import { validateExecuteParameters } from './adapters/AdapterRuntimeSchemas.js';
import { generateAssistPlusExecutionFixture } from './sidecar/SimulatorContracts.js';
import { classifyExecutionFailure } from './RetryPolicy.js';
import { parseAssistSubmitResponse } from './sidecar/BridgeContracts.js';
import { SidecarContractConformanceService } from './SidecarContractConformanceService.js';

const INSTRUMENT_LOG_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml';
const EXECUTION_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml';

type TargetPlatform = 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist';

type RobotPlanPayload = {
  kind: 'robot-plan';
  id: string;
  targetPlatform: TargetPlatform;
  artifacts?: Array<{
    role: string;
    fileRef: { uri: string };
  }>;
  plannedRunRef?: { kind: 'record' | 'ontology'; id: string; type?: string };
};

type InstrumentLogPayload = {
  kind: 'instrument-log';
  id: string;
  logType: 'robot_telemetry';
  status: 'completed' | 'error';
  plannedRunRef?: { kind: 'record' | 'ontology'; id: string; type?: string };
  startedAt: string;
  completedAt: string;
  entries: Array<{
    timestamp: string;
    entryType: 'info' | 'error' | 'telemetry';
    message: string;
    data?: Record<string, unknown>;
  }>;
  artifacts: Array<{
    role: string;
    fileRef: { uri: string; mimeType: string; label: string };
  }>;
};

type ExecutionRunPayload = {
  kind: 'execution-run';
  recordId: string;
  robotPlanRef: { kind: 'record'; id: string; type: 'robot-plan' };
  plannedRunRef?: { kind: 'record'; id: string; type: 'planned-run' };
  parentExecutionRunRef?: { kind: 'record'; id: string; type: 'execution-run' };
  attempt?: number;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  mode: string;
  startedAt: string;
  completedAt?: string;
  externalRunId?: string;
  externalProtocolId?: string;
  lastStatusRaw?: string;
  materializedEventGraphId?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  failureCode?: string;
  retryReason?: string;
  notes?: string;
};

type ExecutionResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  mode: string;
  command: string;
  metadata?: Record<string, unknown>;
};

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchLikeResponse>;

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) {
    return null;
  }
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }
  return Number.parseInt(suffix, 10);
}

function envCommandForTarget(target: TargetPlatform): { cmd: string; args: string[] } {
  if (target === 'integra_assist') {
    const cmd = process.env['LABOS_SIDECAR_INTEGRA_ASSIST_CMD'] ?? 'echo';
    const argTemplate = process.env['LABOS_SIDECAR_INTEGRA_ASSIST_ARGS'] ?? 'AssistPlus sidecar stub';
    return { cmd, args: argTemplate.split(' ').filter(Boolean) };
  }
  if (target === 'opentrons_flex') {
    const cmd = process.env['LABOS_SIDECAR_OPENTRONS_FLEX_CMD'] ?? 'echo';
    const argTemplate = process.env['LABOS_SIDECAR_OPENTRONS_FLEX_ARGS'] ?? 'Opentrons Flex sidecar stub';
    return { cmd, args: argTemplate.split(' ').filter(Boolean) };
  }
  const cmd = process.env['LABOS_SIDECAR_OPENTRONS_OT2_CMD'] ?? 'echo';
  const argTemplate = process.env['LABOS_SIDECAR_OPENTRONS_OT2_ARGS'] ?? 'Opentrons OT2 sidecar stub';
  return { cmd, args: argTemplate.split(' ').filter(Boolean) };
}

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pickStringId(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  for (const value of Object.values(obj)) {
    const nested = pickStringId(value, keys);
    if (nested) return nested;
  }
  return undefined;
}

export class ExecutionRunner {
  private readonly ctx: AppContext;
  private readonly sidecarRunner: SidecarRunner;
  private readonly fetchFn: FetchLike;
  private readonly materializer: ExecutionMaterializer;
  private readonly sidecarContracts: SidecarContractConformanceService;

  constructor(
    ctx: AppContext,
    sidecarRunner: SidecarRunner = new SidecarRunner(),
    fetchFn?: FetchLike
  ) {
    this.ctx = ctx;
    this.sidecarRunner = sidecarRunner;
    this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.materializer = new ExecutionMaterializer(ctx);
    this.sidecarContracts = new SidecarContractConformanceService(ctx);
  }

  private async nextLogId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'instrument-log' });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, 'ILOG');
      if (n !== null && n > max) {
        max = n;
      }
    }
    return `ILOG-${String(max + 1).padStart(6, '0')}`;
  }

  private async nextExecutionRunId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'execution-run' });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, 'EXR');
      if (n !== null && n > max) {
        max = n;
      }
    }
    return `EXR-${String(max + 1).padStart(6, '0')}`;
  }

  private async updatePlannedRunState(plannedRunId: string, state: 'executing' | 'completed' | 'failed'): Promise<void> {
    const envelope = await this.ctx.store.get(plannedRunId);
    if (!envelope) {
      return;
    }
    const payload = envelope.payload;
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const record = payload as Record<string, unknown>;
    if (record['kind'] !== 'planned-run') {
      return;
    }

    const updateResult = await this.ctx.store.update({
      envelope: {
        recordId: envelope.recordId,
        schemaId: envelope.schemaId,
        payload: {
          ...record,
          state,
        },
      },
      message: `Set ${plannedRunId} state to ${state}`,
    });
    if (!updateResult.success) {
      throw new ExecutionError('UPDATE_FAILED', updateResult.error ?? `Failed to update planned run ${plannedRunId}`, 400);
    }
  }

  private async nextAttemptForRobotPlan(robotPlanId: string): Promise<number> {
    const runs = await this.ctx.store.list({ kind: 'execution-run', limit: 500 });
    let maxAttempt = 0;
    for (const env of runs) {
      const payload = env.payload as { robotPlanRef?: { id?: string }; attempt?: number };
      if (payload.robotPlanRef?.id !== robotPlanId) continue;
      const attempt = typeof payload.attempt === 'number' && Number.isFinite(payload.attempt) ? payload.attempt : 1;
      if (attempt > maxAttempt) maxAttempt = attempt;
    }
    return maxAttempt + 1;
  }

  async executeRobotPlan(
    robotPlanId: string,
    options?: { parentExecutionRunId?: string; parameters?: Record<string, unknown> }
  ): Promise<{ executionRunId: string; logId: string; status: 'completed' | 'error' }> {
    const envelope = await this.ctx.store.get(robotPlanId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Robot plan not found: ${robotPlanId}`, 404);
    }
    const payload = envelope.payload as RobotPlanPayload;
    if (payload.kind !== 'robot-plan') {
      throw new ExecutionError('BAD_REQUEST', `${robotPlanId} is not a robot-plan`, 400);
    }

    const artifact = (payload.artifacts ?? [])[0];
    if (!artifact) {
      throw new ExecutionError('BAD_REQUEST', `Robot plan ${robotPlanId} has no artifacts`, 400);
    }

    const target = payload.targetPlatform;
    const runtimeParameters = validateExecuteParameters(target, options?.parameters ?? {});
    const plannedRunId = payload.plannedRunRef?.kind === 'record' ? payload.plannedRunRef.id : undefined;
    if (plannedRunId) {
      await this.updatePlannedRunState(plannedRunId, 'executing');
    }

    const startedAt = new Date().toISOString();
    const executionRunId = await this.nextExecutionRunId();
    const attempt = await this.nextAttemptForRobotPlan(robotPlanId);
    const executionRunPayloadBase: Omit<ExecutionRunPayload, 'status' | 'mode'> = {
      kind: 'execution-run',
      recordId: executionRunId,
      robotPlanRef: { kind: 'record', id: robotPlanId, type: 'robot-plan' },
      ...(plannedRunId ? { plannedRunRef: { kind: 'record', id: plannedRunId, type: 'planned-run' } } : {}),
      ...(options?.parentExecutionRunId
        ? { parentExecutionRunRef: { kind: 'record', id: options.parentExecutionRunId, type: 'execution-run' } }
        : {}),
      attempt,
      startedAt,
    };

    let sidecar: ExecutionResult;
    try {
      sidecar = await this.executeTarget(target, robotPlanId, artifact.fileRef.uri, runtimeParameters);
    } catch (err) {
      if (plannedRunId) {
        await this.updatePlannedRunState(plannedRunId, 'failed');
      }
      const classified = classifyExecutionFailure({
        mode: 'unknown',
        stderr: err instanceof Error ? err.message : String(err),
      });
      await this.ctx.store.create({
        envelope: {
          recordId: executionRunId,
          schemaId: EXECUTION_RUN_SCHEMA_ID,
          payload: {
            ...executionRunPayloadBase,
            status: 'failed',
            mode: 'unknown',
            completedAt: new Date().toISOString(),
            failureClass: classified.failureClass,
            retryRecommended: classified.retryRecommended,
            failureCode: classified.failureCode,
            retryReason: classified.reason,
            notes: err instanceof Error ? err.message : String(err),
          } satisfies ExecutionRunPayload,
        },
        message: `Create failed execution run ${executionRunId}`,
      });
      throw err;
    }
    const completedAt = new Date().toISOString();

    const logId = await this.nextLogId();
    const logFilePath = `records/instrument-log-artifact/${target}/${logId}.log`;
    const logContent = [
      `robotPlanId=${robotPlanId}`,
      `target=${target}`,
      `mode=${sidecar.mode}`,
      `command=${sidecar.command}`,
      `exitCode=${sidecar.exitCode}`,
      ...(sidecar.metadata?.['opentronsRunId'] ? [`opentronsRunId=${String(sidecar.metadata['opentronsRunId'])}`] : []),
      ...(sidecar.metadata?.['opentronsProtocolId'] ? [`opentronsProtocolId=${String(sidecar.metadata['opentronsProtocolId'])}`] : []),
      `stdout=${sidecar.stdout.trim()}`,
      `stderr=${sidecar.stderr.trim()}`,
      '',
    ].join('\n');

    const existing = await this.ctx.repoAdapter.getFile(logFilePath);
    const fileResult = existing
      ? await this.ctx.repoAdapter.updateFile({
          path: logFilePath,
          content: logContent,
          sha: existing.sha,
          message: `Update log artifact ${logId}`,
        })
      : await this.ctx.repoAdapter.createFile({
          path: logFilePath,
          content: logContent,
          message: `Create log artifact ${logId}`,
        });
    if (!fileResult.success) {
      throw new ExecutionError('ARTIFACT_WRITE_FAILED', fileResult.error ?? 'Failed to write instrument log', 500);
    }

    const status: 'completed' | 'error' = sidecar.ok ? 'completed' : 'error';
    if (plannedRunId) {
      await this.updatePlannedRunState(plannedRunId, sidecar.ok ? 'completed' : 'failed');
    }

    await this.ctx.store.create({
      envelope: {
        recordId: executionRunId,
        schemaId: EXECUTION_RUN_SCHEMA_ID,
        payload: {
          ...executionRunPayloadBase,
          status: sidecar.ok ? 'completed' : 'failed',
          mode: sidecar.mode,
          completedAt,
          ...(typeof sidecar.metadata?.['opentronsRunId'] === 'string'
            ? { externalRunId: sidecar.metadata['opentronsRunId'] }
            : typeof sidecar.metadata?.['assistRunId'] === 'string'
              ? { externalRunId: sidecar.metadata['assistRunId'] }
              : {}),
          ...(typeof sidecar.metadata?.['opentronsProtocolId'] === 'string' ? { externalProtocolId: sidecar.metadata['opentronsProtocolId'] } : {}),
          ...(typeof sidecar.metadata?.['externalStatus'] === 'string' ? { lastStatusRaw: sidecar.metadata['externalStatus'] } : {}),
          ...(!sidecar.ok
            ? (() => {
                const classified = classifyExecutionFailure({
                  mode: sidecar.mode,
                  exitCode: sidecar.exitCode,
                  ...(typeof sidecar.metadata?.['externalStatus'] === 'string' ? { statusRaw: sidecar.metadata['externalStatus'] } : {}),
                  stderr: sidecar.stderr,
                });
                return {
                  failureClass: classified.failureClass,
                  retryRecommended: classified.retryRecommended,
                  failureCode: classified.failureCode,
                  retryReason: classified.reason,
                };
              })()
            : {}),
        } satisfies ExecutionRunPayload,
      },
      message: `Create execution run ${executionRunId}`,
    });
    if (sidecar.ok) {
      try {
        await this.materializer.materializeFromExecutionRun(executionRunId);
      } catch {
        // Materialization is best-effort here; poller can retry later.
      }
    }

    const logPayload: InstrumentLogPayload = {
      kind: 'instrument-log',
      id: logId,
      logType: 'robot_telemetry',
      status,
      ...(payload.plannedRunRef ? { plannedRunRef: payload.plannedRunRef } : {}),
      startedAt,
      completedAt,
      entries: [
        {
          timestamp: startedAt,
          entryType: 'info',
          message: `Execute ${robotPlanId} on ${target}`,
          data: {
            artifact: artifact.fileRef.uri,
            robotPlanId,
            targetPlatform: target,
            executionMode: sidecar.mode,
            runtimeParameters,
            ...(sidecar.metadata ?? {}),
          },
        },
        {
          timestamp: completedAt,
          entryType: sidecar.ok ? 'telemetry' : 'error',
          message: sidecar.ok ? 'Execution finished' : 'Execution failed',
          data: { exitCode: sidecar.exitCode },
        },
      ],
      artifacts: [
        {
          role: 'raw_log',
          fileRef: {
            uri: logFilePath,
            mimeType: 'text/plain',
            label: `Execution log for ${robotPlanId}`,
          },
        },
      ],
    };

    const createResult = await this.ctx.store.create({
      envelope: {
        recordId: logId,
        schemaId: INSTRUMENT_LOG_SCHEMA_ID,
        payload: logPayload,
      },
      message: `Create instrument log ${logId}`,
    });
    if (!createResult.success) {
      throw new ExecutionError('CREATE_FAILED', createResult.error ?? 'Failed to create instrument log record', 400);
    }

    return { executionRunId, logId, status };
  }

  private async executeTarget(
    target: TargetPlatform,
    robotPlanId: string,
    artifactUri: string,
    parameters: Record<string, unknown>
  ): Promise<ExecutionResult> {
    if (target === 'integra_assist' && (process.env['LABOS_SIMULATE_ASSIST_PLUS'] === '1' || parameters['simulate'] === true)) {
      const simulation = await generateAssistPlusExecutionFixture(this.ctx, {
        robotPlanId,
        artifactUri,
        parameters,
      });
      return {
        ok: true,
        exitCode: 0,
        stdout: simulation.stdout,
        stderr: '',
        mode: 'assist_plus_simulator',
        command: 'labos-sim assist-plus',
        metadata: {
          fixturePath: simulation.fixturePath,
          ...simulation.metadata,
        },
      };
    }

    if (target === 'integra_assist') {
      const submitUrl = process.env['LABOS_INTEGRA_ASSIST_SUBMIT_URL'];
      if (submitUrl) {
        return this.executeViaIntegraAssistApi({
          robotPlanId,
          artifactUri,
          submitUrl,
          parameters,
        });
      }
    }

    if (target === 'opentrons_ot2' || target === 'opentrons_flex') {
      const submitUrl = process.env['LABOS_OPENTRONS_SUBMIT_URL'];
      const mode = process.env['LABOS_OPENTRONS_API_MODE'] ?? 'direct_submit';
      if (mode === 'two_step') {
        const baseUrl = process.env['LABOS_OPENTRONS_BASE_URL'];
        if (!baseUrl) {
          throw new ExecutionError('BAD_REQUEST', 'LABOS_OPENTRONS_BASE_URL is required for LABOS_OPENTRONS_API_MODE=two_step', 400);
        }
        return this.executeViaOpentronsTwoStepApi({ target, robotPlanId, artifactUri, baseUrl, parameters });
      }
      if (submitUrl && mode === 'direct_submit') {
        return this.executeViaOpentronsApi({ target, robotPlanId, artifactUri, submitUrl, parameters });
      }
    }

    const { cmd, args } = envCommandForTarget(target);
    const run = await this.sidecarRunner.run({
      target,
      command: cmd,
      args: [...args, artifactUri, ...(Object.keys(parameters).length > 0 ? [JSON.stringify(parameters)] : [])],
      timeoutMs: 120_000,
    });
    return {
      ...run,
      mode: 'sidecar_process',
      command: `${cmd} ${[...args, artifactUri, ...(Object.keys(parameters).length > 0 ? ['<runtime-parameters-json>'] : [])].join(' ')}`,
    };
  }

  private async executeViaIntegraAssistApi(input: {
    robotPlanId: string;
    artifactUri: string;
    submitUrl: string;
    parameters: Record<string, unknown>;
  }): Promise<ExecutionResult> {
    const artifactPath = input.artifactUri.startsWith('file:') ? input.artifactUri.slice('file:'.length) : input.artifactUri;
    const artifactFile = await this.ctx.repoAdapter.getFile(artifactPath);
    if (!artifactFile) {
      throw new ExecutionError('NOT_FOUND', `Artifact not found for INTEGRA API submission: ${artifactPath}`, 404);
    }
    const token = process.env['LABOS_INTEGRA_ASSIST_API_TOKEN'];
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const submitPayload = {
      robotPlanId: input.robotPlanId,
      targetPlatform: 'integra_assist',
      artifactUri: input.artifactUri,
      vialabXml: artifactFile.content,
      parameters: input.parameters,
    };
    const contractCheck = this.sidecarContracts.validatePayloadIfSchemaAvailable(
      'integra_assist.submit.request',
      submitPayload,
    );
    if (contractCheck.checked && !contractCheck.valid) {
      throw new ExecutionError(
        'BAD_REQUEST',
        `INTEGRA submit request payload failed sidecar contract validation`,
        400,
      );
    }
    const body = JSON.stringify(submitPayload);
    const response = await this.fetchFn(input.submitUrl, {
      method: 'POST',
      headers,
      body,
    });
    const responseText = await response.text();
    let runId: string | undefined;
    let externalStatus: string | undefined;
    let contractVersion: string | undefined;
    let legacyContract: boolean | undefined;
    if (response.ok) {
      try {
        const parsed = parseAssistSubmitResponse(responseText);
        runId = parsed.runId;
        externalStatus = parsed.status;
        contractVersion = parsed.contractVersion;
        legacyContract = parsed.legacy;
      } catch (err) {
        throw new ExecutionError(
          'BAD_SIDECAR_RESPONSE',
          err instanceof Error ? err.message : String(err),
          502,
        );
      }
    } else {
      const responseJson = parseJsonMaybe(responseText);
      runId = pickStringId(responseJson, ['runId', 'id']);
      externalStatus = pickStringId(responseJson, ['status', 'runStatus']);
    }
    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : response.status,
      stdout: response.ok ? responseText : '',
      stderr: response.ok ? '' : responseText,
      mode: 'integra_http',
      command: `POST ${input.submitUrl}`,
      metadata: {
        ...(runId ? { assistRunId: runId } : {}),
        ...(externalStatus ? { externalStatus } : {}),
        ...(contractVersion ? { contractVersion } : {}),
        ...(legacyContract !== undefined ? { legacyContract } : {}),
        ...(Object.keys(input.parameters).length > 0 ? { runtimeParameters: input.parameters } : {}),
      },
    };
  }

  private async executeViaOpentronsApi(input: {
    target: TargetPlatform;
    robotPlanId: string;
    artifactUri: string;
    submitUrl: string;
    parameters: Record<string, unknown>;
  }): Promise<ExecutionResult> {
    const artifactPath = input.artifactUri.startsWith('file:') ? input.artifactUri.slice('file:'.length) : input.artifactUri;
    const artifactFile = await this.ctx.repoAdapter.getFile(artifactPath);
    if (!artifactFile) {
      throw new ExecutionError('NOT_FOUND', `Artifact not found for API submission: ${artifactPath}`, 404);
    }

    const token = process.env['LABOS_OPENTRONS_API_TOKEN'];
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const body = JSON.stringify({
      robotPlanId: input.robotPlanId,
      targetPlatform: input.target,
      artifactUri: input.artifactUri,
      protocolScript: artifactFile.content,
      parameters: input.parameters,
    });

    const response = await this.fetchFn(input.submitUrl, {
      method: 'POST',
      headers,
      body,
    });
    const responseText = await response.text();
    const ok = response.ok;
    const responseJson = parseJsonMaybe(responseText);
    const runId = pickStringId(responseJson, ['runId', 'id']);
    const submissionId = pickStringId(responseJson, ['submissionId', 'id']);

    return {
      ok,
      exitCode: ok ? 0 : response.status,
      stdout: ok ? responseText : '',
      stderr: ok ? '' : responseText,
      mode: 'opentrons_http',
      command: `POST ${input.submitUrl}`,
      metadata: {
        ...(runId ? { opentronsRunId: runId } : {}),
        ...(submissionId ? { opentronsSubmissionId: submissionId } : {}),
        ...(Object.keys(input.parameters).length > 0 ? { runtimeParameters: input.parameters } : {}),
      },
    };
  }

  private async executeViaOpentronsTwoStepApi(input: {
    target: TargetPlatform;
    robotPlanId: string;
    artifactUri: string;
    baseUrl: string;
    parameters: Record<string, unknown>;
  }): Promise<ExecutionResult> {
    const artifactPath = input.artifactUri.startsWith('file:') ? input.artifactUri.slice('file:'.length) : input.artifactUri;
    const artifactFile = await this.ctx.repoAdapter.getFile(artifactPath);
    if (!artifactFile) {
      throw new ExecutionError('NOT_FOUND', `Artifact not found for API submission: ${artifactPath}`, 404);
    }

    const token = process.env['LABOS_OPENTRONS_API_TOKEN'];
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const protocolsUrl = `${input.baseUrl.replace(/\/+$/, '')}/protocols`;
    const runsUrl = `${input.baseUrl.replace(/\/+$/, '')}/runs`;

    const protocolBody = JSON.stringify({
      robotPlanId: input.robotPlanId,
      targetPlatform: input.target,
      protocolKey: `${input.robotPlanId}.py`,
      protocolScript: artifactFile.content,
      parameters: input.parameters,
    });
    const protocolResp = await this.fetchFn(protocolsUrl, {
      method: 'POST',
      headers,
      body: protocolBody,
    });
    const protocolText = await protocolResp.text();
    if (!protocolResp.ok) {
      return {
        ok: false,
        exitCode: protocolResp.status,
        stdout: '',
        stderr: protocolText,
        mode: 'opentrons_http_two_step',
        command: `POST ${protocolsUrl}`,
      };
    }
    const protocolJson = parseJsonMaybe(protocolText);
    const protocolId = pickStringId(protocolJson, ['protocolId', 'id']);
    if (!protocolId) {
      return {
        ok: false,
        exitCode: 500,
        stdout: '',
        stderr: `Could not extract protocolId from response: ${protocolText}`,
        mode: 'opentrons_http_two_step',
        command: `POST ${protocolsUrl}`,
      };
    }

    const runBody = JSON.stringify({
      protocolId,
      robotPlanId: input.robotPlanId,
      targetPlatform: input.target,
      parameters: input.parameters,
    });
    const runResp = await this.fetchFn(runsUrl, {
      method: 'POST',
      headers,
      body: runBody,
    });
    const runText = await runResp.text();
    if (!runResp.ok) {
      return {
        ok: false,
        exitCode: runResp.status,
        stdout: '',
        stderr: runText,
        mode: 'opentrons_http_two_step',
        command: `POST ${protocolsUrl} -> POST ${runsUrl}`,
      };
    }
    const runJson = parseJsonMaybe(runText);
    const runId = pickStringId(runJson, ['runId', 'id']);

    return {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify({ protocolId, runId: runId ?? null }),
      stderr: '',
      mode: 'opentrons_http_two_step',
      command: `POST ${protocolsUrl} -> POST ${runsUrl}`,
      metadata: {
        opentronsProtocolId: protocolId,
        ...(runId ? { opentronsRunId: runId } : {}),
        ...(Object.keys(input.parameters).length > 0 ? { runtimeParameters: input.parameters } : {}),
      },
    };
  }
}
