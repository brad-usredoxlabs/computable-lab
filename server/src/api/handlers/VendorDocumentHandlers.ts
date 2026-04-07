import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { RecordStore } from '../../store/types.js';
import { attachVendorDocumentExtraction, type VendorDocumentUpload } from '../../vendor-documents/service.js';

export interface VendorDocumentHandlers {
  extractVendorDocument(
    request: FastifyRequest<{ Params: { id: string }; Body: VendorDocumentUpload }>,
    reply: FastifyReply,
  ): Promise<{ success: true; vendorProductId: string; document: Record<string, unknown>; draft?: Record<string, unknown>; drafts?: Record<string, unknown>[] } | ApiError>;
}

export function createVendorDocumentHandlers(store: RecordStore): VendorDocumentHandlers {
  return {
    async extractVendorDocument(request, reply) {
      try {
        const extraction = await attachVendorDocumentExtraction(store, request.params.id, request.body);
        return {
          success: true,
          vendorProductId: request.params.id,
          document: extraction.document,
          ...(extraction.draft ? { draft: extraction.draft } : {}),
          ...(extraction.drafts ? { drafts: extraction.drafts } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 400);
        return {
          error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
          message,
        };
      }
    },
  };
}
