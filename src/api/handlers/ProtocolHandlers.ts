/**
 * ProtocolHandlers — Stub HTTP handlers for protocol management.
 *
 * Provides endpoints for saving event graphs as protocols, loading protocols
 * for editing, and binding protocol roles to concrete instances (wizard flow).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';

export function createProtocolHandlers(_ctx: AppContext) {
  return {
    /**
     * POST /protocols/from-event-graph
     * Save an event graph as a protocol record.
     */
    async saveFromEventGraph(
      _request: FastifyRequest<{
        Body: {
          eventGraphId: string;
          title?: string;
          tags?: string[];
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; recordId?: string } | ApiError> {
      // TODO: Implement protocol extraction from event graph
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Protocol save from event graph is not yet implemented.',
      };
    },

    /**
     * GET /protocols/:id/load
     * Load a protocol for the editor (returns event graph shape).
     */
    async loadProtocol(
      _request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ protocol: unknown } | ApiError> {
      // TODO: Implement protocol loading with event graph shape
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Protocol load is not yet implemented.',
      };
    },

    /**
     * POST /protocols/:id/bind
     * Start wizard: bind abstract roles to concrete instances, creating a PlannedRun.
     */
    async bindProtocol(
      _request: FastifyRequest<{
        Params: { id: string };
        Body: {
          bindings?: {
            labware?: Array<{ roleId: string; labwareInstanceRef?: unknown }>;
            materials?: Array<{ roleId: string; materialRef?: unknown }>;
            instruments?: Array<{ roleId: string; instrumentRef?: unknown }>;
            parameters?: Array<{ name: string; value: unknown }>;
          };
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; plannedRunId?: string } | ApiError> {
      // TODO: Implement protocol binding wizard
      reply.status(501);
      return {
        error: 'NOT_IMPLEMENTED',
        message: 'Protocol binding is not yet implemented.',
      };
    },
  };
}

export type ProtocolHandlers = ReturnType<typeof createProtocolHandlers>;
