/**
 * RecordStoreImpl — Implementation of RecordStore.
 * 
 * This class orchestrates:
 * - YAML parsing/serialization (via RecordParser)
 * - Schema validation (via AjvValidator)
 * - Lint validation (via LintEngine)
 * - File operations (via RepoAdapter)
 * 
 * It has NO schema-specific logic. All domain rules live in specs.
 */

import { controlledContent, withRecordLock } from '../revisions/RecordRevisionService.js';
import type { ValidationResult, LintResult } from '../types/common.js';
import type { RecordEnvelope, RecordMeta } from '../types/RecordEnvelope.js';
import type { RepoAdapter } from '../repo/types.js';
import type { AjvValidator } from '../validation/AjvValidator.js';
import type { LintEngine } from '../lint/LintEngine.js';
import type {
  RecordStore,
  RecordStoreConfig,
  RecordStoreWriteHook,
  StoreResult,
  RecordFilter,
  CreateRecordOptions,
  UpdateRecordOptions,
  DeleteRecordOptions,
  GetRecordOptions,
  SeedPromotion,
} from './types.js';
import {
  detectLifecycleBypass,
  type BypassLifecycleReader,
  type BypassAuditAppender,
} from '../lifecycle/BypassAudit.js';
import {
  parseRecord,
  serializeRecord,
} from './RecordParser.js';
import {
  generatePath,
  isNestedKind,
  parseRecordPath,
} from '../repo/PathConvention.js';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: Required<Omit<RecordStoreConfig, 'writeHook'>> = {
  baseDir: 'records',
  author: 'record-store',
  email: 'store@computable-lab.com',
  seedDir: '',
  appendOnlyKinds: [],
};

/**
 * RecordStoreImpl — Full implementation of RecordStore.
 */
type ResolvedConfig = Required<Omit<RecordStoreConfig, 'writeHook'>> &
  Pick<RecordStoreConfig, 'writeHook'>;

/** Late-bound collaborators for the lifecycle-bypass audit detector. */
export interface LifecycleBypassAuditCollaborator {
  engine: BypassLifecycleReader;
  audit: BypassAuditAppender;
}

export class RecordStoreImpl implements RecordStore {
  private config: ResolvedConfig;
  private readonly repo: RepoAdapter;
  private readonly validator: AjvValidator;
  private readonly lintEngine: LintEngine;
  private lifecycleBypassAudit?: LifecycleBypassAuditCollaborator;
  
  // Cache: recordId -> { path, sha }
  private readonly pathCache: Map<string, { path: string; sha: string }> = new Map();
  private readonly seedPathCache: Map<string, string> = new Map();
  
