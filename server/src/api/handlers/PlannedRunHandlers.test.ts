/**
 * Tests for PlannedRunHandlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createPlannedRunHandlers } from './PlannedRunHandlers.js';

// ---------------------------------------------------------------------------
// Module-level mocks for services used in chaining tests
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

function makeMockStore(): RecordStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true }),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

function makeMockCtx(store: RecordStore): AppContext {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlannedRunHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFromLocalProtocol', () => {
    it('returns 201 with plannedRunId and state on success', async () => {
      mockCreateFromLocalProtocolFn.mockResolvedValue({
        ok: true,
        plannedRunRef: 'PLR-plan-test-abc12345',
        envelope: {} as RecordEnvelope,
      });

      const store = makeMockStore();
      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        body: { localProtocolRef: 'LPR-test-001' },
      } as unknown as FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>;
      const reply = makeMockReply();

      const result = await handlers.createFromLocalProtocol(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(201);
      expect(result).toEqual({
        plannedRunId: 'PLR-plan-test-abc12345',
        state: 'draft',
      });
    });

    it('returns 400 when localProtocolRef is missing', async () => {
      mockCreateFromLocalProtocolFn.mockResolvedValue({
        ok: false,
        reason: 'localProtocolRef required',
        status: 400,
      });

      const store = makeMockStore();
      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        body: { localProtocolRef: '' },
      } as unknown as FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>;
      const reply = makeMockReply();

      const result = await handlers.createFromLocalProtocol(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'CREATE_PLANNED_RUN_FAILED',
        message: 'localProtocolRef required',
      });
    });

    it('returns 404 when local-protocol is not found', async () => {
      mockCreateFromLocalProtocolFn.mockResolvedValue({
        ok: false,
        reason: 'local-protocol not found',
        status: 404,
      });

      const store = makeMockStore();
      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        body: { localProtocolRef: 'LPR-nonexistent' },
      } as unknown as FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>;
      const reply = makeMockReply();

      const result = await handlers.createFromLocalProtocol(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(404);
      expect(result).toEqual({
        error: 'CREATE_PLANNED_RUN_FAILED',
        message: 'local-protocol not found',
      });
    });

    it('returns 400 when resolved record is not a local-protocol', async () => {
      mockCreateFromLocalProtocolFn.mockResolvedValue({
        ok: false,
        reason: 'resolved record is not a local-protocol (kind=protocol)',
        status: 400,
      });

      const store = makeMockStore();
      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        body: { localProtocolRef: 'PRT-wrong' },
      } as unknown as FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>;
      const reply = makeMockReply();

      const result = await handlers.createFromLocalProtocol(request, reply as unknown as FastifyReply);

      expect(reply.statusValue).toBe(400);
      expect(result).toEqual({
        error: 'CREATE_PLANNED_RUN_FAILED',
        message: 'resolved record is not a local-protocol (kind=protocol)',
      });
    });

    it('passes custom title to the service', async () => {
      mockCreateFromLocalProtocolFn.mockResolvedValue({
        ok: true,
        plannedRunRef: 'PLR-custom-plan-xyz',
        envelope: {} as RecordEnvelope,
      });

      const store = makeMockStore();
      const ctx = makeMockCtx(store);
      const handlers = createPlannedRunHandlers(ctx);

      const request = {
        body: { localProtocolRef: 'LPR-test-001', title: 'My Custom Plan' },
      } as unknown as FastifyRequest<{
        Body: { localProtocolRef: string; title?: string };
      }>;
      const reply = makeMockReply();

      await handlers.createFromLocalProtocol(request, reply as unknown as FastifyReply);

      expect(mockCreateFromLocalProtocolFn).toHaveBeenCalledWith(
        'LPR-test-001',
        { title: 'My Custom Plan' },
      );
    });
  });
});
