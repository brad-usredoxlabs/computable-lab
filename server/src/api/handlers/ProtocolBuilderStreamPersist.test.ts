/**
 * VPDF-3 — the extract stream persists its candidate server-side (spec D1/D2).
 *
 * Harness (spec §RED-first test plan): the REAL-store boot copied from
 * W25DraftLifecyclePromotion.test.ts (initializeApp/createServer + throwaway
 * tmp git store, CONFIG_PATH pinned so fixtures never leak into the durable
 * lane store — git on the NFS worktree blows the vitest budget) booted against
 * the REAL schema tree, plus the stubbed-SSE-fetch pattern from
 * ProtocolBuilderStream.test.ts. The stream rides the REAL route, so the
 * server.ts store wiring is under test too.
 *
 * Arms:
 *  probe-mints  (R2 probe, passes at trunk): a schema-legal candidate payload
 *               mints through store.create — the mint path, not POST /records.
 *  probe-update (R1 discriminator, RED at trunk with APPEND_ONLY): store.update
 *               on an existing candidate must SUCCEED (OQ-1: the wall changes
 *               through its DATA list); governance kinds stay walled.
 *  mints        (RED at trunk — the handler persists nothing today): one stream
 *               run with a resolvable documentId -> deterministic CAN-* record
 *               EXISTS, VPDF ref names it, done carries its recordId, every fact
 *               carries the document-level anchor + conservative pageStart:1
 *               with the AI_CHUNK_ANCHORS_APPROXIMATE diagnostic (OQ-2).
 *  updates      (RED at trunk): re-extract UPDATES in place — same recordId,
 *               updated payload, exactly ONE candidate for the document.
 *  emit-only    arms: no documentId / missing record / non-vendor-pdf document
 *               -> stream completes, ZERO candidate records (today's behavior).
 *  persist-failure arm: a store whose create fails -> error event, NO done,
 *               no partial ref write (never a done claiming a record it did not
 *               write).
 *  zero-step    arm: merged candidate with steps:[] -> no candidate persisted
 *               (VPDF-4 seam: the terminal stage is not this item's to fix).
 *  staleness    arm (verified-by 2): a non-promoted XDR joined to the VPDF
 *               carries CANDIDATE_SUPERSEDED_BY_REEXTRACT exactly once after
 *               TWO re-extracts (dedupe, not accumulate), and promotion still
 *               succeeds on the flagged XDR.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../../server.js';
import type { AppContext } from '../../server.js';
import { createProtocolBuilderHandlers } from './ProtocolBuilderHandlers.js';
import Fastify from 'fastify';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';

const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';
const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';
const VPDF_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-pdf.schema.yaml';
const AUDIT_EVENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/audit-event.schema.yaml';
const SIGNATURE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/signature.schema.yaml';

const VPDF_ID = 'VPDF-VPDF3-DEMO';
const CAN_ID = `CAN-vendorpdf-${createHash('sha256').update(VPDF_ID).digest('hex').slice(0, 16)}`;
const GHOST_REF_ID = 'graph-lemur-abcdef012345';

const testDir = resolve(process.cwd(), 'tmp/vpdf3-stream-persist');
const dataDir = resolve('/tmp', 'cl-vpdf3-stream-persist-data');

let ctx: AppContext;
let app: FastifyInstance;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // CRITICAL isolation (W25 T1 canon): pin CONFIG_PATH to a throwaway config so
  // every record this suite mints lands under /tmp and dies in afterAll.
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    '  dataDir: ' + dataDir,
    '  workspaceDir: ' + dataDir + '/workspaces',
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
    'ai:',
    '  inference:',
    '    baseUrl: http://127.0.0.1:1/v1',
    '    model: vpdf3-stub-model',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });
  app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();
  await seedUser();
  await seedVendorPdf();
}, 600000);

afterAll(async () => {
  await app?.close();
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

/** Stub the inference endpoint with a scripted OpenAI-compatible SSE stream. */
function stubInferenceStream(content: string) {
  globalThis.fetch = vi.fn(async () => {
    const body = `data: ${JSON.stringify({
      id: 'chunk',
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\ndata: [DONE]\n\n`;
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Parse the SSE body Fastify collected into events. */
function eventsOf(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice('data:'.length).trim()) as Record<string, unknown>);
}

async function seedVendorPdf(): Promise<void> {
  const result = await ctx.store.create({
    envelope: {
      recordId: VPDF_ID,
      schemaId: VPDF_SCHEMA_ID,
      payload: {
        kind: 'vendor-pdf',
        recordId: VPDF_ID,
        title: 'Thermo PureLink RNA Mini Kit',
        state: 'ingested',
        source: {
          engine: 'upload',
          ingestedAt: '2026-10-20T00:00:00.000Z',
          url: 'https://example.invalid/purelink.pdf',
          pageCount: 2,
        },
        extractedText: [
          { pageNumber: 1, text: '1. Lyse the sample.' },
          { pageNumber: 2, text: '2. Wash the column.' },
        ],
        // The stranded pre-wave-2 ghost ref: re-extract must heal it (task (5)).
        vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: GHOST_REF_ID },
      },
    },
    message: `seed ${VPDF_ID} for VPDF-3`,
  });
  if (!result.success) throw new Error(`seed ${VPDF_ID} failed: ${result.error}`);
}

