/**
 * REST handler for POST /ai/extract-protocol.
 *
 * Accepts a PDF file upload (multipart form-data) and returns a structured
 * ProtocolCandidate extracted from the vendor protocol document.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';
import { extractVendorProtocolCandidateFromInput } from '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
import type { ProtocolCandidate } from '../../ingestion/vendor-protocol/types.js';

/**
 * Response body returned by /ai/extract-protocol.
 */
export interface ExtractProtocolResponse {
  /** The structured protocol candidate extracted from the PDF. */
  candidate: ProtocolCandidate;
  /** Source metadata about the uploaded file. */
  source: {
    /** Whether the input was treated as a PDF or plain text. */
    inputKind: 'pdf' | 'text';
    /** Original file name from the upload. */
    fileName: string;
    /** SHA-256 hash of the uploaded file bytes. */
    sha256: string;
  };
  /** Summary of the parsed document structure. */
  document: {
    /** Page count of the source document. */
    pageCount: number;
    /** Number of sections detected. */
    sectionCount: number;
    /** Number of tables detected. */
    tableCount: number;
  };
  /** Path to the persisted candidate artifact (if persisted). */
  candidatePath?: string;
}

export interface ExtractProtocolHandlers {
  extractProtocol(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<ExtractProtocolResponse | ApiError>;
}

/**
 * Create extract-protocol handler backed by VendorProtocolCandidateService.
 *
 * @param workspaceRoot - The workspace root path used to persist candidate artifacts.
 */
export function createExtractProtocolHandlers(
  workspaceRoot: string,
): ExtractProtocolHandlers {
  return {
    async extractProtocol(request, reply) {
      // Read the uploaded PDF from multipart form-data.
      let fileBuffer: Buffer | undefined;
      let fileName = '';

      try {
        for await (const part of request.parts()) {
          if (part.type === 'file' && part.fieldname === 'file') {
            fileBuffer = await part.toBuffer();
            fileName = part.filename;
          }
        }
      } catch (err) {
        request.log.error(err, 'Failed to read multipart upload');
        reply.status(400);
        return {
          error: 'UPLOAD_ERROR',
          message: `Failed to read upload: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (!fileBuffer) {
        reply.status(400);
        return {
          error: 'MISSING_FILE',
          message: 'File is required and must be uploaded as multipart form data with fieldname "file"',
        };
      }

      try {
        const result = await extractVendorProtocolCandidateFromInput({
          workspaceRoot,
          contentBase64: fileBuffer.toString('base64'),
          fileName,
          persist: true,
        });

        return {
          candidate: result.candidate,
          source: {
            inputKind: result.source.inputKind,
            fileName: result.source.fileName,
            sha256: result.source.sha256,
          },
          document: {
            pageCount: result.document.pageCount,
            sectionCount: result.document.sectionCount,
            tableCount: result.document.tableCount,
          },
          ...(result.candidatePath ? { candidatePath: result.candidatePath } : {}),
        };
      } catch (err) {
        request.log.error(err, 'Protocol extraction failed');
        reply.status(500);
        return {
          error: 'EXTRACTION_ERROR',
          message: `Protocol extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
