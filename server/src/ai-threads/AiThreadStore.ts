/**
 * AiThreadStore — transient, per-(user, endpoint, scope, threadId) AI
 * conversation storage.
 *
 * Live threads are stored as JSON files under
 * `var/ai-threads/{userId}/{endpoint}/{scope}/{threadId}.json`, outside the
 * records git tree. They survive reloads and device switches but are not
 * first-class records until they are promoted via the conversation schema.
 *
 * L2-THREAD-SCOPED-1 (per-tab threads + the SUITEA-D3 deck-scope amendment):
 * the key is (userId, endpoint, scope, threadId). `scope` is an optional
 * sanitized path segment — surfaces with an instance identity (deck surface:
 * the loaded event-graph recordId) send it; surfaces without one are placed
 * under the reserved segment {@link DEFAULT_THREAD_SCOPE} ("_"). A DIRECTORY
 * per (user, endpoint, scope) makes the thread-list endpoint one readdir and
 * keeps snapshot files and the LEGACY flat `{user}/{endpoint}.json` files out
 * of the new namespace.
 *
 * NO-FALLBACK RULE (binding): an absent, malformed, or unknown threadId yields
 * a FRESH EMPTY thread. This store NEVER reads another thread of the same
 * (user, endpoint) — not the legacy flat file, not a sibling threadId, not
 * "most recently updated".
 *
 * Writes use a tmp-then-rename pattern so a crash mid-write cannot leave a
 * truncated file. When a thread grows past `snapshotThresholdMessages`, the
 * current file is rotated to a timestamped snapshot in the SAME scope
 * directory (never listed as a thread) and the live file keeps the most
 * recent `snapshotKeepTail` messages.
 *
 * The store is intentionally small and synchronous-ish. Phase 1 (`/browser`'s
 * JSON-LD index) introduces real durable infrastructure; this is the
 * lightweight predecessor for the AI dock's live thread.
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  isApplianceEndpoint,
  type AiThread,
  type ApplianceEndpoint,
  type AppendMessageInput,
  type ThreadMention,
  type ThreadMessage,
  type ThreadSummary,
} from './types.js';

/**
 * The reserved scope segment for surfaces WITHOUT an instance identity
 * (amendment A-1): a single store constant — sanitize-safe, recordId-
 * collision-free, never a per-surface literal.
 */
export const DEFAULT_THREAD_SCOPE = '_';

/** Thread-list title: first USER message, trimmed, truncated to this many chars. */
const THREAD_LIST_TITLE_MAX = 60;
const THREAD_LIST_TITLE_ELLIPSIS = '…';

/**
 * The EXACT snapshot-file naming the store generates in `rotateSnapshot`:
 * `{threadId}.{<ISO stamp, ':' and '.' replaced with '-'>}.snapshot.json`.
 * listThreads filters on THIS (not a bare `.snapshot.json` suffix) so the
 * snapshot namespace belongs to the store alone — a client-minted thread id
 * like `foo.snapshot` can never be hidden from the list (reviewer defect 7).
 */
const SNAPSHOT_FILE_PATTERN = /\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.snapshot\.json$/;

export interface AiThreadStoreOptions {
  rootDir: string;
  snapshotThresholdMessages?: number;
  snapshotKeepTail?: number;
}

const DEFAULT_THRESHOLD = 500;
const DEFAULT_KEEP_TAIL = 100;

export class AiThreadStore {
  private readonly rootDir: string;
  private readonly snapshotThresholdMessages: number;
  private readonly snapshotKeepTail: number;

  constructor(options: AiThreadStoreOptions) {
    this.rootDir = options.rootDir;
    this.snapshotThresholdMessages = options.snapshotThresholdMessages ?? DEFAULT_THRESHOLD;
    this.snapshotKeepTail = options.snapshotKeepTail ?? DEFAULT_KEEP_TAIL;
  }

  /**
   * Normalize a scope to its path segment: absent scope => the reserved
   * `DEFAULT_THREAD_SCOPE` segment; present scope => sanitized (traversal
   * refused). The reserved "_" is a VALID segment (it passes the alphabet),
   * so a client minting under "_" never trips the guard.
   */
  private scopeSegment(scope: string | undefined): string {
    if (typeof scope !== 'string' || scope.length === 0) return DEFAULT_THREAD_SCOPE;
    return sanitizeSegment(scope, 'scope');
  }

  /** Directory holding a (user, endpoint)'s threads: one per scope. */
  private threadRootDir(userId: string, endpoint: ApplianceEndpoint): string {
    const safeUser = sanitizeSegment(userId, 'userId');
    return join(this.rootDir, safeUser, endpoint);
  }

