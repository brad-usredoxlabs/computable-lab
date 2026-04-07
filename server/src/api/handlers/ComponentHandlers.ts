import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { ComponentGraphError, ComponentGraphService } from '../../protocol/ComponentGraphService.js';

export function createComponentHandlers(ctx: AppContext) {
  const service = new ComponentGraphService(ctx);

  return {
    async createComponent(
      request: FastifyRequest<{
        Body: {
          recordId?: string;
          title: string;
          description?: string;
          roles?: Record<string, unknown>;
          compatibility?: Record<string, unknown>;
          template: Record<string, unknown>;
          tags?: string[];
          notes?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; component?: unknown } | ApiError> {
      try {
        const component = await service.createDraft(request.body);
        reply.status(201);
        return { success: true, component };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async updateComponent(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          title?: string;
          description?: string;
          roles?: Record<string, unknown>;
          compatibility?: Record<string, unknown>;
          template?: Record<string, unknown>;
          tags?: string[];
          notes?: string;
          state?: 'draft' | 'published' | 'deprecated';
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; component?: unknown } | ApiError> {
      try {
        const component = await service.updateDraft(request.params.id, request.body);
        return { success: true, component };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async publishComponent(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { version?: string; notes?: string };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; component?: unknown; version?: unknown } | ApiError> {
      try {
        const published = await service.publish(request.params.id, request.body);
        return { success: true, component: published.component, version: published.version };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async getComponent(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<{ component?: unknown } | ApiError> {
      try {
        const component = await service.get(request.params.id);
        return { component };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async listComponents(
      request: FastifyRequest<{
        Querystring: { state?: 'draft' | 'published' | 'deprecated'; limit?: number; offset?: number };
      }>,
      reply: FastifyReply,
    ): Promise<{ components?: unknown[]; total?: number } | ApiError> {
      try {
        const components = await service.list({
          ...(request.query.state !== undefined ? { state: request.query.state } : {}),
          ...(request.query.limit !== undefined ? { limit: Number(request.query.limit) } : {}),
          ...(request.query.offset !== undefined ? { offset: Number(request.query.offset) } : {}),
        });
        return { components, total: components.length };
      } catch (err) {
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async instantiateComponent(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          sourceRef?: Record<string, unknown>;
          componentVersionRef?: Record<string, unknown>;
          bindings?: Record<string, unknown>;
          renderMode?: 'collapsed' | 'expanded';
          notes?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; instance?: unknown } | ApiError> {
      try {
        const instance = await service.instantiate(request.params.id, request.body);
        reply.status(201);
        return { success: true, instance };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async componentInstanceStatus(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<{ status?: unknown } | ApiError> {
      try {
        const status = await service.instanceStatus(request.params.id);
        return { status };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async upgradeComponentInstance(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<{ success: boolean; instance?: unknown } | ApiError> {
      try {
        const instance = await service.upgradeInstance(request.params.id);
        return { success: true, instance };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async suggestFromEventGraph(
      request: FastifyRequest<{ Body: { eventGraphId: string; minOccurrences?: number } }>,
      reply: FastifyReply,
    ): Promise<{ suggestions?: unknown } | ApiError> {
      try {
        const suggestions = await service.suggestFromEventGraph(request.body);
        return { suggestions };
      } catch (err) {
        if (err instanceof ComponentGraphError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export type ComponentHandlers = ReturnType<typeof createComponentHandlers>;
