// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecordHandlers } from './RecordHandlers';
import type { RecordEnvelope } from '../../types/RecordEnvelope';
import type { RecordStore } from '../../store/types';

// --- stubs -------------------------------------------------------------------

function makeStubStore(records: RecordEnvelope[]) {
  const byId = new Map(records.map((r) => [r.recordId, r]));
  return {
    list: async () => records,
    get: async (id: string) => byId.get(id) ?? null,
  } as unknown as RecordStore;
}

const PRIV: RecordEnvelope = {
  recordId: 'PRIV-EXP-1',
  schemaId: 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
  payload: {
    kind: 'experiment',
    links: { kind: 'record', id: 'MISSING-SECRET' },
  },
  meta: { createdAt: '2024-01-01T00:00:00Z', kind: 'experiment' },
};

// -----------------------------------------------------------------------------

describe('listDanglingReferences – ACL filtering', () => {
  let canAccessMock: ReturnType<typeof vi.fn>;
  let records: RecordEnvelope[];

  beforeEach(() => {
    canAccessMock = vi.fn(async () => false);
    records = [PRIV];
  });

  function buildHandler(allowAll: boolean) {
    if (allowAll) canAccessMock = vi.fn(async () => true);

    const security = {
      identityService: {
        resolveRequestUser: async () => ({ userId: 'USR-1', isSystem: false }),
      },
      authorizationService: {
        canAccess: canAccessMock,
        buildAclSnapshot: async () => ({}),
      },
    };
    return createRecordHandlers(
      makeStubStore(records),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      security as unknown as Parameters<typeof createRecordHandlers>[7],
    );
  }

  it('A – hides dangling rows when canAccess denies', async () => {
    const handler = buildHandler(false);
    const result = await handler.listDanglingReferences({} as any, {} as any);
    expect(result).toEqual({ dangling: [], count: 0 });
    expect(canAccessMock).toHaveBeenCalled();
  });

  it('B – exposes dangling rows when canAccess permits (anti-vacuity)', async () => {
    const handler = buildHandler(true);
    const result = await handler.listDanglingReferences({} as any, {} as any);
    expect(result).not.toHaveProperty('error');
    expect(result.dangling.length).toBe(1);
    expect(result.dangling[0].recordId).toBe('PRIV-EXP-1');
    expect(result.dangling[0].kind).toBe('experiment');
    expect(result.dangling[0].pointer).toBe('links');
    expect(result.dangling[0].targetId).toBe('MISSING-SECRET');
  });
});
