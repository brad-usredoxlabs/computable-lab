import type { AppContext } from '../server.js';
import { SidecarRunner } from '../execution/sidecar/SidecarRunner.js';
import { MeasurementService } from './MeasurementService.js';
import { AdapterParameterError, validateActiveReadParameters } from '../execution/adapters/AdapterRuntimeSchemas.js';
import { generateGeminiMeasurementFixture } from '../execution/sidecar/SimulatorContracts.js';
import { parseGeminiActiveReadResponse } from '../execution/sidecar/BridgeContracts.js';
import { SidecarContractConformanceService } from '../execution/SidecarContractConformanceService.js';

const INSTRUMENT_LOG_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml';

type ActiveReadAdapterId =
  | 'molecular_devices_gemini'
  | 'abi_7500_qpcr'
  | 'agilent_6890n_gc'
  | 'metrohm_761_ic';

type ActiveReadRequest = {
  adapterId: ActiveReadAdapterId;
  instrumentRef?: unknown;
  labwareInstanceRef?: unknown;
  eventGraphRef?: unknown;
  readEventRef?: string;
  parserId?: string;
  outputPath?: string;
  parameters?: Record<string, unknown>;
};

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchLikeResponse>;

function commandForAdapter(adapterId: ActiveReadAdapterId): { command: string; args: string[]; defaultParserId: string } {
  if (adapterId === 'molecular_devices_gemini') {
    return {
      command: process.env['LABOS_SIDECAR_GEMINI_CMD'] ?? 'echo',
      args: (process.env['LABOS_SIDECAR_GEMINI_ARGS'] ?? '{"rawDataPath":"records/inbox/gemini.csv"}').split(' ').filter(Boolean),
      defaultParserId: 'gemini_csv',
    };
  }
  if (adapterId === 'abi_7500_qpcr') {
    return {
      command: process.env['LABOS_SIDECAR_ABI_7500_CMD'] ?? 'echo',
      args: (process.env['LABOS_SIDECAR_ABI_7500_ARGS'] ?? '{"rawDataPath":"records/inbox/abi7500.csv"}').split(' ').filter(Boolean),
      defaultParserId: 'abi7500_csv',
    };
  }
  if (adapterId === 'agilent_6890n_gc') {
    return {
      command: process.env['LABOS_SIDECAR_AGILENT_6890N_CMD'] ?? 'echo',
      args: (process.env['LABOS_SIDECAR_AGILENT_6890N_ARGS'] ?? '{"rawDataPath":"records/inbox/agilent6890.csv"}').split(' ').filter(Boolean),
      defaultParserId: 'agilent_6890_csv_stub',
    };
  }
  return {
    command: process.env['LABOS_SIDECAR_METROHM_761_CMD'] ?? 'echo',
    args: (process.env['LABOS_SIDECAR_METROHM_761_ARGS'] ?? '{"rawDataPath":"records/inbox/metrohm761.csv"}').split(' ').filter(Boolean),
    defaultParserId: 'metrohm_761_csv_stub',
  };
}

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

export class MeasurementActiveControlError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class MeasurementActiveControlService {
  private readonly ctx: AppContext;
  private readonly sidecarRunner: SidecarRunner;
  private readonly measurements: MeasurementService;
  private readonly fetchFn: FetchLike;
  private readonly sidecarContracts: SidecarContractConformanceService;

  constructor(
    ctx: AppContext,
    sidecarRunner: SidecarRunner = new SidecarRunner(),
    measurements?: MeasurementService,
    fetchFn?: FetchLike
  ) {
    this.ctx = ctx;
    this.sidecarRunner = sidecarRunner;
    this.measurements = measurements ?? new MeasurementService(ctx);
    this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.sidecarContracts = new SidecarContractConformanceService(ctx);
  }