  constructor(
    repo: RepoAdapter,
    validator: AjvValidator,
    lintEngine: LintEngine,
    config: RecordStoreConfig = {}
  ) {
    this.repo = repo;
    this.validator = validator;
    this.lintEngine = lintEngine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach (or detach with `null`) a write-side hook. Lets the server wire
   * up dependent indexers (e.g. the JSON-LD index) after the store has been
   * constructed — necessary because the projector depends on UI specs that
   * are loaded after the store.
   */
  setWriteHook(hook: RecordStoreWriteHook | null): void {
    if (hook) this.config.writeHook = hook;
    else delete this.config.writeHook;
  }

  /**
   * Attach (or detach with `null`) the lifecycle-bypass audit collaborator.
   * Lazily bound like setWriteHook: the lifecycle engine and audit service
   * are constructed after the store in server.ts. When wired, a successful
   * update() that flips the lifecycle state of a managed record WITHOUT the
   * viaLifecycleApi marker self-reports a lifecycle_state_bypass audit event.
   */
  setLifecycleBypassAudit(collab: LifecycleBypassAuditCollaborator | null): void {
    if (collab) this.lifecycleBypassAudit = collab;
    else delete this.lifecycleBypassAudit;
  }


  /**
   * Find the file path for a record by ID.
   * Searches the records directory for a matching file.
   */
  private async findRecordPath(recordId: string): Promise<{ path: string; sha: string } | null> {
    // Check cache first
    const cached = this.pathCache.get(recordId);
    if (cached) {
      // Verify file still exists
      const exists = await this.repo.fileExists(cached.path);
      if (exists) {
        return cached;
      }
      this.pathCache.delete(recordId);
    }
    
    // Search for the file
    const files = await this.repo.listFiles({
      directory: this.config.baseDir,
      pattern: '*.yaml',
      recursive: true,
    });
    
    for (const filePath of files) {
      const parsed = parseRecordPath(filePath);
      if (parsed?.recordId === recordId) {
        const file = await this.repo.getFile(filePath);
        if (file) {
          const entry = { path: filePath, sha: file.sha };
          this.pathCache.set(recordId, entry);
          return entry;
        }
      }
    }

    // Filename-convention miss: records whose filenames lack the
    // `{recordId}__{slug}` shape (hand-authored or imported files) are
    // invisible to the path scan above but perfectly parseable — list() and
    // the library index read content and DO see them, which made get-by-id
    // disagree with search about which records exist. Fall back to content
    // identity so every path agrees; the path cache makes repeats cheap.
    for (const filePath of files) {
      if (parseRecordPath(filePath)) continue; // covered by the scan above
      const file = await this.repo.getFile(filePath);
      if (!file) continue;
      const result = parseRecord(file.content, filePath);
      if (result.success && result.envelope?.recordId === recordId) {
        const entry = { path: filePath, sha: file.sha };
        this.pathCache.set(recordId, entry);
        return entry;
      }
    }

    return null;
  }

  private findSeedRecordPath(recordId: string): string | null {
    if (!this.config.seedDir) return null;
    const cached = this.seedPathCache.get(recordId);
    if (cached) {
      try {
        if (statSync(cached).isFile()) return cached;
      } catch {
        this.seedPathCache.delete(recordId);
      }
    }

    const stack = [this.config.seedDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }

      for (const name of entries) {
        const fullPath = join(dir, name);
        let isDirectory = false;
        let isFile = false;
        try {
          const stat = statSync(fullPath);
          isDirectory = stat.isDirectory();
          isFile = stat.isFile();
        } catch {
          continue;
        }
        if (isDirectory) {
          stack.push(fullPath);
          continue;
        }
        if (!isFile || (!name.endsWith('.yaml') && !name.endsWith('.yml'))) continue;
        try {
          const parsed = parseRecord(readFileSync(fullPath, 'utf-8'), fullPath);
          if (parsed.success && parsed.envelope?.recordId === recordId) {
            this.seedPathCache.set(recordId, fullPath);
            return fullPath;
          }
        } catch {
          // Skip malformed seed files.
        }
      }
    }
    return null;
  }

