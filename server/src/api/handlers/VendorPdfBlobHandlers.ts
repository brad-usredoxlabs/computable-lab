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
import { vendorPdfPageDir, vendorPdfPageFileName } from '../../vendor-documents/pdfAcquisition.js';
import { documentFormatFor } from '../../extract/decodeAttachment.js';

const RECORD_ID_PATTERN = /^VPDF-[A-Za-z0-9_-]+$/;
// pageNumber is a NUMBER before it is ever a path fragment: a non-numeric
// value (../.., encoded traversal, absolute path, huge) is refused with 404
// BEFORE any filesystem contact (plan B3 / bait 2).
const PAGE_NUMBER_PATTERN = /^\d{1,6}$/;
// §B2 pins the rasterizer's kept output pages as `page-NNN.png` (pdftoppm
// -png). The media type for that extension still comes from the config map.
const RASTER_PAGE_EXTENSION = 'png';

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

    /**
     * DOCINGEST-B B3 — serve ONE kept page image of an image-kind vendor-pdf
     * record: GET /vendor-pdfs/:recordId/page/:pageNumber.
     *
     * The page dir is reconstructed from the record's own stored_path via the
     * ONE naming convention (vendorPdfPageDir — the same helper the
     * acquisition writer uses; a second convention would be a defect). The
     * guard mirrors getVendorPdfBlob's resolve+prefix shape exactly (:78-86):
     * the resolved page file must sit inside the workspace AND inside the
     * record's own page dir. Only `source.mediaKind === 'image'` records have
     * page images; everything else is an honest 404.
     */
    async getPageImage(
      request: FastifyRequest<{ Params: { recordId: string; pageNumber: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const { recordId, pageNumber } = request.params;
      if (!RECORD_ID_PATTERN.test(recordId)) {
        reply.status(400).send({
          error: 'INVALID_RECORD_ID',
          message: 'recordId must match /^VPDF-[A-Za-z0-9_-]+$/',
        });
        return;
      }
      // Regex BEFORE filesystem contact: '../..', encoded traversal, absolute
      // paths, non-numeric, and absurd numbers all 404 here.
      if (!PAGE_NUMBER_PATTERN.test(pageNumber)) {
        reply.status(404).send({
          error: 'PAGE_NOT_FOUND',
          message: `pageNumber must be a positive integer (got ${JSON.stringify(pageNumber)})`,
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

      const payload = envelope.payload as { file?: VendorPdfFile; source?: { mediaKind?: string } };
      if (payload?.source?.mediaKind !== 'image') {
        reply.status(404).send({
          error: 'PAGE_NOT_FOUND',
          message: `Record ${recordId} is not an image-kind document — it has no page images`,
        });
        return;
      }
      const file = payload?.file;
      if (!file || typeof file.stored_path !== 'string') {
        reply.status(404).send({
          error: 'RECORD_HAS_NO_BLOB',
          message: `Record ${recordId} has no file.stored_path`,
        });
        return;
      }

      // The page dir comes from the record's own stored bytes: the artifact
      // file name is <sha12>.<ext> (upload handler), so the sha12 the writer
      // used is recoverable from stored_path.
      const storedPath = resolve(workspaceRootAbsolute, file.stored_path);
      const storedRel = relative(workspaceRootAbsolute, storedPath);
      if (storedRel === '' || storedRel.startsWith('..')) {
        reply.status(400).send({
          error: 'PATH_TRAVERSAL',
          message: 'stored_path escapes the workspace root',
        });
        return;
      }
      const baseName = storedPath.slice(storedPath.lastIndexOf('/') + 1)
      const sha12 = baseName.split('.')[0] ?? ''
      if (!/^[A-Za-z0-9]{1,64}$/.test(sha12)) {
        reply.status(404).send({
          error: 'PAGE_NOT_FOUND',
          message: 'stored_path does not name a content-addressed artifact',
        });
        return;
      }
      // Which page file the writer kept: a direct photo upload keeps its own
      // config-declared image extension (a .jpg stays .jpg); a rasterized scan
      // writes the rasterizer's output pages (§B2: page-001.png). Try the
      // record's own extension first when it IS an image format, then the
      // raster output. Both come from the config-declared format map.
      const ownFormat = await documentFormatFor(`page.${baseName.split('.')[1]?.toLowerCase() ?? ''}`);
      const rasterFormat = await documentFormatFor(`page.${RASTER_PAGE_EXTENSION}`);
      const candidates = [
        ...(ownFormat?.mediaKind === 'image' ? [{ extension: ownFormat.extension, mediaType: ownFormat.mediaType }] : []),
        ...(rasterFormat ? [{ extension: rasterFormat.extension, mediaType: rasterFormat.mediaType }] : []),
      ];
      if (candidates.length === 0) {
        reply.status(404).send({
          error: 'PAGE_NOT_FOUND',
          message: 'no page-image format is declared in config/ingestion/document-extraction.yaml',
        });
        return;
      }

      const pageDir = vendorPdfPageDir(workspaceRootAbsolute, sha12);
      let pagePath = resolve(pageDir, vendorPdfPageFileName(Number(pageNumber), candidates[0]!.extension));
      let contentType = candidates[0]!.mediaType;
      for (const candidate of candidates) {
        const candidatePath = resolve(pageDir, vendorPdfPageFileName(Number(pageNumber), candidate.extension));
        const rel = relative(pageDir, candidatePath);
        if (rel === '' || rel.startsWith('..')) {
          reply.status(400).send({
            error: 'PATH_TRAVERSAL',
            message: 'page path escapes the record\u2019s page directory',
          });
          return;
        }
        try {
          const stats = await stat(candidatePath);
          if (stats.isFile()) {
            pagePath = candidatePath;
            contentType = candidate.mediaType;
            break;
          }
        } catch {
          // try the next candidate; a missing page surfaces as 404 below
        }
      }

      let size: number;
      try {
        const stats = await stat(pagePath);
        if (!stats.isFile()) {
          reply.status(404).send({ error: 'PAGE_NOT_FOUND', message: `No page image ${pageNumber} for ${recordId}` });
          return;
        }
        size = stats.size;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reply.status(404).send({ error: 'PAGE_NOT_FOUND', message: `No page image ${pageNumber} for ${recordId}` });
          return;
        }
        reply.status(500).send({
          error: 'PAGE_STAT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      // Honest content-type: resolved above from the config-declared format
      // map for whichever page file actually exists (a kept .jpg page is
      // served as image/jpeg, a rasterized scan page as image/png).
      reply
        .header('content-type', contentType)
        .header('content-length', String(size))
        .header('accept-ranges', 'none');
      const stream = createReadStream(pagePath);
      // Same load-bearing `return reply.send(stream)` as getVendorPdfBlob.
      return reply.send(stream);
    },
  };
}

export type VendorPdfBlobHandlers = ReturnType<typeof createVendorPdfBlobHandlers>;