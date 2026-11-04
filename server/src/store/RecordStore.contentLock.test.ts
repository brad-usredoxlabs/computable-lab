/**
 * L1-RECORD-LOCK-GUARD-1 LEG 1 U3 — store no-op + declared content lock.
 *
 * Pins the AM-3/AM-11 store-level no-op short-circuit and the AM-2 content
 * lock that reads the DECLARED lifecycle data (contentLockedStates resolver)
 * instead of a hardcoded state list. Absent `config.contentLockedStates`
 * MUST serve the shared defaultContentLockedStates (declared YAML, disk-
 * backed) — the resolver is never `undefined` at runtime.
 *
 * Test schema: `additionalProperties: false` so the validation-failure
 * ordering pin can break validation via an undeclared key (updatedAt is
 * stripped by controlledContent, so the content lock does not fire first).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from './RecordStoreImpl.js';

const SCHEMA_ID = 'https://cl-test.local/store-content-lock.schema.yaml';
// Minimal structural schema so the store's validate wall passes for the
// pin envelopes (same convention as RecordStore.test.ts).
const TEST_SCHEMA = {
  $id: SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  properties: {
    recordId: { type: 'string' },
    $schema: { type: 'string' },
    kind: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    lifecycleId: { type: 'string' },
    state: { type: 'string' },
    status: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['recordId', 'kind'],
};

function envelope(recordId: string, state: string) {
  return {
    recordId,
    schemaId: SCHEMA_ID,
    payload: {
      recordId,
      $schema: SCHEMA_ID,
      kind: 'document-control-guard',
      title: 'Content-lock guard pin doc',
      body: 'stable body',
      lifecycleId: 'document-control',
      state,
      status: state,
    },
  };
}

function makeValidator(): AjvValidator {
  const v = new AjvValidator();
  v.addSchema(TEST_SCHEMA, SCHEMA_ID);
  return v;
}

/** Round-trip through the store: create, then GET returns the stored envelope. */
async function stored(store: ReturnType<typeof createRecordStore>, recordId: string, state: string) {
  const created = await store.create({ envelope: envelope(recordId, state) });
  if (!created.success || !created.envelope) throw new Error(`create failed: ${created.error}`);
  const got = await store.get(recordId);
  if (!got) throw new Error(`get failed for ${recordId}`);
  return got;
}

