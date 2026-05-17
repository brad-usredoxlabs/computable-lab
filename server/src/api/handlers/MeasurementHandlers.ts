/**
 * MeasurementHandlers — Stub HTTP handlers for measurement ingest and plate map export.
 *
 * Provides endpoints for ingesting instrument output, querying measurement data,
 * and exporting plate maps as CSV.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { extname } from 'node:path';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { MeasurementService, MeasurementServiceError } from '../../measurement/MeasurementService.js';
import { MeasurementActiveControlService, MeasurementActiveControlError } from '../../measurement/MeasurementActiveControlService.js';
import { AdapterParameterError, getActiveReadParameterShape, listActiveReadTargets, validateActiveReadParameters } from '../../execution/adapters/AdapterRuntimeSchemas.js';
import { PlateMapExporter } from '../../execution/PlateMapExporter.js';
import { ExecutionError } from '../../execution/ExecutionOrchestrator.js';
import {
  GEMINI_EM_ADAPTER_ID,
  GEMINI_EM_OPERATION,
  evaluateInstrumentExecutionReadiness,
  type InstrumentApplianceExecutionRecord,
  type InstrumentApplianceExecutionStatus,
  type InstrumentExecutionReadiness,
  type InstrumentApplianceJob,
} from '../../compiler/artifacts/InstrumentApplianceJob.js';

type ActiveReadRequestBody = {
  adapterId: 'molecular_devices_gemini' | 'abi_7500_qpcr' | 'agilent_6890n_gc' | 'metrohm_761_ic';
  instrumentRef?: unknown;
  labwareInstanceRef?: unknown;
  eventGraphRef?: unknown;
  measurementContextRef?: unknown;
  readEventRef?: string;
  timepoint?: string;
  seriesId?: string;
  parserId?: string;
  outputPath?: string;
  parameters?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getJobPayload(body: unknown): unknown {
  if (isRecord(body) && 'job' in body) return body['job'];
  return body;
}

function validateGeminiApplianceJob(body: unknown): InstrumentApplianceJob {
  const job = getJobPayload(body);
  if (!isRecord(job)) {
    throw new MeasurementActiveControlError(
      'BAD_APPLIANCE_JOB',
      'Request body must be an instrument appliance job or { job } wrapper.',
      400,
    );
  }
  const request = job['request'];
  if (
    job['kind'] !== 'instrument-appliance-job'
    || job['adapterId'] !== GEMINI_EM_ADAPTER_ID
    || job['operation'] !== GEMINI_EM_OPERATION
    || !isRecord(request)
    || request['adapterId'] !== GEMINI_EM_ADAPTER_ID
  ) {
    throw new MeasurementActiveControlError(
      'BAD_APPLIANCE_JOB',
      'Only Gemini EM active_read instrument appliance jobs are executable by this endpoint.',
      400,
    );
  }
  const parameters = request['parameters'];
  if (parameters !== undefined && !isRecord(parameters)) {
    throw new MeasurementActiveControlError(
      'BAD_APPLIANCE_JOB',
      'Appliance job request.parameters must be an object when provided.',
      400,
    );
  }
  return job as unknown as InstrumentApplianceJob;
}

function safePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'instrument-appliance-job';
}

async function writeInstrumentApplianceExecutionRecord(
  ctx: AppContext,
  input: {
    job: InstrumentApplianceJob;
    readiness: InstrumentExecutionReadiness;
    status: InstrumentApplianceExecutionStatus;
    requestedAt: string;
    completedAt: string;
    confirmedLiveExecution: boolean;
    result?: InstrumentApplianceExecutionRecord['result'];
    error?: InstrumentApplianceExecutionRecord['error'];
  },
): Promise<string> {
  const timestamp = input.requestedAt.replace(/[:.]/g, '-');
  const base = `records/instrument-appliance-jobs/${safePathSegment(input.job.jobId)}-${timestamp}`;
  let path = `${base}.json`;
  let counter = 1;
  while (await ctx.repoAdapter.fileExists(path)) {
    path = `${base}-${counter}.json`;
    counter += 1;
  }
  const executionId = path
    .replace(/^records\/instrument-appliance-jobs\//, '')
    .replace(/\.json$/, '');
  const record: InstrumentApplianceExecutionRecord = {
    kind: 'instrument-appliance-execution-record',
    executionId,
    jobId: input.job.jobId,
    adapterId: input.job.adapterId,
    operation: input.job.operation,
    instrument: input.job.instrument,
    status: input.status,
    requestedAt: input.requestedAt,
    completedAt: input.completedAt,
    readiness: input.readiness,
    confirmation: {
      required: input.readiness.requiresConfirmation,
      confirmed: input.confirmedLiveExecution,
    },
    job: input.job,
    ...(input.result ? { result: input.result } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
  await ctx.repoAdapter.createFile({
    path,
    content: `${JSON.stringify(record, null, 2)}\n`,
    message: `Record instrument appliance execution ${executionId}`,
  });
  return path;
}

export function createMeasurementHandlers(ctx: AppContext) {
  const service = new MeasurementService(ctx);
  const activeControl = new MeasurementActiveControlService(ctx);
  const plateMapExporter = new PlateMapExporter(ctx);

  return {
    /**
     * POST /measurements/upload-raw
     * Upload a text-based instrument export into the repo-backed inbox.
     */
    async uploadRawMeasurementFile(
      request: FastifyRequest<{
        Body: {
          runId?: string;
          fileName?: string;
          contentBase64?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: true; path: string; fileName: string; size: number } | ApiError> {
      const fileName = typeof request.body.fileName === 'string' ? request.body.fileName.trim() : '';
      const contentBase64 = typeof request.body.contentBase64 === 'string' ? request.body.contentBase64.trim() : '';
      if (!fileName || !contentBase64) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'fileName and contentBase64 are required' };
      }
      try {
        const buffer = Buffer.from(contentBase64, 'base64');
        const content = buffer.toString('utf-8');
        const runSegment = typeof request.body.runId === 'string' && request.body.runId.trim() ? request.body.runId.trim() : 'manual';
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `measurement${extname(fileName) || '.txt'}`;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        let path = `records/inbox/measurements/${runSegment}/${stamp}-${safeFileName}`;
        let counter = 1;
        while (await ctx.repoAdapter.fileExists(path)) {
          path = `records/inbox/measurements/${runSegment}/${stamp}-${counter}-${safeFileName}`;
          counter += 1;
        }
        const result = await ctx.repoAdapter.createFile({
          path,
          content,
          message: `Upload raw measurement file ${safeFileName}`,
        });
        if (!result.success) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: result.error ?? 'Failed to store uploaded measurement file' };
        }
        reply.status(201);
        return { success: true, path, fileName: safeFileName, size: buffer.length };
      } catch (err) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Failed to process uploaded file',
        };
      }
    },

    /**
     * POST /measurements/ingest
     * Ingest instrument output and create a measurement record.
     */
    async ingestMeasurement(
      request: FastifyRequest<{
        Body: {
          instrumentRef?: unknown;
          labwareInstanceRef?: unknown;
          eventGraphRef?: unknown;
          measurementContextRef?: unknown;
          readEventRef?: string;
          timepoint?: string;
          seriesId?: string;
          parserId?: string;
          rawData?: unknown;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; recordId?: string } | ApiError> {
      try {
        const result = await service.ingest(request.body);
        reply.status(201);
        return { success: true, recordId: result.recordId };
      } catch (err) {
        if (err instanceof MeasurementServiceError) {
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
     * POST /measurements/appliance-jobs/execute
     * Execute a compiled instrument-appliance-job artifact.
     */
    async executeInstrumentApplianceJob(
      request: FastifyRequest<{
        Body: InstrumentApplianceJob | { job?: InstrumentApplianceJob; confirmLiveExecution?: boolean };
      }>,
      reply: FastifyReply,
    ): Promise<{
      success: boolean;
      jobId?: string;
      measurementId?: string;
      logId?: string;
      rawDataPath?: string;
      applianceExecutionRecordPath?: string;
    } | ApiError> {
      let job: InstrumentApplianceJob | undefined;
      let readiness: InstrumentExecutionReadiness | undefined;
      let requestedAt: string | undefined;
      let confirmLiveExecution = false;
      try {
        job = validateGeminiApplianceJob(request.body);
        readiness = evaluateInstrumentExecutionReadiness(job);
        requestedAt = new Date().toISOString();
        if (readiness.status !== 'ready') {
          throw new MeasurementActiveControlError(
            'EXECUTION_NOT_READY',
            `Instrument appliance job '${job.jobId}' is not ready for execution: ${readiness.blockers.map((b) => b.message).join('; ')}`,
            400,
          );
        }
        confirmLiveExecution = isRecord(request.body) && request.body['confirmLiveExecution'] === true;
        if (readiness.requiresConfirmation && !confirmLiveExecution) {
          throw new MeasurementActiveControlError(
            'LIVE_EXECUTION_CONFIRMATION_REQUIRED',
            `Instrument appliance job '${job.jobId}' targets live execution and requires explicit confirmation.`,
            409,
          );
        }
        const result = await activeControl.performActiveRead(job.request as ActiveReadRequestBody);
        const applianceExecutionRecordPath = await writeInstrumentApplianceExecutionRecord(ctx, {
          job,
          readiness,
          status: 'completed',
          requestedAt,
          completedAt: new Date().toISOString(),
          confirmedLiveExecution: confirmLiveExecution,
          result: {
            measurementId: result.measurementId,
            logId: result.logId,
            rawDataPath: result.rawDataPath,
          },
        });
        reply.status(201);
        return {
          success: true,
          jobId: job.jobId,
          measurementId: result.measurementId,
          logId: result.logId,
          rawDataPath: result.rawDataPath,
          applianceExecutionRecordPath,
        };
      } catch (err) {
        if (err instanceof MeasurementActiveControlError) {
          let applianceExecutionRecordPath: string | undefined;
          if (job && readiness && requestedAt) {
            const status: InstrumentApplianceExecutionStatus = err.code === 'EXECUTION_NOT_READY'
              ? 'blocked'
              : err.code === 'LIVE_EXECUTION_CONFIRMATION_REQUIRED'
                ? 'rejected'
                : 'failed';
            try {
              applianceExecutionRecordPath = await writeInstrumentApplianceExecutionRecord(ctx, {
                job,
                readiness,
                status,
                requestedAt,
                completedAt: new Date().toISOString(),
                confirmedLiveExecution: confirmLiveExecution,
                error: {
                  code: err.code,
                  message: err.message,
                  statusCode: err.statusCode,
                },
              });
            } catch {
              applianceExecutionRecordPath = undefined;
            }
          }
          reply.status(err.statusCode);
          return {
            error: err.code,
            message: err.message,
            ...(applianceExecutionRecordPath ? { details: { applianceExecutionRecordPath } } : {}),
          };
        }
        if (err instanceof MeasurementServiceError) {
          let applianceExecutionRecordPath: string | undefined;
          if (job && readiness && requestedAt) {
            try {
              applianceExecutionRecordPath = await writeInstrumentApplianceExecutionRecord(ctx, {
                job,
                readiness,
                status: 'failed',
                requestedAt,
                completedAt: new Date().toISOString(),
                confirmedLiveExecution: confirmLiveExecution,
                error: {
                  code: err.code,
                  message: err.message,
                  statusCode: err.statusCode,
                },
              });
            } catch {
              applianceExecutionRecordPath = undefined;
            }
          }
          reply.status(err.statusCode);
          return {
            error: err.code,
            message: err.message,
            ...(applianceExecutionRecordPath ? { details: { applianceExecutionRecordPath } } : {}),
          };
        }
        let applianceExecutionRecordPath: string | undefined;
        if (job && readiness && requestedAt) {
          try {
            applianceExecutionRecordPath = await writeInstrumentApplianceExecutionRecord(ctx, {
              job,
              readiness,
              status: 'failed',
              requestedAt,
              completedAt: new Date().toISOString(),
              confirmedLiveExecution: confirmLiveExecution,
              error: {
                code: 'INTERNAL_ERROR',
                message: err instanceof Error ? err.message : String(err),
              },
            });
          } catch {
            applianceExecutionRecordPath = undefined;
          }
        }
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
          ...(applianceExecutionRecordPath ? { details: { applianceExecutionRecordPath } } : {}),
        };
      }
    },

    /**
     * POST /measurements/active-read
     * Trigger an instrument readout and ingest the generated data.
     */
    async activeReadMeasurement(
      request: FastifyRequest<{
        Body: {
          adapterId: 'molecular_devices_gemini' | 'abi_7500_qpcr' | 'agilent_6890n_gc' | 'metrohm_761_ic';
          instrumentRef?: unknown;
          labwareInstanceRef?: unknown;
          eventGraphRef?: unknown;
          measurementContextRef?: unknown;
          readEventRef?: string;
          timepoint?: string;
          seriesId?: string;
          parserId?: string;
          outputPath?: string;
          parameters?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; measurementId?: string; logId?: string; rawDataPath?: string } | ApiError> {
      try {
        const result = await activeControl.performActiveRead(request.body);
        reply.status(201);
        return {
          success: true,
          measurementId: result.measurementId,
          logId: result.logId,
          rawDataPath: result.rawDataPath,
        };
      } catch (err) {
        if (err instanceof MeasurementActiveControlError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        if (err instanceof MeasurementServiceError) {
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
     * GET /measurements/active-read/schema
     * Return active-read parameter schemas by adapter id.
     */
    async getActiveReadSchemas(): Promise<{ adapters: Array<{ adapterId: string; shape: Record<string, string> }>; total: number }> {
      const adapters = listActiveReadTargets().map((adapterId) => ({
        adapterId,
        shape: getActiveReadParameterShape(adapterId),
      }));
      return { adapters, total: adapters.length };
    },

    /**
     * POST /measurements/active-read/validate
     * Validate active-read runtime parameters.
     */
    async validateActiveRead(
      request: FastifyRequest<{
        Body: {
          adapterId: 'molecular_devices_gemini' | 'abi_7500_qpcr' | 'agilent_6890n_gc' | 'metrohm_761_ic';
          parameters?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; adapterId?: string; normalized?: Record<string, unknown> } | ApiError> {
      try {
        const normalized = validateActiveReadParameters(request.body.adapterId, request.body.parameters ?? {});
        return { success: true, adapterId: request.body.adapterId, normalized };
      } catch (err) {
        if (err instanceof AdapterParameterError) {
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
     * GET /measurements/:id
     * Get a measurement record.
     */
    async getMeasurement(
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
          return { error: 'NOT_FOUND', message: `Measurement not found: ${id}` };
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
     * GET /measurements/:id/well/:well
     * Get per-well data slice from a measurement.
     */
    async getMeasurementWell(
      request: FastifyRequest<{
        Params: { id: string; well: string };
        Querystring: { channelId?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ well: string; data: unknown[] } | ApiError> {
      const { id, well } = request.params;
      try {
        const envelope = await ctx.store.get(id);
        if (!envelope) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Measurement not found: ${id}` };
        }

        const payload = envelope.payload as { data?: Array<{ well: string; channelId?: string }> };
        const allData = payload.data ?? [];
        let filtered = allData.filter((d) => d.well === well);

        const { channelId } = request.query;
        if (channelId !== undefined) {
          filtered = filtered.filter((d) => d.channelId === channelId);
        }

        return { well, data: filtered };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * POST /plate-maps/export
     * Export a plate map CSV from an event graph.
     */
    async exportPlateMap(
      request: FastifyRequest<{
        Body: {
          eventGraphId: string;
          labwareId?: string;
          format?: 'csv' | 'tsv';
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ content: string; format: 'csv' | 'tsv' } | ApiError> {
      try {
        const format = request.body.format === 'tsv' ? 'tsv' : 'csv';
        const exportArgs: { eventGraphId: string; labwareId?: string; format?: 'csv' | 'tsv' } = {
          eventGraphId: request.body.eventGraphId,
          format,
          ...(request.body.labwareId !== undefined ? { labwareId: request.body.labwareId } : {}),
        };
        const content = await plateMapExporter.export(exportArgs);
        const mime = format === 'tsv' ? 'text/tab-separated-values; charset=utf-8' : 'text/csv; charset=utf-8';
        reply.header('content-type', mime);
        return { content, format };
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
  };
}

export type MeasurementHandlers = ReturnType<typeof createMeasurementHandlers>;
