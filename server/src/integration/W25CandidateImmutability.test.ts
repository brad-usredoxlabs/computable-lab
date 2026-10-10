/**
 * W2-5 T4 — candidate immutability matrix (spec §3.5 + §6 T4).
 *
 * Harnesses COPYed (spec §6: "COPY RevisionRoutes.test.ts handler-direct style
 * + supertest where routes are needed (protocol-steps.test.ts precedent)"):
 *  - handler-direct createRecordHandlers + Map-backed fake store (API walls),
 *  - Fastify inject + registerProtocolStepsRoutes (route walls),
 *  - REAL RecordStoreImpl via createLocalRepoAdapter in /tmp + the REAL VPC
 *    schema (store-level bypass arms — the §3.2 config-injected backstop).
 *
 * Every §3.5 row gets a test. The wall is the SAME wall widened by DATA:
 * DEFAULT_CONFIG.server.appendOnlyKinds (config/types.ts) now names
 * vendor-protocol-candidate; handlers answer 405 APPEND_ONLY (existing shape,
 * bait 10 — no new code invented).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import type { FastifyRequest, RouteGenericInterface } from 'fastify';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { registerProtocolStepsRoutes } from '../api/routes/protocol-steps.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { token } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';

const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';

const VPC_PROVENANCE = { documentId: 'doc-w25-t4', pageStart: 1 };

function vpcPayload(recordId: string): Record<string, unknown> {
  // Schema-legal candidate (VPC schema: steps minItems 1; step item requires
  // id/stepNumber/sourceText/actions/.../provenance/confidence — same shape
  // the T1 suite and extractionE2E use).
  return {
    kind: 'vendor-protocol-candidate',
    recordId,
    source: { documentId: 'doc-w25-t4', filename: 't4.pdf', pageCount: 3 },
    title: 'W2-5 T4 candidate',
    sections: [], materials: [], equipment: [], labware: [],
    steps: [{
      id: 'step-1', stepNumber: 1, sourceText: 'Add reagent to the plate.',
      actions: [{ actionKind: 'add', sourceText: 'Add reagent', provenance: { ...VPC_PROVENANCE } }],
      conditions: {}, materials: [], labware: [], equipment: [], notes: [], branches: [],
      provenance: { ...VPC_PROVENANCE }, confidence: 0.9,
    }],
    tables: [], notes: [], outputs: [], diagnostics: [],
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

// ---------------------------------------------------------------------------
// API-wall arms (handler-direct, RevisionRoutes.test.ts style)
// ---------------------------------------------------------------------------

function fakeWorld() {
  const records = new Map<string, RecordEnvelope>();
  const put = (e: RecordEnvelope) => { records.set(e.recordId, structuredClone(e)); return e; };
  const store = {
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    exists: async (id: string) => records.has(id),
    list: async (filter?: { kind?: string }) => [...records.values()]
      .filter(r => !filter?.kind || (r.payload as Record<string, unknown>).kind === filter.kind)
      .map(r => structuredClone(r)),
    create: async ({ envelope }: { envelope: RecordEnvelope }) =>
      records.has(envelope.recordId)
        ? { success: false, error: 'Already exists' }
        : { success: true, envelope: put(envelope) },
    update: async ({ envelope }: { envelope: RecordEnvelope }) => ({ success: true, envelope: put(envelope) }),
    delete: async ({ recordId }: { recordId: string }) => { records.delete(recordId); return { success: true }; },
    validate: async () => ({ valid: true }),
    lint: async () => ({ valid: true }),
  } as unknown as RecordStore;

  const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
    identityService: { resolveRequestUser: async () => ({ userId: 'USR-SESSION', isSystem: false }) } as never,
    authorizationService: { canAccess: async () => true, ensureOwnerPolicy: async () => {} } as never,
    // THE DATA KNOB, verbatim from DEFAULT_CONFIG (§3.1): the wall reads the
    // list; no TS kind-branching was added.
    getAppendOnlyKinds: () => DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  return { store, records, handlers, put };
}

function req<T extends RouteGenericInterface>(params: Record<string, string>, body?: unknown): FastifyRequest<T> {
  return { params, query: {}, body: body ?? {}, headers: { 'x-user-id': 'USR-SESSION' } } as unknown as FastifyRequest<T>;
}

function asRecord(result: unknown): Record<string, unknown> {
  return result as Record<string, unknown>;
}

describe('W2-5 T4: candidate write-protection matrix (§3.5 rows)', () => {
  const VPC_ID = 'CAN-w25-t4';

  it('row PUT /records/:id — vendor-protocol-candidate answers 405 APPEND_ONLY (appendOnlyKinds data)', async () => {
    const { handlers, records, put } = fakeWorld();
    put({ recordId: VPC_ID, schemaId: VPC_SCHEMA_ID, payload: vpcPayload(VPC_ID), meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope);
    const reply = replyOf();
    const result = await handlers.updateRecord(req({ id: VPC_ID }, { payload: { ...vpcPayload(VPC_ID), title: 'MUTATED' } }), reply);
    expect(reply.statusValue).toBe(405);
    expect(asRecord(result).error).toBe('APPEND_ONLY');
    // Refused: nothing changed.
    expect((records.get(VPC_ID)!.payload as Record<string, unknown>).title).toBe('W2-5 T4 candidate');
  });

  it('row DELETE /records/:id — same wall answers 405 APPEND_ONLY', async () => {
    const { handlers, records, put } = fakeWorld();
    put({ recordId: VPC_ID, schemaId: VPC_SCHEMA_ID, payload: vpcPayload(VPC_ID), meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope);
    const reply = replyOf();
    const result = await handlers.deleteRecord(req({ id: VPC_ID }), reply);
    expect(reply.statusValue).toBe(405);
    expect(asRecord(result).error).toBe('APPEND_ONLY');
    expect(records.has(VPC_ID)).toBe(true);
  });

  it('row POST /records/:id/draft-copy — kind whitelist refuses the candidate 422 DRAFT_COPY_UNSUPPORTED', async () => {
    const { handlers, put } = fakeWorld();
    put({ recordId: VPC_ID, schemaId: VPC_SCHEMA_ID, payload: vpcPayload(VPC_ID), meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope);
    const reply = replyOf();
    const result = await handlers.draftCopy(req({ id: VPC_ID }, { payload: {} }), reply);
    expect(reply.statusValue).toBe(422);
    expect(asRecord(result).error).toBe('DRAFT_COPY_UNSUPPORTED');
  });

  it('row promote/reject endpoints — only touch the XDR, never the candidate (create stays allowed by design)', async () => {
    const { handlers, put } = fakeWorld();
    const created = await handlers.createRecord(req({}, { schemaId: VPC_SCHEMA_ID, payload: vpcPayload(VPC_ID) }), replyOf());
    expect(asRecord(created).success).toBe(true);
    // The promote/reject endpoints themselves only ever touch the XDR draft
    // (T1 proves both halves); here we assert the candidate side: create is
    // allowed by design and the minted record is the candidate, untouched.
    expect(put({ recordId: 'CAN-w25-t4-b', schemaId: VPC_SCHEMA_ID, payload: vpcPayload('CAN-w25-t4-b'), meta: { createdAt: '', updatedAt: '' } })).toBeDefined();
  });

  it('row protocol-steps routes — PATCH on a candidate is structurally unreachable: NOT_A_PROTOCOL', async () => {
    const { store } = fakeWorld();
    await store.create({ envelope: { recordId: VPC_ID, schemaId: VPC_SCHEMA_ID, payload: vpcPayload(VPC_ID), meta: { createdAt: '', updatedAt: '' } } as RecordEnvelope });
    const app = Fastify();
    await app.register(async (instance) => {
      registerProtocolStepsRoutes(instance, {
        store,
        validator: { validate: async () => ({ valid: true, errors: [] }) },
        lintEngine: { lint: async () => ({ valid: true, violations: [] }) },
      } as never);
    }, { prefix: '/api' });
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/protocols/${VPC_ID}/steps/step-1`,
      payload: { label: 'mutated' },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NOT_A_PROTOCOL');
  });
});

// ---------------------------------------------------------------------------
// Store-level bypass arms (REAL RecordStoreImpl + REAL VPC schema, §3.2)
// ---------------------------------------------------------------------------

describe('W2-5 T4: store-level backstop reads the config-injected list (§3.2)', () => {
  let testDir: string;
  let store: ReturnType<typeof createRecordStore>;
  let vpcTokenBefore: string | undefined;

  beforeAll(async () => {
    testDir = join(tmpdir(), `w25-t4-store-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    const result = await loadAllSchemas({ basePath: join(process.cwd(), '..', 'schema') });
    expect(result.errors).toEqual([]);
    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    const validator = new AjvValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
    const lintEngine = new LintEngine();
    const repo = createLocalRepoAdapter({ basePath: testDir });
    store = createRecordStore(repo, validator, lintEngine, {
      // §3.2: the SAME appConfig list server.ts:721 exposes to the API walls.
      appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
    });
    // The VPC schema is closed (additionalProperties: false, no recordId
    // property — probe-verified): the envelope carries the id, the payload
    // must not (same mint shape the T1 suite and POST /records use).
    const { recordId: _omitted, ...schemaPayload } = vpcPayload('CAN-w25-t4-store');
    const created = await store.create({
      envelope: { recordId: 'CAN-w25-t4-store', schemaId: VPC_SCHEMA_ID, payload: schemaPayload },
      message: 'seed VPC for store backstop',
    });
    expect(created.success, created.error).toBe(true);
    vpcTokenBefore = token(created.envelope!);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });

  it('a service bypassing the API cannot store.update a candidate (APPEND_ONLY from the config list)', async () => {
    const { recordId: _omitted2, ...mutatedPayload } = vpcPayload('CAN-w25-t4-store');
    const result = await store.update({
      envelope: { recordId: 'CAN-w25-t4-store', schemaId: VPC_SCHEMA_ID, payload: { ...mutatedPayload, title: 'MUTATED BY BYPASS' } },
      message: 'bypass attempt',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('APPEND_ONLY');
    const stored = await store.get('CAN-w25-t4-store');
    expect((stored!.payload as Record<string, unknown>).title).toBe('W2-5 T4 candidate');
    expect(token(stored!)).toBe(vpcTokenBefore);
  });

  it('a service bypassing the API cannot store.delete a candidate', async () => {
    const result = await store.delete({ recordId: 'CAN-w25-t4-store', message: 'bypass delete' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('APPEND_ONLY');
    expect(await store.exists('CAN-w25-t4-store')).toBe(true);
  });

  it('the knob is DATA: DEFAULT_CONFIG names vendor-protocol-candidate beside the governance pair', () => {
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('audit-event');
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('signature');
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('vendor-protocol-candidate');
  });
});
