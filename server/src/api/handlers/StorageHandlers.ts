/**
 * StorageHandlers — HTTP bridge for external storage devices (S3 / NAS / USB).
 *
 * Exposes the device list (public, safe shape) and directory browsing so the
 * UI can let a lab scientist find an instrument output file on a mounted
 * device / bucket and later acquire it as a data-reference. Browse only touches
 * storage metadata (file names, sizes) — it never moves bytes into git.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { StorageError } from '../../storage/types.js';
import { acquireDataReference, type AcquireInput } from '../../storage/acquisition.js';

export interface StorageBrowseParams {
  id: string;
}

export interface StorageBrowseQuery {
  path?: string;
}

export interface AcquireBody {
  deviceId: string;
  path: string;
  title?: string;
  dataKind?: AcquireInput['dataKind'];
  format?: string;
  readerVersion?: string;
  acquisitionContext?: Record<string, unknown>;
  sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string };
}

export function createStorageHandlers(ctx: AppContext) {
  async function listDevices(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ devices: ctx.storageService.listDevices() });
  }

  async function browse(
    request: FastifyRequest<{ Params: StorageBrowseParams; Querystring: StorageBrowseQuery }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const path = request.query?.path ?? '';
    if (!ctx.storageService.has(id)) {
      return reply.status(404).send({
        success: false,
        error: `storage device not found: ${id}`,
      });
    }
    try {
      const entries = await ctx.storageService.browse(id, path);
      return reply.send({
        success: true,
        deviceId: id,
        path,
        entries,
      });
    } catch (err) {
      if (err instanceof StorageError) {
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 500).send({
          success: false,
          error: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  }

  async function acquire(
    request: FastifyRequest<{ Body: AcquireBody }>,
    reply: FastifyReply,
  ) {
    const body = request.body;
    if (!body || typeof body.deviceId !== 'string' || typeof body.path !== 'string' || body.path.trim() === '') {
      return reply.status(400).send({
        success: false,
        error: 'deviceId and path are required',
      });
    }
    const dataKind: AcquireInput['dataKind'] =
      body.dataKind &&
      ['table', 'signal', 'signal-collection', 'spatial-array', 'image', 'binary', 'metric'].includes(body.dataKind)
        ? body.dataKind
        : 'binary';

    try {
      const { recordId, payload } = await acquireDataReference(ctx, {
        deviceId: body.deviceId,
        path: body.path.trim(),
        ...(body.title ? { title: body.title } : {}),
        dataKind,
        ...(body.format ? { format: body.format } : {}),
        ...(body.readerVersion ? { readerVersion: body.readerVersion } : {}),
        ...(body.acquisitionContext ? { acquisitionContext: body.acquisitionContext } : {}),
        ...(body.sourceRunRef ? { sourceRunRef: body.sourceRunRef } : {}),
      });
      return reply.status(201).send({
        success: true,
        recordId,
        payload,
      });
    } catch (err) {
      if (err instanceof StorageError) {
        return reply.status(err.code === 'NOT_FOUND' ? 404 : 500).send({
          success: false,
          error: err.message,
          code: err.code,
        });
      }
      throw err;
    }
  }

  return { listDevices, browse, acquire };
}

export type StorageHandlers = ReturnType<typeof createStorageHandlers>;