  /**
   * Path for a single thread file:
   * `var/ai-threads/{user}/{endpoint}/{scope}/{threadId}.json`.
   * Validates every segment to refuse traversal. The legacy flat
   * `{user}/{endpoint}.json` file is a SIBLING of the {endpoint}/ directory —
   * it is never produced or read by the thread-scoped path (OQ-3: abandoned,
   * not migrated, not read by any new path).
   */
  private threadPath(userId: string, endpoint: ApplianceEndpoint, scope: string | undefined, threadId: string): string {
    const safeThreadId = sanitizeSegment(threadId, 'threadId');
    return join(this.threadRootDir(userId, endpoint), this.scopeSegment(scope), `${safeThreadId}.json`);
  }

  /**
   * Stable-conversation file keyed by conversationId alone (NOT per-endpoint),
   * so a permanent chat keeps one identity across route/surface mounts.
   */
  private conversationPath(conversationId: string): string {
    const safe = sanitizeSegment(conversationId, 'conversationId');
    return join(this.rootDir, '_conversations', `${safe}.json`);
  }

  /** Read a conversation by its stable id; null when it does not exist yet. */
  async getConversation(conversationId: string): Promise<AiThread | null> {
    const path = this.conversationPath(conversationId);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AiThread>;
      return {
        conversationId,
        endpoint: (parsed.endpoint ?? 'event-editor') as ApplianceEndpoint,
        userId: parsed.userId ?? '',
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Read ONE thread: (userId, endpoint, scope, threadId). Returns an empty
   * thread when no file exists yet — a fresh thread, NOT another thread of the
   * same (user, endpoint). Absent scope is placed under the reserved "_"
   * segment. Malformed scope/threadId segments reject (the caller maps that to
   * fresh-empty semantics; never a fallback read).
   */
  async getThread(
    userId: string,
    endpoint: ApplianceEndpoint,
    scope: string | undefined,
    threadId: string,
  ): Promise<AiThread> {
    const path = this.threadPath(userId, endpoint, scope, threadId);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AiThread>;
      return {
        endpoint,
        userId,
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyThread(userId, endpoint);
      }
      throw err;
    }
  }

  /** Append a single message and (optionally) any new mentions.
   *
   * `threadId` is REQUIRED for thread addressing (D6): omitting it is a
   * type error, not a runtime `?? ''` that can only throw deeper down. It is
   * ignored on the conversationId escape-hatch path (the append lands on the
   * stable conversation file).
   */
  async append(
    userId: string,
    endpoint: ApplianceEndpoint,
    input: AppendMessageInput,
    scope: string | undefined,
    threadId: string,
  ): Promise<AiThread> {
    // Stable-conversation addressing: when a conversationId is supplied, the
    // append lands on THAT conversation regardless of the current endpoint
    // surface, so a permanent chat survives route/tab changes under one id.
    // (Escaped-hatch axis — untouched by L2-THREAD-SCOPED-1.)
    const conversationId = input.conversationId;
    const thread = conversationId
      ? (await this.getConversation(conversationId)) ?? {
          conversationId,
          endpoint,
          userId,
          messages: [],
          mentions: [],
          updatedAt: new Date(0).toISOString(),
        }
      : await this.getThread(userId, endpoint, scope, threadId);
    const message: ThreadMessage = {
      ...input.message,
      createdAt: input.message.createdAt ?? new Date().toISOString(),
    };
    thread.messages.push(message);
    if (input.mentions && input.mentions.length > 0) {
      thread.mentions = dedupeMentions([...thread.mentions, ...input.mentions]);
    }
    thread.updatedAt = message.createdAt;

    if (thread.messages.length > this.snapshotThresholdMessages) {
      await this.rotateSnapshot(userId, endpoint, thread, scope, threadId);
      thread.messages = thread.messages.slice(-this.snapshotKeepTail);
    }

    if (conversationId) {
      await this.writeConversationAtomic(conversationId, thread);
    } else {
      await this.writeAtomic(userId, endpoint, scope, threadId, thread);
    }
    return thread;
  }

  /**
   * Clear exactly ONE thread: (userId, endpoint, scope, threadId) — the
   * promoted thread and nothing else. Never the whole surface, never a
   * sibling thread, never the legacy flat file.
   */
  async clear(
    userId: string,
    endpoint: ApplianceEndpoint,
    scope: string | undefined,
    threadId: string,
  ): Promise<void> {
    const thread = emptyThread(userId, endpoint);
    await this.writeAtomic(userId, endpoint, scope, threadId, thread);
  }

  /**
   * List the CALLING user's threads for (endpoint, scope) only (amendment
   * A-3): a readdir of `var/ai-threads/{user}/{endpoint}/{scope}/`. Snapshot
   * files (`${threadId}.${stamp}.snapshot.json` siblings), other scopes, and
   * the legacy flat `{user}/{endpoint}.json` can never appear as threads.
   * Title = first USER message content, trimmed, truncated (pure store data —
   * no schema, no record type). Sorted updatedAt desc.
   */
  async listThreads(
    userId: string,
    endpoint: ApplianceEndpoint,
    scope: string | undefined,
  ): Promise<ThreadSummary[]> {
    const dir = join(this.threadRootDir(userId, endpoint), this.scopeSegment(scope));
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    // LIVE thread files only: `{threadId}.json`. Snapshot files are matched
    // by the EXACT naming the store itself generates —
    // `{threadId}.{<ISO stamp>}.snapshot.json` (see `rotateSnapshot`) — NOT
    // by the bare `.snapshot.json` suffix: a client-minted thread id is
    // arbitrary safe-alphabet text, so a thread legitimately named
    // `foo.snapshot` must stay visible forever (reviewer defect 7).
    const live = entries.filter((e) => e.isFile() && e.name.endsWith('.json') && !SNAPSHOT_FILE_PATTERN.test(e.name));
    const summaries: ThreadSummary[] = [];
    for (const entry of live) {
      const threadId = entry.name.slice(0, -'.json'.length);
      const thread = await this.getThread(userId, endpoint, scope, threadId);
      const firstUser = thread.messages.find((m) => m.role === 'user');
      const rawTitle = firstUser ? firstUser.content.trim() : '';
      summaries.push({
        threadId,
        title: threadTitle(rawTitle),
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length,
      });
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return summaries;
  }

  /** List existing user ids — useful for admin / debugging. */
  async listUsers(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAtomic(
    userId: string,
    endpoint: ApplianceEndpoint,
    scope: string | undefined,
    threadId: string,
    thread: AiThread,
  ): Promise<void> {
    const finalPath = this.threadPath(userId, endpoint, scope, threadId);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(thread, null, 2), 'utf8');
    await rename(tmpPath, finalPath);
  }

  /** tmp-then-rename write for a stable-conversation thread file. */
  private async writeConversationAtomic(conversationId: string, thread: AiThread): Promise<void> {
    const finalPath = this.conversationPath(conversationId);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(thread, null, 2), 'utf8');
    await rename(tmpPath, finalPath);
  }

  private async rotateSnapshot(
    userId: string,
    endpoint: ApplianceEndpoint,
    thread: AiThread,
    scope: string | undefined,
    threadId: string,
  ): Promise<void> {
    // Snapshots live in the SAME scope directory as the thread they rotated
    // (named `{threadId}.{stamp}.snapshot.json`) — never in the {user}/ dir,
    // and never matched by listThreads' live-file filter.
    const safeThreadId = sanitizeSegment(threadId, 'threadId');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = join(
      this.threadRootDir(userId, endpoint),
      this.scopeSegment(scope),
      `${safeThreadId}.${stamp}.snapshot.json`,
    );
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(thread, null, 2), 'utf8');
  }
}

