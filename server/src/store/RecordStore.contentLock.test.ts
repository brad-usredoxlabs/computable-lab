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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from './RecordStoreImpl.js';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { controlledContent } from '../revisions/RecordRevisionService.js';
import type { RecordStore, RecordEnvelope } from './types.js';
import type { IndexManager } from '../index/IndexManager.js';

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

// D9 (fix cycle 1): kind is parameterizable so the AM-11(a) append-only
// ordering pin can carry the NAMED production append-only kind `attestation`
// (the wall is the generic appendOnlyKinds knob; the ordering proof is
// kind-independent, so the pin proves the same wall semantics with the real
// kind). Every other pin uses the default `document-control-guard`.
function envelope(recordId: string, state: string, kind: string = 'document-control-guard') {
  return {
    recordId,
    schemaId: SCHEMA_ID,
    payload: {
      recordId,
      $schema: SCHEMA_ID,
      kind,
      title: 'Content-lock guard pin doc',
      body: 'stable body',
      lifecycleId: 'document-control',
      state,
      status: state,
      // D2 (fix cycle 1): the fixture carries a REAL updatedAt so the AM-6(a)
      // no-op pin is NOT vacuous. controlledContent strips updatedAt, so this
      // is production-faithful (the handler always stamps it) and does not
      // affect the content lock. A stored updatedAt lets the pin send a FRESH
      // (different) stamp on a content-equal PUT and prove it does not leak.
      updatedAt: '2026-11-04T10:00:00.000Z',
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

  // D8 (fix cycle 1): register the cleanup PER TEST (afterEach) so each
  // test's temp repo dir is removed after that test. The previous bare call
  // `afterEachCleanup(repoRoot);` ran ONCE at describe-registration time
  // with repoRoot still undefined, so the temp dirs were never cleaned.
  afterEach(() => afterEachCleanup(repoRoot));

  it('AM-6(a): no-edit PUT on an effective record ⇒ 0 writes, stored contentSha, stored updatedAt', async () => {
    const before = await stored(store, 'CLG-1', 'effective');
    writes = 0; // create fired the hook once; the no-op must add ZERO writes
    const beforeSha = before.meta?.contentSha;
    const beforeUpdated = (before.payload as { updatedAt?: string }).updatedAt;
    expect(beforeUpdated).toBeDefined(); // fixture carries a stored stamp (D2: non-vacuous)
    const beforeFiles = await listRecordFiles(store);

    // D2 (fix cycle 1): send a FRESH updatedAt (the handler's unconditional
    // stamp, production-faithful) on a content-equal, state-equal PUT.
    // controlledContent strips updatedAt → the mandated predicate sees
    // equality and the no-op fires; a raw deep-equality / JSON.stringify
    // predicate (the forbidden regression AM-3/bait 11 names) would see the
    // fresh stamp as a change and WRITE — writes would be 1, so this pin
    // discriminates the two predicates.
    const freshStamp = new Date().toISOString();
    expect(freshStamp).not.toBe(beforeUpdated);
    const incoming = structuredClone(before);
    (incoming.payload as { updatedAt: string }).updatedAt = freshStamp;
    const result = await store.update({
      envelope: incoming, // content-equal, state-equal, FRESH updatedAt
    });

    expect(result.success).toBe(true);
    expect(writes).toBe(0);
    expect(result.envelope).toMatchObject(before);
    expect(result.envelope?.meta?.contentSha).toBe(beforeSha);
    // The fresh stamp did NOT leak: the response carries the STORED stamp.
    expect((result.envelope?.payload as { updatedAt: string }).updatedAt).toBe(beforeUpdated);
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
      { writeHook: { onUpsert: () => { writes += 1; } }, appendOnlyKinds: ['attestation'] },
    );
    const created = await appStore.create({ envelope: envelope('APP-1', 'effective', 'attestation') });
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

  it('ordering: content-EQUAL PUT with a lint failure ⇒ Lint failed (typed rejection wins)', async () => {
    // AM-11 lint-ordering pin (fix cycle 1 / D3): the no-op sits AFTER the
    // lint wall, so a content-EQUAL PUT that FAILS lint must be refused by
    // the lint wall — never swallowed into a no-op 200. Uses the store's REAL
    // lint engine (LintEngine). Setup follows the fix direction verbatim:
    // "a stored record whose lint fails while controlled content is equal".
    // The record is stored first (the engine has no spec yet, so create's own
    // lint pass is clean), then a severity:'error' spec is added that the
    // stored content-equal envelope fails: the body is the stable pin body.
    // The content-equal update therefore hits the LINT wall (before the
    // no-op) and must be refused — controlled content stays byte-equal, so
    // the content lock and the no-op predicate both stay quiet.
    const lintEngine = new LintEngine();
    const lintStore = createRecordStore(
      createLocalRepoAdapter({ basePath: repoRoot }),
      makeValidator(),
      lintEngine,
      { writeHook: { onUpsert: () => { writes += 1; } } },
    );
    const created = await lintStore.create({ envelope: envelope('LINT-1', 'effective') });
    expect(created.success).toBe(true);
    writes = 0; // reset: the create's hook write is not under test
    // Now the stored record FAILS lint (spec added after storage): a rule the
    // envelope cannot satisfy. The content-equal PUT must trip the lint wall.
    lintEngine.addSpec('clg-lint-ordering', {
      lintVersion: 1,
      schemaId: SCHEMA_ID,
      rules: [
        {
          id: 'clg-pin-body-must-not-be-stable',
          title: 'pin: body must not be the stable pin body',
          severity: 'error',
          scope: 'record',
          assert: { op: 'not', not: { op: 'equals', path: 'body', value: 'stable body' } },
          message: { template: 'body must not be the stable pin body (lint ordering pin)' },
        },
      ],
    });
    const before = await lintStore.get('LINT-1');
    if (!before) throw new Error('LINT-1 not found after create');
    const result = await lintStore.update({ envelope: structuredClone(before) });
    // NEW ordering pin (AM-11 / D3): the lint wall wins over the no-op —
    // RED-first: if the no-op were (re)moved ahead of lint, this PUT would
    // be swallowed as a 200 no-op and the asserts below would fail.
    expect(result.success).toBe(false);
    expect(result.error).toContain('Lint failed with errors');
    expect(result.lint?.valid).toBe(false);
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

// ---------------------------------------------------------------------------
// L1-RECORD-LOCK-GUARD-1 (AM-3, fix cycle 2 / F1+F2) — handler-side no-op pins.
//
// The store-level no-op marker is pinned above (AM-6(a): `result.unchanged ===
// true`). These pins close the CONSUMPTION side (one gate, two halves): the
// handler must gate BOTH post-write side effects on that marker —
//   F1: the index rebuild (RecordHandlers.ts:1302 `result.unchanged !== true`),
//   F2: the revision/audit block (the `record_revised` capture + append),
// so a content-equal/state-equal PUT mints NO rebuild, NO revision, NO audit
// event, while a real content-changing write still does 1x each.
//
// Harness: a mock RecordStore that reproduces the store's explicit no-op marker
// using the SAME predicate the real store uses (state equality +
// `controlledContent` — the real predicate, not a hand-rolled diff). The marker
// itself is pinned on the REAL store above; here we pin that the handler
// consumes it. Reverting EITHER gate clause turns these RED.
// ---------------------------------------------------------------------------

const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';

function xdrPayload(): Record<string, unknown> {
  return {
    kind: 'extraction-draft',
    recordId: 'XDR-PIN',
    source_artifact: { kind: 'file', id: 'VPF-PIN' },
    candidates: [
      { target_kind: 'protocol', draft: { kind: 'protocol', title: 'MEANT draft v1', steps: [] }, confidence: 0.8 },
      { target_kind: 'protocol', draft: { kind: 'protocol', title: 'Terminal candidate', steps: [] }, confidence: 0.7, status: 'promoted' },
    ],
    status: 'pending_review',
  };
}

function replyOf() {
  let statusValue = 200;
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => body,
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

/** Handler harness: mock store (reproducing the no-op marker) + indexManager
 *  spy + auditService.append spy, driven through createRecordHandlers. */
function handlerHarness() {
  const existingEnvelope: RecordEnvelope = {
    recordId: 'XDR-PIN',
    schemaId: XDR_SCHEMA_ID,
    payload: xdrPayload(),
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-REVIEWER', contentSha: 'sha-stored' },
  } as RecordEnvelope;
  const records = new Map<string, RecordEnvelope>([[existingEnvelope.recordId, existingEnvelope]]);
  const store = {
    get: async (id: string) => (records.has(id) ? structuredClone(records.get(id)!) : null),
    list: async () => [...records.values()].map((r) => structuredClone(r)),
    create: async ({ envelope }: { envelope: RecordEnvelope }) => {
      records.set(envelope.recordId, structuredClone(envelope));
      return { success: true, envelope: structuredClone(envelope) };
    },
    update: async ({ envelope }: { envelope: RecordEnvelope }) => {
      const stored = records.get(envelope.recordId)!;
      const incoming = envelope.payload as Record<string, unknown>;
      const storedPayload = stored.payload as Record<string, unknown>;
      // SAME predicate the real store uses (state equality + controlledContent).
      const isNoop = String(incoming.state ?? undefined) === String(storedPayload.state ?? undefined)
        && controlledContent(incoming) === controlledContent(storedPayload);
      if (isNoop) return { success: true, envelope: structuredClone(stored), unchanged: true };
      const updated = { ...envelope, meta: { ...envelope.meta, contentSha: 'sha-new' } };
      records.set(envelope.recordId, structuredClone(updated));
      return { success: true, envelope: structuredClone(updated) };
    },
    delete: async () => ({ success: true }),
    validate: async () => ({ valid: true }),
    lint: async () => ({ valid: true }),
    exists: async () => false,
    getByPath: async () => null,
    getWithValidation: async () => ({ success: true }),
  } as unknown as RecordStore;

  const rebuild = vi.fn();
  const indexManager = { rebuild } as unknown as IndexManager;
  const auditAppend = vi.fn(async () => {});
  const security = {
    auditService: { append: auditAppend },
    getRevisionOnEditKinds: () => ['extraction-draft'],
  };
  const handlers = createRecordHandlers(store, indexManager, undefined, undefined, undefined, undefined, security as never);
  return { handlers, rebuild, auditAppend, existingEnvelope };
}

describe('L1-RECORD-LOCK-GUARD-1 (AM-3, fix cycle 2 / F1+F2) — handler-side no-op pins', () => {
  it('content-equal/state-equal PUT on extraction-draft (no-op) ⇒ 0 index rebuilds AND 0 audit appends', async () => {
    const { handlers, rebuild, auditAppend, existingEnvelope } = handlerHarness();
    const res = await handlers.updateRecord(
      { params: { id: 'XDR-PIN' }, body: { payload: structuredClone(existingEnvelope.payload) }, headers: {} } as never,
      replyOf(),
    ) as { success?: boolean };
    expect(res.success).toBe(true);
    // F1: the rebuild gate consumes the marker — a no-op wrote nothing, so no
    // wasted full index rebuild. (Reverting `result.unchanged !== true` at the
    // rebuild gate ⇒ rebuild fires 1x ⇒ this goes RED.)
    expect(rebuild, 'no-op must not rebuild the index').toHaveBeenCalledTimes(0);
    // F2: the revision/audit block is gated on the marker — a no-op mints no
    // record_revised audit event. (Reverting the block's gate clause ⇒ append
    // fires 1x ⇒ this goes RED.)
    expect(auditAppend, 'no-op must not append a record_revised audit event').toHaveBeenCalledTimes(0);
  });

  it('content-CHANGING PUT on extraction-draft (real write) ⇒ still 1 index rebuild AND 1 audit append', async () => {
    const { handlers, rebuild, auditAppend, existingEnvelope } = handlerHarness();
    const nextPayload = structuredClone(existingEnvelope.payload) as Record<string, unknown>;
    const candidates = nextPayload.candidates as Array<Record<string, unknown>>;
    candidates[0] = { ...candidates[0]!, draft: { kind: 'protocol', title: 'MEANT draft v2 (reviewed)', steps: [] } };
    const res = await handlers.updateRecord(
      { params: { id: 'XDR-PIN' }, body: { payload: nextPayload }, headers: {} } as never,
      replyOf(),
    ) as { success?: boolean };
    expect(res.success).toBe(true);
    // Control arm (AM-3): the gate only suppresses the NO-OP. A real write
    // (unchanged absent) still rebuilds once and appends record_revised once.
    expect(rebuild, 'a real write still rebuilds the index once').toHaveBeenCalledTimes(1);
    expect(auditAppend, 'a real write still appends record_revised once').toHaveBeenCalledTimes(1);
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
