/**
 * MCP tool: resolve — the agent's entry point to the resolve() spine.
 *
 * Walks the five-tier hierarchy (local record → local OAK ontology → remote
 * OLS4 → vendor → mint-local) and returns ranked, CURIE-typed candidates. This
 * is the same spine the UI/copilot and the compiler use, so the agent's
 * grounding agrees with what the compiler will accept. Prefer this over the
 * OLS4-only `ontology_search`.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';

export function registerResolveTool(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const spine = createResolveSpineFromContext(ctx);

  dualRegister(server, registry,
    'resolve',
    'Resolve a noun (material, reagent, cell line, …) to a ranked list of ontology-grounded CURIE candidates, ' +
      'walking local records → local ontologies → remote ontologies → vendor, plus a "mint local term" affordance. ' +
      'Prefer the highest-ranked candidate; never invent a free-text material when a candidate exists.',
    {
      term: z.string().describe('The term to resolve (e.g. "fenofibrate", "HepG2", "DMEM")'),
      surface: z.string().optional().describe('Active surface / grounding profile (biases material level)'),
      kinds: z.array(z.string()).optional().describe('Restrict to candidate kinds (e.g. ["material","labware"])'),
      level: z
        .enum(['concept', 'spec', 'instance', 'aliquot', 'unknown'])
        .optional()
        .describe('Bias toward a material-hierarchy layer'),
      limit: z.number().optional().describe('Maximum candidates (default 20)'),
    },
    async (args) => {
      try {
        const term = (args.term ?? '').trim();
        if (!term) return errorResult('term is required');
        const candidates = await spine.resolve(term, {
          ...(args.surface ? { surface: args.surface } : {}),
          ...(args.kinds ? { kinds: args.kinds } : {}),
          ...(args.level ? { level: args.level } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
        });
        return jsonResult({ candidates });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
