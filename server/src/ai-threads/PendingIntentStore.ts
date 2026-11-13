/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpstore3) — the pending-intent checkpoint store: a
 * sibling of AiThreadStore, not a new subsystem. A parked prompt is persisted BESIDE
 * its chat thread at `{rootDir}/{userId}/{endpoint}/{scope}/{threadId}.checkpoint.json`
 * (tmp-then-rename) so a page reload, browser-back, or second tab still returns to
 * the pending prompt (Brad 2026-11-11: "Durable: stored with the chat thread").
 * Validation authority: checkpointContract.ts ONLY (the one Ajv seam — the store never
 * writes a document the contract would reject). Divergence: the committed
 * validateContextDelta takes no mode argument, so the injection-mode refusal is applied
 * HERE as the named `injection-refused` diagnostic (the committed module is the authority
 * and is not edited). Consumption-once (acceptance case e): resume's compare-and-set runs
 * under an in-process serialisation keyed by the checkpoint FILE PATH — a module-level
 * Map<string, Promise> chain shared by every store instance (two tabs = two instances; a
 * per-instance chain would let a double resume through); `version_conflict` is never
 * swallowed into load()'s null. Cross-process locking is OUT OF SCOPE (debt): a second
 * node needs an OS-level lock; the atomic tmp-then-rename write is NOT a lock.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateCheckpoint, validateContextDelta, type ContractDiagnostic, type ContextDelta, type PendingIntentCheckpoint } from '../compiler/journey/checkpointContract.js';
import { DEFAULT_THREAD_SCOPE, isValidThreadSegment } from './AiThreadStore.js';

export interface PendingIntentStoreOptions {
  rootDir: string;
  userId: string;
  endpoint: string;
  /** Absent scope lands under the reserved DEFAULT_THREAD_SCOPE segment (as for the sibling store). */
  scope?: string;
  threadId: string;
}

/** All REQUIRED: an absent field is a type error, never a silently-`undefined` receipt field (exactOptionalPropertyTypes). */
export interface ResumeInput { expectedVersion: number; receiptId: string; resumedAt: string; resumedBy: string; outcome: string }

export type SaveResult = { ok: true } | { ok: false; diagnostics: ContractDiagnostic[] };
export type ResumeResult = { ok: true; checkpoint: PendingIntentCheckpoint } | { ok: false; diagnostics: ContractDiagnostic[] };
export type AttachResult = { ok: true; delta: ContextDelta } | { ok: false; diagnostics: ContractDiagnostic[] };

/** Named store-level "no checkpoint" — distinct from version_conflict, so the caller can tell "none here" from "already resumed". */
const DIAG_NOT_FOUND: ContractDiagnostic = {
  code: 'checkpoint-not-found',
  path: '/checkpoint_id',
  message: 'no checkpoint document is stored for this thread: absent file, malformed JSON, or a mismatched checkpoint_id — never a fallback read of a sibling thread or "most recently updated"',
};

/** The CAS-loser diagnostic (store-level; the contract owns no store codes) — the message states WHICH rule refused. */
function versionConflict(message: string): ContractDiagnostic {
  return { code: 'version_conflict', path: '/concurrency_version', message };
}

/** In-process serialisation keyed by the checkpoint FILE PATH: a module-level Map<string, Promise> chain — every operation awaits the previous one on the same path. Module-level on purpose: the two-tab double-resume fires on two store instances, so a per-instance map would not order them. */
const chains = new Map<string, Promise<unknown>>();

export class PendingIntentStore {
  private readonly userId: string;
  private readonly endpoint: string;
  private readonly scopeSeg: string;
  private readonly threadId: string;
  private readonly filePath: string;

  constructor(options: PendingIntentStoreOptions) {
    this.userId = segment(options.userId, 'userId');
    this.endpoint = segment(options.endpoint, 'endpoint');
    // Sanitise with the sibling store's exported alphabet guard (one source of truth), so a `..` scope cannot escape rootDir.
    this.scopeSeg = segment(options.scope ?? DEFAULT_THREAD_SCOPE, 'scope');
    this.threadId = segment(options.threadId, 'threadId');
    this.filePath = join(options.rootDir, this.userId, this.endpoint, this.scopeSeg, `${this.threadId}.checkpoint.json`);
  }

