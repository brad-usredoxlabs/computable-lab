/**
 * PROTO-AI-5 — server-side write gates on the whole-record PUT path.
 *
 * Mirrors the human editor's client-only gate module
 * (app/src/event-editor/right-pane/protocol/protocolStepEditing.ts) onto
 * RecordHandlers.updateRecord, so a non-client writer (AI apply path, curl)
 * gets the same safety net:
 *   G1 executed-step delete (startedAt OR completedAt — the stricter client rule)
 *   G3 ≥1 step must remain (stable code, not just the generic Ajv 422)
 *   G4 duplicate stepId (mirrors POST /steps DUPLICATE_STEP_ID)
 *
 * Direct-handler style mirrors RecordHandlers.lifecycle.test.ts. The store is
 * an in-memory envelope map so "persists NOTHING" is a real read-back check.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createRecordHandlers } from './RecordHandlers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

function protocolEnvelope(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId: PROTOCOL_SCHEMA_ID,
    payload: { kind: 'protocol', recordId, title: 'Gate test', ...payload },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as RecordEnvelope;
}

/** In-memory envelope store: update persists (so a passed gate is observable)
 *  and get() reads the CURRENT stored envelope (so a refused write leaves the
 *  record provably unchanged). */
function makeGateStore(initial: RecordEnvelope) {
  const byId = new Map<string, RecordEnvelope>([[initial.recordId, initial]]);
  const updateCalls: Array<{ envelope: RecordEnvelope; expectedSha?: string }> = [];
  const store = {
    async get(recordId: string) { return byId.get(recordId) ?? null; },
    async list() { return []; },
    async create(opts: { envelope: RecordEnvelope }) {
      byId.set(opts.envelope.recordId, opts.envelope);
      return { success: true, envelope: opts.envelope };
    },
    async update(opts: { envelope: RecordEnvelope; expectedSha?: string }) {
      updateCalls.push(opts);
      byId.set(opts.envelope.recordId, opts.envelope);
      return { success: true, envelope: opts.envelope };
    },
    async delete() { return { success: true }; },
  };
  return { store: store as unknown as RecordStore, byId, updateCalls };
}

function makeReply() {
  let statusValue = 200;
  let responseBody: unknown = {};
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => { responseBody = body; return reply; },
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  Object.defineProperty(reply, 'responseBody', { get: () => responseBody });
  return reply;
}

function makeRequest(id: string, body: Record<string, unknown>) {
  return {
    params: { id },
    body,
    headers: {},
  } as never;
}

const stepsA = [
  { stepId: 'step-a', label: 'Bind', ordinal: 1, kind: 'other' },
  { stepId: 'step-b', label: 'Wash', ordinal: 2, kind: 'other' },
];

/** The two executedness flavours the client blocks (protocolStepEditing.ts:92):
 *  startedAt OR completedAt. Route-side DELETE historically checked only
 *  startedAt (protocol-steps.ts:503); the stricter rule is the target. */
const stepStarted = { stepId: 'step-b', label: 'Wash', ordinal: 2, kind: 'other', executionMeta: { startedAt: '2026-02-02T00:00:00.000Z' } };
const stepCompletedOnly = { stepId: 'step-b', label: 'Wash', ordinal: 2, kind: 'other', executionMeta: { completedAt: '2026-02-02T00:00:00.000Z' } };

// ---------------------------------------------------------------------------
// G1 — executed-step delete via whole-record PUT
// ---------------------------------------------------------------------------

