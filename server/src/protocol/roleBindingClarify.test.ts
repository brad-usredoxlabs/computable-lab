// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { AppContext } from '../server.js';
import { proposeRoleBindings } from './roleBindingProposal.js';
import { clarificationRequestsFor } from './roleBindingClarify.js';
import { createPlannedRunHandlers } from '../api/handlers/PlannedRunHandlers.js';

function env(recordId: string, kind: string, body: Record<string, unknown> = {}): RecordEnvelope {
  return { recordId, schemaId: 'test', payload: { kind, recordId, ...body }, meta: { kind } };
}

function fakeStore(records: RecordEnvelope[]) {
  return {
    get: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      filter?.kind
        ? records.filter((r) => r.meta?.kind === filter.kind || (r.payload as any).kind === filter.kind)
        : records,
    ),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

const run = (protocolIds: string[]) =>
  env('RUN-1', 'planned-run', {
    localProtocolRefs: protocolIds.map((id) => ({ kind: 'record', id, type: 'local-protocol' })),
  });

const localProtocol = (recordId: string, universalId: string) =>
  env(recordId, 'local-protocol', { inherits_from: { kind: 'record', id: universalId, type: 'protocol' } });

const universalProtocol = (recordId: string, roles: Record<string, unknown>) =>
  env(recordId, 'protocol', { roles });

/**
 * One matching vendor-product -> `proposed`; two matching vendor-products ->
 * `ambiguous`. No material record for either declared id, so the only
 * candidates are the vendor-products themselves and the counts stay exact.
 */
const RECORDS = (): RecordEnvelope[] => [
  run(['LPR-1']),
  localProtocol('LPR-1', 'PRT-uni'),
  universalProtocol('PRT-uni', {
    materialRoles: [
      { roleId: 'medium', allowedMaterialIds: ['MAT-MED'] },
      { roleId: 'enzyme', allowedMaterialIds: ['MAT-ENZ'] },
    ],
  }),
  env('VPR-MED-1', 'vendor-product', { name: 'Medium Aa', material_ref: { id: 'MAT-MED' } }),
  env('VPR-ENZ-B', 'vendor-product', { name: 'Enzyme Bb', material_ref: { id: 'MAT-ENZ' } }),
  env('VPR-ENZ-A', 'vendor-product', { name: 'Enzyme Aa', material_ref: { id: 'MAT-ENZ' } }),
];

async function proposalsOf(store: ReturnType<typeof fakeStore>) {
  return proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
}

describe('clarificationRequestsFor', () => {
  it('emits ONE card naming both candidates for the ambiguous role only', async () => {
    const store = fakeStore(RECORDS());
    const proposals = await proposalsOf(store);
    const roles = proposals.protocols[0]!.roles;
    expect(roles.map((r) => [r.roleId, r.state])).toEqual([
      ['medium', 'proposed'],
      ['enzyme', 'ambiguous'],
    ]);

    const cards = clarificationRequestsFor(proposals);

    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.roleId).toBe('enzyme');
    // proposals are keyed by the run's local-protocol id (the universal only supplies roles)
    expect(card.id).toBe('role-binding-LPR-1-enzyme');
    expect(card.kind).toBe('material');
    expect(card.menuProvider).toBe('choice');
    expect(card.origin).toBe('harness');
    expect(card.options).toEqual([
      { id: 'VPR-ENZ-A', label: 'Enzyme Aa' },
      { id: 'VPR-ENZ-B', label: 'Enzyme Bb' },
    ]);
    for (const candidate of roles[1]!.candidates) {
      expect(card.prompt).toContain(candidate.label);
    }
    expect(card.prompt).toContain('enzyme');
    // the single-candidate role gets no question
    expect(cards.some((c) => c.roleId === 'medium')).toBe(false);
  });

  it('writes no optional key as undefined and no fabricated score/snippet', async () => {
    const cards = clarificationRequestsFor(await proposalsOf(fakeStore(RECORDS())));
    const card = cards[0]!;
    expect(Object.keys(card).sort()).toEqual(
      ['id', 'kind', 'menuProvider', 'options', 'origin', 'prompt', 'roleId'].sort(),
    );
    for (const option of card.options) {
      expect(Object.keys(option).sort()).toEqual(['id', 'label']);
    }
    expect(card).not.toHaveProperty('snippet');
  });

  it('is deterministic across two runs over the same store', async () => {
    const store = fakeStore(RECORDS());
    const first = clarificationRequestsFor(await proposalsOf(store));
    const second = clarificationRequestsFor(await proposalsOf(store));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('returns no cards when nothing is ambiguous', async () => {
    expect(
      clarificationRequestsFor({ protocols: [{ protocolId: 'PRT-uni', roles: [] }] }),
    ).toEqual([]);
  });
});

describe('GET /runs/:id/role-binding-proposals wiring', () => {
  function ctxOf(store: ReturnType<typeof fakeStore>): AppContext {
    return { store } as unknown as AppContext;
  }

  function replyStub() {
    const reply: any = { status: () => reply };
    return reply;
  }

  function requestStub(id: string) {
    return { params: { id } } as any;
  }

  it('adds the card and still writes nothing', async () => {
    const store = fakeStore(RECORDS());
    const handlers = createPlannedRunHandlers(ctxOf(store));

    const body = await handlers.getRoleBindingProposals(requestStub('RUN-1'), replyStub());

    expect(body).toMatchObject({ protocols: [{ protocolId: 'LPR-1' }] });
    const cards = (body as unknown as { clarificationRequests?: unknown[] }).clarificationRequests;
    expect(cards).toHaveLength(1);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('omits the key entirely when every role is already proposed', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { materialRoles: [{ roleId: 'medium', allowedMaterialIds: ['MAT-MED'] }] }),
      env('VPR-MED-1', 'vendor-product', { name: 'Medium Aa', material_ref: { id: 'MAT-MED' } }),
    ]);
    const handlers = createPlannedRunHandlers(ctxOf(store));

    const body = await handlers.getRoleBindingProposals(requestStub('RUN-1'), replyStub());

    expect(body).not.toHaveProperty('clarificationRequests');
    expect(store.create).not.toHaveBeenCalled();
  });
});