  /**
   * Adapter fingerprint convention (EmbeddedGitRepoAdapter.ts:39,
   * GitRepoAdapter.ts:199, LocalRepoAdapter.ts:28): sha256 hex, first 40
   * chars. Reused EXACTLY for the seed content fingerprint — no second hash
   * format.
   */
  private static contentFingerprint(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 40);
  }

  /**
   * Merge hierarchical refs from `payload.links` and top-level studyId/
   * experimentId/runId into the single links object PathConvention expects
   * (shared by createUnlocked and the seed promotion path so both land at
   * the same `{recordId}__{slug}.yaml` convention).
   */
  private linksFromPayload(payload: Record<string, unknown>):
    | { studyId?: string; experimentId?: string; runId?: string }
    | undefined {
    const nestedLinks = (payload.links ?? {}) as {
      studyId?: string;
      experimentId?: string;
      runId?: string;
    };
    const mergedLinks: {
      studyId?: string;
      experimentId?: string;
      runId?: string;
    } = {
      ...nestedLinks,
      ...(typeof payload.studyId === 'string'
        ? { studyId: payload.studyId }
        : {}),
      ...(typeof payload.experimentId === 'string'
        ? { experimentId: payload.experimentId }
        : {}),
      ...(typeof payload.runId === 'string' ? { runId: payload.runId } : {}),
    };
    return Object.keys(mergedLinks).length > 0 ? mergedLinks : undefined;
  }

  /**
   * The append-only wall (governance triple + config-injected kinds, §3.2).
   * Shared verbatim between the working-copy path and the seed-candidate
   * path so a seed payload hits the IDENTICAL wall before promotion.
   * Generic evaluation — no domain kinds.
   */
  private appendOnlyWallError(storedPayload: Record<string, unknown> | undefined): StoreResult | null {
    if (['record-revision', 'signature', 'audit-event', ...(this.config.appendOnlyKinds ?? [])].includes(String(storedPayload?.kind))) {
      return { success: false, error: 'APPEND_ONLY: immutable records cannot be updated' };
    }
    return null;
  }

  /**
   * The content lock (lifecycleId + controlled state + changed controlled
   * content). Shared verbatim between the working-copy path and the
   * seed-candidate path.
   */
  private contentLockError(storedPayload: Record<string, unknown> | undefined, incomingPayload: unknown): StoreResult | null {
    if (storedPayload?.lifecycleId && ['approved', 'effective', 'superseded', 'archived'].includes(String(storedPayload.state)) && controlledContent(storedPayload) !== controlledContent(incomingPayload)) {
      return { success: false, error: 'CONTROLLED_RECORD_LOCKED: create a new draft before editing controlled content' };
    }
    return null;
  }

  /**
   * QMS7-2: read a seed candidate for the promotion path. Returns the seed
   * file's content and its adapter-convention fingerprint, or null when no
   * seed file resolves the id. READ-ONLY: the seed file is only ever read
   * here — no code path may open records/seed/** for writing.
   */
  private readSeedCandidate(recordId: string): { path: string; content: string; fingerprint: string } | null {
    const seedPath = this.findSeedRecordPath(recordId);
    if (!seedPath) return null;
    try {
      const content = readFileSync(seedPath, 'utf-8');
      return { path: seedPath, content, fingerprint: RecordStoreImpl.contentFingerprint(content) };
    } catch {
      return null;
    }
  }

  private getSeedRecord(recordId: string): RecordEnvelope | null {
    const seedPath = this.findSeedRecordPath(recordId);
    if (!seedPath) return null;
    try {
      const parsed = parseRecord(readFileSync(seedPath, 'utf-8'), seedPath);
      if (!parsed.success || !parsed.envelope) return null;
      return {
        ...parsed.envelope,
        meta: {
          ...parsed.envelope.meta,
          path: seedPath,
          commitSha: 'seed',
        },
      };
    } catch {
      return null;
    }
  }
  
  /**
   * Get a record by ID.
   */
  async get(recordId: string): Promise<RecordEnvelope | null> {
    const entry = await this.findRecordPath(recordId);
    if (!entry) {
      return this.getSeedRecord(recordId);
    }

    const file = await this.repo.getFile(entry.path);
    if (!file) {
      return null;
    }

    const result = parseRecord(file.content, entry.path);
    if (!result.success || !result.envelope) {
      return null;
    }

    // Add meta info
    return {
      ...result.envelope,
      meta: {
        ...result.envelope.meta,
        path: entry.path,
        commitSha: file.sha,
        contentSha: file.sha,
        ...(file.gitCommit ? { gitCommit: file.gitCommit } : {}),
      },
    };
  }

  async getByPath(path: string): Promise<RecordEnvelope | null> {
    const file = await this.repo.getFile(path);
    if (!file) {
      return null;
    }

    const result = parseRecord(file.content, path);
    if (!result.success || !result.envelope) {
      return null;
    }

    // Prime the path cache so a subsequent get() by recordId is also fast.
    this.pathCache.set(result.envelope.recordId, { path, sha: file.sha });

    return {
      ...result.envelope,
      meta: {
        ...result.envelope.meta,
        path,
        commitSha: file.sha,
        contentSha: file.sha,
        ...(file.gitCommit ? { gitCommit: file.gitCommit } : {}),
      },
    };
  }
  
  /**
   * Get a record with validation/lint results.
   */
  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = await this.get(options.recordId);
    
    if (!envelope) {
      return {
        success: false,
        error: `Record not found: ${options.recordId}`,
      };
    }
    
    const result: StoreResult = {
      success: true,
      envelope,
    };
    
    if (options.validate) {
      result.validation = await this.validate(envelope);
    }
    
    if (options.lint) {
      result.lint = await this.lint(envelope);
    }
    
    return result;
  }
  
  /**
   * Read seed record envelopes from a local directory.
   * Only returns records whose recordId is NOT already in `existing`.
   */
  private listSeedRecords(dir: string, existing: Set<string>): RecordEnvelope[] {
    const results: RecordEnvelope[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return results; // directory doesn't exist for this kind
    }
    for (const name of entries) {
      if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
      try {
        const fullPath = join(dir, name);
        const content = readFileSync(fullPath, 'utf-8');
        const parsed = parseRecord(content, fullPath);
        if (!parsed.success || !parsed.envelope) continue;
        if (existing.has(parsed.envelope.recordId)) continue;
        results.push({
          ...parsed.envelope,
          meta: {
            ...parsed.envelope.meta,
            path: fullPath,
            commitSha: 'seed',
          },
        });
      } catch {
        // skip malformed seed files
      }
    }
    return results;
  }

  /**
   * List records.
   */
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    // Determine search directory. Most kinds live flat under `records/{kind}/`
    // and can be scanned non-recursively. Nested kinds (artifacts, event-graphs)
    // are stored inside parent record directories, so they need a recursive
    // sweep from the base dir and a post-filter on envelope.kind.
    const nested = filter?.kind ? isNestedKind(filter.kind) : false;
    const searchDir = filter?.kind && !nested
      ? `${this.config.baseDir}/${filter.kind}`
      : this.config.baseDir;

    const files = await this.repo.listFiles({
      directory: searchDir,
      pattern: '*.yaml',
      recursive: !filter?.kind || nested,
    });

    const envelopes: RecordEnvelope[] = [];

    for (const filePath of files) {
      // Apply prefix filter if specified
      if (filter?.idPrefix) {
        const parsed = parseRecordPath(filePath);
        if (!parsed?.recordId.startsWith(filter.idPrefix)) {
          continue;
        }
      }

      const file = await this.repo.getFile(filePath);
      if (!file) continue;

      const result = parseRecord(file.content, filePath);
      if (!result.success || !result.envelope) continue;

      // For nested kinds the directory walk yields everything under baseDir,
      // so we have to filter by the payload's own kind (carried on
      // envelope.meta.kind by RecordParser). parseRecordPath can't tell us
      // this — the parent directory name (e.g. "artifacts") isn't the
      // record kind ("artifact").
      if (nested && result.envelope.meta?.kind !== filter?.kind) {
        continue;
      }

      // Apply schema filter if specified
      if (filter?.schemaId && result.envelope.schemaId !== filter.schemaId) {
        continue;
      }

      envelopes.push({
        ...result.envelope,
        meta: {
          ...result.envelope.meta,
          path: filePath,
          commitSha: file.sha,
        contentSha: file.sha,
        ...(file.gitCommit ? { gitCommit: file.gitCommit } : {}),
        },
      });

      // Apply offset
      if (filter?.offset && envelopes.length <= filter.offset) {
        envelopes.shift();
        continue;
      }

      // Apply limit
      if (filter?.limit && envelopes.length >= filter.limit) {
        break;
      }
    }

    // Merge built-in seed records that don't exist in the connected repo.
    if (this.config.seedDir && filter?.kind) {
      const seedKindDir = join(this.config.seedDir, filter.kind);
      const existing = new Set(envelopes.map((e) => e.recordId));
      const seedEnvelopes = this.listSeedRecords(seedKindDir, existing);
      for (const env of seedEnvelopes) {
        if (filter.idPrefix && !env.recordId.startsWith(filter.idPrefix)) continue;
        if (filter.schemaId && env.schemaId !== filter.schemaId) continue;
        envelopes.push(env);
      }
    }

    return envelopes;
  }
  
  /**
   * Create a new record.
   */
  async getVerifiedCommit(recordId: string, expectedSha?: string): Promise<string | undefined> {
    const entry = await this.findRecordPath(recordId);
    if (!entry || !expectedSha) return undefined;
    if ((await this.repo.getFile(entry.path))?.sha !== expectedSha) return undefined;
    const commit = await this.repo.getVerifiedCommit?.(entry.path);
    return (await this.repo.getFile(entry.path))?.sha === expectedSha ? commit : undefined;
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    return withRecordLock(this, `write:${options.envelope.recordId}`, () => this.createUnlocked(options));
  }

  private async createUnlocked(options: CreateRecordOptions): Promise<StoreResult> {
    const { envelope, message, skipValidation, skipLint } = options;
    
    // Check if record already exists
    const existing = await this.findRecordPath(envelope.recordId);
    if (existing) {
      return {
        success: false,
        error: `Record already exists: ${envelope.recordId}`,
      };
    }
    
    // Validate if not skipped
    let validation: ValidationResult | undefined;
    if (!skipValidation) {
      validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          success: false,
          validation,
          error: 'Validation failed',
        };
      }
    }
    
    // Lint if not skipped
    let lint: LintResult | undefined;
    if (!skipLint) {
      lint = await this.lint(envelope);
      if (!lint.valid) {
        return {
          success: false,
          lint,
          error: 'Lint failed with errors',
        };
      }
    }
    
    // Extract kind from payload
    const payload = envelope.payload as Record<string, unknown>;
    const kind = payload.kind as string || envelope.meta?.kind || 'unknown';
    const title = payload.title as string || payload.name as string || '';
    
    // Extract links from payload. Records carry hierarchical refs either
    // nested under `payload.links` or at the top level (e.g. experiment
    // schemas put `studyId` at the top; artifact does the same). Merge both
    // shapes so PathConvention sees a single `links` object regardless of
    // schema style.
    const links = this.linksFromPayload(payload);
    
    // Generate path
    const path = generatePath({
      recordId: envelope.recordId,
      kind,
      slug: title,
      baseDir: this.config.baseDir,
      ...(links !== undefined ? { links } : {}),
    });
    
    // Serialize to YAML
    const content = serializeRecord(envelope);
    
    // Create file
    const commitMessage = message || `Create ${envelope.recordId}`;
    const result = await this.repo.createFile({
      path,
      content,
      message: commitMessage,
      author: this.config.author,
      email: this.config.email,
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create file',
      };
    }
    
    // Update cache
    if (result.commit) {
      this.pathCache.set(envelope.recordId, { path, sha: result.commit.sha });
    }
    
    // Build meta without undefined values
    const newMeta: RecordMeta = {
      ...envelope.meta,
      path,
      ...(await this.repo.getFile(path).then(file => file ? { commitSha: file.sha, contentSha: file.sha, ...(file.gitCommit ? { gitCommit: file.gitCommit } : {}) } : {})),
    };

    const finalEnvelope = { ...envelope, meta: newMeta };
    await this.fireUpsertHook(finalEnvelope);

    return {
      success: true,
      envelope: finalEnvelope,
      ...(validation !== undefined ? { validation } : {}),
      ...(lint !== undefined ? { lint } : {}),
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
    };
  }

  /**
   * Fire the upsert hook, swallowing errors so a misbehaving indexer cannot
   * fail an otherwise successful write. The hook is logged on error so we
   * can spot indexer drift; the write itself remains authoritative.
   */
  private async fireUpsertHook(envelope: RecordEnvelope): Promise<void> {
    const hook = this.config.writeHook;
    if (!hook) return;
    try {
      await hook.onUpsert(envelope);
    } catch (err) {
      console.warn(
        `RecordStore writeHook.onUpsert failed for ${envelope.recordId}:`,
        err,
      );
    }
  }

  private async fireDeleteHook(recordId: string): Promise<void> {
    const hook = this.config.writeHook;
    if (!hook) return;
    try {
      await hook.onDelete(recordId);
    } catch (err) {
      console.warn(
        `RecordStore writeHook.onDelete failed for ${recordId}:`,
        err,
      );
    }
  }

  /**
   * Update an existing record.
   */
  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    return withRecordLock(this, `write:${options.envelope.recordId}`, () => this.updateUnlocked(options));
  }

  private async updateUnlocked(options: UpdateRecordOptions): Promise<StoreResult> {
    const { envelope, expectedSha, message, skipValidation, skipLint } = options;
    
    // Find existing record in the working data dir.
    const existing = await this.findRecordPath(envelope.recordId);

    // QMS7-2 copy-on-write: when the working scan misses, consult the seed
    // dir. The read paths (get()'s seed fallback, list()'s seed merge) DO
    // resolve seed records — the write path must agree about which records
    // exist. A seed hit is a CANDIDATE promotion: the SAME walls run against
    // the seed payload before anything durable, and only a fully authorized,
    // valid write copies the seed content into the data dir. The seed file
    // is only ever read.
    let target:
      | { mode: 'working'; path: string; content: string; sha: string }
      | { mode: 'seed'; path: string; content: string; fingerprint: string };
    if (existing) {
      const file = await this.repo.getFile(existing.path);
      if (!file) {
        return {
          success: false,
          error: `File not found: ${existing.path}`,
        };
      }
      target = { mode: 'working', path: existing.path, content: file.content, sha: file.sha };
    } else {
      const candidate = this.readSeedCandidate(envelope.recordId);
      if (!candidate) {
        return {
          success: false,
          error: `Record not found: ${envelope.recordId}`,
        };
      }
      target = { mode: 'seed', ...candidate };
    }
    
    const storedPayload = parseRecord(target.content, target.path).envelope?.payload as Record<string, unknown> | undefined;
    // Governance triple hardcoded here + config-injected kinds (§3.2): the
    // SAME list the record API walls read, so an API-bypassing service hits
    // the identical store-level wall. Generic evaluation, no domain kinds.
    // QMS7-2: evaluated against the seed payload too, BEFORE any promotion.
    const appendOnly = this.appendOnlyWallError(storedPayload);
    if (appendOnly) return appendOnly;

    const contentLock = this.contentLockError(storedPayload, envelope.payload);
    if (contentLock) return contentLock;

    // Snapshot the previous payload for the lifecycle-bypass detector
    // (only parsed when the detector is wired — otherwise zero cost).
    let previousPayload: unknown;
    if (this.lifecycleBypassAudit) {
      const prev = parseRecord(target.content, target.path);
      if (prev.success) previousPayload = prev.envelope?.payload;
    }
    
    // Check expected SHA if provided. For a seed candidate the stored
    // fingerprint is the seed content's fingerprint, and the seed read path
    // stamps commitSha 'seed' (getSeedRecord sets no contentSha), so the
    // literal 'seed' token the handler echoes counts as matching (OQ3).
    const storedSha = target.mode === 'working' ? target.sha : target.fingerprint;
    const sha = expectedSha || storedSha;
    if (expectedSha && expectedSha !== storedSha && !(target.mode === 'seed' && expectedSha === 'seed')) {
      return {
        success: false,
        error: `SHA mismatch: expected ${expectedSha}, got ${storedSha}`,
      };
    }
    
    // Validate if not skipped
    let validation: ValidationResult | undefined;
    if (!skipValidation) {
      validation = await this.validate(envelope);
      if (!validation.valid) {
        return {
          success: false,
          validation,
          error: 'Validation failed',
        };
      }
    }
    
    // Lint if not skipped
    let lint: LintResult | undefined;
    if (!skipLint) {
      lint = await this.lint(envelope);
      if (!lint.valid) {
        return {
          success: false,
          lint,
          error: 'Lint failed with errors',
        };
      }
    }
    
    // Serialize to YAML
    const content = serializeRecord(envelope);
    
    // Update file — or, for a seed candidate, PROMOTE: a single createFile
    // at the generatePath convention (same as createUnlocked, so the fast
    // path-scan resolves it afterwards). create-or-fail is the durability
    // wall: nothing before this point touched the repo, and a failed
    // createFile commits nothing — no half-written window, zero residue on
    // refusal. The commit message carries the provenance in human-visible
    // form.
    const commitMessage = message
      || (target.mode === 'seed'
        ? `Promote seed record ${envelope.recordId} from ${target.path} (seed content ${target.fingerprint})`
        : `Update ${envelope.recordId}`);
    const promotionPath = target.mode === 'seed'
      ? generatePath({
          recordId: envelope.recordId,
          kind: String((envelope.payload as Record<string, unknown>).kind ?? envelope.meta?.kind ?? 'unknown'),
          slug: String((envelope.payload as Record<string, unknown>).title ?? (envelope.payload as Record<string, unknown>).name ?? ''),
          baseDir: this.config.baseDir,
          ...(this.linksFromPayload(envelope.payload as Record<string, unknown>) !== undefined
            ? { links: this.linksFromPayload(envelope.payload as Record<string, unknown>)! }
            : {}),
        })
      : target.path;

    const result = target.mode === 'seed'
      ? await this.repo.createFile({
          path: promotionPath,
          content,
          message: commitMessage,
          author: this.config.author,
          email: this.config.email,
        })
      : await this.repo.updateFile({
          path: promotionPath,
          content,
          message: commitMessage,
          sha,
          author: this.config.author,
          email: this.config.email,
        });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || (target.mode === 'seed' ? 'Failed to promote seed record' : 'Failed to update file'),
      };
    }
    
    // Update cache
    if (result.commit) {
      this.pathCache.set(envelope.recordId, { path: promotionPath, sha: result.commit.sha });
    }

    // Lifecycle-bypass self-report (spec §10 gap): the write committed, the
    // gate was never consulted, and the lifecycle state flipped — record
    // that fact. Fire-and-forget: never blocks or fails the business write.
    const collab = this.lifecycleBypassAudit;
    if (collab) {
      const nextPayload = envelope.payload;
      const lifecycleId =
        nextPayload && typeof nextPayload === 'object'
          ? (nextPayload as Record<string, unknown>).lifecycleId
          : undefined;
      if (typeof lifecycleId === 'string' && collab.engine.isLoaded(lifecycleId)) {
        // Actor resolution: options.actor (caller-declared) → envelope meta
        // updatedBy (not a declared RecordMeta field today; probed defensively)
        // → meta.createdBy (nearest declared provenance) → 'unknown'.
        const metaAny = envelope.meta as Record<string, unknown> | undefined;
        const actor =
          options.actor ??
          (typeof metaAny?.updatedBy === 'string' ? metaAny.updatedBy : undefined) ??
          envelope.meta?.createdBy ??
          'unknown';
        const event = detectLifecycleBypass(collab.engine, {
          previousPayload,
          nextPayload,
          ...(options.viaLifecycleApi !== undefined ? { viaLifecycleApi: options.viaLifecycleApi } : {}),
          actor,
          recordId: envelope.recordId,
        });
        if (event) {
          void collab.audit.append(event).catch(() => {});
        }
      }
    }
    
    // Build meta without undefined values
    const updatedMeta: RecordMeta = {
      ...envelope.meta,
      path: promotionPath,
      ...(await this.repo.getFile(promotionPath).then(file => file ? { commitSha: file.sha, contentSha: file.sha, ...(file.gitCommit ? { gitCommit: file.gitCommit } : {}) } : {})),
    };

    const finalEnvelope = { ...envelope, meta: updatedMeta };
    await this.fireUpsertHook(finalEnvelope);

    // Typed provenance marker (OQ2 handler consumes it for the audit
    // append): seed path + seed content fingerprint at read time.
    const promotion: SeedPromotion | undefined =
      target.mode === 'seed'
        ? { seedPath: target.path, seedContentSha: target.fingerprint }
        : undefined;

    return {
      success: true,
      envelope: finalEnvelope,
      ...(validation !== undefined ? { validation } : {}),
      ...(lint !== undefined ? { lint } : {}),
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
      ...(promotion !== undefined ? { promotion } : {}),
    };
  }

  /**
   * Delete a record.
   */
  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    return withRecordLock(this, `write:${options.recordId}`, () => this.deleteUnlocked(options));
  }

  private async deleteUnlocked(options: DeleteRecordOptions): Promise<StoreResult> {
    const { recordId, expectedSha, message } = options;
    
    // Find existing record
    const existing = await this.findRecordPath(recordId);
    if (!existing) {
      // OQ1 ruling: delete() stays seed-refused — factory defaults must not
      // be erasable through a data-dir delete a re-seed would resurrect
      // anyway (archive semantics belong to the lifecycle layer). The store
      // error is message-only clearer than the generic 'Record not found'
      // so the read/write disagreement stops being mysterious. No behavior
      // change, no kind names.
      if (this.findSeedRecordPath(recordId)) {
        return {
          success: false,
          error: `Record ${recordId} resolves from seed; seed records cannot be deleted`,
        };
      }
      return {
        success: false,
        error: `Record not found: ${recordId}`,
      };
    }
    
    // Get current file to verify SHA
    const file = await this.repo.getFile(existing.path);
    if (!file) {
      return {
        success: false,
        error: `File not found: ${existing.path}`,
      };
    }
    
    const storedPayload = parseRecord(file.content, existing.path).envelope?.payload as Record<string, unknown> | undefined;
    // Same config-injected append-only backstop as update() (§3.2).
    if (['record-revision', 'signature', 'audit-event', ...(this.config.appendOnlyKinds ?? [])].includes(String(storedPayload?.kind))) {
      return { success: false, error: 'APPEND_ONLY: immutable records cannot be deleted' };
    }

    // Check expected SHA if provided
    const sha = expectedSha || file.sha;
    if (expectedSha && file.sha !== expectedSha) {
      return {
        success: false,
        error: `SHA mismatch: expected ${expectedSha}, got ${file.sha}`,
      };
    }
    
    // Delete file
    const commitMessage = message || `Delete ${recordId}`;
    const result = await this.repo.deleteFile({
      path: existing.path,
      sha,
      message: commitMessage,
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to delete file',
      };
    }
    
    // Remove from cache
    this.pathCache.delete(recordId);

    await this.fireDeleteHook(recordId);

    return {
      success: true,
      ...(result.commit !== undefined ? {
        commit: {
          sha: result.commit.sha,
          message: result.commit.message,
          timestamp: result.commit.timestamp,
        },
      } : {}),
    };
  }

  /**
   * Validate a record against its schema.
   */
  async validate(envelope: RecordEnvelope): Promise<ValidationResult> {
    // Check if schema is loaded
    if (!this.validator.hasSchema(envelope.schemaId)) {
      return {
        valid: false,
        errors: [{
          path: '/',
          message: `Schema not found: ${envelope.schemaId}`,
          keyword: 'schema',
        }],
      };
    }
    
    return this.validator.validate(envelope.payload, envelope.schemaId);
  }
  
  /**
   * Lint a record against rules.
   */
  async lint(envelope: RecordEnvelope): Promise<LintResult> {
    return this.lintEngine.lint(envelope.payload, envelope.schemaId);
  }
  
  /**
   * Check if a record exists.
   */
  async exists(recordId: string): Promise<boolean> {
    const entry = await this.findRecordPath(recordId);
    return entry !== null;
  }
  
  /**
   * Clear the path cache.
   */
  clearCache(): void {
    this.pathCache.clear();
    this.seedPathCache.clear();
  }
}

/**
 * Create a new RecordStore instance.
 */
export function createRecordStore(
  repo: RepoAdapter,
  validator: AjvValidator,
  lintEngine: LintEngine,
  config?: RecordStoreConfig
): RecordStoreImpl {
  return new RecordStoreImpl(repo, validator, lintEngine, config);
}
