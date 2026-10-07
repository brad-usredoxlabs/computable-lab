/**
 * WorkstateJournal — the APPROVED option (a) ledger core (PB-CH-8, spec §1).
 *
 * An append-only, content-hashed workstate-SNAPSHOT journal under
 * `var/sessions/{userId}/journal/`, driven by a declarative capture/tag/
 * retention policy YAML (schema/workflow/workstate-journal.policy.yaml).
 * Pure filesystem module: no record store, no Fastify, no knowledge-layer
 * adjacency (decision §4.1 — a snapshot is NOT a `record-revision` and never
 * enters the records git tree).
 *
 * THE policy file is THE source of truth: every threshold (interval, window,
 * actor rule, caps, idFields, anchor) is a data read PER CALL (the
 * `config/drafting/workstate-tab-kinds.yaml` precedent — hot-reload without
 * restart). File absent ⇒ capture DISABLED, never defaulted (decision §4.2).
 * There is deliberately NO policy constant in TypeScript.
 *
 * Capture is best-effort like `AuditEventService.ts:38-40`: failures are
 * logged, never thrown at the caller (the PUT stays 200-green). Appends are
 * single-writer-per-capture (decision §4.7): an in-module per-user promise
 * queue + unique-seq filenames + atomic tmp+rename (the exact
 * `WorkspaceSessionStore.ts:84-86` pattern). No read-modify-write.
 *
 * Read-time integrity re-verification follows the `RecordRevisionService.ts:
 * 54-61` pattern: a corrupt entry is SKIPPED and surfaced as an `integrity`
 * diagnostic, never silently replaced by a neighbor.
 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { contentHash } from '../revisions/RecordRevisionService.js';
import type { StoredWorkspaceSession } from './WorkspaceSessionStore.js';

// ============================================================================
// Entry + policy shapes
// ============================================================================

export interface WorkstateSnapshotEntry {
  journalVersion: 1;
  seq: number;
  /** Server clock at capture — the same instant as the linkage window T. */
  capturedAt: string;
  /** resolveRequestUser userId — never 'default' (decision §4.3). */
  actor: string;
  /** contentHash(snapshot) — RecordRevisionService.ts:23 canonical(). */
  contentHash: string;
  /** Byte-canonical transport doc, exactly as put() would write it. */
  snapshot: StoredWorkspaceSession;
  /** Server-known EVT-… ids; OMITTED when zero (exactOptionalPropertyTypes). */
  links?: string[];
}

/** The interpreted policy (shape only — the YAML declares the values). */
export interface JournalPolicy {
  journalVersion: number;
  capture: {
    enabled: boolean;
    minIntervalMs: number;
    requireResolvedActor: boolean;
    skipUnchanged: boolean;
  };
  linkage: {
    windowMs: number;
    requireSameActor: boolean;
    maxLinks: number;
    idFields: string[];
  };
  retention: {
    maxEntries: number;
    maxAgeDays: number;
  };
  query: {
    anchor: 'latest' | 'earliest';
  };
}

/** The audit seam: production passes `{ list: () => ctx.store.list({ kind: 'audit-event' }) }`. */
export interface AuditEventLike {
  recordId: string;
  actor: string;
  action: string;
  subjectId: string;
  occurredAt: string;
}
export interface AuditSourceLike {
  list(filter: { kind: 'audit-event' }): Promise<readonly AuditEventLike[]>;
}

export interface IntegrityNote {
  file: string;
  reason: string;
}

export type AsOfResult =
  | { status: 'found'; asOf: string; capturedAt: string; links?: string[]; snapshot: StoredWorkspaceSession; integrity: IntegrityNote[] }
  | { status: 'no-history'; asOf: string; reason: 'policy-disabled' | 'journal-empty' | 'predates-first-capture' | 'pruned'; integrity: IntegrityNote[] };

export type CaptureSkipReason = 'policy-disabled' | 'actor-unresolved' | 'interval' | 'unchanged' | 'capture-error';