async function seedUser(): Promise<void> {
  const result = await ctx.store.create({
    envelope: {
      recordId: 'USR-VPDF3-TESTER',
      schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
      payload: {
        kind: 'user',
        recordId: 'USR-VPDF3-TESTER',
        username: 'vpdf3-tester',
        displayName: 'VPDF-3 Tester',
        email: 'vpdf3-tester@example.invalid',
        status: 'active',
      },
    },
    message: 'seed test user for VPDF-3 identity wall',
  });
  if (!result.success) throw new Error(`seed user failed: ${result.error}`);
}

function chunkJson(title: string, steps: Array<{ stepNumber: number; text: string }>): string {
  return JSON.stringify({
    kind: 'vendor-protocol-candidate',
    title,
    steps,
    materials: [{ label: 'Lysis Solution' }],
    labware: [],
    equipment: [],
  });
}

async function runStream(payload: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/protocol-builder/extract-stream',
    payload,
  });
  expect(res.statusCode).toBe(200);
  return eventsOf(res.body);
}

async function candidatesForDocument(): Promise<RecordEnvelope[]> {
  const all = await ctx.store.list({ kind: 'vendor-protocol-candidate' });
  return all.filter((r) => (r.payload as Record<string, unknown>).source &&
    ((r.payload as Record<string, unknown>).source as Record<string, unknown>).documentId === VPDF_ID);
}

// ---------------------------------------------------------------------------
// R1/R2 probes (spec: the first targeted check, before any handler wiring)
// ---------------------------------------------------------------------------

