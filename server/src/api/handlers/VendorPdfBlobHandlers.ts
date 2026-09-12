/**
 * VendorPdfBlobHandlers — serve the stored PDF bytes of a free-floating
 * `vendor-pdf` record over HTTP.
 *
 * Artifact blobs are served by ArtifactBlobHandlers, but that route is
 * study-scoped (`/studies/:studyId/artifacts/:artifactId/blob`). Ingested
 * vendor PDFs are free-floating records (no study), so they need their own
 * route so the browser's pdfjs can do a normal GET:
 *
 *   GET /vendor-pdfs/:recordId/pdf
 *     → 200  application/pdf (or whatever media_type the record's file has)
 *     → 400  recordId malformed, or stored_path escapes the workspace root
 *     → 404  no such record, record has no stored file, or file missing
 *
 * Path-traversal protection mirrors ArtifactBlobHandlers: `file.stored_path`
 * must resolve under the workspace root.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { RecordStore } from '../../store/types.js';

const RECORD_ID_PATTERN = /^VPDF-[A-Za-z0-9_-]+$/;

interface VendorPdfFile {
  file_name?: string;
  media_type?: string;
  stored_path?: string;
}

interface CreateVendorPdfBlobHandlersOptions {
  recordStore: RecordStore;
  workspaceRoot: string;
}

/**
 * Build a vendor-pdf blob handler bound to the records workspace root.
 * The root is resolved once at startup and passed in.
 */
export function createVendorPdfBlobHandlers(opts: CreateVendorPdfBlobHandlersOptions) {
  const workspaceRootAbsolute = resolve(opts.workspaceRoot);

  return {
    async getVendorPdfBlob(
      request: FastifyRequest<{ Params: { recordId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const { recordId } = request.params;
      if (!RECORD_ID_PATTERN.test(recordId)) {
        reply.status(400).send({
          error: 'INVALID_RECORD_ID',
          message: 'recordId must match /^VPDF-[A-Za-z0-9_-]+$/',
        });
        return;
      }

      const envelope = await opts.recordStore.get(recordId);
      if (!envelope) {
        reply.status(404).send({
          error: 'RECORD_NOT_FOUND',
          message: `No record named ${recordId}`,
        });
        return;
      }

      const payload = envelope.payload as { file?: VendorPdfFile };
      const file = payload?.file;
      if (!file || typeof file.stored_path !== 'string') {
        reply.status(404).send({
          error: 'RECORD_HAS_NO_BLOB',
          message: `Record ${recordId} has no file.stored_path`,
        });
        return;
      }

      const requestedPath = resolve(workspaceRootAbsolute, file.stored_path);
      const rel = relative(workspaceRootAbsolute, requestedPath);
      if (rel === '' || rel.startsWith('..')) {
        reply.status(400).send({
          error: 'PATH_TRAVERSAL',
          message: 'stored_path escapes the workspace root',
        });
        return;
      }

      let size: number;
      try {
        const stats = await stat(requestedPath);
        if (!stats.isFile()) {
          reply.status(404).send({
            error: 'BLOB_NOT_FOUND',
            message: 'stored_path does not resolve to a file',
          });
          return;
        }
        size = stats.size;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reply.status(404).send({
            error: 'BLOB_NOT_FOUND',
            message: `Blob at ${file.stored_path} does not exist on disk`,
          });
          return;
        }
        reply.status(500).send({
          error: 'BLOB_STAT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const contentType = file.media_type ?? 'application/pdf';
      reply
        .header('content-type', contentType)
        .header('content-length', String(size))
        // No range support for now — pdfjs falls back to a single GET.
        .header('accept-ranges', 'none')
        .header(
          'content-disposition',
          file.file_name ? `inline; filename="${file.file_name}"` : 'inline',
        );

      const stream = createReadStream(requestedPath);
      // `return reply.send(...)` is load-bearing for streams in async
      // handlers: without an explicit return Fastify resolves the handler's
      // promise to undefined and auto-sends that as the body, overwriting the
      // stream with a zero-byte reply.
      return reply.send(stream);
    },
  };
}

export type VendorPdfBlobHandlers = ReturnType<typeof createVendorPdfBlobHandlers>;