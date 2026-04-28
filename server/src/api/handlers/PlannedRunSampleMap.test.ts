/**
 * Tests for PlannedRunSampleMap handler (setSampleMap endpoint).
 *
 * Covers:
 * - Implicit mode: clears sampleMap
 * - CSV mode happy: stores valid entries
 * - CSV mode invalid wellId: rejects with 400
 * - CSV mode duplicate wellId: rejects with 400
 * - CSV mode empty sampleLabel: rejects with 400
 * - Missing planned-run: rejects with 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordEnvelope } from '../../store/types.js';
import { createPlannedRunHandlers } from './PlannedRunHandlers.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateFromLocalProtocolFn = vi.hoisted(() => vi.fn());

vi.mock('../../protocol/PlannedRunFromLocalProtocolService.js', () => ({
  PlannedRunFromLocalProtocolService: function() {
    return { createFromLocalProtocol: mockCreateFromLocalProtocolFn };
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore() {
  const getFn = vi.fn().mockResolvedValue(null);
  const updateFn = vi.fn().mockResolvedValue({ success: true });

  return {
    get: getFn,
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true }),
    update: updateFn,
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
    _get: getFn,
    _update: updateFn,
  };
}

function makeMockCtx(store: ReturnType<typeof makeMockStore>): AppContext {
  return {
    schemaRegistry: {} as any,
    validator: {} as any,
    lintEngine: {} as any,
    repoAdapter: {} as any,
    store,
    indexManager: {} as any,
    uiSpecLoader: {} as any,
    workspaceRoot: '/tmp',
    recordsDir: 'records',
    schemaDir: 'schema',
    platformRegistry: {} as any,
    lifecycleEngine: {} as any,
    policyBundleService: {} as any,
  } as unknown as AppContext;
}

function makeMockReply() {
  let statusValue = 200;
  let responseBody: unknown = {};

  const reply: any = {
    status: (code: number) => {
      statusValue = code;
      return reply;
    },
    send: (body: unknown) => {
      responseBody = body;
      return reply;
    },
  };

  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  Object.defineProperty(reply, 'responseBody', { get: () => responseBody });

  return reply;
}

function makePlannedRunEnvelope(sampleMap?: unknown[]): RecordEnvelope {
  return {
    recordId: 'PLR-test-001',
    schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
    payload: {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test Run',
      sourceType: 'local-protocol' as const,
      sourceRef: { kind: 'record', id: 'LPR-test-001' },
      state: 'draft' as const,
      ...(sampleMap !== undefined ? { sampleMap } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlannedRunSampleMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setSampleMap — implicit mode', () => {
    it('clears sampleMap when mode is implicit', async () => {
      const existingSampleMap = [
        { wellId: 'A1', sampleLabel: 'sample-1' },
        { wellId: 'A2', sampleLabel: 'sample-2' },
      ];
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope(existingSampleMap));

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-test-001' },
        body: { mode: 'implicit' },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'implicit' };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(200);
      expect(result).toEqual({ success: true, mode: 'implicit', entryCount: 0 });

      // Verify the update was called with sampleMap removed
      const updateCall = store._update.mock.calls[0][0];
      expect((updateCall.envelope.payload as any).sampleMap).toBeUndefined();
    });
  });

  describe('setSampleMap — CSV mode happy path', () => {
    it('stores valid CSV entries', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope());

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const entries = [
        { wellId: 'A1', sampleLabel: 'patient-001' },
        { wellId: 'A2', sampleLabel: 'patient-002' },
        { wellId: 'B1', sampleLabel: 'patient-003' },
      ];

      const request = {
        params: { id: 'PLR-test-001' },
        body: { mode: 'csv', entries },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'csv'; entries: Array<{ wellId: string; sampleLabel: string }> };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(200);
      expect(result).toEqual({ success: true, mode: 'csv', entryCount: 3 });

      // Verify the update was called with sampleMap set
      const updateCall = store._update.mock.calls[0][0];
      expect((updateCall.envelope.payload as any).sampleMap).toEqual(entries);
    });
  });

  describe('setSampleMap — CSV mode validation failures', () => {
    it('rejects invalid wellId for 96-well pattern', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope());

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-test-001' },
        body: { mode: 'csv', entries: [{ wellId: 'Z99', sampleLabel: 'x' }] },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'csv'; entries: Array<{ wellId: string; sampleLabel: string }> };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'INVALID_SAMPLE_MAP',
        message: "well id 'Z99' does not match expected pattern",
      });
    });

    it('rejects duplicate wellId entries', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope());

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-test-001' },
        body: {
          mode: 'csv',
          entries: [
            { wellId: 'A1', sampleLabel: 'first' },
            { wellId: 'A1', sampleLabel: 'second' },
          ],
        },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'csv'; entries: Array<{ wellId: string; sampleLabel: string }> };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'INVALID_SAMPLE_MAP',
        message: "duplicate well id 'A1'",
      });
    });

    it('rejects empty sampleLabel', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope());

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-test-001' },
        body: {
          mode: 'csv',
          entries: [{ wellId: 'A1', sampleLabel: '' }],
        },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'csv'; entries: Array<{ wellId: string; sampleLabel: string }> };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'INVALID_SAMPLE_MAP',
        message: "sampleLabel for well 'A1' must be non-empty",
      });
    });
  });

  describe('setSampleMap — missing planned-run', () => {
    it('returns 404 when planned-run does not exist', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(null);

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-nonexistent' },
        body: { mode: 'implicit' },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'implicit' };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(404);
      expect(result).toEqual({
        error: 'PLANNED_RUN_NOT_FOUND',
        message: 'planned-run PLR-nonexistent not found',
      });
    });

    it('returns 404 when record exists but is not a planned-run', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue({
        recordId: 'STU-001',
        schemaId: 'study.schema.yaml',
        payload: { kind: 'study', recordId: 'STU-001' },
      } as unknown as RecordEnvelope);

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'STU-001' },
        body: { mode: 'implicit' },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: 'implicit' };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(404);
      expect(result).toEqual({
        error: 'PLANNED_RUN_NOT_FOUND',
        message: 'planned-run STU-001 not found',
      });
    });
  });

  describe('setSampleMap — invalid mode', () => {
    it('rejects unknown mode', async () => {
      const store = makeMockStore();
      store._get.mockResolvedValue(makePlannedRunEnvelope());

      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        params: { id: 'PLR-test-001' },
        body: { mode: 'unknown' },
      } as unknown as FastifyRequest<{
        Params: { id: string };
        Body: { mode: string };
      }>;
      const reply = makeMockReply();

      const result = await handlers.setSampleMap(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'INVALID_MODE',
        message: 'mode must be implicit or csv',
      });
    });
  });
});
