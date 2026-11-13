/**
 * L2-JOURNEY-EVIDENCE-1 (unit evstore): the DURABLE seam for the journey
 * evidence bundle — the unit-1 bundle is pure (it exists only for the length
 * of one call); this store is what an auditor reads back later. save:
 * tmp-then-EXCLUSIVE-link (so the existence check and the publish are one
 * syscall — two racing saves of one revision cannot both win) to
 * {rootDir}/journeys/{journey_id}/{revision}.bundle.json, refusing anything
 * the closed schema rejects through the unit-1 module's ONE Ajv loader
 * (validateJourneyEvidenceBundle) — never a second instance. A same-revision
 * overwrite is a no-op only when the bytes are identical; otherwise the named
 * revision_exists refusal is thrown and the first file is never touched
 * (evidence is append-only). load: ONE revision — absent, malformed,
 * schema-invalid (determinism.mode absent/changed on disk, a fourth mode) or
 * digest-mismatched (the unit-1 digest check, run on read) → null: a failed
 * read, never a defaulted bundle, never "latest", never a sibling-journey
 * scan. verify: the unit-1 digest check (verifyJourneyEvidenceBundle) over
 * the bundle's OWN preserved-document entries — every mismatch named by
 * ref_id, never repaired, never re-hashed locally. Journey identity arrives
 * as an argument, never a literal.
 */
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  validateJourneyEvidenceBundle,
  verifyJourneyEvidenceBundle,
  type JourneyEvidenceBundle,
  type JourneyEvidenceBundleMismatch,
} from './journeyEvidenceBundle.js';

export const RULE_STORE_REVISION_EXISTS = 'revision_exists';
export const RULE_STORE_INVALID_SEGMENT = 'invalid_segment';

/** One named refusal from the store: rule + a message naming the offender. */
export class JourneyEvidenceStoreError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'JourneyEvidenceStoreError';
    this.rule = rule;
  }
}
/** Read-time verdict: tampered is reported by ref_id, never repaired, never
 * returned as valid; not_found (no mismatches) is the absent/malformed read. */
export type JourneyEvidenceStoreVerifyResult =
  | { ok: true; mismatches: [] }
  | { ok: false; mismatches: JourneyEvidenceBundleMismatch[] };
/** rootDir is an option — no derived default path, no journey id or surface name as a literal. */
export interface JourneyEvidenceStoreOptions { rootDir: string }

export class JourneyEvidenceStore {
  private readonly rootDir: string;
  constructor(options: JourneyEvidenceStoreOptions) {
    this.rootDir = options.rootDir;
  }
  /** The on-disk path of one stored bundle; both segments sanitised before join. */
  bundlePath(journeyId: string, revision: number): string {
    return join(this.rootDir, 'journeys', sanitizeSegment(journeyId), `${sanitizeSegment(String(revision))}.bundle.json`);
  }
  /** Write the bundle durably. The candidate must pass the closed schema (the
   * unit-1 module's single loader — one Ajv authority); the write goes to a tmp
   * path and is published by link(), an exclusive create, so a racing writer
   * gets EEXIST rather than overwriting the winner. An existing revision is overwritten
   * ONLY when the bytes are identical (a no-op); otherwise the named
   * revision_exists refusal is thrown — the append-only trail is never silently replaced. */
  async save(bundle: JourneyEvidenceBundle): Promise<void> {
    const verdict = validateJourneyEvidenceBundle(bundle);
    if (!verdict.ok) {
      throw new JourneyEvidenceStoreError('schema_rejected',
        `journey ${bundle.journey_id} revision ${bundle.revision}: the bundle is not the closed journey-evidence-bundle shape and the store refuses to persist it: ${verdict.errors.join('; ')}`);
    }
    const finalPath = this.bundlePath(bundle.journey_id, bundle.revision);
    const payload = JSON.stringify(bundle, null, 2);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    try {
      // The existence check and the publish are ONE exclusive-create syscall: a racing
      // writer gets EEXIST instead of both seeing ENOENT and the later rename winning.
      await link(tmpPath, finalPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
      await unlink(tmpPath).catch(() => {});
      const existing = await readMaybe(finalPath);
      if (existing === payload) return; // byte-identical re-save: a no-op, the file is untouched
      throw new JourneyEvidenceStoreError(RULE_STORE_REVISION_EXISTS,
        `journey ${bundle.journey_id}: revision ${bundle.revision} is already stored with different bytes — evidence is append-only and a silent overwrite destroys the audit trail`);
    }
    await unlink(tmpPath).catch(() => {}); // the link is the file now; the tmp name is scratch
  }
  /** Read ONE revision. Absent, malformed JSON, schema-invalid (determinism.mode
   * absent/changed on disk, a fourth mode) or digest-mismatched (the unit-1
   * digest check, run on read) → null: a failed read, never a defaulted
   * bundle, never "latest", never a sibling-journey scan. Tampered is null
   * here and NAMED in verify; the two calls tell them apart. */
  async load(journeyId: string, revision: number): Promise<JourneyEvidenceBundle | null> {
    const bundle = await this.readBundle(journeyId, revision);
    if (bundle === null) return null;
    return this.digestMismatches(bundle).length === 0 ? bundle : null;
  }
  /** Re-verify one stored revision: absent or malformed → not-ok with no
   * mismatches; readable → the unit-1 digest check, so a document no longer
   * hashing to its declared sha256 is reported by ref_id (expected ≠ actual). */
  async verify(journeyId: string, revision: number): Promise<JourneyEvidenceStoreVerifyResult> {
    const bundle = await this.readBundle(journeyId, revision);
    if (bundle === null) return { ok: false, mismatches: [] };
    const mismatches = this.digestMismatches(bundle);
    return mismatches.length === 0 ? { ok: true, mismatches: [] } : { ok: false, mismatches };
  }
  /** The parsed + schema-validated bundle, or null — the one read both operations share. */
  private async readBundle(journeyId: string, revision: number): Promise<JourneyEvidenceBundle | null> {
    const raw = await readMaybe(this.bundlePath(journeyId, revision));
    if (raw === undefined) return null;
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null; // malformed JSON: a failed read, not a throw
    }
    if (validateJourneyEvidenceBundle(candidate).ok !== true) return null;
    return candidate as JourneyEvidenceBundle;
  }
  /** The load-time digest check — the unit-1 verifier (verifyJourneyEvidenceBundle),
   * called ONCE here and nowhere else: every retained document re-hashed by ref_id. */
  private digestMismatches(bundle: JourneyEvidenceBundle): JourneyEvidenceBundleMismatch[] {
    const documents: Record<string, string> = {};
    for (const entry of [...bundle.intent_revisions, ...bundle.observations, ...bundle.human_approvals, ...bundle.effect_receipts, ...bundle.checkpoint_events]) {
      documents[entry.ref_id] = entry.document;
    }
    return verifyJourneyEvidenceBundle(bundle, documents);
  }
}
/** One path segment: non-empty, free of '/' and '..' — a crafted id or revision cannot walk out of the root; the refusal is named. */
function sanitizeSegment(segment: string): string {
  if (segment.length === 0 || segment === '.' || segment === '..' || segment.includes('/')) {
    throw new JourneyEvidenceStoreError(RULE_STORE_INVALID_SEGMENT,
      `the store path segment '${segment}' is not a safe name: it is empty, a traversal token, or contains a separator`);
  }
  return segment;
}
/** One read: undefined = "no file" (ENOENT) — every other error propagates; a store failure must not be laundered into "absent". */
async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}
