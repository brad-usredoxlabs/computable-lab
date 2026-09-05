/**
 * MCP tools: lab.* — the Graph Search Engine's agent surface.
 *
 * Exposes the same canonical GraphQuery primitives the Find UI uses, so a
 * query issued by an agent and an equivalent query by the user return the same
 * result sets (spec §1.1). Each tool is a thin wrapper over GraphQueryEngine.
 *
 * Surface (spec §13):
 *   lab.resolve, lab.get, lab.find, lab.traverse, lab.path, lab.neighborhood,
 *   lab.lineage, lab.aggregate, lab.exists, lab.get_collection,
 *   lab.create_collection, lab.create_selection, lab.ai_context
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import type { GraphQuery } from '../../graph-query/types.js';

function svcOf(ctx: AppContext) {
  if (!ctx.graphQueryService) {
    throw new Error('Graph query service not initialized');
  }
  return ctx.graphQueryService;
}

/**
 * Run a raw query object through the shared engine and serialize the result
 * the same way for every lab.* tool.
 */
async function runEngine(ctx: AppContext, query: unknown): Promise<ReturnType<typeof jsonResult | typeof errorResult>> {
  const svc = svcOf(ctx);
  try {
    const result = await svc.engine.execute(query as GraphQuery);
    return jsonResult({
      query_id: result.query_id,
      result_type: result.result_type,
      objects: result.objects,
      relationships: result.relationships,
      summary: result.summary,
      ...(result.explain ? { explain: result.explain } : {}),
    });
  } catch (err) {
    return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function registerGraphTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(server, registry, 'lab.resolve',
    'Resolve a human/domain term (e.g. "plate 421", "rotenone", "MagPix", "well A7") to canonical graph objects (§5.1).',
    {
      term: z.string(),
      type: z.string().optional(),
      limit: z.number().optional(),
      explain: z.boolean().optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'resolve',
      term: args.term,
      ...(args.type ? { type: args.type } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
      ...(args.explain ? { explain: args.explain } : {}),
    }));

  dualRegister(server, registry, 'lab.get',
    'Retrieve a single graph object and its selected properties + relationships (§5.2).',
    {
      objectId: z.string(),
      fields: z.array(z.string()).optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'get',
      objectId: args.objectId,
      ...(args.fields ? { fields: args.fields } : {}),
    }));

  dualRegister(server, registry, 'lab.find',
    'Find graph objects of a type matching property conditions. Use dotted fields to expand relationships, e.g. {field:"treatment.name",operator:"=",value:"rotenone"} for wells treated with rotenone (§5.3, §11).',
    {
      type: z.string(),
      where: z.array(z.object({
        field: z.string(),
        operator: z.enum(['=', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'not_in']),
        value: z.any(),
      })).optional(),
      scope: z.any().optional(),
      limit: z.number().optional(),
      order: z.any().optional(),
      explain: z.boolean().optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'find',
      type: args.type,
      ...(args.where ? { where: args.where } : {}),
      ...(args.scope ? { scope: args.scope } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
      ...(args.order ? { order: args.order } : {}),
      ...(args.explain ? { explain: args.explain } : {}),
    }));

  dualRegister(server, registry, 'lab.traverse',
    'Follow graph relationships from one or more starting objects (§5.4).',
    {
      start: z.union([z.string(), z.array(z.string())]),
      relationship: z.string(),
      direction: z.enum(['out', 'in']).optional(),
      depth: z.number().optional(),
      targetType: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'traverse',
      start: args.start,
      relationship: args.relationship,
      ...(args.direction ? { direction: args.direction } : {}),
      ...(args.depth ? { depth: args.depth } : {}),
      ...(args.targetType ? { targetType: args.targetType } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
    }));

  dualRegister(server, registry, 'lab.path',
    'Find a meaningful path between two graph objects (§5.5).',
    {
      from: z.string(),
      to: z.string(),
      relationshipTypes: z.array(z.string()).optional(),
      maxDepth: z.number().optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'path',
      from: args.from,
      to: args.to,
      ...(args.relationshipTypes ? { relationshipTypes: args.relationshipTypes } : {}),
      ...(args.maxDepth ? { maxDepth: args.maxDepth } : {}),
    }));

  dualRegister(server, registry, 'lab.neighborhood',
    'Return a bounded subgraph (neighborhood) surrounding one or more objects (§5.6). Useful for agent context.',
    {
      objects: z.array(z.string()).min(1),
      depth: z.number().min(1),
    },
    async (args) => runEngine(ctx, { op: 'neighborhood', objects: args.objects, depth: args.depth }));

  dualRegister(server, registry, 'lab.lineage',
    'Retrieve upstream (in) or downstream (out) derivation history of an object (§5.7).',
    {
      object: z.string(),
      direction: z.enum(['up', 'down']),
      depth: z.number().optional(),
    },
    async (args) => runEngine(ctx, {
      op: 'lineage',
      object: args.object,
      direction: args.direction,
      ...(args.depth ? { depth: args.depth } : {}),
    }));

  dualRegister(server, registry, 'lab.aggregate',
    'Perform calculations over a query result (count/sum/mean/median/min/max/stddev/first/last/distinct_count), optionally grouped (§5.9).',
    {
      query: z.any(),
      groupBy: z.string().optional(),
      measures: z.array(z.object({
        name: z.string(),
        field: z.string(),
        op: z.enum(['count', 'sum', 'mean', 'median', 'min', 'max', 'stddev', 'first', 'last', 'distinct_count']),
      })).min(1),
    },
    async (args) => runEngine(ctx, {
      op: 'aggregate',
      query: args.query,
      ...(args.groupBy ? { groupBy: args.groupBy } : {}),
      measures: args.measures,
    }));

  dualRegister(server, registry, 'lab.exists',
    'Efficiently determine whether matching evidence exists (§5.10).',
    { query: z.any() },
    async (args) => runEngine(ctx, { op: 'exists', query: args.query }));

  dualRegister(server, registry, 'lab.get_collection',
    'Resolve an ephemeral collection:q_xxx or selection:q_yyy handle to its node ids (§7).',
    { handle: z.string() },
    async (args) => {
      const svc = svcOf(ctx);
      try {
        const nodeIds = svc.collections.getCollection(args.handle) ?? svc.collections.getSelection(args.handle);
        if (!nodeIds) return errorResult(`Unknown collection/selection handle: ${args.handle}`);
        return jsonResult({ handle: args.handle, nodeIds });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  dualRegister(server, registry, 'lab.create_collection',
    'Create an ephemeral collection handle from explicit node ids (§7).',
    { nodeIds: z.array(z.string()) },
    async (args) => {
      const svc = svcOf(ctx);
      try {
        const handle = svc.collections.createCollection(args.nodeIds);
        return jsonResult({ handle, nodeIds: args.nodeIds });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  dualRegister(server, registry, 'lab.create_selection',
    'Create a selection (subset) from a collection handle (§7).',
    { collection: z.string(), nodeIds: z.array(z.string()) },
    async (args) => {
      const svc = svcOf(ctx);
      try {
        const handle = svc.collections.createSelection(args.collection, args.nodeIds);
        return jsonResult({ handle, nodeIds: args.nodeIds });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  dualRegister(server, registry, 'lab.ai_context',
    'Package a selection + instruction into the canonical AI context {prompt, selection, nodeIds} (§7, end-to-end loop).',
    { selection: z.string(), prompt: z.string().optional() },
    async (args) => {
      const svc = svcOf(ctx);
      try {
        const out = svc.collections.toAiContext(args.selection, args.prompt ?? '');
        if (out.nodeIds.length === 0) return errorResult(`Unknown selection: ${args.selection}`);
        return jsonResult(out);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}