/**
 * SpecSheetHandlers — POST /ingestion/spec-sheet/extract
 *
 * Extracts field proposals from a vendor spec-sheet URL. Does NOT write any
 * record; this endpoint only proposes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppConfig } from '../../config/types.js';
import { extractFromUrl, type SpecSheetExtractResult } from '../../ingestion/SpecSheetExtractor.js';

export interface SpecSheetExtractRequest {
  url: string;
  recordKind: string;
}

export interface SpecSheetHandlers {
  extractSpecSheet(
    request: FastifyRequest<{ Body: SpecSheetExtractRequest }>,
    reply: FastifyReply,
  ): Promise<SpecSheetExtractResult | ApiError>;
}

export function createSpecSheetHandlers(deps: {
  getAppConfig: () => AppConfig | undefined;
}): SpecSheetHandlers {
  const { getAppConfig } = deps;

  return {
    async extractSpecSheet(request, reply) {
      const body = request.body ?? {};
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      const recordKind = typeof body.recordKind === 'string' ? body.recordKind.trim() : '';

      if (!url) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Body field "url" is required and must be a non-empty string.' };
      }
      if (!recordKind) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Body field "recordKind" is required and must be a non-empty string.' };
      }

      try {
        const result = await extractFromUrl(recordKind, url, getAppConfig());
        return result;
      } catch (err) {
        // Unmapped kinds throw from getSpecSheetFieldMap — pass through as 400
        const message = err instanceof Error ? err.message : String(err);
        reply.status(400);
        return { error: 'FIELD_MAP_MISSING', message };
      }
    },
  };
}