describe('VPDF-3 probe: the mint path and the append-only wall (R1/R2)', () => {
  const probePayload = (title: string): Record<string, unknown> => ({
    kind: 'vendor-protocol-candidate',
    source: { documentId: 'doc-vpdf3-probe', filename: 'probe.pdf', pageCount: 1 },
    title,
    sections: [], materials: [], equipment: [], labware: [],
    steps: [{
      id: 'step-1', stepNumber: 1, sourceText: 'Add reagent to the plate.',
      actions: [{ actionKind: 'other', sourceText: 'Add reagent', provenance: { documentId: 'doc-vpdf3-probe', pageStart: 1 } }],
      conditions: {}, materials: [], labware: [], equipment: [], notes: [], branches: [],
      provenance: { documentId: 'doc-vpdf3-probe', pageStart: 1 }, confidence: 0.9,
    }],
    tables: [], notes: [], outputs: [], diagnostics: [],
  });

  it('mints: a schema-legal candidate mints through store.create (the extraction mint path, R2)', async () => {
    const created = await ctx.store.create({
      envelope: { recordId: 'CAN-vpdf3-probe', schemaId: VPC_SCHEMA_ID, payload: probePayload('Probe candidate') },
      message: 'probe: mint VPC via store.create',
    });
    expect(created.success, created.error).toBe(true);
    const stored = await ctx.store.get('CAN-vpdf3-probe');
    expect(stored).not.toBeNull();
    expect((stored!.payload as Record<string, unknown>).kind).toBe('vendor-protocol-candidate');
  });

  it('updates: store.update on an existing candidate SUCCEEDS (OQ-1: the wall drops the candidate kind)', async () => {
    // Self-contained: mint the fixture here so this arm runs standalone under
    // `-t 'updates'` — at trunk it answers APPEND_ONLY (the R1 discriminator).
    const seeded = await ctx.store.create({
      envelope: { recordId: 'CAN-vpdf3-probe-update', schemaId: VPC_SCHEMA_ID, payload: probePayload('Probe candidate') },
      message: 'probe: seed VPC for the update arm',
    });
    expect(seeded.success, seeded.error).toBe(true);
    const updated = await ctx.store.update({
      envelope: { recordId: 'CAN-vpdf3-probe-update', schemaId: VPC_SCHEMA_ID, payload: probePayload('Probe candidate v2') },
      message: 'probe: update-in-place (Brad 2026-10-20 ruling)',
    });
    expect(updated.success, updated.error).toBe(true);
    const stored = await ctx.store.get('CAN-vpdf3-probe-update');
    expect((stored!.payload as Record<string, unknown>).title).toBe('Probe candidate v2');
  });

  it('governance kinds stay walled: audit-event and signature answer APPEND_ONLY (the pair beside the dropped kind)', async () => {
    // The knob is DATA (bait 4): the wall's config-injected half is the list.
    const { DEFAULT_CONFIG } = await import('../../config/types.js');
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('audit-event');
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('signature');
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).not.toContain('vendor-protocol-candidate');

    // OQ-1 regression pin: the wall is EXERCISED, not merely listed. Both
    // governance records are minted through the REAL store (create has no
    // append-only wall — only update/delete do), then a real update AND a real
    // delete are attempted against them on the same store the persist arms use.
    // If the governance pair ever leaves the wall (the DATA list or the
    // store-level backstop), these arms go RED.
    const auditEnv = {
      recordId: 'EVT-VPDF3-GOVERNANCE',
      schemaId: AUDIT_EVENT_SCHEMA_ID,
      payload: {
        kind: 'audit-event',
        recordId: 'EVT-VPDF3-GOVERNANCE',
        actor: 'USR-VPDF3-TESTER',
        action: 'record_created',
        subjectType: 'vendor-pdf',
        subjectId: VPDF_ID,
        occurredAt: '2026-10-20T00:00:00.000Z',
        data: { note: 'VPDF-3 governance wall pin' },
      },
    };
    const signatureEnv = {
      recordId: 'SIG-VPDF3-GOVERNANCE',
      schemaId: SIGNATURE_SCHEMA_ID,
      payload: {
        kind: 'signature',
        recordId: 'SIG-VPDF3-GOVERNANCE',
        signedBy: 'USR-VPDF3-TESTER',
        action: 'approved',
        meaning: { code: 'approved', statement: 'VPDF-3 governance wall pin' },
        subject: { recordId: VPDF_ID },
        signedAt: '2026-10-20T00:00:00.000Z',
        authentication: { method: 'password_reauthentication' },
      },
    };
    for (const env of [auditEnv, signatureEnv]) {
      const minted = await ctx.store.create({ envelope: env, message: `seed ${env.recordId} for the governance wall arm` });
      expect(minted.success, minted.error).toBe(true);
    }

    for (const env of [auditEnv, signatureEnv]) {
      const tampered = await ctx.store.update({
        envelope: { ...env, payload: { ...env.payload, ...(env.payload.kind === 'audit-event' ? { action: 'record_updated' } : {}) } },
        message: `tamper attempt on ${env.recordId} (must be refused)`,
      });
      expect(tampered.success, `${env.payload.kind} update must be refused`).toBe(false);
      expect(String(tampered.error)).toContain('APPEND_ONLY');

      const removed = await ctx.store.delete({ recordId: env.recordId, message: `delete attempt on ${env.recordId} (must be refused)` });
      expect(removed.success, `${env.payload.kind} delete must be refused`).toBe(false);
      expect(String(removed.error)).toContain('APPEND_ONLY');

      // Append-only means the record is still there, unchanged.
      const stored = await ctx.store.get(env.recordId);
      expect(stored, `${env.recordId} must survive the refused write`).not.toBeNull();
      expect((stored!.payload as Record<string, unknown>).kind).toBe(env.payload.kind);
    }

    expect((await ctx.store.list({ kind: 'audit-event' })).some((r) => r.recordId === auditEnv.recordId)).toBe(true);
    expect((await ctx.store.list({ kind: 'signature' })).some((r) => r.recordId === signatureEnv.recordId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D1: the stream persist leg (RED at trunk: the handler mints nothing)
// ---------------------------------------------------------------------------

describe('VPDF-3 D1: the extract stream persists its candidate server-side', () => {
  it('mints: one run -> deterministic CAN-* record EXISTS, VPDF ref names it, done carries its recordId (OQ-2 anchors)', async () => {
    stubInferenceStream(chunkJson('PureLink RNA Kit', [
      { stepNumber: 1, text: 'Lyse the sample in Lysis Solution.' },
      { stepNumber: 2, text: 'Wash the column with Wash Solution.' },
    ]));
    const events = await runStream({ text: '1. Lyse the sample.\n2. Wash the column.', documentId: VPDF_ID });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.candidateRecordId).toBe(CAN_ID);

    const stored = await ctx.store.get(CAN_ID);
    expect(stored, `candidate ${CAN_ID} must exist after the stream`).not.toBeNull();
    const payload = stored!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('vendor-protocol-candidate');
    expect((payload.source as Record<string, unknown>).documentId).toBe(VPDF_ID);
    expect((payload.steps as Array<Record<string, unknown>>).length).toBe(2);

    // OQ-2: document-level anchor + conservative pageStart:1, declared — never
    // a page-FABRICATED anchor beyond the declared floor.
    for (const step of payload.steps as Array<Record<string, unknown>>) {
      const prov = step.provenance as Record<string, unknown>;
      expect(prov.documentId).toBe(VPDF_ID);
      expect(prov.pageStart).toBe(1);
    }
    const diagnostics = payload.diagnostics as Array<Record<string, unknown>>;
    expect(diagnostics.some((d) => d.code === 'AI_CHUNK_ANCHORS_APPROXIMATE')).toBe(true);

    // The ghost ref is healed (task (5): re-extract is the repair path).
    const vpdf = await ctx.store.get(VPDF_ID);
    const ref = (vpdf!.payload as Record<string, unknown>).vendorProtocolCandidateRef as Record<string, unknown>;
    expect(ref).toEqual({ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID });
  });

  it('updates: a second run with different steps -> SAME recordId, updated payload, exactly ONE candidate', async () => {
    stubInferenceStream(chunkJson('PureLink RNA Kit (revised)', [
      { stepNumber: 1, text: 'Lyse the sample for 10 minutes.' },
    ]));
    const events = await runStream({ text: '1. Lyse the sample for 10 minutes.', documentId: VPDF_ID });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.candidateRecordId).toBe(CAN_ID);

    const mine = await candidatesForDocument();
    expect(mine.length).toBe(1);
    const payload = mine[0]!.payload as Record<string, unknown>;
    expect((payload.steps as Array<Record<string, unknown>>).length).toBe(1);
    expect((payload.steps as Array<Record<string, unknown>>)[0]!.sourceText).toContain('10 minutes');
  });

  it('emit-only: a body without documentId completes the stream and mints ZERO candidates', async () => {
    stubInferenceStream(chunkJson('Standalone', [{ stepNumber: 1, text: 'Do the thing.' }]));
    const before = (await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length;
    const events = await runStream({ text: 'Do the thing.' });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.candidateRecordId).toBeUndefined();
    const after = (await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length;
    expect(after).toBe(before);
  });

  it('emit-only: a documentId naming a missing record mints ZERO candidates', async () => {
    stubInferenceStream(chunkJson('Standalone', [{ stepNumber: 1, text: 'Do the thing.' }]));
    const before = (await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length;
    const events = await runStream({ text: 'Do the thing.', documentId: 'VPDF-DOES-NOT-EXIST' });
    expect(events[events.length - 1].type).toBe('done');
    expect(events[events.length - 1].candidateRecordId).toBeUndefined();
    expect((await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length).toBe(before);
  });

  it('emit-only: a documentId naming a non-vendor-pdf record mints ZERO candidates', async () => {
    stubInferenceStream(chunkJson('Standalone', [{ stepNumber: 1, text: 'Do the thing.' }]));
    const before = (await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length;
    const events = await runStream({ text: 'Do the thing.', documentId: 'USR-VPDF3-TESTER' });
    expect(events[events.length - 1].type).toBe('done');
    expect(events[events.length - 1].candidateRecordId).toBeUndefined();
    expect((await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length).toBe(before);
  });

  it('zero-step merge: no candidate is persisted and done claims no record (VPDF-4 seam)', async () => {
    stubInferenceStream(JSON.stringify({ kind: 'vendor-protocol-candidate', title: 'Nothing', steps: [] }));
    const before = (await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length;
    const events = await runStream({ text: 'Unparseable-ish text.', documentId: VPDF_ID });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.candidateRecordId).toBeUndefined();
    expect((await ctx.store.list({ kind: 'vendor-protocol-candidate' })).length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// D1 failure semantics: never a done that claims a record it did not write
// ---------------------------------------------------------------------------

describe('VPDF-3 D1: persist failure ends the stream with an error, never a lying done', () => {
  it('a store whose create fails -> error event, NO done, no partial ref write', async () => {
    const vpdfEnvelope: RecordEnvelope = {
      recordId: VPDF_ID,
      schemaId: VPDF_SCHEMA_ID,
      payload: {
        kind: 'vendor-pdf',
        recordId: VPDF_ID,
        title: 'Thermo PureLink RNA Mini Kit',
        state: 'ingested',
        source: { engine: 'upload', ingestedAt: '2026-10-20T00:00:00.000Z', url: 'https://example.invalid/purelink.pdf' },
        extractedText: [{ pageNumber: 1, text: '1. Lyse the sample.' }],
        vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: GHOST_REF_ID },
      },
    };
    const updates: RecordEnvelope[] = [];
    const failingStore = {
      get: async (id: string) => (id === VPDF_ID ? structuredClone(vpdfEnvelope) : null),
      list: async () => [],
      create: async () => ({ success: false, error: 'Validation failed' }),
      update: async ({ envelope }: { envelope: RecordEnvelope }) => { updates.push(envelope); return { success: true, envelope }; },
    } as unknown as RecordStore;

    stubInferenceStream(chunkJson('PureLink', [{ stepNumber: 1, text: 'Lyse the sample.' }]));
    const handlers = createProtocolBuilderHandlers('/tmp', {
      baseUrl: 'http://ai/v1',
      model: 'vpdf3-stub-model',
    }, undefined, failingStore);
    const local = Fastify();
    await local.register((instance) => {
      instance.post('/protocol-builder/extract-stream', handlers.extractProtocolStream.bind(handlers));
    }, { prefix: '/api' });
    const res = await local.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: '1. Lyse the sample.', documentId: VPDF_ID },
    });
    await local.close();

    const events = eventsOf(res.body);
    const types = events.map((e) => e.type);
    expect(types).not.toContain('done');
    const error = events.find((e) => e.type === 'error');
    expect(error, 'persist failure must end the stream with an error event').toBeDefined();
    expect(String(error!.message)).toContain('could not be persisted');
    // No partial ref write: the VPDF envelope was never updated.
    expect(updates.some((env) => env.recordId === VPDF_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D2: staleness — ONE data-flag mechanism, deduped, promotion unaffected
// ---------------------------------------------------------------------------

describe('VPDF-3 D2: re-extract flags the joined non-promoted XDR exactly once', () => {
  const XDR_ID = 'XDR-vpdf3-stale';

  beforeAll(async () => {
    const verbRef = (id: string, canonical: string) => ({ ref: { kind: 'record', type: 'verb-definition', id }, canonical });
    const result = await ctx.store.create({
      envelope: {
        recordId: XDR_ID,
        schemaId: XDR_SCHEMA_ID,
        payload: {
          kind: 'extraction-draft',
          recordId: XDR_ID,
          source_artifact: { kind: 'file', id: VPDF_ID, locator: 'purelink.pdf' },
          candidates: [{
            target_kind: 'protocol',
            draft: {
              kind: 'protocol',
              recordId: `PRT-${XDR_ID}-semantic`,
              title: 'VPDF-3 staleness draft',
              steps: [{
                stepId: 'inc-1', label: 'Incubate', ordinal: 1, kind: 'incubate',
                intent: {
                  semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 1 }],
                },
              }],
            },
            confidence: 0.9,
            evidence_span: 'Incubate the batch.',
            uncertainty: 'low',
            ambiguity_spans: [],
          }],
          status: 'pending_review',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      },
      message: `seed ${XDR_ID} for VPDF-3 staleness`,
    });
    if (!result.success) throw new Error(`seed ${XDR_ID} failed: ${result.error}`);
  });

  it('two re-extracts -> CANDIDATE_SUPERSEDED_BY_REEXTRACT appears exactly once (dedupe, not accumulate)', async () => {
    for (const text of ['1. Lyse the sample (pass A).', '1. Lyse the sample (pass B).']) {
      stubInferenceStream(chunkJson('PureLink', [{ stepNumber: 1, text }]));
      const events = await runStream({ text, documentId: VPDF_ID });
      expect(events[events.length - 1].type).toBe('done');
    }
    const xdr = await ctx.store.get(XDR_ID);
    expect(xdr).not.toBeNull();
    const diagnostics = ((xdr!.payload as Record<string, unknown>).diagnostics ?? []) as Array<Record<string, unknown>>;
    const flags = diagnostics.filter((d) => d.code === 'CANDIDATE_SUPERSEDED_BY_REEXTRACT');
    expect(flags.length).toBe(1);
    expect(flags[0]!.severity).toBe('warning');
    expect((flags[0]!.details as Record<string, unknown>).candidateRecordId).toBe(CAN_ID);
  });

  it('promotion still succeeds on the flagged XDR (diagnostics do not gate review)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/extraction/drafts/${XDR_ID}/candidates/0/promote`,
      headers: { 'x-user-id': 'USR-VPDF3-TESTER' },
    });
    expect(res.statusCode, `promote failed: ${res.body}`).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VPDF-3 fix run 2 (regression pin): REAL-model diagnostics are bare strings.
// The live deepseek run emitted top-level `diagnostics` as an array of strings
// (chunk parsed cleanly, steps:9) and the persist leg died with
// /diagnostics/N "must be object" (Ajv2020 vs the REAL schema tree). Every
// unit stub before this pinned object-shaped diagnostics, so the suites missed
// it. This arm rides the REAL route against the REAL store + REAL schema tree
// with a stubbed inference stream whose diagnostics are BARE STRINGS — the
// exact live shape. RED at HEAD e6cb5e90 (Validation failed), GREEN after the
// adapter normalization.
// ---------------------------------------------------------------------------

describe('VPDF-3 fix2: bare-string model diagnostics persist (real store + real schema tree)', () => {
  it('stream with string diagnostics -> done event, CAN-* record exists, stored diagnostics all objects', async () => {
    const content = JSON.stringify({
      kind: 'vendor-protocol-candidate',
      title: 'PureLink RNA Mini Kit',
      steps: [
        { stepNumber: 1, text: '1. Lyse the sample.' },
        { stepNumber: 2, text: '2. Bind the lysate to the column.' },
      ],
      materials: [{ label: 'PBS' }],
      // The real model's shape: bare strings, NOT objects.
      diagnostics: [
        'PBS is listed under materials but is not used in the purification procedure.',
        'Incubation equipment for the 55 degrees C step is not specified.',
      ],
    });
    stubInferenceStream(content);
    const events = await runStream({ text: '1. Lyse the sample.\n2. Bind the lysate to the column.', documentId: VPDF_ID });

    const last = events[events.length - 1];
    expect(last.type, `expected done, got: ${JSON.stringify(last)}`).toBe('done');
    expect(events.some((e) => e.type === 'error')).toBe(false);

    const candidates = await candidatesForDocument();
    expect(candidates.length).toBe(1);
    const payload = candidates[0]!.payload as Record<string, unknown>;
    const diagnostics = payload.diagnostics as Array<Record<string, unknown>>;
    expect(Array.isArray(diagnostics)).toBe(true);
    for (const d of diagnostics) {
      expect(typeof d, 'every stored diagnostic must be an object').toBe('object');
      expect(d).not.toBeNull();
      expect(['error', 'warning', 'info']).toContain(d.severity);
      expect(typeof d.code).toBe('string');
      expect(typeof d.message).toBe('string');
    }
    // The model's strings survive verbatim as messages.
    expect(diagnostics.some((d) => d.message === 'PBS is listed under materials but is not used in the purification procedure.')).toBe(true);
    expect(diagnostics.some((d) => d.message === 'Incubation equipment for the 55 degrees C step is not specified.')).toBe(true);
  });
});

describe('VPDF-3 fix2: bare-string step notes persist (real store + real schema tree)', () => {
  it('stream with string-shaped step notes -> done event, stored step notes are arrays', async () => {
    const content = JSON.stringify({
      kind: 'vendor-protocol-candidate',
      title: 'PureLink RNA Mini Kit',
      steps: [
        { stepNumber: 1, text: '1. Lyse the sample.', notes: 'Lysis is optional for cultured cells.' },
        { stepNumber: 2, text: '2. Bind the lysate.', notes: null },
      ],
      diagnostics: ['Centrifugation speed is not numerically specified.'],
    });
    stubInferenceStream(content);
    const events = await runStream({ text: '1. Lyse the sample.\n2. Bind the lysate.', documentId: VPDF_ID });
    const last = events[events.length - 1];
    expect(last.type, `expected done, got: ${JSON.stringify(last)}`).toBe('done');

    const candidates = await candidatesForDocument();
    expect(candidates.length).toBe(1);
    const steps = (candidates[0]!.payload as Record<string, unknown>).steps as Array<Record<string, unknown>>;
    for (const step of steps) {
      expect(Array.isArray(step.notes), `step ${step.stepNumber} notes must be stored as an array`).toBe(true);
    }
    expect(steps[0]!.notes).toEqual(['Lysis is optional for cultured cells.']);
    expect(steps[1]!.notes).toEqual([]);
  });
});
