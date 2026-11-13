// @vitest-environment node
/**
 * L2-JOURNEY-EVIDENCE-1 (unit evstore): the durable seam — round-trip
 * (bundle in === bundle out, including determinism.mode; a byte-identical
 * re-save is a no-op), absent → null, a second save at the same revision
 * with different bytes refused by the named revision_exists (the original
 * file byte-identical), a stored document edited on disk named by verify on
 * its ref_id (expected ≠ actual), load → null for a tampered bundle,
 * byte-stable verify, malformed JSON → null (not a throw), determinism
 * missing on disk → null (not defaulted), and '..' / '/' segments refused
 * before any write. Root is a mkdtemp under os.tmpdir(), removed in
 * afterAll; nothing is written into the worktree. Fixtures mirror the
 * unit-1 shapes with neutral ids.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildJourneyEvidenceBundle } from './journeyEvidenceBundle.js';
import type { JourneyEvidenceBundle, JourneyEvidenceBundleInput } from './journeyEvidenceBundle.js';
import type { CompiledJourneyManifest } from './journeyCompiler.js';
import type { CompiledJourneyEnvelope } from './journeyEnvelope.js';
import { JourneyEvidenceStore, JourneyEvidenceStoreError } from './journeyEvidenceStore.js';

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const doc = (refId: string, text: string): { ref_id: string; sha256: string; document: string } =>
  ({ ref_id: refId, sha256: sha256Hex(text), document: text });
const REQUEST = { message_id: 'msg-0001', verbatim_text: 'Run the full assay on the new extract' };
const MANIFEST: CompiledJourneyManifest = { journey_id: 'JX-2026-113', revision: 1, steps: [{ id: 'step-extract', capability_ref: 'cap-extract', capability_version: '1.2.0', interaction_mode: 'automatic', status: 'READY', reasons: [], blocked_by: [] }], not_ready: [] };
const ENVELOPE: CompiledJourneyEnvelope = { journey_id: 'JX-2026-113', revision: 1, step_id: 'step-extract', capability_ref: 'cap-extract', capability_version: '1.2.0', bindings: [{ port_index: 0, declared_version: 'v3', resolved_version: 'v3' }], authorization: { action: 'auto-create', target: 'cap-extract', disposition: 'allowed', authority: 'project-owner', setting_key: 'allowAutoCreate', origin_profile_id: 'profile-lab-1', rationale: 'declared policy permits auto-create for this step' } };
/** The complete input every arm starts from; arms override, never rebuild. */
const completeInput = (overrides: Partial<JourneyEvidenceBundleInput> = {}): JourneyEvidenceBundleInput => ({
  journey_id: 'JX-2026-113',
  revision: 1,
  request: { ...REQUEST },
  intent_revisions: [doc('doc-intent-r1', 'intent revision 1: the AI added the extraction step with a versioned port')],
  compiler_versions: [{ name: 'journey-compiler', version: '1.0.0' }],
  retained_versions: [{ ref: 'record-extract-9', version: 'v3' }],
  compiled_manifests: [MANIFEST],
  observations: [doc('obs-1', 'observation: absorbance plateau reached at four minutes')],
  required_approvals: ['step-signoff'],
  human_approvals: [doc('step-signoff', 'receipt: signoff task closed on record rec-77')],
  execution_envelopes: [ENVELOPE],
  effects: [{ step_id: 'step-extract', receipt_id: 'eff-1' }],
  effect_receipts: [doc('eff-1', 'effect: two millilitre transfer completed on pipette-4')],
  checkpoint_events: [doc('cp-1', 'checkpoint: stage-1 manifest compiled clean')],
  determinism: { mode: 'replay_from_evidence' },
  ...overrides,
});
const build = (input: JourneyEvidenceBundleInput): JourneyEvidenceBundle => {
  const out = buildJourneyEvidenceBundle(input);
  if (!out.ok) throw new Error(`fixture build failed: ${out.diagnostics.map((d) => d.rule).join(',')}`);
  return out.bundle;
};
/** Edit the stored file on disk directly — the audit-tamper simulation. */
async function editStored(store: JourneyEvidenceStore, journeyId: string, revision: number, edit: (bundle: Record<string, unknown>) => void): Promise<void> {
  const path = store.bundlePath(journeyId, revision);
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  edit(parsed);
  await writeFile(path, JSON.stringify(parsed, null, 2), 'utf8');
}

const JOURNEY = 'JX-2026-113';

