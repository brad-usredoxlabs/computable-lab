/**
 * Handler for generic record search endpoint.
 * 
 * Provides a unified search pattern across all record types:
 * - Local-first search in the RecordStore
 * - Optional Exa web search fallback
 */

import type { RecordStore } from '../../store/types.js';
import type { AppConfig } from '../../config/types.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import { resolveAiProfile } from '../../config/types.js';

export interface RecordSearchResult {
  origin: 'local' | 'web';
  recordId?: string;       // only for local results
  title: string;
  snippet: string;
  url?: string;            // only for web results
  kind?: string;           // record kind for local results
  schemaId?: string;       // for local results
}

export interface SearchRecordsBody {
  query: string;
  kinds: string[];          // e.g. ['equipment', 'equipment-class'] or ['material'] or ['labware']
  schemaId?: string;        // optional hint for Exa search context
}

export interface SearchRecordsResponse {
  results: RecordSearchResult[];
  sources: string[];
}

export interface PrecompileRecordBody {
  schemaId: string;
  title: string;
  snippet: string;
  url?: string;
}

export interface PrecompileRecordResponse {
  success: boolean;
  payload?: Record<string, unknown>;
  notes?: string[];
  error?: string;
}

/**
 * Handler for the /ai/search-records endpoint.
 */
export class RecordSearchHandlers {
  private store: RecordStore;
  private config: AppConfig;
  private schemaRegistry: SchemaRegistry;

  constructor(store: RecordStore, config: AppConfig, schemaRegistry: SchemaRegistry) {
    this.store = store;
    this.config = config;
    this.schemaRegistry = schemaRegistry;
  }

  /**
   * Search local records by query and kinds.
   */
  async searchLocal(query: string, kinds: string[]): Promise<RecordSearchResult[]> {
    const lowerQuery = query.toLowerCase();
    const results: RecordSearchResult[] = [];

    for (const kind of kinds) {
      const records = await this.store.list({ kind });
      for (const record of records) {
        const payload = record.payload as Record<string, unknown>;
        // Check common display fields
        const searchable = [
          payload.name, payload.title, payload.label,
          payload.manufacturer, payload.model, payload.modelFamily,
          payload.canonical, payload.id,
        ].filter(Boolean).map(v => String(v).toLowerCase());

        if (searchable.some(s => s.includes(lowerQuery))) {
          results.push({
            origin: 'local',
            recordId: record.recordId,
            title: String(payload.name || payload.title || payload.label || record.recordId),
            snippet: [payload.manufacturer, payload.model || payload.modelFamily, payload.domain]
              .filter(Boolean).join(' — '),
            kind: String(payload.kind),
            schemaId: record.schemaId,
          });
        }
      }
    }
    return results;
  }

  /**
   * Search the web using Exa if configured.
   */
  async searchWeb(query: string, kinds: string[]): Promise<RecordSearchResult[]> {
    const exaConfig = this.config.integrations?.exa;
    if (!exaConfig?.enabled || !exaConfig.apiKey) return [];

    // Build context suffix from the kinds
    const kindHints: Record<string, string> = {
      'equipment': 'laboratory equipment specifications',
      'equipment-class': 'laboratory equipment model specifications',
      'material': 'chemical reagent supplier',
      'labware': 'laboratory consumable specifications',
      'instrument': 'analytical instrument specifications',
    };
    const suffix = kinds.map(k => kindHints[k]).filter(Boolean)[0] || 'laboratory';

    try {
      const { exaSearch, resolveExaConfig } = await import('../../integrations/exa.js');
      const resolvedConfig = resolveExaConfig(this.config);
      if (!resolvedConfig) return [];
      
      const response = await exaSearch(resolvedConfig, {
        query: `${query} ${suffix}`,
        numResults: 5,
        searchType: 'auto',
        contentMode: 'highlights',
      });

      const typedResponse = response as { results?: Array<{
        title?: string;
        highlights?: string[];
        text?: string;
        url?: string;
      }> };

      return (typedResponse.results || []).map(r => {
        const result: RecordSearchResult = {
          origin: 'web' as const,
          title: r.title || 'Untitled',
          snippet: (r.highlights || [r.text || '']).join(' ').slice(0, 300),
        };
        if (r.url) {
          result.url = r.url;
        }
        return result;
      });
    } catch {
      return [];
    }
  }

  /**
   * Main search handler - combines local and web search.
   */
  async searchRecords(
    request: FastifyRequest<{ Body: SearchRecordsBody }>,
    _reply: FastifyReply
  ): Promise<SearchRecordsResponse> {
    const { query, kinds } = request.body;

    // Perform local search
    const localResults = await this.searchLocal(query, kinds);

    // Perform web search if Exa is configured
    const webResults = await this.searchWeb(query, kinds);

    // Combine results
    const results = [...localResults, ...webResults];

    // Build sources list
    const sources: string[] = [];
    if (localResults.length > 0) sources.push('local');
    if (webResults.length > 0) sources.push('exa');

    return { results, sources };
  }