function emptyThread(userId: string, endpoint: ApplianceEndpoint): AiThread {
  return {
    endpoint,
    userId,
    messages: [],
    mentions: [],
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * Thread-list title (spec §4.4): the first USER message content, trimmed,
 * truncated to THREAD_LIST_TITLE_MAX chars with an ellipsis. ONE named
 * constant applied generically — no message-shape branching, no per-surface
 * branches (reviewer bait #4).
 */
function threadTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= THREAD_LIST_TITLE_MAX) return trimmed;
  return `${trimmed.slice(0, THREAD_LIST_TITLE_MAX)}${THREAD_LIST_TITLE_ELLIPSIS}`;
}

function dedupeMentions(mentions: ThreadMention[]): ThreadMention[] {
  const seen = new Set<string>();
  const out: ThreadMention[] = [];
  for (const m of mentions) {
    const key = `${m.kind}:${m.ref.recordId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Reject path traversal, empty segments, and anything but a safe id alphabet. */
const THREAD_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Dots-only segments ("." and ".." — any run of dots and nothing else) are
 * REFUSED even though the alphabet technically admits dots: "." is a no-op
 * path hop and ".." ESCAPES the {endpoint} directory into {user}/, which is
 * exactly the legacy-flat-file fallback the NO-FALLBACK RULE forbids
 * (adversarial review L2-THREAD-SCOPED-1 defect 2). Checked inside the ONE
 * alphabet guard so both the handler (isValidThreadSegment) and the store
 * (sanitizeSegment) refuse it — a malformed scope maps to FRESH-EMPTY "_"
 * semantics at the handler, never to another scope's (or the legacy) file.
 */
const DOTS_ONLY_SEGMENT_PATTERN = /^\.+$/;

/**
 * True when the value is a SAFE single path segment (the store's id
 * alphabet): non-empty, no traversal, only [A-Za-z0-9._-], and NOT a
 * dots-only segment ("." / ".."). Exported so the HTTP handler can map an
 * absent/malformed header to FRESH-EMPTY semantics (never 4xx, never a
 * fallback read) with the SAME alphabet the store sanitizes with — one
 * source of truth, no second validator.
 */
export function isValidThreadSegment(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && THREAD_SEGMENT_PATTERN.test(value)
    && !DOTS_ONLY_SEGMENT_PATTERN.test(value)
  );
}

function sanitizeSegment(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (!isValidThreadSegment(value)) {
    throw new Error(`${field} contains unsupported characters: ${value}`);
  }
  return value;
}

export { isApplianceEndpoint };
