/**
 * Tests for RecordHandlers lifecycle transition actor identity.
 *
 * The lifecycle transition check must use the authenticated session user as
 * actorId, NOT the spoofable x-actor-id header.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import type { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import { checkLifecycleTransition } from '../../lifecycle/lifecycleMiddleware.js';
import { createRecordHandlers } from './RecordHandlers.js';

vi.mock('../../lifecycle/lifecycleMiddleware.js', () => ({
  checkLifecycleTransition: vi.fn(() => ({
    allowed: true,
    transition: { from: 'draft', to: 'in_review', event: 'SUBMIT_FOR_REVIEW' },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const existingEnvelope: RecordEnvelope = {
  recordId: 'DOC-1',
  schemaId: 'https://computable-lab.com/schema/computable-lab/document.schema.yaml',
  payload: {
    kind: 'document',
    recordId: 'DOC-1',
    lifecycleId: 'document-control',
    state: 'draft',
  },
  meta: {},
} as unknown as RecordEnvelope;

function makeMockStore(): RecordStore {
  return {
    get: vi.fn().mockResolvedValue(existingEnvelope),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true, envelope: existingEnvelope }),
    update: vi.fn().mockResolvedValue({ success: true, envelope: existingEnvelope }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
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

describe('RecordHandlers lifecycle transition actor identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the authenticated session user as actorId, not the x-actor-id header', async () => {
    const store = makeMockStore();
    const identityService = {
      resolveRequestUser: async () => ({ userId: 'USR-CAROL', isSystem: false }),
    };

    const handlers = createRecordHandlers(
      store,
      undefined,
      undefined,
      undefined,
      {} as unknown as LifecycleEngine,
      undefined,
      { identityService } as any,
    );

    const request = {
      params: { id: 'DOC-1' },
      body: {
        payload: {
          kind: 'document',
          recordId: 'DOC-1',
          lifecycleId: 'document-control',
          state: 'in_review',
        },
      },
      headers: { 'x-actor-id': 'USR-SPOOFER' },
    } as unknown as FastifyRequest<{
      Params: { id: string };
      Body: { payload: Record<string, unknown> };
    }>;
    const reply = makeMockReply();

    await handlers.updateRecord(request, reply as unknown as FastifyReply);

    expect(checkLifecycleTransition).toHaveBeenCalled();
    const call = (checkLifecycleTransition as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = call[1] as { actorId?: string };
    expect(options.actorId).toBe('USR-CAROL');
  });
});