  /**
   * Precompile a record from search result context.
   * Takes a schema ID and search result context to produce a pre-filled record payload.
   */
  async precompileRecord(
    request: FastifyRequest<{ Body: PrecompileRecordBody }>,
    reply: FastifyReply
  ): Promise<PrecompileRecordResponse> {
    const { schemaId, title, snippet, url } = request.body;

    // Validate inputs
    if (!schemaId || typeof schemaId !== 'string' || schemaId.trim().length === 0) {
      reply.status(400);
      return { success: false, error: 'schemaId is required and must be a non-empty string' };
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      reply.status(400);
      return { success: false, error: 'title is required and must be a non-empty string' };
    }
    if (!snippet || typeof snippet !== 'string' || snippet.trim().length === 0) {
      reply.status(400);
      return { success: false, error: 'snippet is required and must be a non-empty string' };
    }

    // Check AI configuration
    const aiConfig = this.config.ai;
    if (!aiConfig?.inference?.baseUrl) {
      reply.status(503);
      return { success: false, error: 'AI is not configured. Add inference configuration to config.yaml.' };
    }

    // Resolve AI profile
    const profile = resolveAiProfile(aiConfig);
    const inferenceConfig = profile.inference;

    // Get schema from registry
    const schema = this.schemaRegistry.getById(schemaId);
    if (!schema) {
      reply.status(404);
      return { success: false, error: `Schema not found: ${schemaId}` };
    }

    // Build system prompt with search result context
    const urlSection = url ? `- Source URL: ${url}` : '';
    const systemPrompt = `You are creating a record for a laboratory information system.

The user selected this item from search results:
- Title: ${title}
- Details: ${snippet}
${urlSection}

Create a JSON object conforming to this schema:

Schema: ${schemaId}
Required fields: ${JSON.stringify(schema.schema.required || [])}
Properties:
${JSON.stringify(schema.schema.properties, null, 2)}

Rules:
- Generate an appropriate ID with the correct prefix for this record type
- Fill in all fields you can determine from the search context
- Omit fields you cannot determine
- Set status to 'active' if the schema has a status field
- Respond with ONLY a valid JSON object, no markdown fencing`;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(inferenceConfig.apiKey ? { 'Authorization': `Bearer ${inferenceConfig.apiKey}` } : {}),
    };

    // Call AI inference endpoint
    let response: Response;
    try {
      response = await fetch(`${inferenceConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: inferenceConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Create a record for: ${title}` },
          ],
          temperature: inferenceConfig.temperature ?? 0.2,
          max_tokens: inferenceConfig.maxTokens ?? 4096,
        }),
      });
    } catch (err) {
      request.log.error(err, 'Inference endpoint failed');
      reply.status(503);
      return { success: false, error: `Inference endpoint failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      request.log.error(`Inference endpoint returned ${response.status}: ${errorText}`);
      reply.status(502);
      return { success: false, error: `Inference endpoint error: ${response.status} ${errorText}` };
    }

    // Parse AI response
    const completionData = await response.json() as Record<string, unknown>;

    // Extract content from OpenAI or Anthropic format
    const choices = completionData.choices as Array<{ message?: { content?: string | null } }> | undefined;
    const anthropicContent = completionData.content as Array<{ type?: string; text?: string }> | undefined;
    let content = choices?.[0]?.message?.content
      ?? anthropicContent?.find(b => b.type === 'text')?.text;

    if (!content || typeof content !== 'string') {
      request.log.error({ completionData: JSON.stringify(completionData).slice(0, 500) }, 'Unexpected inference response structure');
      reply.status(422);
      return { success: false, error: 'Failed to parse AI response' };
    }

    // Strip markdown fencing if present
    content = content.trim();
    const fenceMatch = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch?.[1]) {
      content = fenceMatch[1].trim();
    }

    // Parse JSON
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      request.log.error({ content: content.slice(0, 500) }, 'AI response is not valid JSON');
      reply.status(422);
      return { success: false, error: 'Failed to parse AI response as JSON' };
    }

    return {
      success: true,
      payload: parsedJson as Record<string, unknown>,
      notes: ['AI-precompiled record — review before saving'],
    };
  }
}

/**
 * Factory function to create RecordSearchHandlers.
 */
export function createRecordSearchHandlers(
  store: RecordStore,
  config: AppConfig,
  schemaRegistry: SchemaRegistry
): RecordSearchHandlers {
  return new RecordSearchHandlers(store, config, schemaRegistry);
}
