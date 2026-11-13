/**
 * L2-JOURNEY-EVIDENCE-1 (unit evstore): the DURABLE seam for the journey
 * evidence bundle. The unit-1 bundle (journeyEvidenceBundle.ts) is pure — it
 * exists only for the length of one call; this store is what an auditor
 * reads back later. save writes tmp-then-rename (the AiThreadStore idiom) to
 * {rootDir}/journeys/{journey_id}/{revision}.bundle.json and refuses
 * anything the closed schema rejects — through the unit-1 module's ONE Ajv
 * loader (validateJourneyEvidenceBundle), never a second instance. Evidence
 * is append-only: a same-journey + same-revision overwrite is allowed only
 * when the new bytes are identical (a no-op), otherwise the named
 * revision_exists diagnostic is thrown and the first file is never touched.
 * load reads one revision only — absent or malformed → null, never a
 * fallback to "latest" and never a scan of a sibling journey directory —
 * and a bundle that fails its closed schema (determinism absent, a fourth
 * mode, any malformed shape) is a FAILED read, not a defaulted one. verify
 * re-runs the unit-1 digest check (verifyJourneyEvidenceBundle) over the
 * bundle's own preserved-document entries and reports every mismatch by
 * ref_id — never repaired, never re-hashed locally. The journey identity
 * arrives as an argument, never a literal.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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
/** The read-time verdict: a tampered bundle is reported by ref_id, never
 * repaired, never returned as valid; not_found is the absent/malformed read. */
export type JourneyEvidenceStoreVerifyResult =
  | { ok: true; mismatches: [] }
  | { ok: false; mismatches: JourneyEvidenceBundleMismatch[] };
/** The store takes its root as an option — no derived default path inside
 * logic, no journey id or surface name as a literal. */
export interface JourneyEvidenceStoreOptions { rootDir: string }

export class JourneyEvidenceStore {
  private readonly rootDir: string;
  constructor(options: JourneyEvidenceStoreOptions) {
    this.rootDir = options.rootDir;
  }
  /** The on-disk path of one stored bundle: {rootDir}/journeys/{journey_id}/
   * {revision}.bundle.json. Both segments are sanitised first, so a caller
   * cannot walk out of rootDir through a crafted id or revision. */
  bundlePath(journeyId: string, revision: number): string {
    return join(this.rootDir, 'journeys', sanitizeSegment(journeyId), `${sanitizeSegment(String(revision))}.bundle.json`);
  }
  /** Write the bundle durably. The candidate must pass the closed schema
   * (through the unit-1 module's single loader — one Ajv authority). The
   * tmp-then-rename write copies the AiThreadStore idiom: no torn file is
   * ever visible at the final path. An existing revision is overwritten ONLY
   * when the bytes are identical (a no-op); otherwise the append-only
   * trail is protected with the named revision_exists refusal. */
  async save(bundle: JourneyEvidenceBundle): Promise<void> {
    const verdict = validateJourneyEvidenceBundle(bundle);
    if (!verdict.ok) {
      throw new JourneyEvidenceStoreError('schema_rejected',
        `journey ${bundle.journey_id} revision ${bundle.revision}: the bundle is not the closed journey-evidence-bundle shape and the store refuses to persist it: ${verdict.errors.join('; ')}`);
    }
    const finalPath = this.bundlePath(bundle.journey_id, bundle.revision);
    const payload = JSON.stringify(bundle, null, 2);
    const existing = await readMaybe(finalPath);
    if (existing !== undefined) {
      if (existing === payload) return; // byte-identical re-save: a no-op, the file is untouched
      throw new JourneyEvidenceStoreError(RULE_STORE_REVISION_EXISTS,
        `journey ${bundle.journey_id}: revision ${bundle.revision} is already stored with different bytes — evidence is append-only and a silent overwrite destroys the audit trail`);
    }
    await mkdir(dirname(finalPath), { recursive: true });
    const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, finalPath);
  }
  /** Read ONE revision. Absent, malformed JSON, or a bundle that fails its
   * closed schema (a determinism.mode that changed or went absent on disk,
   * a fourth mode, any malformed member) → null: a failed read, never a
   * defaulted bundle, never "latest", never a scan of a sibling journey.
   * On read, REFUSE the bundle too when a retained document no longer
   * hashes to its declared sha256 (the unit-1 digest check) — tampered is
   * null here and NAMED in verify; the two calls tell them apart. */
  async load(journeyId: string, revision: number): Promise<JourneyEvidenceBundle | null> {
    const bundle = await this.readBundle(journeyId, revision);
    if (bundle === null) return null;
    return this.digestMismatches(bundle).length === 0 ? bundle : null;
  }
  /** Re-verify one stored revision: absent or malformed → not-ok with no
   * mismatches (nothing readable to re-hash); readable → the unit-1 digest
   * check over the bundle's OWN preserved-document entries, so a document
   * whose text no longer hashes to its declared sha256 is reported by
   * ref_id with expected ≠ actual — deterministic across runs. */
  async verify(journeyId: string, revision: number): Promise<JourneyEvidenceStoreVerifyResult> {
    const bundle = await this.readBundle(journeyId, revision);
    if (bundle === null) return { ok: false, mismatches: [] };
    const mismatches = this.digestMismatches(bundle);
    return mismatches.length === 0 ? { ok: true, mismatches: [] } : { ok: false, mismatches };
  }
  /** The parsed + schema-validated bundle, or null for absent / malformed /
   * schema-rejected — the one read both operations share. */
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
   * called ONCE here and nowhere else: every retained document re-hashed
   * against its declared sha256, keyed by ref_id. Never a local re-hash. */
  private digestMismatches(bundle: JourneyEvidenceBundle): JourneyEvidenceBundleMismatch[] {
    const documents: Record<string, string> = {};
    for (const entry of [...bundle.intent_revisions, ...bundle.observations, ...bundle.human_approvals, ...bundle.effect_receipts, ...bundle.checkpoint_events]) {
      documents[entry.ref_id] = entry.document;
    }
    return verifyJourneyEvidenceBundle(bundle, documents);
  }
}
/** One path segment: the name must be non-empty and free of '/' and '..',
 * so a crafted id or revision cannot walk out of the root. The refusal is
 * named and never repairs the input. */
function sanitizeSegment(segment: string): string {
  if (segment.length === 0 || segment === '.' || segment === '..' || segment.includes('/')) {
    throw new JourneyEvidenceStoreError(RULE_STORE_INVALID_SEGMENT,
      `the store path segment '${segment}' is not a safe name: it is empty, a traversal token, or contains a separator`);
  }
  return segment;
}
/** One read: undefined means "no file" (ENOENT) — the ONLY read error a
 * caller may distinguish from a tampered one. Every other error propagates:
 * a store failure must not be laundered into "absent". */
async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}
