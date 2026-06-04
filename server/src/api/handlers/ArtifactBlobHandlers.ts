/**
 * ArtifactBlobHandlers — serve the binary file referenced by an artifact
 * record (e.g. the actual PDF bytes for `artifactKind: 'pdf'`).
 *
 * The frontend's PdfViewer (Phase 5) needs a URL it can hand to pdfjs's
 * `getDocument()`. Rather than streaming the bytes through the JSON
 * records API, this dedicated endpoint lets pdfjs do a normal HTTP range
 * fetch with a proper content-type and content-length.
 *
 *   GET /studies/:studyId/artifacts/:artifactId/blob
 *     → 200  application/pdf (or whatever media_type the artifact has)
 *     → 404  artifact / blob not found
 *     → 400  studyId / artifactId malformed, or path-traversal attempted
 *
 * The route is study-scoped — even though the artifact's recordId is
 * globally unique, the URL shape lets us refuse to serve blobs belonging
 * to a different study than the URL claims, which is a useful defense
 * against link forging.
 *
 * Path-traversal protection: the artifact's `file.stored_path` must
 * resolve under the records workspace root after `resolve()`. Anything
 * that escapes (e.g. `../etc/passwd`) returns 400.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { RecordStore } from '../../store/types.js';

const STUDY_ID_PATTERN = /^STU-[A-Za-z0-9_-]+$/;
const ARTIFACT_ID_PATTERN = /^ART-[A-Za-z0-9_-]+$/;

interface Params {
  studyId: string;
  artifactId: string;
}

interface ArtifactFile {
  file_name?: string;
  media_type?: string;
  stored_path?: string;
}

interface ArtifactPayload {
  studyId?: string;
  artifactKind?: string;
  file?: ArtifactFile;
}

/**
 * Build a handler bound to the records workspace root + records subdir.
 * Both are resolved once at server startup and passed in.
 */
export function createArtifactBlobHandlers(
  store: RecordStore,
  workspaceRoot: string,
) {
  const workspaceRootAbsolute = resolve(workspaceRoot);

  return {
    async getArtifactBlob(
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply,
    ): Promise<void> {
      const { studyId, artifactId } = request.params;
      if (!STUDY_ID_PATTERN.test(studyId)) {
        reply.status(400).send({
          error: 'INVALID_STUDY_ID',
          message: 'studyId must match /^STU-[A-Za-z0-9_-]+$/',
        });
        return;
      }
      if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
        reply.status(400).send({
          error: 'INVALID_ARTIFACT_ID',
          message: 'artifactId must match /^ART-[A-Za-z0-9_-]+$/',
        });
        return;
      }

      const envelope = await store.get(artifactId);
      if (!envelope) {
        reply.status(404).send({
          error: 'ARTIFACT_NOT_FOUND',
          message: `No artifact named ${artifactId}`,
        });
        return;
      }

      const payload = envelope.payload as ArtifactPayload;
      if (envelope.meta?.kind !== 'artifact') {
        reply.status(404).send({
          error: 'NOT_AN_ARTIFACT',
          message: `${artifactId} is not an artifact record`,
        });
        return;
      }
      // Refuse if the URL's study doesn't match the artifact's parent
      // study — defends against link forging (artifactId enumeration).
      if (payload.studyId && payload.studyId !== studyId) {
        reply.status(404).send({
          error: 'ARTIFACT_NOT_IN_STUDY',
          message: `Artifact ${artifactId} does not belong to ${studyId}`,
        });
        return;
      }

      const file = payload.file;
      if (!file || typeof file.stored_path !== 'string') {
        reply.status(404).send({
          error: 'ARTIFACT_HAS_NO_BLOB',
          message: `Artifact ${artifactId} has no file.stored_path`,
        });
        return;
      }

      // Resolve under the workspace root and refuse anything that escapes.
      // `resolve()` normalizes absolute paths too (an absolute stored_path
      // would short-circuit the workspace root); `relative()` then gives
      // us `../...` for any escape, which is the signal we test against.
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
            message: `stored_path does not resolve to a file`,
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

      const contentType = file.media_type ?? 'application/octet-stream';
      reply
        .header('content-type', contentType)
        .header('content-length', String(size))
        // Tell pdfjs (and any other consumer) that range requests are NOT
        // supported by this simple implementation — pdfjs falls back to a
        // single GET. Range support could be added later if PDFs grow huge.
        .header('accept-ranges', 'none')
        .header(
          'content-disposition',
          file.file_name ? `inline; filename="${file.file_name}"` : 'inline',
        );

      const stream = createReadStream(requestedPath);
      // Fastify accepts a Readable directly via reply.send().
      reply.send(stream);
    },
  };
}

export type ArtifactBlobHandlers = ReturnType<typeof createArtifactBlobHandlers>;
