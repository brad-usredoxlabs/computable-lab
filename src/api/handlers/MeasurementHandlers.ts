/**
 * MeasurementHandlers — Stub HTTP handlers for measurement ingest and plate map export.
 *
 * Provides endpoints for ingesting instrument output, querying measurement data,
 * and exporting plate maps as CSV.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { MeasurementService, MeasurementServiceError } from '../../measurement/MeasurementService.js';
import { MeasurementActiveControlService, MeasurementActiveControlError } from '../../measurement/MeasurementActiveControlService.js';
import { AdapterParameterError, getActiveReadParameterShape, listActiveReadTargets, validateActiveReadParameters } from '../../execution/adapters/AdapterRuntimeSchemas.js';
import { PlateMapExporter } from '../../execution/PlateMapExporter.js';
import { ExecutionError } from '../../execution/ExecutionOrchestrator.js';

export function createMeasurementHandlers(ctx: AppContext) {
  const service = new MeasurementService(ctx);
  const activeControl = new MeasurementActiveControlService(ctx);
  const plateMapExporter = new PlateMapExporter(ctx);

  return {
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
          readEventRef?: string;
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
          readEventRef?: string;
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