describe('JourneyEvidenceStore', () => {
  let root: string;
  let store: JourneyEvidenceStore;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'evstore-'));
    store = new JourneyEvidenceStore({ rootDir: root });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('(AC1) round-trip: save + load returns the identical bundle, including determinism.mode', async () => {
    const bundle = build(completeInput());
    await store.save(bundle);
    const loaded = await store.load(JOURNEY, 1);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(bundle);
    expect(loaded?.determinism).toEqual(bundle.determinism); // identical before and after
    expect(bundle.determinism.mode).toBe(loaded?.determinism.mode);
    const raw = JSON.parse(await readFile(store.bundlePath(JOURNEY, 1), 'utf8'));
    expect(raw).toEqual(bundle); // the on-disk bytes are the bundle itself
    await expect(store.save(loaded!)).resolves.toBeUndefined(); // byte-identical re-save: a no-op
  });

  it('(AC3) a second save at the same revision with different content is refused revision_exists; the original file is byte-identical', async () => {
    const original = await readFile(store.bundlePath(JOURNEY, 1), 'utf8');
    const altered = build(completeInput({ observations: [doc('obs-1', 'observation: absorbance plateau reached at six minutes')] }));
    let err: unknown;
    try {
      await store.save(altered);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(JourneyEvidenceStoreError);
    expect((err as JourneyEvidenceStoreError).rule).toBe('revision_exists');
    expect(await readFile(store.bundlePath(JOURNEY, 1), 'utf8')).toBe(original); // the original is untouched
  });

  it('(AC2) a stored document edited on disk: verify names that ref_id with expected ≠ actual, twice byte-stably; load returns null', async () => {
    const bundle = build(completeInput({ revision: 2, observations: [doc('obs-1', 'observation: absorbance plateau reached at four minutes, repeated')] }));
    await store.save(bundle);
    const originalText = bundle.observations[0]!.document;
    await editStored(store, JOURNEY, 2, (b) => {
      const observations = b.observations as { document: string }[];
      observations[0]!.document += ' (amended)'; // the declared digest stays over the original text
    });
    const first = await store.verify(JOURNEY, 2);
    console.log('AC2 verify result:', JSON.stringify(first));
    expect(first.ok).toBe(false);
    expect(first.mismatches).toEqual([
      { ref_id: 'obs-1', expected: sha256Hex(originalText), actual: sha256Hex(originalText + ' (amended)') },
    ]);
    const second = await store.verify(JOURNEY, 2);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first)); // byte-stable across two runs
    expect(await store.load(JOURNEY, 2)).toBeNull(); // tampered: never returned as valid
  });

  it('absent file → load returns null; verify reports not-ok with no mismatches', async () => {
    expect(await store.load(JOURNEY, 99)).toBeNull();
    expect(await store.verify(JOURNEY, 99)).toEqual({ ok: false, mismatches: [] });
  });

  it('malformed JSON → load returns null (not a throw)', async () => {
    const path = store.bundlePath(JOURNEY, 4);
    await writeFile(path, '{ not json', 'utf8');
    expect(await store.load(JOURNEY, 4)).toBeNull();
    expect(await store.verify(JOURNEY, 4)).toEqual({ ok: false, mismatches: [] });
  });

  it('determinism missing on disk → load returns null (a failed read, never a defaulted bundle)', async () => {
    await store.save(build(completeInput({ revision: 3 })));
    await editStored(store, JOURNEY, 3, (b) => { delete b.determinism; });
    expect(await store.load(JOURNEY, 3)).toBeNull();
    expect(await store.verify(JOURNEY, 3)).toEqual({ ok: false, mismatches: [] });
  });

  it('a stored schema-invalid bundle (a fourth determinism mode on disk) → load returns null', async () => {
    await store.save(build(completeInput({ revision: 5 })));
    await editStored(store, JOURNEY, 5, (b) => {
      b.determinism = { mode: 'live' }; // the closed schema refuses the fourth mode
    });
    expect(await store.load(JOURNEY, 5)).toBeNull();
  });

  it('path segments are sanitised: ".." and "/" are refused before any write and cannot escape rootDir', async () => {
    await expect(store.load('..', 1)).rejects.toMatchObject({ rule: 'invalid_segment' });
    await expect(store.load('a/b', 1)).rejects.toMatchObject({ rule: 'invalid_segment' });
    await expect(store.verify('..', 1)).rejects.toMatchObject({ rule: 'invalid_segment' });
    await expect(store.save(build(completeInput()))).resolves.toBeUndefined(); // byte-identical re-save: a no-op
    await expect(store.save(build(completeInput({ journey_id: '../escape' })))).rejects.toMatchObject({ rule: 'invalid_segment' });
    expect(await store.load(JOURNEY, 1)).not.toBeNull(); // the worktree-root layout is intact
  });
});
