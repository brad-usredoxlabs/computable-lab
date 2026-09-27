/**
 * LabSyncHandlers — /api/lab-sync/* admin/observability surface.
 *
 * Mirrors the execution-poller route shape: status / poll-once / start /
 * stop, plus an outbound push-once. When lab-sync is unconfigured the worker
 * is absent and routes report a disabled status rather than 404 (the UI can
 * render a consistent panel).
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { LabSyncWorker } from '../../lab-sync/LabSyncWorker.js'
import type { ApiError } from '../types.js'

export interface LabSyncHandlerDeps {
  /** Null when config.labSync is absent/incomplete — worker never fabricated. */
  worker: LabSyncWorker | null
}

export function createLabSyncHandlers(deps: LabSyncHandlerDeps) {
  const { worker } = deps

  return {
    /**
     * GET /lab-sync/status
     */
    async status(): Promise<{ status: Record<string, unknown> }> {
      if (!worker) {
        return { status: { enabled: false, running: false, cursor: 0, errorStreak: 0 } }
      }
      return { status: (await worker.status()) as unknown as Record<string, unknown> }
    },

    /**
     * POST /lab-sync/poll-once
     * One pull->translate->ack cycle (bypasses the interval timer).
     */
    async pollOnce(_request: FastifyRequest, reply: FastifyReply): Promise<Record<string, unknown> | ApiError> {
      if (!worker) {
        reply.status(503)
        return { error: 'LAB_SYNC_DISABLED', message: 'labSync not configured (enabled + token + baseUrl)' }
      }
      try {
        const summary = await worker.pollOnce()
        return { summary: summary as unknown as Record<string, unknown> }
      } catch (err) {
        reply.status(502)
        return { error: 'LAB_SYNC_FETCH_FAILED', message: err instanceof Error ? err.message : String(err) }
      }
    },

    /**
     * POST /lab-sync/push-once
     * Push pending outbound events to the website now.
     */
    async pushOnce(_request: FastifyRequest, reply: FastifyReply): Promise<Record<string, unknown> | ApiError> {
      if (!worker) {
        reply.status(503)
        return { error: 'LAB_SYNC_DISABLED', message: 'labSync not configured' }
      }
      try {
        const result = await worker.pushOutbound()
        return { pushed: result.pushed, failed: result.failed }
      } catch (err) {
        reply.status(502)
        return { error: 'LAB_SYNC_PUSH_FAILED', message: err instanceof Error ? err.message : String(err) }
      }
    },

    /**
     * POST /lab-sync/start  — begin the background loop.
     */
    async start(_request: FastifyRequest, reply: FastifyReply): Promise<Record<string, unknown> | ApiError> {
      if (!worker) {
        reply.status(503)
        return { error: 'LAB_SYNC_DISABLED', message: 'labSync not configured' }
      }
      await worker.start()
      return { status: (await worker.status()) as unknown as Record<string, unknown> }
    },

    /**
     * POST /lab-sync/stop — stop the background loop.
     */
    async stop(_request: FastifyRequest, reply: FastifyReply): Promise<Record<string, unknown> | ApiError> {
      if (!worker) {
        reply.status(503)
        return { error: 'LAB_SYNC_DISABLED', message: 'labSync not configured' }
      }
      await worker.stop()
      return { status: (await worker.status()) as unknown as Record<string, unknown> }
    },
  }
}

export type LabSyncHandlers = ReturnType<typeof createLabSyncHandlers>