  private async nextLogId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'instrument-log' });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, 'ILOG');
      if (n !== null && n > max) max = n;
    }
    return `ILOG-${String(max + 1).padStart(6, '0')}`;
  }

  async performActiveRead(input: ActiveReadRequest): Promise<{
    adapterId: ActiveReadAdapterId;
    measurementId: string;
    logId: string;
    rawDataPath: string;
  }> {
    const command = commandForAdapter(input.adapterId);
    let parameters: Record<string, unknown>;
    try {
      parameters = validateActiveReadParameters(input.adapterId, input.parameters);
    } catch (err) {
      if (err instanceof AdapterParameterError) {
        throw new MeasurementActiveControlError(err.code, err.message, err.statusCode);
      }
      throw err;
    }
    const startedAt = new Date().toISOString();
    const runResult = (input.adapterId === 'molecular_devices_gemini'
      && (process.env['LABOS_SIMULATE_GEMINI'] === '1' || parameters['simulate'] === true))
      ? await (async () => {
          const simulated = await generateGeminiMeasurementFixture(this.ctx, {
            outputPath: input.outputPath ?? 'records/inbox/gemini_simulated.csv',
            parameters,
          });
          return {
            ok: true,
            exitCode: 0,
            stdout: simulated.stdout,
            stderr: '',
          };
        })()
      : (input.adapterId === 'molecular_devices_gemini' && process.env['LABOS_GEMINI_READ_URL'])
        ? await (async () => {
            const url = process.env['LABOS_GEMINI_READ_URL']!;
            const token = process.env['LABOS_GEMINI_API_TOKEN'];
            const headers: Record<string, string> = {
              'content-type': 'application/json',
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            };
            const requestPayload = {
              adapterId: input.adapterId,
              ...(input.instrumentRef !== undefined ? { instrumentRef: input.instrumentRef } : {}),
              ...(input.outputPath !== undefined ? { outputPath: input.outputPath } : {}),
              parameters,
            };
            const contractCheck = this.sidecarContracts.validatePayloadIfSchemaAvailable(
              'molecular_devices_gemini.active_read.request',
              requestPayload,
            );
            if (contractCheck.checked && !contractCheck.valid) {
              throw new MeasurementActiveControlError(
                'BAD_REQUEST',
                'Gemini active-read payload failed sidecar contract validation',
                400,
              );
            }
            const response = await this.fetchFn(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(requestPayload),
            });
            const text = await response.text();
            return {
              ok: response.ok,
              exitCode: response.ok ? 0 : response.status,
              stdout: response.ok ? text : '',
              stderr: response.ok ? '' : text,
            };
          })()
      : await this.sidecarRunner.run({
          target: input.adapterId,
          command: command.command,
          args: [
            ...command.args,
            ...(Object.keys(parameters).length > 0 ? [JSON.stringify(parameters)] : []),
          ],
          timeoutMs: 120_000,
        });
    const completedAt = new Date().toISOString();
    if (!runResult.ok) {
      throw new MeasurementActiveControlError(
        'ACTIVE_CONTROL_FAILED',
        `Active read failed for ${input.adapterId}: ${runResult.stderr || runResult.stdout}`,
        502
      );
    }

    let rawDataPath = input.outputPath;
    let contractVersion: string | undefined;
    let legacyContract: boolean | undefined;
    if (!rawDataPath) {
      try {
        if (input.adapterId === 'molecular_devices_gemini') {
          const parsed = parseGeminiActiveReadResponse(runResult.stdout);
          rawDataPath = parsed.rawDataPath;
          contractVersion = parsed.contractVersion;
          legacyContract = parsed.legacy;
        } else {
          const trimmed = runResult.stdout.trim();
          if (trimmed) {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (typeof parsed['rawDataPath'] === 'string') {
              rawDataPath = parsed['rawDataPath'];
            }
          }
        }
      } catch (err) {
        throw new MeasurementActiveControlError(
          'BAD_SIDECAR_RESPONSE',
          err instanceof Error ? err.message : String(err),
          400
        );
      }
    }
    if (!rawDataPath) {
      throw new MeasurementActiveControlError(
        'BAD_SIDECAR_RESPONSE',
        `Active read sidecar did not provide rawDataPath for ${input.adapterId}`,
        400
      );
    }

    const measurement = await this.measurements.ingest({
      ...(input.instrumentRef !== undefined ? { instrumentRef: input.instrumentRef } : {}),
      ...(input.labwareInstanceRef !== undefined ? { labwareInstanceRef: input.labwareInstanceRef } : {}),
      ...(input.eventGraphRef !== undefined ? { eventGraphRef: input.eventGraphRef } : {}),
      ...(input.readEventRef !== undefined ? { readEventRef: input.readEventRef } : {}),
      parserId: input.parserId ?? command.defaultParserId,
      rawData: { path: rawDataPath },
    });

    const logId = await this.nextLogId();
    await this.ctx.store.create({
      envelope: {
        recordId: logId,
        schemaId: INSTRUMENT_LOG_SCHEMA_ID,
        payload: {
          kind: 'instrument-log',
          id: logId,
          logType: 'instrument_readout',
          status: 'completed',
          ...(input.instrumentRef ? { instrumentRef: input.instrumentRef } : {}),
          ...(input.eventGraphRef ? { eventGraphRef: input.eventGraphRef } : {}),
          startedAt,
          completedAt,
          entries: [
            {
              timestamp: startedAt,
              entryType: 'info',
              message: `Active read started for ${input.adapterId}`,
              data: {
                adapterId: input.adapterId,
                command: command.command,
                args: command.args,
                parameters,
              },
            },
            {
              timestamp: completedAt,
              entryType: 'telemetry',
              message: `Active read completed (${measurement.recordId})`,
              data: {
                measurementId: measurement.recordId,
                rawDataPath,
                ...(contractVersion ? { contractVersion } : {}),
                ...(legacyContract !== undefined ? { legacyContract } : {}),
              },
            },
          ],
          artifacts: [
            {
              role: 'raw_data',
              fileRef: {
                uri: rawDataPath,
                mimeType: 'text/csv',
                label: `Active read raw output for ${input.adapterId}`,
              },
            },
          ],
        },
      },
      message: `Create active read log ${logId}`,
      skipValidation: true,
      skipLint: true,
    });

    return {
      adapterId: input.adapterId,
      measurementId: measurement.recordId,
      logId,
      rawDataPath,
    };
  }
}