describe('PUT /records/:id — G1 executed-step delete (startedAt OR completedAt)', () => {
  it('rejects deleting a startedAt-executed step: 400 STEP_ALREADY_EXECUTED, persists nothing', async () => {
    const existing = protocolEnvelope('PRT-g1a', { steps: [stepsA[0], stepStarted] });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [stepsA[0]]; // client-style PUT that drops the executed step

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g1a', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect((resultBody as unknown as { error: string }).error).toBe('STEP_ALREADY_EXECUTED');
    expect(updateCalls.length).toBe(0);
    // Read back: stored payload unchanged.
    expect((byId.get('PRT-g1a')!.payload as Record<string, unknown>).steps).toEqual([stepsA[0], stepStarted]);
  });

  it('rejects deleting a completedAt-only step (stricter client rule): 400 STEP_ALREADY_EXECUTED, persists nothing', async () => {
    const existing = protocolEnvelope('PRT-g1b', { steps: [stepsA[0], stepCompletedOnly] });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [stepsA[0]];

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g1b', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect((resultBody as unknown as { error: string }).error).toBe('STEP_ALREADY_EXECUTED');
    expect(updateCalls.length).toBe(0);
    expect((byId.get('PRT-g1b')!.payload as Record<string, unknown>).steps).toEqual([stepsA[0], stepCompletedOnly]);
  });

  it('mutating an executed step in place (not deleting) is NOT blocked by the gate', async () => {
    const existing = protocolEnvelope('PRT-g1c', { steps: [stepsA[0], stepStarted] });
    const { store, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    (next.steps as Record<string, unknown>[])[1]!.label = 'Wash twice';

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g1c', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(200);
    expect(updateCalls.length).toBe(1);
  });

  it('deleting an UNexecuted step succeeds and persists (happy path byte-stable)', async () => {
    const existing = protocolEnvelope('PRT-g1d', { steps: [stepsA[0], stepsA[1]] });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [{ ...stepsA[1]!, ordinal: 1 }]; // client renumbers after delete

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g1d', { payload: next }), reply as unknown as FastifyReply);

    expect(updateCalls.length).toBe(1);
    const stored = (byId.get('PRT-g1d')!.payload as Record<string, unknown>).steps as Record<string, unknown>[];
    expect(stored.length).toBe(1);
    expect(stored[0]!.stepId).toBe('step-b');
  });
});

// ---------------------------------------------------------------------------
// G3 — ≥1 step must remain via whole-record PUT
// ---------------------------------------------------------------------------

describe('PUT /records/:id — G3 ≥1-step stable code', () => {
  it('empty steps[] → 422 MIN_STEPS_REMAIN (stable code alongside the validation detail), persists nothing', async () => {
    const existing = protocolEnvelope('PRT-g3a', { steps: stepsA });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [];

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g3a', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(422);
    const body = resultBody as unknown as { error: string; code?: string; validation?: unknown };
    // Stable machine-readable code is present alongside the existing shape.
    expect(body.code ?? body.error).toBe('MIN_STEPS_REMAIN');
    expect(updateCalls.length).toBe(0);
    expect(((byId.get('PRT-g3a')!.payload) as Record<string, unknown>).steps).toEqual(stepsA);
  });

  it('deleting the LAST step (1 -> 0) → 422 MIN_STEPS_REMAIN, persists nothing', async () => {
    const existing = protocolEnvelope('PRT-g3b', { steps: [stepsA[0]] });
    const { store, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    delete next.steps; // a PUT body omitting steps is equally fatal (schema required)

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g3b', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(422);
    const body = resultBody as unknown as { error: string; code?: string };
    expect(body.code ?? body.error).toBe('MIN_STEPS_REMAIN');
    expect(updateCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// G4 — duplicate stepId via whole-record PUT
// ---------------------------------------------------------------------------

describe('PUT /records/:id — G4 duplicate stepId', () => {
  it('duplicate stepIds → 400 DUPLICATE_STEP_ID (mirrors POST /steps), persists nothing', async () => {
    const existing = protocolEnvelope('PRT-g4', { steps: stepsA });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [stepsA[0], { ...stepsA[1]!, stepId: 'step-a' }]; // collide on stepId

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g4', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect((resultBody as unknown as { error: string }).error).toBe('DUPLICATE_STEP_ID');
    expect(updateCalls.length).toBe(0);
    expect((byId.get('PRT-g4')!.payload as Record<string, unknown>).steps).toEqual(stepsA);
  });

  it('unique stepIds persist normally (happy path byte-stable)', async () => {
    const existing = protocolEnvelope('PRT-g4ok', { steps: stepsA });
    const { store, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [stepsA[0], stepsA[1], { stepId: 'step-c', label: 'Read', ordinal: 3, kind: 'read' }];

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-g4ok', { payload: next }), reply as unknown as FastifyReply);

    expect(updateCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Content-locked protocol via PUT — existing CONTROLLED_RECORD_LOCKED preserved
// ---------------------------------------------------------------------------

describe('PUT /records/:id — locked protocol (existing handler lock preserved unchanged)', () => {
  it('content edit on an approved protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing', async () => {
    const existing = protocolEnvelope('PRT-locked', {
      lifecycleId: 'protocol-control',
      state: 'approved',
      steps: stepsA,
    });
    const { store, byId, updateCalls } = makeGateStore(existing);
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    (next.steps as Record<string, unknown>[])[0]!.label = 'Edited after approval';

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-locked', { payload: next }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(409);
    expect((resultBody as unknown as { error: string }).error).toBe('CONTROLLED_RECORD_LOCKED');
    expect(updateCalls.length).toBe(0);
    expect((byId.get('PRT-locked')!.payload as Record<string, unknown>).steps).toEqual(stepsA);
  });
});

// ---------------------------------------------------------------------------
// Stale expectedSha conflict — behaviour must stay unchanged
// ---------------------------------------------------------------------------

describe('PUT /records/:id — stale expectedSha conflict preserved', () => {
  it('SHA mismatch still answers 409 with the SHA-mismatch error (not converted to a gate code)', async () => {
    const existing = protocolEnvelope('PRT-sha', { steps: stepsA });
    const store = {
      async get() { return existing; },
      async list() { return []; },
      async update(opts: { envelope: RecordEnvelope; expectedSha?: string }) {
        return { success: false, error: `SHA mismatch: expected ${opts.expectedSha}, got deadbeef` };
      },
    } as unknown as RecordStore;
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    (next.steps as Record<string, unknown>[])[0]!.label = 'Renamed';

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-sha', { payload: next, expectedSha: 'deadbeef' }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(409);
    expect(String((resultBody as unknown as { error: string }).error)).toContain('SHA mismatch');
  });

  it('gate refusal takes precedence over a stale-sha store refusal for an executed-step delete', async () => {
    // A curl writer with a stale sha AND a deleted executed step must see the
    // gate code (the write would not have happened either way).
    const existing = protocolEnvelope('PRT-sha2', { steps: [stepsA[0], stepStarted] });
    const store = {
      async get() { return existing; },
      async list() { return []; },
      async update() { return { success: false, error: 'SHA mismatch: expected x, got y' }; },
    } as unknown as RecordStore;
    const handlers = createRecordHandlers(store);

    const next = structuredClone(existing.payload) as Record<string, unknown>;
    next.steps = [stepsA[0]];

    const reply = makeReply();
    const resultBody = await handlers.updateRecord(makeRequest('PRT-sha2', { payload: next, expectedSha: 'x' }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect((resultBody as unknown as { error: string }).error).toBe('STEP_ALREADY_EXECUTED');
  });
});

// ---------------------------------------------------------------------------
// Non-protocol records are untouched by the new gates
// ---------------------------------------------------------------------------

describe('PUT /records/:id — gates do not fire for non-protocol kinds', () => {
  it('a document PUT with no steps passes through to the store', async () => {
    const doc = {
      recordId: 'DOC-9',
      schemaId: 'https://computable-lab.com/schema/computable-lab/document.schema.yaml',
      payload: { kind: 'document', recordId: 'DOC-9', title: 'Note' },
      meta: {},
    } as unknown as RecordEnvelope;
    const { store, updateCalls } = makeGateStore(doc);
    const handlers = createRecordHandlers(store);

    const reply = makeReply();
    await handlers.updateRecord(
      makeRequest('DOC-9', { payload: { kind: 'document', recordId: 'DOC-9', title: 'Renamed' } }),
      reply as unknown as FastifyReply,
    );

    expect(updateCalls.length).toBe(1);
  });
});
