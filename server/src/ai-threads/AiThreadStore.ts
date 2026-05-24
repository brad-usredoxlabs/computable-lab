/**
 * AiThreadStore — transient, per-(user, endpoint) AI conversation storage.
 *
 * Live threads are stored as JSON files under `var/ai-threads/{userId}/{endpoint}.json`,
 * outside the records git tree. They survive reloads and device switches but
 * are not first-class records until they are promoted via the conversation
 * schema.
 *
 * Writes use a tmp-then-rename pattern so a crash mid-write cannot leave a
 * truncated file. When a thread grows past `snapshotThresholdMessages`, the
 * current file is rotated to a timestamped snapshot in the same directory
 * and the live file keeps the most recent `snapshotKeepTail` messages.
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
} from './types.js';

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

  /** Path for a user's thread file. Validates inputs to refuse traversal. */
  private threadPath(userId: string, endpoint: ApplianceEndpoint): string {
    const safeUser = sanitizeSegment(userId, 'userId');
    return join(this.rootDir, safeUser, `${endpoint}.json`);
  }

  /** Read a thread; return an empty thread when no file exists yet. */
  async getThread(userId: string, endpoint: ApplianceEndpoint): Promise<AiThread> {
    const path = this.threadPath(userId, endpoint);
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

  /** Append a single message and (optionally) any new mentions. */
  async append(
    userId: string,
    endpoint: ApplianceEndpoint,
    input: AppendMessageInput,
  ): Promise<AiThread> {
    const thread = await this.getThread(userId, endpoint);
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
      await this.rotateSnapshot(userId, endpoint, thread);
      thread.messages = thread.messages.slice(-this.snapshotKeepTail);
    }

    await this.writeAtomic(userId, endpoint, thread);
    return thread;
  }

  /** Clear the live thread (used after promote-to-record). */
  async clear(userId: string, endpoint: ApplianceEndpoint): Promise<void> {
    const thread = emptyThread(userId, endpoint);
    await this.writeAtomic(userId, endpoint, thread);
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
    thread: AiThread,
  ): Promise<void> {
    const finalPath = this.threadPath(userId, endpoint);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(thread, null, 2), 'utf8');
    await rename(tmpPath, finalPath);
  }

  private async rotateSnapshot(
    userId: string,
    endpoint: ApplianceEndpoint,
    thread: AiThread,
  ): Promise<void> {
    const safeUser = sanitizeSegment(userId, 'userId');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = join(this.rootDir, safeUser, `${endpoint}.${stamp}.snapshot.json`);
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
function sanitizeSegment(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${field} contains unsupported characters: ${value}`);
  }
  return value;
}

export { isApplianceEndpoint };
