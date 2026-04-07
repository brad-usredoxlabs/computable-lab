/**
 * TagHandlers — HTTP handler for suggesting tags/keywords from existing records.
 *
 * Scans records via store.list(), aggregates unique values for the specified
 * field, filters by substring match (case-insensitive), and returns sorted
 * by frequency.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { ApiError } from '../types.js';

export interface TagSuggestion {
  value: string;
  count: number;
}

export interface TagSuggestResponse {
  suggestions: TagSuggestion[];
  total: number;
}

const ALLOWED_FIELDS = new Set(['keywords', 'tags']);

/**
 * Create tag suggestion handlers bound to a RecordStore.
 */
export function createTagHandlers(store: RecordStore) {
  return {
    /**
     * GET /tags/suggest?q=...&field=keywords|tags&limit=20
     */
    async suggestTags(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          field?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<TagSuggestResponse | ApiError> {
      const q = (request.query.q || '').trim().toLowerCase();
      const field = (request.query.field || '').trim();
      const limit = Math.min(Math.max(Number(request.query.limit) || 20, 1), 100);

      if (!ALLOWED_FIELDS.has(field)) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: `field must be one of: ${[...ALLOWED_FIELDS].join(', ')}`,
        };
      }

      try {
        const records = await store.list({});
        const freq = new Map<string, number>();

        for (const env of records) {
          const payload = env.payload as Record<string, unknown> | undefined;
          if (!payload) continue;
          const arr = payload[field];
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            if (typeof item !== 'string') continue;
            const existing = freq.get(item) ?? 0;
            freq.set(item, existing + 1);
          }
        }

        // Filter by substring match and sort by frequency desc
        let entries = [...freq.entries()];
        if (q) {
          entries = entries.filter(([val]) => val.toLowerCase().includes(q));
        }
        entries.sort((a, b) => b[1] - a[1]);

        const suggestions: TagSuggestion[] = entries
          .slice(0, limit)
          .map(([value, count]) => ({ value, count }));

        return { suggestions, total: entries.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to suggest tags: ${message}`,
        };
      }
    },
  };
}

export type TagHandlers = ReturnType<typeof createTagHandlers>;
