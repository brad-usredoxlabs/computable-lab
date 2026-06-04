/**
 * Workspace handlers — GET/PUT for per-study UI workspace state.
 *
 * Workspace state is a sidecar YAML at
 * `<recordsRoot>/studies/<studyId>/workspace.yaml`. It carries UI shape
 * (open tabs, pane widths, right-pane mode), not scientific data.
 *
 * - GET returns the file contents, falling back to a default state when
 *   the file is absent. Callers should never have to handle 404 specially.
 * - PUT writes the supplied state atomically (tmp file + rename), with no
 *   SHA-based optimistic locking. Last writer wins by design — the values
 *   are low-stakes and the debounced client throttles concurrent writes.
 *
 * The handler reaches the filesystem directly via fs/promises rather than
 * routing through the RecordStore. workspace.yaml is not a record and the
 * RecordStore's schema validation, lint pipeline, and pathing conventions
 * don't apply.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  defaultWorkspaceState,
  parseWorkspaceState,
  type WorkspaceState,
} from '../../workspace/types.js';

const STUDY_ID_PATTERN = /^STU-[A-Za-z0-9_-]+$/;

interface StudyIdParams {
  studyId: string;
}

/**
 * Build a handler bound to the absolute records root and records subdir
 * (typically `'records'`). These are resolved once at server startup and
 * passed in, mirroring how other handlers receive their dependencies.
 */
export function createWorkspaceHandlers(
  workspaceRoot: string,
  recordsDir: string,
) {
  const recordsRootAbsolute = resolve(workspaceRoot, recordsDir);

  function workspaceFilePath(studyId: string): string {
    return join(recordsRootAbsolute, 'studies', studyId, 'workspace.yaml');
  }

  function rejectInvalidStudyId(
    reply: FastifyReply,
    studyId: string | undefined,
  ): boolean {
    if (!studyId || !STUDY_ID_PATTERN.test(studyId)) {
      reply.status(400).send({
        error: 'INVALID_STUDY_ID',
        message: 'studyId must match /^STU-[A-Za-z0-9_-]+$/',
      });
      return true;
    }
    return false;
  }

  return {
    /**
     * GET /studies/:studyId/workspace
     * Returns the parsed workspace YAML or default state when absent.
     */
    async getWorkspace(
      request: FastifyRequest<{ Params: StudyIdParams }>,
      reply: FastifyReply,
    ): Promise<{ state: WorkspaceState } | undefined> {
      const { studyId } = request.params;
      if (rejectInvalidStudyId(reply, studyId)) return undefined;

      const filePath = workspaceFilePath(studyId);
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = parseYaml(content) as unknown;
        const state = parseWorkspaceState(parsed);
        if (!state) {
          // Malformed on-disk file — surface the default rather than 500.
          // The next PUT will overwrite, healing the file.
          return { state: defaultWorkspaceState(studyId) };
        }
        // The on-disk file may have been written for a different studyId
        // (file moved by hand). Always trust the URL.
        return { state: { ...state, studyId } };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return { state: defaultWorkspaceState(studyId) };
        }
        reply.status(500).send({
          error: 'WORKSPACE_READ_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return undefined;
      }
    },

    /**
     * PUT /studies/:studyId/workspace
     * Atomically writes the supplied state. Body must be the WorkspaceState
     * object directly (not wrapped). Returns the persisted state.
     */
    async putWorkspace(
      request: FastifyRequest<{ Params: StudyIdParams; Body: unknown }>,
      reply: FastifyReply,
    ): Promise<{ state: WorkspaceState } | undefined> {
      const { studyId } = request.params;
      if (rejectInvalidStudyId(reply, studyId)) return undefined;

      // Force the studyId in the body to match the URL — even if the client
      // posts a stale or wrong studyId we don't want to write it.
      const incoming =
        request.body && typeof request.body === 'object'
          ? { ...(request.body as Record<string, unknown>), studyId }
          : null;
      const state = parseWorkspaceState(incoming);
      if (!state) {
        reply.status(400).send({
          error: 'INVALID_WORKSPACE_STATE',
          message:
            'Body must be a WorkspaceState (studyId, tabs[], activeTabId, rightPaneMode, rightPaneCollapsed, paneWidths).',
        });
        return undefined;
      }

      const filePath = workspaceFilePath(studyId);
      try {
        await mkdir(dirname(filePath), { recursive: true });
        const tmpPath = join(
          dirname(filePath),
          `.workspace.yaml.${randomUUID()}.tmp`,
        );
        const yaml = stringifyYaml(state, { indent: 2 });
        await writeFile(tmpPath, yaml, 'utf-8');
        await rename(tmpPath, filePath);
        return { state };
      } catch (err) {
        reply.status(500).send({
          error: 'WORKSPACE_WRITE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return undefined;
      }
    },
  };
}

export type WorkspaceHandlers = ReturnType<typeof createWorkspaceHandlers>;
