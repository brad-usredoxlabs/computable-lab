import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { attachVendorDocumentExtraction } from '../../vendor-documents/service.js';

export function registerVendorDocumentTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(
    server,
    registry,
    'vendor_document_extract',
    'Attach a vendor document to a vendor-product record and create an OCR/text-extracted composition draft for review before canonicalization.',
    {
      vendorProductId: z.string().describe('Vendor-product record ID'),
      fileName: z.string().describe('Uploaded file name'),
      mediaType: z.string().describe('Media type such as application/pdf or text/plain'),
      contentBase64: z.string().optional().describe('Base64-encoded file content'),
      sourceUrl: z.string().optional().describe('Original vendor URL'),
      title: z.string().optional().describe('Optional display title'),
      documentKind: z.enum(['product_sheet', 'formulation_sheet', 'certificate_of_analysis', 'safety_data_sheet', 'label', 'other']).optional(),
      note: z.string().optional().describe('Optional provenance note'),
    },
    async (args) => {
      try {
        const extraction = await attachVendorDocumentExtraction(ctx.store, args.vendorProductId, {
          fileName: args.fileName,
          mediaType: args.mediaType,
          ...(args.contentBase64 ? { contentBase64: args.contentBase64 } : {}),
          ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
          ...(args.title ? { title: args.title } : {}),
          ...(args.documentKind ? { documentKind: args.documentKind } : {}),
          ...(args.note ? { note: args.note } : {}),
        });
        return jsonResult({
          success: true,
          vendorProductId: args.vendorProductId,
          document: extraction.document,
          ...(extraction.draft ? { draft: extraction.draft } : {}),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
