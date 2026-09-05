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

export interface StorageBrowseParams {
  id: string;
}

export interface StorageBrowseQuery {
  path?: string;
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

  return { listDevices, browse };
}

export type StorageHandlers = ReturnType<typeof createStorageHandlers>;