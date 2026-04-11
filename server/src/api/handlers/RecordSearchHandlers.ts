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

/**
 * Handler for the /ai/search-records endpoint.
 */
export class RecordSearchHandlers {
  private store: RecordStore;
  private config: AppConfig;

  constructor(store: RecordStore, config: AppConfig) {
    this.store = store;
    this.config = config;
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
    if (!exaConfig?.enabled) return [];

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
      const { exaSearch } = await import('../../integrations/exa.js');
      const response = await exaSearch(exaConfig, {
        query: `${query} ${suffix}`,
        numResults: 5,
        type: 'auto',
        contentMode: 'highlights',
      });

      const typedResponse = response as { results?: Array<{
        title?: string;
        highlights?: string[];
        text?: string;
        url?: string;
      }> };

      return (typedResponse.results || []).map(r => ({
        origin: 'web' as const,
        title: r.title || 'Untitled',
        snippet: (r.highlights || [r.text || '']).join(' ').slice(0, 300),
        url: r.url,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Main search handler - combines local and web search.
   */
  async searchRecords(
    request: FastifyRequest<{ Body: SearchRecordsBody }>,
    reply: FastifyReply
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
}

/**
 * Factory function to create RecordSearchHandlers.
 */
export function createRecordSearchHandlers(store: RecordStore, config: AppConfig): RecordSearchHandlers {
  return new RecordSearchHandlers(store, config);
}