export type CaptureResult =
  | { captured: true; entry: WorkstateSnapshotEntry }
  | { captured: false; reason: CaptureSkipReason };

export interface WorkstateJournalOptions {
  workspaceRoot: string;
  /** Absolute path to schema/workflow/workstate-journal.policy.yaml. */
  policyPath: string;
  auditSource: AuditSourceLike;
  /** Server clock override (tests pin it); default = new Date().toISOString(). */
  now?: () => string;
}

// ============================================================================
// Internals
// ============================================================================

/** Refuse traversal — the userId arrives from a resolved actor (same rule as the store). */
function sanitizeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`invalid journal path segment: ${value}`);
  }
  return value;
}

const ENTRY_FILE_RE = /^(\d{6})-(.+)\.yaml$/;

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`workstate journal policy: ${context} must be a non-empty string`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`workstate journal policy: ${context} must be a finite number`);
  }
  return value;
}

function requiredBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`workstate journal policy: ${context} must be a boolean`);
  }
  return value;
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`workstate journal policy: ${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Interpret the policy YAML. A missing file ⇒ null ⇒ capture DISABLED
 * (decision §4.2: "removing the policy YAML must leave capture disabled, not
 * defaulting"). A malformed file is treated the same way (honest off, never a
 * silent default). NEVER cached — re-read per capture/prune/query call.
 */
function interpretPolicy(raw: unknown): JournalPolicy | null {
  if (raw === null || raw === undefined) return null;
  try {
    const doc = asObject(raw, 'document');
    const capture = asObject(doc.capture, 'capture');
    const linkage = asObject(doc.linkage, 'linkage');
    const retention = asObject(doc.retention, 'retention');
    const query = asObject(doc.query, 'query');
    const anchor = requiredString(query.anchor, 'query.anchor');
    if (anchor !== 'latest' && anchor !== 'earliest') {
      throw new Error('workstate journal policy: query.anchor must be "latest" or "earliest"');
    }
    const idFields = linkage.idFields;
    if (!Array.isArray(idFields) || !idFields.every((f) => typeof f === 'string' && f.trim().length > 0)) {
      throw new Error('workstate journal policy: linkage.idFields must be an array of non-empty strings');
    }
    return {
      journalVersion: requiredNumber(doc.journalVersion, 'journalVersion'),
      capture: {
        enabled: requiredBoolean(capture.enabled, 'capture.enabled'),
        minIntervalMs: requiredNumber(capture.minIntervalMs, 'capture.minIntervalMs'),
        requireResolvedActor: requiredBoolean(capture.requireResolvedActor, 'capture.requireResolvedActor'),
        skipUnchanged: requiredBoolean(capture.skipUnchanged, 'capture.skipUnchanged'),
      },
      linkage: {
        windowMs: requiredNumber(linkage.windowMs, 'linkage.windowMs'),
        requireSameActor: requiredBoolean(linkage.requireSameActor, 'linkage.requireSameActor'),
        maxLinks: requiredNumber(linkage.maxLinks, 'linkage.maxLinks'),
        idFields: idFields.map((f) => String(f).trim()),
      },
      retention: {
        maxEntries: requiredNumber(retention.maxEntries, 'retention.maxEntries'),
        maxAgeDays: requiredNumber(retention.maxAgeDays, 'retention.maxAgeDays'),
      },
      query: { anchor },
    };
  } catch (err) {
    console.warn(`WorkstateJournal: policy file invalid — capture treated as DISABLED: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Shape check for a parsed entry file (integrity re-verification is separate). */
function validEntryShape(parsed: unknown): parsed is WorkstateSnapshotEntry {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const e = parsed as Record<string, unknown>;
  return (
    e.journalVersion === 1 &&
    typeof e.seq === 'number' &&
    Number.isInteger(e.seq) &&
    typeof e.capturedAt === 'string' &&
    typeof e.actor === 'string' &&
    typeof e.contentHash === 'string' &&
    !!e.snapshot &&
    typeof e.snapshot === 'object' &&
    !Array.isArray(e.snapshot) &&
    (e.links === undefined || (Array.isArray(e.links) && e.links.every((l) => typeof l === 'string')))
  );
}

