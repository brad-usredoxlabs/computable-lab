import { describe, expect, it, vi } from 'vitest';
import { createIntentAcceptHandlers } from './IntentAcceptHandlers.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { CreateRecordOptions } from '../../store/types.js';

const created: RecordEnvelope[] = [];
const mockStore = {
  get: vi.fn(async () => null),
  getRecord: vi.fn(async () => null),
  list: vi.fn(async () => []),
  create: vi.fn(async (opts: CreateRecordOptions) => {
    created.push(opts.envelope);
    return { success: true, recordId: opts.envelope.recordId };
  }),
};

const ctx = { store: mockStore } as never;

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}
function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let s: number | undefined;
  const r = {
    status(code: number) {
      s = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: s, payload });
      return r;
    },
  };
  return { r, calls };
}

const VALID = {
  sourceProtocolId: 'prt-zymo-magbead',
  sourceTitle: 'Zymo MagBead',
  title: 'Zymo MagBead for lab 7',
  localMacro: {
    intentId: 'zymo-local',
    actions: [
      { action: 'spin', rpm: 4000, duration: '5 min' },
      { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: 600 },
      { action: 'transfer', source: 'block', target: 'magstand', volumeUl: 200 },
    ],
  },
  answers: { sample_type: 'bacterial', module_type: 'rack' },
};

describe('createIntentAcceptHandlers', () => {
  it('requires sourceProtocolId + localMacro.actions', async () => {
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({ sourceProtocolId: 'x' }) as never, reply.r as never);
    expect(reply.calls[0].status).toBe(400);
  });

  it('persists a local-protocol with inherits_from + overrides.parameters + branch_resolution', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest(VALID) as never, reply.r as never);

    const payload = reply.calls[0].payload as any;
    expect(payload.ok).toBe(true);
    expect(payload.localProtocol.kind).toBe('local-protocol');
    expect(payload.localProtocol.inherits_from).toMatchObject({ id: 'prt-zymo-magbead', type: 'protocol' });
    expect(payload.localProtocol.status).toBe('active');

    // overrides.parameters preserves the macro actions verbatim (Q6 training shape)
    const params = payload.localProtocol.overrides.parameters;
    expect(params).toHaveLength(3);
    expect(params[0]).toMatchObject({ action: 'spin', rpm: 4000 });
    expect(params[2]).toMatchObject({ action: 'transfer', target: 'magstand' });

    // branch_resolution from answers
    expect(payload.localProtocol.branch_resolution).toHaveLength(2);
    expect(payload.localProtocol.branch_resolution[0]).toMatchObject({ axisId: 'sample_type', branchIds: ['bacterial'] });

    // store got a valid envelope with the LPR- prefix
    expect(created).toHaveLength(1);
    expect(created[0].recordId).toMatch(/^LPR-/);
  });
});