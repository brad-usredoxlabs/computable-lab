import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { ComponentGraphError, ComponentGraphService } from '../../protocol/ComponentGraphService.js';

export function registerComponentTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const service = new ComponentGraphService(ctx);

  dualRegister(server, registry,
    'component_create',
    'Create a graph-component draft from an event-graph subgraph template.',
    {
      recordId: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      roles: z.record(z.string(), z.unknown()).optional(),
      compatibility: z.record(z.string(), z.unknown()).optional(),
      template: z.record(z.string(), z.unknown()),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      try {
        const component = await service.createDraft({
          ...(args.recordId !== undefined ? { recordId: args.recordId } : {}),
          title: args.title,
          ...(args.description !== undefined ? { description: args.description } : {}),
          ...(args.roles !== undefined ? { roles: args.roles } : {}),
          ...(args.compatibility !== undefined ? { compatibility: args.compatibility } : {}),
          template: args.template,
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
        });
        return jsonResult({ success: true, component });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_list',
    'List graph-components.',
    {
      state: z.enum(['draft', 'published', 'deprecated']).optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (args) => {
      try {
        const components = await service.list({
          ...(args.state !== undefined ? { state: args.state } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.offset !== undefined ? { offset: args.offset } : {}),
        });
        return jsonResult({ components, total: components.length });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_get',
    'Get a graph-component by recordId.',
    {
      componentId: z.string(),
    },
    async (args) => {
      try {
        const component = await service.get(args.componentId);
        return jsonResult({ component });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_update',
    'Update a graph-component draft metadata/template.',
    {
      componentId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      roles: z.record(z.string(), z.unknown()).optional(),
      compatibility: z.record(z.string(), z.unknown()).optional(),
      template: z.record(z.string(), z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      state: z.enum(['draft', 'published', 'deprecated']).optional(),
    },
    async (args) => {
      try {
        const component = await service.updateDraft(args.componentId, {
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.description !== undefined ? { description: args.description } : {}),
          ...(args.roles !== undefined ? { roles: args.roles } : {}),
          ...(args.compatibility !== undefined ? { compatibility: args.compatibility } : {}),
          ...(args.template !== undefined ? { template: args.template } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
          ...(args.state !== undefined ? { state: args.state } : {}),
        });
        return jsonResult({ success: true, component });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_publish',
    'Publish an immutable graph-component-version from a graph-component.',
    {
      componentId: z.string(),
      version: z.string().optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      try {
        const published = await service.publish(args.componentId, {
          ...(args.version !== undefined ? { version: args.version } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
        });
        return jsonResult({ success: true, component: published.component, version: published.version });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_instantiate',
    'Instantiate a graph-component-version into a concrete graph-component-instance.',
    {
      componentId: z.string(),
      sourceRef: z.record(z.string(), z.unknown()).optional(),
      componentVersionRef: z.record(z.string(), z.unknown()).optional(),
      bindings: z.record(z.string(), z.unknown()).optional(),
      renderMode: z.enum(['collapsed', 'expanded']).optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      try {
        const instance = await service.instantiate(args.componentId, {
          ...(args.sourceRef !== undefined ? { sourceRef: args.sourceRef } : {}),
          ...(args.componentVersionRef !== undefined ? { componentVersionRef: args.componentVersionRef } : {}),
          ...(args.bindings !== undefined ? { bindings: args.bindings } : {}),
          ...(args.renderMode !== undefined ? { renderMode: args.renderMode } : {}),
          ...(args.notes !== undefined ? { notes: args.notes } : {}),
        });
        return jsonResult({ success: true, instance });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_instance_status',
    'Get graph-component-instance status, including stale/latest-version information.',
    {
      instanceId: z.string(),
    },
    async (args) => {
      try {
        const status = await service.instanceStatus(args.instanceId);
        return jsonResult({ status });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_instance_upgrade',
    'Upgrade a graph-component-instance to latest component version.',
    {
      instanceId: z.string(),
    },
    async (args) => {
      try {
        const instance = await service.upgradeInstance(args.instanceId);
        return jsonResult({ success: true, instance });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  dualRegister(server, registry,
    'component_suggest_from_event_graph',
    'Suggest repeated event signatures in an event graph for promotion to reusable components.',
    {
      eventGraphId: z.string(),
      minOccurrences: z.number().optional(),
    },
    async (args) => {
      try {
        const suggestions = await service.suggestFromEventGraph({
          eventGraphId: args.eventGraphId,
          ...(args.minOccurrences !== undefined ? { minOccurrences: args.minOccurrences } : {}),
        });
        return jsonResult({ suggestions });
      } catch (err) {
        if (err instanceof ComponentGraphError) return errorResult(`${err.code}: ${err.message}`);
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