interface JournalFileRecord {
  file: string;
  seq: number;
  entry: WorkstateSnapshotEntry | null;
  integrity: IntegrityNote | null;
}

// ============================================================================
// The journal
// ============================================================================

export class WorkstateJournal {
  private readonly rootDir: string;
  private readonly policyPath: string;
  private readonly auditSource: AuditSourceLike;
  private readonly now: () => string;
  /** Single-writer-per-capture per user (decision §4.7; withRecordLock precedent). */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(opts: WorkstateJournalOptions) {
    this.rootDir = resolve(opts.workspaceRoot, 'var', 'sessions');
    this.policyPath = opts.policyPath;
    this.auditSource = opts.auditSource;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  private journalDir(userId: string): string {
    return join(this.rootDir, sanitizeSegment(userId), 'journal');
  }

  /** THE policy read — per call, never cached (verification 9 proves policy-off). */
  private readPolicy(): JournalPolicy | null {
    try {
      // Sync read keeps the read strictly per-call (the workstateCompile.ts
      // readFileSync precedent for config/drafting/workstate-tab-kinds.yaml).
      const raw = parseYaml(readFileSync(this.policyPath, 'utf8'));
      return interpretPolicy(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      console.warn(`WorkstateJournal: policy file unreadable — capture treated as DISABLED: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** All entry files for a user, ordered by seq; corrupt files carry an integrity note. */
  private async readJournalFiles(userId: string): Promise<JournalFileRecord[]> {
    const dir = this.journalDir(userId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const records: JournalFileRecord[] = [];
    for (const file of names) {
      const match = ENTRY_FILE_RE.exec(file);
      if (!match) continue;
      const seq = Number(match[1]);
      let raw: string;
      try {
        raw = await readFile(join(dir, file), 'utf8');
      } catch {
        records.push({ file, seq, entry: null, integrity: { file, reason: 'entry file unreadable' } });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = parseYaml(raw);
      } catch {
        records.push({ file, seq, entry: null, integrity: { file, reason: 'entry YAML unparseable' } });
        continue;
      }
      if (!validEntryShape(parsed)) {
        records.push({ file, seq, entry: null, integrity: { file, reason: 'entry shape invalid' } });
        continue;
      }
      const entry = parsed as WorkstateSnapshotEntry;
      if (contentHash(entry.snapshot) !== entry.contentHash) {
        records.push({ file, seq, entry: null, integrity: { file, reason: `contentHash mismatch (read-time re-verification failed)` } });
        continue;
      }
      records.push({ file, seq, entry, integrity: null });
    }
    records.sort((a, b) => a.seq - b.seq);
    return records;
  }

  /**
   * THE capture decision (route call site: after validation, after store.put
   * succeeds). Every branch below is a policy-data read — zero hardcoded
   * policy branches (reviewer bait #3).
   */
  async maybeCapture(input: { userId: string; actor: string | null; snapshot: StoredWorkspaceSession }): Promise<CaptureResult> {
    // Serialize per user: two raced PUTs land as distinct seq files, never torn.
    const previous = this.queues.get(input.userId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.captureInner(input));
    this.queues.set(input.userId, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(input.userId) === next) this.queues.delete(input.userId);
    }
  }

  private async captureInner(input: { userId: string; actor: string | null; snapshot: StoredWorkspaceSession }): Promise<CaptureResult> {
    try {
      const policy = this.readPolicy();
      if (!policy || !policy.capture.enabled) return { captured: false, reason: 'policy-disabled' };

      // Actor rule is DATA (capture.requireResolvedActor): the 'default'
      // fallback and unresolved actors never capture (decision §4.3). main.yaml
      // LWW behavior for the fallback is byte-unchanged — that is the route's
      // store.put, which already happened.
      if (policy.capture.requireResolvedActor && (input.actor === null || input.actor === 'default')) {
        return { captured: false, reason: 'actor-unresolved' };
      }

      const files = await this.readJournalFiles(input.userId);
      const valid = files.filter((f) => f.entry !== null);
      const last = valid[valid.length - 1] ?? null;

      // T: the server clock, SAME instant as capturedAt and the window (§4.4).
      const tIso = this.now();
      const tMs = Date.parse(tIso);

      // Debounce floor (capture.minIntervalMs).
      if (last && tMs - Date.parse(last.entry!.capturedAt) < policy.capture.minIntervalMs) {
        return { captured: false, reason: 'interval' };
      }

      // Dedupe-on-existing (RecordRevisionService precedent).
      const newHash = contentHash(input.snapshot);
      if (policy.capture.skipUnchanged && last && contentHash(last.entry!.snapshot) === newHash) {
        return { captured: false, reason: 'unchanged' };
      }

      // Capture-window linkage (§4.4) — the ONE interpreted-logic item:
      // ids come from the snapshot's tab payloads at the policy-declared
      // idFields; candidates are server-known audit events inside the window
      // with a subjectId match (and actor match when required). The model
      // never contributes an id: there is no code path accepting a caller-supplied link.
      const ids = collectIdFields(input.snapshot.tabs, policy.linkage.idFields);
      const windowStart = Math.max(
        last ? Date.parse(last.entry!.capturedAt) + 1 : Number.NEGATIVE_INFINITY,
        tMs - policy.linkage.windowMs,
      );
      let links: string[] = [];
      if (ids.size > 0) {
        const auditEvents = await this.auditSource.list({ kind: 'audit-event' });
        const matched: string[] = [];
        for (const event of auditEvents) {
          const occurredMs = Date.parse(event.occurredAt);
          if (!Number.isFinite(occurredMs)) continue;
          if (occurredMs < windowStart || occurredMs > tMs) continue;
          if (!ids.has(event.subjectId)) continue;
          if (policy.linkage.requireSameActor && event.actor !== input.actor) continue;
          matched.push(event.recordId);
          if (matched.length >= policy.linkage.maxLinks) break;
        }
        links = matched;
      }

      // seq = max existing seq + 1 from the directory listing (corrupt files
      // still occupy their seq — append-only, never renumbered).
      const maxSeq = files.reduce((max, f) => Math.max(max, f.seq), 0);
      const seq = maxSeq + 1;
      const entry: WorkstateSnapshotEntry = {
        journalVersion: 1,
        seq,
        capturedAt: tIso,
        actor: input.actor ?? 'default',
        contentHash: newHash,
        snapshot: input.snapshot,
        ...(links.length > 0 ? { links } : {}),
      };

      const dir = this.journalDir(input.userId);
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${String(seq).padStart(6, '0')}-${randomUUID()}.yaml`);
      // Atomic append: the exact WorkspaceSessionStore.ts:84-86 tmp+rename pattern.
      const tmp = `${path}.${randomUUID()}.tmp`;
      await writeFile(tmp, stringifyYaml(entry), 'utf8');
      await rename(tmp, path);

      // Retention after each capture — best-effort, whole files only (§4.9).
      await this.prune(input.userId, policy, path, tMs).catch((err) => {
        console.warn(`WorkstateJournal: retention prune failed for ${input.userId}: ${err instanceof Error ? err.message : String(err)}`);
      });

      return { captured: true, entry };
    } catch (err) {
      // Capture is best-effort (AuditEventService.ts:38-40 mirror): logged, never fails the PUT.
      console.warn(`WorkstateJournal: capture failed for ${input.userId}: ${err instanceof Error ? err.message : String(err)}`);
      return { captured: false, reason: 'capture-error' };
    }
  }

  /** Retention: remove WHOLE journal files only, oldest seq first, never the
   *  just-appended file, never rewrite or reorder a retained file (decision §4.9). */
  private async prune(userId: string, policy: JournalPolicy, justAppendedPath: string, tMs: number): Promise<void> {
    const dir = this.journalDir(userId);
    const files = await this.readJournalFiles(userId);
    const ageCutoff = tMs - policy.retention.maxAgeDays * 86_400_000;
    const survivors = new Set<string>(files.map((f) => f.file));

    // Age cap: only entries whose capturedAt is readable can be age-assessed;
    // a corrupt entry is never age-deleted (its bytes are not trusted).
    for (const f of files) {
      const path = join(dir, f.file);
      if (path === justAppendedPath) continue;
      if (f.entry && Date.parse(f.entry.capturedAt) < ageCutoff) {
        await unlink(path);
        survivors.delete(f.file);
      }
    }

    // Count cap: oldest seq first (files are seq-ordered), never the just-appended file.
    let count = survivors.size;
    for (const f of files) {
      if (count <= policy.retention.maxEntries) break;
      const path = join(dir, f.file);
      if (path === justAppendedPath) continue;
      if (!survivors.has(f.file)) continue;
      await unlink(path);
      survivors.delete(f.file);
      count -= 1;
    }
  }

  /**
   * asOf(t): newest entry with capturedAt ≤ t, ties break by SEQ (never
   * content order). Read-time contentHash re-verification per entry
   * (RecordRevisionService.ts:54-61 pattern); corrupt entries are SKIPPED and
   * surfaced as `integrity` diagnostics, never silently replaced.
   */
  async asOf(userId: string, t: string): Promise<AsOfResult> {
    const policy = this.readPolicy();
    if (!policy || !policy.capture.enabled) {
      return { status: 'no-history', asOf: t, reason: 'policy-disabled', integrity: [] };
    }
    const files = await this.readJournalFiles(userId);
    const integrity = files.filter((f) => f.integrity).map((f) => f.integrity!);
    const valid = files.filter((f) => f.entry !== null);
    if (valid.length === 0) {
      return { status: 'no-history', asOf: t, reason: 'journal-empty', integrity };
    }
    const tMs = Date.parse(t);
    const atOrBefore = valid.filter((f) => Date.parse(f.entry!.capturedAt) <= tMs);
    if (atOrBefore.length === 0) {
      const oldest = valid[0]!;
      // A seq gap at the oldest end means history existed and was pruned —
      // say so honestly rather than claiming the journal was always this short.
      const reason = oldest.seq > 1 ? 'pruned' : 'predates-first-capture';
      return { status: 'no-history', asOf: t, reason, integrity };
    }
    // Ties break by seq: the highest seq at-or-before t wins, never file order.
    const chosen = atOrBefore[atOrBefore.length - 1]!;
    const entry = chosen.entry!;
    return {
      status: 'found',
      asOf: t,
      capturedAt: entry.capturedAt,
      ...(entry.links && entry.links.length > 0 ? { links: entry.links } : {}),
      snapshot: entry.snapshot,
      integrity,
    };
  }

  /** Honest policy state for the query side (ledgerQuery uses this to answer
   *  `no-history reason:policy-disabled` without pretending to read history). */
  policyDisabled(): boolean {
    const policy = this.readPolicy();
    return !policy || !policy.capture.enabled;
  }

  /** The declared query anchor (policy data; ledgerQuery reads it, never hardcodes). */
  queryAnchor(): 'latest' | 'earliest' {
    const policy = this.readPolicy();
    return policy ? policy.query.anchor : 'latest';
  }
}

/**
 * Collect the strings a snapshot's tab payloads carry at the policy-declared
 * idFields (linkage.idFields is DATA — mirroring config/drafting/
 * workstate-tab-kinds.yaml idField vocabulary). Dedup, insertion order kept.
 */
function collectIdFields(tabs: readonly unknown[], idFields: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) continue;
    for (const field of idFields) {
      const value = (tab as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim().length > 0) ids.add(value.trim());
    }
  }
  return ids;
}
