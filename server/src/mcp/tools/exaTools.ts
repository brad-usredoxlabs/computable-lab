import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { exaGetContents, exaSearch, resolveExaConfig } from '../../integrations/exa.js';

const searchTypeSchema = z.enum(['auto', 'fast', 'instant', 'deep', 'deep-reasoning']);
const contentModeSchema = z.enum(['highlights', 'text', 'summary']);
const categorySchema = z.enum([
  'company',
  'people',
  'research paper',
  'news',
  'tweet',
  'personal site',
  'financial report',
]);

function requireExaConfig(ctx: AppContext) {
  const config = resolveExaConfig(ctx.appConfig);
  if (!config) {
    throw new Error('Exa is not configured. Set integrations.exa.apiKey or EXA_API_KEY on the computable-lab backend.');
  }
  return config;
}

export function registerExaTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(
    server,
    registry,
    'web_search_exa',
    'Search the public web with Exa. Use this for vendor pages, product PDFs, technical articles, and other official sources when local records are insufficient.',
    {
      query: z.string().describe('Natural-language web search query'),
      searchType: searchTypeSchema.optional().describe('Search strategy; default comes from backend config'),
      numResults: z.number().int().min(1).max(25).optional().describe('Maximum results to return'),
      category: categorySchema.optional().describe('Optional Exa category filter'),
      includeDomains: z.array(z.string()).optional().describe('Restrict results to these domains'),
      excludeDomains: z.array(z.string()).optional().describe('Exclude these domains'),
      startPublishedDate: z.string().optional().describe('Lower published-date bound in ISO 8601 or YYYY-MM-DD'),
      endPublishedDate: z.string().optional().describe('Upper published-date bound in ISO 8601 or YYYY-MM-DD'),
      maxAgeHours: z.number().optional().describe('Maximum cache age in hours; 0 forces livecrawl'),
      contentMode: contentModeSchema.optional().describe('Returned content mode'),
      maxCharacters: z.number().int().min(1).max(50000).optional().describe('Character budget for returned content'),
      highlightQuery: z.string().optional().describe('Optional focus query for highlights'),
      summaryQuery: z.string().optional().describe('Optional focus query for summaries'),
    },
    async (args) => {
      try {
        const result = await exaSearch(requireExaConfig(ctx), args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  dualRegister(
    server,
    registry,
    'web_get_contents_exa',
    'Fetch page contents from known URLs with Exa. Use this after finding a vendor page, product sheet, or article that needs extraction.',
    {
      urls: z.array(z.string().url()).min(1).max(20).describe('One or more URLs to fetch'),
      contentMode: contentModeSchema.optional().describe('Returned content mode'),
      maxCharacters: z.number().int().min(1).max(50000).optional().describe('Character budget for returned content'),
      query: z.string().optional().describe('Optional focus query for highlights or summaries'),
      maxAgeHours: z.number().optional().describe('Maximum cache age in hours; 0 forces livecrawl'),
    },
    async (args) => {
      try {
        const result = await exaGetContents(requireExaConfig(ctx), args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
