// @vitest-environment node
/**
 * Tests for POST /runs/:id/protocols (attach local-protocol to planned-run).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createPlannedRunHandlers } from './PlannedRunHandlers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeStore extends RecordStore {
  records: Map<string, RecordEnvelope>;
}

function envelopeOf(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
    payload,
  };
}

function makeFakeStore(seed: RecordEnvelope[]): FakeStore {
  const records = new Map<string, RecordEnvelope>(seed.map((e) => [e.recordId, e]));
  const store = {
    records,
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    update: vi.fn(async (options: { envelope: RecordEnvelope }) => {
      records.set(options.envelope.recordId, options.envelope);
      return { success: true };
    }),
  } as unknown as FakeStore;
  return store;
}

function makeMockCtx(store: RecordStore): AppContext {
  return {
    schemaRegistry: {},
    validator: {},
    lintEngine: {},
    repoAdapter: {},
    store,
    indexManager: {},
    uiSpecLoader: {},
    workspaceRoot: '/tmp',
    recordsDir: 'records',
    schemaDir: 'schema',
    platformRegistry: {},
    lifecycleEngine: {},
    policyBundleService: {},
  } as unknown as AppContext;
}

function makeMockReply() {
  let statusValue = 200;

  const reply: any = {
    status: (code: number) => {
      statusValue = code;
      return reply;
    },
  };

  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });

  return reply;
}

function makeRequest(id: string | undefined, body: unknown) {
  return {
    params: { id },
    body,
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: { protocolId?: string } }>;
}

const LPR_A = 'LPR-aaaa-0001';
const LPR_B = 'LPR-bbbb-0002';
const PLR_ID = 'PLR-run-0001';

function plannedRunPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'planned-run', state: 'draft', title: 'Parse run', ...extra };
}

function localProtocolRecord(id: string): RecordEnvelope {
  return envelopeOf(id, { kind: 'local-protocol', title: `Protocol ${id}` });
}

describe('PlannedRunHandlers.attachProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches a local-protocol ref to a run with no protocols', async () => {
    const store = makeFakeStore([envelopeOf(PLR_ID, plannedRunPayload()), localProtocolRecord(LPR_A)]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_A }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(200);
    expect(result).toEqual({ success: true, protocolRefs: [LPR_A] });

    const updateArg = (store.update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
      envelope: RecordEnvelope;
    };
    expect((updateArg.envelope.payload as Record<string, unknown>).localProtocolRefs).toEqual([
      { kind: 'record', id: LPR_A, type: 'local-protocol' },
    ]);
  });

  it('is idempotent: A, then B, then A again keeps [A, B] with no duplicate and no reorder', async () => {
    const store = makeFakeStore([envelopeOf(PLR_ID, plannedRunPayload()), localProtocolRecord(LPR_A), localProtocolRecord(LPR_B)]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));

    const replyA1 = makeMockReply();
    const r1 = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_A }), replyA1 as unknown as FastifyReply);
    expect(replyA1.statusValue).toBe(200);
    expect(r1).toEqual({ success: true, protocolRefs: [LPR_A] });

    const replyB = makeMockReply();
    const r2 = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_B }), replyB as unknown as FastifyReply);
    expect(replyB.statusValue).toBe(200);
    expect(r2).toEqual({ success: true, protocolRefs: [LPR_A, LPR_B] });

    const replyA2 = makeMockReply();
    const r3 = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_A }), replyA2 as unknown as FastifyReply);
    expect(replyA2.statusValue).toBe(200);
    expect(r3).toEqual({ success: true, protocolRefs: [LPR_A, LPR_B] });

    const stored = store.records.get(PLR_ID)!;
    expect((stored.payload as Record<string, unknown>).localProtocolRefs).toEqual([
      { kind: 'record', id: LPR_A, type: 'local-protocol' },
      { kind: 'record', id: LPR_B, type: 'local-protocol' },
    ]);
  });

  it('preserves legacy localProtocolRef byte-identically when attaching another protocol', async () => {
    const legacyRef = { kind: 'record', id: LPR_A, type: 'local-protocol', label: 'Legacy lead' };
    const store = makeFakeStore([
      envelopeOf(PLR_ID, plannedRunPayload({ localProtocolRef: legacyRef })),
      localProtocolRecord(LPR_B),
    ]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_B }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(200);
    expect(result).toEqual({ success: true, protocolRefs: [LPR_A, LPR_B] });

    const stored = store.records.get(PLR_ID)!;
    expect((stored.payload as Record<string, unknown>).localProtocolRef).toEqual(legacyRef);
  });

  it('returns 404 PLANNED_RUN_NOT_FOUND for an unknown run id', async () => {
    const store = makeFakeStore([localProtocolRecord(LPR_A)]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest('PLR-missing', { protocolId: LPR_A }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(404);
    expect(result).toMatchObject({ error: 'PLANNED_RUN_NOT_FOUND' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('returns 400 NOT_A_PLANNED_RUN when the run record has another kind', async () => {
    const store = makeFakeStore([
      envelopeOf(PLR_ID, { kind: 'local-protocol', title: 'not a run' }),
      localProtocolRecord(LPR_A),
    ]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_A }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect(result).toMatchObject({ error: 'NOT_A_PLANNED_RUN' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('returns 404 LOCAL_PROTOCOL_NOT_FOUND for an unknown protocol id', async () => {
    const store = makeFakeStore([envelopeOf(PLR_ID, plannedRunPayload())]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: 'LPR-missing' }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(404);
    expect(result).toMatchObject({ error: 'LOCAL_PROTOCOL_NOT_FOUND' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('returns 400 NOT_A_LOCAL_PROTOCOL when the protocol record has another kind', async () => {
    const store = makeFakeStore([
      envelopeOf(PLR_ID, plannedRunPayload()),
      envelopeOf(LPR_A, { kind: 'protocol', title: 'abstract protocol' }),
    ]);
    const handlers = createPlannedRunHandlers(makeMockCtx(store));
    const reply = makeMockReply();

    const result = await handlers.attachProtocol(makeRequest(PLR_ID, { protocolId: LPR_A }), reply as unknown as FastifyReply);

    expect(reply.statusValue).toBe(400);
    expect(result).toMatchObject({ error: 'NOT_A_LOCAL_PROTOCOL' });
    expect(store.update).not.toHaveBeenCalled();
  });
});
