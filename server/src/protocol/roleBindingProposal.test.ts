// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { proposeRoleBindings } from './roleBindingProposal.js';

function env(recordId: string, kind: string, body: Record<string, unknown> = {}): RecordEnvelope {
  return { recordId, schemaId: 'test', payload: { kind, recordId, ...body }, meta: { kind } };
}

function fakeStore(records: RecordEnvelope[]) {
  return {
    get: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      filter?.kind ? records.filter((r) => r.meta?.kind === filter.kind || (r.payload as any).kind === filter.kind) : records,
    ),
  };
}

const run = (protocolIds: string[]) =>
  env('RUN-1', 'planned-run', { localProtocolRefs: protocolIds.map((id) => ({ kind: 'record', id, type: 'local-protocol' })) });

const protocol = (roles: Record<string, unknown>) => env('PRT-1', 'local-protocol', { roles });

describe('proposeRoleBindings', () => {
  it('proposes a single vendor-product matching one allowed material concept', async () => {
    const store = fakeStore([
      run(['PRT-1']),
      protocol({ materialRoles: [{ roleId: 'role_one', allowedMaterialIds: ['MAT-001'] }] }),
      env('VPR-1', 'vendor-product', { name: 'Item A', material_ref: { kind: 'record', id: 'MAT-001', type: 'material' } }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['PRT-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates).toHaveLength(1);
    expect(role.candidates[0]).toMatchObject({ recordId: 'VPR-1', recordKind: 'vendor-product' });
    expect(role).not.toHaveProperty('reason');
  });

  it('is ambiguous with every candidate and no default when two vendors match', async () => {
    const recs = [
      run(['PRT-1']),
      protocol({ materialRoles: [{ roleId: 'role_two', allowedMaterialIds: ['MAT-002'] }] }),
      env('VPR-B', 'vendor-product', { name: 'Item B', material_ref: { id: 'MAT-002' } }),
      env('VPR-A', 'vendor-product', { name: 'Item A', material_ref: { id: 'MAT-002' } }),
    ];
    const store = fakeStore(recs);
    const first = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['PRT-1']) });
    const second = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['PRT-1']) });
    const role = first.protocols[0]!.roles[0]!;
    expect(role.state).toBe('ambiguous');
    expect(role.candidates.map((c) => c.recordId)).toEqual(['VPR-A', 'VPR-B']);
    expect(role).not.toHaveProperty('selected');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('reports unbound with a reason when a declared labware kind has no record', async () => {
    const store = fakeStore([
      run(['PRT-1']),
      protocol({ labwareRoles: [{ roleId: 'role_three', expectedLabwareKinds: ['lbw-missing'] }] }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['PRT-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('unbound');
    expect(role.candidates).toEqual([]);
    expect(role.reason).toContain('role_three');
    expect(role.reason).toContain('lbw-missing');
  });

  it('does not search when a role declares no selector at all', async () => {
    const store = fakeStore([run(['PRT-1']), protocol({ materialRoles: [{ roleId: 'unstated' }] })]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['PRT-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('unbound');
    expect(role.reason).toMatch(/no .*declar/i);
    expect(face(store.list)).toBe(0);
    expect(face(store.get)).toBe(1);
  });
});

function face(fn: unknown): number {
  return (fn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}
