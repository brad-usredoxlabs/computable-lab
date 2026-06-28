import { describe, expect, it, vi } from 'vitest';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { ProtocolAuthoringService } from './ProtocolAuthoringService.js';

const protocolEnvelope: RecordEnvelope = {
  recordId: 'PRT-test',
  schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
  payload: {
    kind: 'protocol',
    recordId: 'PRT-test',
    title: 'PBS wash',
    description: 'Wash cells with PBS buffer and read on a plate reader.\n1. Add PBS to each well.\n2. Incubate for 5 minutes.',
    roles: { materialRoles: [], instrumentRoles: [] },
    steps: [{ stepId: 'plain_text', kind: 'other', description: 'Wash cells with PBS buffer.' }],
  },
  meta: { kind: 'protocol' },
};

function makeStore(initial: RecordEnvelope = protocolEnvelope): RecordStore {
  let current = structuredClone(initial) as RecordEnvelope;
  return {
    get: vi.fn(async (recordId: string) => recordId === current.recordId ? current : null),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ success: true })),
    update: vi.fn(async ({ envelope }) => {
      current = envelope;
      return { success: true, envelope };
    }),
    delete: vi.fn(async () => ({ success: true })),
    validate: vi.fn(async () => ({ valid: true, errors: [] })),
    lint: vi.fn(async () => ({ valid: true, errors: [] })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore;
}

describe('ProtocolAuthoringService', () => {
  it('returns advisory suggestions without mutating the protocol', async () => {
    const store = makeStore();
    const service = new ProtocolAuthoringService(store);

    const result = await service.suggestStructure('PRT-test');

    expect(result.suggestions.some((s) => s.kind === 'material' && s.roleId === 'pbs')).toBe(true);
    expect(result.suggestions.some((s) => s.kind === 'equipment' && s.roleId === 'plate_reader')).toBe(true);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('applies only accepted material and equipment suggestions to role arrays', async () => {
    const store = makeStore();
    const service = new ProtocolAuthoringService(store);

    const result = await service.applySuggestions('PRT-test', [
      { id: 'material:pbs', kind: 'material', label: 'PBS', roleId: 'pbs', description: 'Wash buffer' },
      { id: 'equipment:plate_reader', kind: 'equipment', label: 'Plate reader', roleId: 'plate_reader' },
      { id: 'variant:robot', kind: 'variant', label: 'Robot deck variant' },
    ]);

    const payload = result.protocol.payload as Record<string, any>;
    expect(result.applied).toEqual({ materialRoles: 1, equipmentRoles: 1, steps: 0 });
    expect(payload.roles.materialRoles).toEqual([{ roleId: 'pbs', description: 'Wash buffer' }]);
    expect(payload.roles.instrumentRoles).toEqual([{ roleId: 'plate_reader' }]);
  });

  it('links a Protocol IDE-style authoring session sidecar to the canonical protocol', async () => {
    const store = makeStore();
    const service = new ProtocolAuthoringService(store);

    const result = await service.createAuthoringSession('PRT-test');

    expect(result.sessionId).toMatch(/^PIS-/);
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({
      envelope: expect.objectContaining({
        recordId: result.sessionId,
        payload: expect.objectContaining({
          kind: 'protocol-ide-session',
          latestProtocolRef: { kind: 'record', id: 'PRT-test', type: 'protocol', label: 'PBS wash' },
        }),
      }),
    }));
    expect(store.update).toHaveBeenCalledWith(expect.objectContaining({
      envelope: expect.objectContaining({
        payload: expect.objectContaining({
          authoring: expect.objectContaining({
            sessionRef: expect.objectContaining({ id: result.sessionId, type: 'protocol-ide-session' }),
          }),
        }),
      }),
    }));
  });
});