describe('L1-RECORD-LOCK-GUARD-1 LEG 1 U3 — store no-op + declared content lock', () => {
  let repoRoot: string;
  let store: ReturnType<typeof createRecordStore>;
  let writes: number;

  beforeEach(async () => {
    repoRoot = join(tmpdir(), `clg-u3-${randomUUID().slice(0, 8)}`);
    await mkdir(join(repoRoot, 'records'), { recursive: true });
    writes = 0;
    const repo = createLocalRepoAdapter({ basePath: repoRoot });
    store = createRecordStore(repo, makeValidator(), new LintEngine(), {
      writeHook: { onUpsert: () => { writes += 1; } },
      // NO contentLockedStates: the explicit default resolver must serve
      // the declared YAMLs (disk-backed).
    });
  });

  afterEachCleanup(repoRoot);

  it('AM-6(a): no-edit PUT on an effective record ⇒ 0 writes, stored contentSha, stored updatedAt', async () => {
    const before = await stored(store, 'CLG-1', 'effective');
    writes = 0; // create fired the hook once; the no-op must add ZERO writes
    const beforeSha = before.meta?.contentSha;
    const beforeUpdated = (before.payload as { updatedAt?: string }).updatedAt;
    const beforeFiles = await listRecordFiles(store);

    const result = await store.update({
      envelope: structuredClone(before), // content-equal, state-equal
    });

    expect(result.success).toBe(true);
    expect(writes).toBe(0);
    expect(result.envelope).toMatchObject(before);
    expect(result.envelope?.meta?.contentSha).toBe(beforeSha);
    expect((result.envelope?.payload as { updatedAt?: string }).updatedAt).toBe(beforeUpdated);
    // D1/AM-3: the no-op must be SIGNALLED to the handler (explicit no-op
    // marker), so the handler can skip its full index rebuild. Before the
    // fix the store returned a plain success with no marker — this assert
    // is RED-first for D1.
    expect(result.unchanged).toBe(true);
    expect(await listRecordFiles(store)).toEqual(beforeFiles); // no rewrite
  });

  it('AM-6(b): approved→effective and effective→superseded still WRITE and advance state', async () => {
    const approved = await stored(store, 'CLG-2', 'approved');
    writes = 0; // reset: the create's hook write is not under test
    // Transitions change state ONLY (the LifecycleHandlers transition path
    // updates payload.state and never payload.status) — a state-only change
    // is content-equal, so the content lock (which requires a content
    // change) does not fire, and the no-op (which requires state equality)
    // does not fire either: the write proceeds and advances the state.
    const t1 = { ...approved, payload: { ...(approved.payload as object), state: 'effective' } };
    const r1 = await store.update({ envelope: t1 });
    expect(r1.success).toBe(true);
    expect(writes).toBe(1);
    expect((r1.envelope?.payload as { state?: string }).state).toBe('effective');
    expect(r1.envelope?.meta?.contentSha).not.toBe(approved.meta?.contentSha); // file rewritten

    const effective = await store.get('CLG-2');
    if (!effective) throw new Error('CLG-2 not found after first transition');
    const t2 = { ...effective, payload: { ...(effective.payload as object), state: 'superseded' } };
    const r2 = await store.update({ envelope: t2 });
    expect(r2.success).toBe(true);
    expect(writes).toBe(2);
    expect((r2.envelope?.payload as { state?: string }).state).toBe('superseded');
  });

  it('AM-6(c): content-CHANGING PUT on a locked (approved) record ⇒ CONTROLLED_RECORD_LOCKED', async () => {
    const approved = await stored(store, 'CLG-3', 'approved');
    writes = 0; // reset: the create's hook write is not under test
    const changed = { ...approved, payload: { ...(approved.payload as object), title: 'TAMPERED' } };
    const result = await store.update({ envelope: changed });
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONTROLLED_RECORD_LOCKED');
    expect(writes).toBe(0);
  });

  it('ordering: content-EQUAL PUT on an append-only kind ⇒ APPEND_ONLY (typed rejection wins)', async () => {
    const appRepo = createLocalRepoAdapter({ basePath: repoRoot });
    const appStore = createRecordStore(
      appRepo,
      makeValidator(),
      new LintEngine(),
      { writeHook: { onUpsert: () => { writes += 1; } }, appendOnlyKinds: ['document-control-guard'] },
    );
    const created = await appStore.create({ envelope: envelope('APP-1', 'effective') });
    expect(created.success).toBe(true);
    writes = 0; // reset: the create's hook write is not under test
    const before = await appStore.get('APP-1');
    if (!before) throw new Error('APP-1 not found after create');
    const result = await appStore.update({ envelope: structuredClone(before) });
    // NEW behavior (AM-11): the no-op sits AFTER the append-only wall, so
    // the typed rejection is unchanged — no 200-swallow. No red possible:
    // this ordering predates the no-op.
    expect(result.success).toBe(false);
    expect(result.error).toContain('APPEND_ONLY');
    expect(writes).toBe(0);
  });

  it('ordering: content-EQUAL PUT with a failed expectedSha ⇒ SHA mismatch (typed rejection wins)', async () => {
    const before = await stored(store, 'CLG-4', 'effective');
    writes = 0; // reset: the create's hook write is not under test
    const result = await store.update({
      envelope: structuredClone(before),
      expectedSha: 'deadbeef'.repeat(5),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA mismatch');
    expect(writes).toBe(0);
  });

  it('ordering: content-EQUAL PUT with a validation failure ⇒ Validation failed (typed rejection wins)', async () => {
    const before = await stored(store, 'CLG-5', 'effective');
    writes = 0; // reset: the create's hook write is not under test
    // Break validation via an UNDECLARED key (additionalProperties: false)
    // while controlledContent stays byte-equal: controlledContent strips
    // createdAt, so the content lock (which runs BEFORE validation) does
    // not fire first — the validation wall is the one that must win.
    const broken = {
      ...before,
      payload: { ...(before.payload as object), createdAt: '2026-01-01T00:00:00Z' },
    };
    const result = await store.update({ envelope: broken });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Validation failed');
    expect(writes).toBe(0);
  });

  it('AM-6 seed branch: content/state-equal PUT on a seed record ⇒ no-op does NOT fire; promotion semantics unchanged', async () => {
    const seedDirName = `seed-cow-clg-${randomUUID().slice(0, 8)}`;
    const seedDir = join(repoRoot, seedDirName);
    const kindDir = join(seedDir, 'document-control-guard');
    await mkdir(kindDir, { recursive: true });
    const seedStore = createRecordStore(
      createLocalRepoAdapter({ basePath: repoRoot }),
      makeValidator(),
      new LintEngine(),
      { writeHook: { onUpsert: () => { writes += 1; } }, seedDir },
    );
    const seedContent = [
      'recordId: SEED-1',
      `$schema: ${SCHEMA_ID}`,
      'kind: document-control-guard',
      'title: Content-lock guard pin doc',
      "body: 'stable body'",
      'lifecycleId: document-control',
      'state: effective',
      'status: effective',
    ].join('\n');
    await writeFile(join(kindDir, 'se-1-content-lock-guard-pin-doc.yaml'), seedContent);
    const before = await seedStore.get('SEED-1');
    if (!before) throw new Error('seed record not visible to get()');
    const result = await seedStore.update({ envelope: structuredClone(before) });
    // Seed candidates are excluded from the no-op by design: the seed
    // promotion path keeps its existing write semantics untouched.
    expect(result.success).toBe(true);
    expect(writes).toBe(1);
    expect(result.envelope?.meta?.contentSha).not.toBe('seed'); // promoted into the data dir
  });

  it('AM-2: absent config ⇒ the declared default resolver serves; document-control locked set = the four declared states', async () => {
    // The default resolver is the shared engine-backed one (declared YAML):
    // document-control declares contentLocked on exactly these states.
    const { defaultContentLockedStates } = await import('../lifecycle/contentLockDefault.js');
    expect([...(defaultContentLockedStates('document-control') ?? [])].sort())
      .toEqual(['approved', 'archived', 'effective', 'superseded']);
    // Fail-open contract: an id no engine has loaded resolves to undefined
    // (explicit fail-open, NOT a second hardcoded set).
    expect(defaultContentLockedStates('no-such-lifecycle')).toBeUndefined();
    // And the store above (built with NO contentLockedStates config) actually
    // enforces the declared set: a content-changing PUT on a locked (approved)
    // record is refused while a transition writes — proving the default is
    // wired, not undefined.
    const locked = await stored(store, 'CLG-6', 'approved');
    writes = 0; // reset: the create's hook write is not under test
    const tampered = { ...locked, payload: { ...(locked.payload as object), body: 'CHANGED' } };
    const refused = await store.update({ envelope: tampered });
    expect(refused.success).toBe(false);
    expect(refused.error).toContain('CONTROLLED_RECORD_LOCKED');
  });
});

/** Record-store files (same listing the store itself uses for path search). */
function listRecordFiles(store: ReturnType<typeof createRecordStore>): Promise<string[]> {
  const repo = (store as unknown as { repo: { listFiles(o: { directory: string; pattern: string; recursive: boolean }): Promise<string[]> } }).repo;
  return repo.listFiles({ directory: 'records', pattern: '*.yaml', recursive: true });
}

async function afterEachCleanup(repoRoot: string): Promise<void> {
  try { await rm(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}
