/**
 * WorkspaceSessionStore — the persisted workspace session (tmux-style attach).
 *
 * One YAML file per user: `var/sessions/{userId}/main.yaml`. Transient UI state,
 * outside the records git tree (same class of thing as var/ai-threads/*).
 * Writes are tmp-then-rename so a crash cannot leave a truncated session.
 *
 * Conflict policy: last writer wins, but the stored `updatedAt` is returned so a
 * device attaching later can decide to adopt the server's copy.
 *
 * Named WorkspaceSessionStore (not SessionStore) because AppContext already has
 * a `sessionStore` — the LOGIN session. These are unrelated.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface StoredWorkspaceSession {
  version: 1;
  userId: string;
  tabs: unknown[];
  activeTabId: string | null;
  updatedAt: string;
}

const empty = (userId: string): StoredWorkspaceSession => ({
  version: 1,
  userId,
  tabs: [],
  activeTabId: null,
  updatedAt: new Date(0).toISOString(),
});

/** Refuse traversal — the userId arrives from a request header. */
function sanitizeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`invalid session path segment: ${value}`);
  }
  return value;
}

export class WorkspaceSessionStore {
  private readonly rootDir: string;

  constructor(workspaceRoot: string) {
    this.rootDir = resolve(workspaceRoot, 'var', 'sessions');
  }

  private filePath(userId: string): string {
    return join(this.rootDir, sanitizeSegment(userId), 'main.yaml');
  }

  /** Read a user's session; an absent file yields the empty session. */
  async get(userId: string): Promise<StoredWorkspaceSession> {
    try {
      const raw = await readFile(this.filePath(userId), 'utf8');
      const parsed = parseYaml(raw) as Partial<StoredWorkspaceSession> | null;
      if (!parsed || typeof parsed !== 'object') return empty(userId);
      return {
        version: 1,
        userId,
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
        activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return empty(userId);
      throw err;
    }
  }

  /** Whole-session upsert (last writer wins). */
  async put(userId: string, tabs: unknown[], activeTabId: string | null): Promise<StoredWorkspaceSession> {
    const next: StoredWorkspaceSession = {
      version: 1,
      userId,
      tabs,
      activeTabId,
      updatedAt: new Date().toISOString(),
    };
    const path = this.filePath(userId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, stringifyYaml(next), 'utf8');
    await rename(tmp, path);
    return next;
  }
}
