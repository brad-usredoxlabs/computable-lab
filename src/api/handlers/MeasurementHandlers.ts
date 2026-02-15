/**
 * MeasurementHandlers — Stub HTTP handlers for measurement ingest and plate map export.
 *
 * Provides endpoints for ingesting instrument output, querying measurement data,
 * and exporting plate maps as CSV.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';

export function createMeasurementHandlers(ctx: AppContext) {
  return {
    /**
     * POST /measurements/ingest
     * Ingest instrument output and create a measurement record.
     */
    async ingestMeasurement(
      _request: FastifyRequest<{
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
      // TODO: Implement measurement ingest (parser logic)
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Measurement ingest is not yet implemented.',
      };
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
      _request: FastifyRequest<{
        Body: {
          eventGraphId: string;
          labwareId?: string;
          format?: 'csv' | 'tsv';
        };
      }>,
      reply: FastifyReply,
    ): Promise<ApiError> {
      // TODO: Implement plate map export
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Plate map export is not yet implemented.',
      };
    },
  };
}

export type MeasurementHandlers = ReturnType<typeof createMeasurementHandlers>;
