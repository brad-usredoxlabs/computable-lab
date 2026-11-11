/**
 * Tests for buildPlanGraph — POST /runs/:id/plan-graph
 *
 * L2-SUBPROTO-g3f1: verify inherits_from resolution at the handler seam.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createPlannedRunHandlers } from './PlannedRunHandlers.js';

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

function makeMockCtx(store: RecordStore, schemaRegistry?: any): AppContext {
  return {
    schemaRegistry: schemaRegistry || {} as any,
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

describe('buildPlanGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves inherits_from steps and roles from the universal protocol', async () => {
    const universalSteps = [
      { stepId: 'step-1', kind: 'incubate', target: { labwareRole: 'plate' }, sampleRole: 'sample' },
      { stepId: 'step-2', kind: 'read', target: { labwareRole: 'plate' } },
    ];
    const universalRoles = {
      labwareRoles: [{ roleId: 'plate' }],
      materialRoles: [{ roleId: 'sample' }],
    };

    // Local protocol: no steps, has inherits_from
    const localPayload = {
      kind: 'local-protocol',
      inherits_from: { kind: 'record', id: 'PRT-universal-1', type: 'protocol' },
    };

    // Universal protocol: has steps and roles
    const universalPayload = {
      kind: 'protocol',
      steps: universalSteps,
      roles: universalRoles,
    };

    // Run payload with bindings
    const runPayload = {
      kind: 'planned-run',
      localProtocolRefs: [{ kind: 'record', id: 'LPR-local-1', type: 'local-protocol' }],
      bindings: {
        labware: [
          { roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'LAB-plate-1', type: 'labware-instance' } },
        ],
        materials: [
          { roleId: 'sample', materialRef: { kind: 'record', id: 'MAT-sample-1', type: 'material-instance' } },
        ],
      },
    };

    const store = makeMockStore();
    // First get: run record
    vi.mocked(store.get).mockResolvedValueOnce({
      recordId: 'PLR-run-1',
      schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
      payload: runPayload,
    } as RecordEnvelope);
    // Second get: local protocol
    vi.mocked(store.get).mockResolvedValueOnce({
      recordId: 'LPR-local-1',
      schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
      payload: localPayload,
    } as RecordEnvelope);
    // Third get: universal protocol (via inherits_from.id)
    vi.mocked(store.get).mockResolvedValueOnce({
      recordId: 'PRT-universal-1',
      schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      payload: universalPayload,
    } as RecordEnvelope);

    const schemaRegistry = {
      getById: vi.fn().mockReturnValue({
        schema: {
          $defs: {
            PlateEvent: {
              properties: {
                event_type: {
                  enum: ['incubate', 'read', 'pipette', 'seal', 'unseal', 'centrifuge', 'shake'],
                },
              },
            },
          },
        },
      }),
    };

    const ctx = makeMockCtx(store, schemaRegistry);
    const handlers = createPlannedRunHandlers(ctx);

    const request = {
      params: { id: 'PLR-run-1' },
    } as unknown as FastifyRequest<{ Params: { id: string } }>;
    const reply = makeMockReply();

    const result = await handlers.buildPlanGraph(request, reply);

    // Should succeed with 200, not fail with 409 MALFORMED_PROTOCOL
    expect(reply.statusValue).toBe(200);
    expect((result as any).success).toBe(true);
    expect((result as any).graphId).toBeDefined();

    // Verify the universal protocol was fetched via inherits_from
    expect(store.get).toHaveBeenCalledWith('PRT-universal-1');
  });
});
