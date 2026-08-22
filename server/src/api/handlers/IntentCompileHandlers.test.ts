import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileHandlers } from './IntentCompileHandlers.js';

function mockStore(labware: Array<{ recordId: string; name: string }> = []) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string }) => {
      if (filter?.kind === 'labware') {
        return labware.map((l) => ({
          recordId: l.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
          payload: { kind: 'labware', name: l.name },
        }));
      }
      return [];
    }),
  };
}

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) {
      currentStatus = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: currentStatus, payload });
      return r;
    },
  };
  return { r, calls };
}

function mockStoreReport() {
  return mockStore([
    { recordId: 'LAB-standard-plate', name: 'standards' },
    { recordId: 'LAB-fresh-plate', name: 'fresh_plate' },
  ]);
}

describe('createIntentCompileHandlers', () => {
  it('compiles a serial-dilution intent with resolvable labware into mix+transfer events', async () => {
    const handlers = createIntentCompileHandlers({ store: mockStoreReport() as any });
    const reply = send();
    const req = mockRequest({
      intent: `
intentId: ex-1
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 4
    replicates: 1
`,
    });
    await handlers.compile(req as any, reply.r as any);
    expect(reply.calls).toHaveLength(1);
    const result = reply.calls[0].payload as {
      outcome: string;
      terminalArtifacts: { events: Array<{ event_type: string }> };
    };
    expect(result.outcome).toBe('complete');
    const types = result.terminalArtifacts.events.map((e) => e.event_type);
    expect(types).toContain('mix');
    expect(types).toContain('transfer');
  });

  it('rejects an invalid intent document with 422', async () => {
    const handlers = createIntentCompileHandlers({ store: mockStoreReport() as any });
    const reply = send();
    await handlers.compile(
      mockRequest({ intent: `intentId: x\nactions:\n  - action: vaporize\n` }) as any,
      reply.r as any,
    );
    expect(reply.calls[0].status).toBe(422);
  });
});