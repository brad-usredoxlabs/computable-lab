/**
 * RelatedRecordsHandlers — Handler for reverse-reference queries.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { ApiError } from '../types.js';

export interface RelatedRecordsResponse {
  related: Array<{ recordId: string; schemaId: string; kind: string; title: string; refField: string }>;
}

/**
 * Recursively search for references to targetId. Returns matching field paths.
 */
function findRefFields(obj: unknown, targetId: string, prefix: string): string[] {
  const results: string[] = [];
  if (obj === null || obj === undefined) return results;
  if (typeof obj === 'string') {
    if (obj === targetId) results.push(prefix);
    return results;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...findRefFields(obj[i], targetId, prefix ? `${prefix}[${i}]` : `[${i}]`));
    }
    return results;
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (record.kind === 'record' && record.id === targetId) results.push(prefix);
    for (const [key, value] of Object.entries(record)) {
      results.push(...findRefFields(value, targetId, prefix ? `${prefix}.${key}` : key));
    }
    return results;
  }
  return results;
}

function extractTitle(payload: Record<string, unknown>): string {
  return (payload.title as string | undefined) ?? (payload.name as string | undefined) ??
    (payload.displayName as string | undefined) ?? (payload.id as string | undefined) ?? 'Unknown';
}

export function createRelatedRecordsHandlers(store: RecordStore) {
  return {
    async getRelatedRecords(
      request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
      reply: FastifyReply
    ): Promise<RelatedRecordsResponse | ApiError> {
      try {
        const targetId = request.params.id;
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        // Scan ALL records, then apply limit to output
        const allRecords = await store.list();
        const related: RelatedRecordsResponse['related'] = [];
        for (const record of allRecords) {
          if (record.recordId === targetId) continue;
          const payload = record.payload as Record<string, unknown>;
          const refFields = findRefFields(payload, targetId, '');
          if (refFields.length > 0) {
            related.push({
              recordId: record.recordId,
              schemaId: record.schemaId,
              kind: (payload.kind as string | undefined) ?? 'unknown',
              title: extractTitle(payload),
              refField: refFields[0] ?? '',
            });
          }
          // Apply limit to output, not to the scan
          if (related.length >= limit) break;
        }
        return { related };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: `Failed to find related records: ${message}` };
      }
    },
  };
}

export type RelatedRecordsHandlers = ReturnType<typeof createRelatedRecordsHandlers>;
export { findRefFields };