  /** Order one operation on this file behind all previous ones; the chain never rejects, so a failure cannot wedge later ones. */
  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const prev = chains.get(this.filePath) ?? Promise.resolve();
    const run = prev.then(task);
    chains.set(this.filePath, run.then(() => undefined, () => undefined));
    return run;
  }

  /** validateCheckpoint FIRST (the contract is the only authority); refuse with its diagnostics on any rule; only then tmp-then-rename. */
  async save(checkpoint: unknown): Promise<SaveResult> {
    const result = validateCheckpoint(checkpoint);
    if (!result.valid) return { ok: false, diagnostics: result.diagnostics };
    await this.withLock(() => this.writeAtomic(result.checkpoint));
    return { ok: true };
  }

  /** Absent file, malformed JSON, or a mismatched checkpoint_id => null — NO-FALLBACK: never a sibling thread's file. */
  async load(checkpointId: string): Promise<PendingIntentCheckpoint | null> {
    const doc = await this.readDocument();
    return doc !== null && doc.checkpoint_id === checkpointId ? doc : null;
  }

  /** The compare-and-set under the same path lock: refuse with a named `version_conflict` when concurrency_version !== expectedVersion or status is already 'resumed'; else write status 'resumed' + the resume receipt + concurrency_version + 1. Exactly ONE call may win. */
  async resume(checkpointId: string, input: ResumeInput): Promise<ResumeResult> {
    return this.withLock(async () => {
      const doc = await this.readDocument();
      if (doc === null || doc.checkpoint_id !== checkpointId) return { ok: false, diagnostics: [DIAG_NOT_FOUND] };
      if (doc.concurrency_version !== input.expectedVersion) {
        return { ok: false, diagnostics: [versionConflict(`stored concurrency_version ${doc.concurrency_version} !== expected ${input.expectedVersion}: a concurrent resume won first`)] };
      }
      if (doc.status === 'resumed') {
        return { ok: false, diagnostics: [versionConflict(`checkpoint ${doc.checkpoint_id} was already resumed: its resume_receipt is authoritative and consumption is once-only`)] };
      }
      // Re-run the one seam on the result before it hits disk; receipt fields come from REQUIRED inputs (never `undefined`).
      const next = validateCheckpoint({
        ...doc,
        status: 'resumed',
        concurrency_version: doc.concurrency_version + 1,
        resume_receipt: {
          receipt_id: input.receiptId,
          resumed_at: input.resumedAt,
          resumed_by: input.resumedBy,
          outcome: input.outcome,
        },
      });
      if (!next.valid) return { ok: false, diagnostics: next.diagnostics };
      await this.writeAtomic(next.checkpoint);
      return { ok: true, checkpoint: next.checkpoint };
    });
  }

  /** Validate with the contract seam; REFUSE in injection mode a delta declaring request_revision (named `injection-refused`) — applied here because the committed validateContextDelta takes no mode argument. The named checkpoint must BE the parked document: read once, compare its own checkpoint_id (checkpoint-not-found on absent/mismatch, never a fallback). */
  async attachDelta(delta: unknown, checkpointId: string): Promise<AttachResult> {
    const result = validateContextDelta(delta);
    if (!result.valid) return { ok: false, diagnostics: result.diagnostics };
    if (result.delta.request_revision !== undefined) {
      return { ok: false, diagnostics: [{
        code: 'injection-refused',
        path: '/request_revision',
        message: 'delta declares request_revision: it would change the request quantity/targets/purpose, which forbids silent injection into the pending prompt',
      }] };
    }
    // One read into a local; the SAME NO-FALLBACK identity rule load()/resume() apply — the id in
    // the path is only a claim until the stored document's own checkpoint_id confirms it.
    const doc = await this.readDocument();
    if (doc === null || doc.checkpoint_id !== checkpointId) return { ok: false, diagnostics: [DIAG_NOT_FOUND] };
    return { ok: true, delta: result.delta };
  }

  /** Raw read: null on absent OR malformed JSON (never a partial interpretation); other I/O errors propagate. */
  private async readDocument(): Promise<PendingIntentCheckpoint | null> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as PendingIntentCheckpoint;
    } catch (err) {
      if (err instanceof SyntaxError || (err as NodeJS.ErrnoException).code === 'ENOENT') return null; // malformed or absent: NO-FALLBACK
      throw err;
    }
  }

  /** tmp-then-rename (the sibling store's idiom): a crash mid-write cannot leave a truncated file; atomic per OS, NOT a lock. */
  private async writeAtomic(doc: PendingIntentCheckpoint): Promise<void> {
    const finalPath = this.filePath;
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(doc, null, 2), 'utf8');
    await rename(tmpPath, finalPath);
  }
}

/** Refuse traversal / dots-only / non-alphabet segments via the sibling store's exported guard (one source of truth for the id alphabet). */
function segment(value: string, field: string): string {
  if (!isValidThreadSegment(value)) throw new Error(`${field} contains unsupported characters: ${value}`);
  return value;
}
