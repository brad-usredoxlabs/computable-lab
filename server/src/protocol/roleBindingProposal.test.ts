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

const run = (protocolIds: string[], bindings?: Record<string, unknown>) =>
  env('RUN-1', 'planned-run', {
    localProtocolRefs: protocolIds.map((id) => ({ kind: 'record', id, type: 'local-protocol' })),
    ...(bindings ? { bindings } : {}),
  });

// local-protocol carries no `roles` (schema: unevaluatedProperties false); the
// declarations live on the universal protocol reached via inherits_from.
const localProtocol = (recordId: string, universalId: string) =>
  env(recordId, 'local-protocol', { inherits_from: { kind: 'record', id: universalId, type: 'protocol' } });

const universalProtocol = (recordId: string, roles: Record<string, unknown>) =>
  env(recordId, 'protocol', { roles });

describe('proposeRoleBindings', () => {
  it('proposes a single vendor-product matching one allowed material concept', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { materialRoles: [{ roleId: 'role_one', allowedMaterialIds: ['MAT-001'] }] }),
      env('VPR-1', 'vendor-product', { name: 'Item A', material_ref: { kind: 'record', id: 'MAT-001', type: 'material' } }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates).toHaveLength(1);
    expect(role.candidates[0]).toMatchObject({ recordId: 'VPR-1', recordKind: 'vendor-product' });
    expect(role).not.toHaveProperty('reason');
  });

  it('is ambiguous with every candidate and no default when two vendors match', async () => {
    const recs = [
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { materialRoles: [{ roleId: 'role_two', allowedMaterialIds: ['MAT-002'] }] }),
      env('VPR-B', 'vendor-product', { name: 'Item B', material_ref: { id: 'MAT-002' } }),
      env('VPR-A', 'vendor-product', { name: 'Item A', material_ref: { id: 'MAT-002' } }),
    ];
    const store = fakeStore(recs);
    const first = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const second = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = first.protocols[0]!.roles[0]!;
    expect(role.state).toBe('ambiguous');
    expect(role.candidates.map((c) => c.recordId)).toEqual(['VPR-A', 'VPR-B']);
    expect(role).not.toHaveProperty('selected');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('proposes the labware whose recordId a role declares as an expected kind', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate, Flat Bottom (seed)', labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates.map((c) => c.recordId)).toEqual(['lbw-seed-plate-96-flat']);
    expect(role).not.toHaveProperty('reason');
  });

  it('does not treat a labwareType category as a declared recordId', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['plate'] }] }),
      env('lbw-1', 'labware', { labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('unbound');
    expect(role.candidates).toEqual([]);
  });

  it('reports unbound with a reason when a declared labware kind has no record', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { labwareRoles: [{ roleId: 'role_three', expectedLabwareKinds: ['lbw-missing'] }] }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('unbound');
    expect(role.candidates).toEqual([]);
    expect(role.reason).toContain('role_three');
    expect(role.reason).toContain('lbw-missing');
  });

  it('does not search when a role declares no selector at all', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { materialRoles: [{ roleId: 'unstated' }] }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('unbound');
    expect(role.reason).toMatch(/no .*declar/i);
    expect(face(store.list)).toBe(0);
    expect(face(store.get)).toBe(3); // existence check + declaredRolesOf (local + universal)
  });

  it('reports bound when a labware binding target resolves and has one candidate', async () => {
    const store = fakeStore([
      run(['LPR-1'], {
        labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'lbw-seed-plate-96-flat', type: 'labware' } }],
      }),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1'], { labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'lbw-seed-plate-96-flat', type: 'labware' } }] }) });
    const role = result.protocols[0].roles[0];
    expect(role.state).toBe('bound');
    expect(role.bound).toMatchObject({ recordId: 'lbw-seed-plate-96-flat' });
  });

  it('reports bound when a material binding beats ambiguity', async () => {
    const recs = [
      run(['LPR-1'], {
        materials: [{ roleId: 'role_two', materialRef: { kind: 'record', id: 'VPR-A', type: 'vendor-product' } }],
      }),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', { materialRoles: [{ roleId: 'role_two', allowedMaterialIds: ['MAT-002'] }] }),
      env('VPR-B', 'vendor-product', { name: 'Item B', material_ref: { id: 'MAT-002' } }),
      env('VPR-A', 'vendor-product', { name: 'Item A', material_ref: { id: 'MAT-002' } }),
    ];
    const store = fakeStore(recs);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1'], { materials: [{ roleId: 'role_two', materialRef: { kind: 'record', id: 'VPR-A', type: 'vendor-product' } }] }) });
    const role = result.protocols[0].roles[0];
    expect(role.state).toBe('bound');
    expect(role.bound).toMatchObject({ recordId: 'VPR-A' });
    expect(role.candidates.map(c => c.recordId)).toEqual(['VPR-A', 'VPR-B']);
  });

  it('falls back to candidate count when a binding target does not exist', async () => {
    const store = fakeStore([
      run(['LPR-1'], {
        labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'lbw-gone', type: 'labware' } }],
      }),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1'], { labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'lbw-gone', type: 'labware' } }] }) });
    const role = result.protocols[0].roles[0];
    expect(role.state).toBe('proposed');
    expect(role.reason).toContain('lbw-gone');
  });

  it('does not change state when the binding is for a different role', async () => {
    const store = fakeStore([
      run(['LPR-1'], {
        labware: [{ roleId: 'other-role', labwareInstanceRef: { kind: 'record', id: 'lbw-seed-plate-96-flat', type: 'labware' } }],
      }),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1'], { labware: [{ roleId: 'other-role', labwareInstanceRef: { kind: 'record', id: 'lbw-seed-plate-96-flat', type: 'labware' } }] }) });
    const role = result.protocols[0].roles[0];
    expect(role.state).toBe('proposed');
    expect(role).not.toHaveProperty('bound');
  });

  // u4select — labware-instance projection tests

  it('proposes the labware-instance (not the definition) when one instance exists for a declared definition', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
      env('LBI-1', 'labware-instance', { label: 'Plate Alpha', labwareId: 'lbw-seed-plate-96-flat' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates).toHaveLength(1);
    expect(role.candidates[0]).toMatchObject({
      recordId: 'LBI-1',
      recordKind: 'labware-instance',
      label: 'Plate Alpha',
    });
  });

  it('is ambiguous with three labware-instances for a declared definition (order pinned)', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
      // D1 pin: insert in reverse order so dropping sort would fail
      env('LBI-C', 'labware-instance', { label: 'Plate C', labwareId: 'lbw-seed-plate-96-flat' }),
      env('LBI-A', 'labware-instance', { label: 'Plate A', labwareId: 'lbw-seed-plate-96-flat' }),
      env('LBI-B', 'labware-instance', { label: 'Plate B', labwareId: 'lbw-seed-plate-96-flat' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('ambiguous');
    expect(role.candidates).toHaveLength(3);
    expect(role.candidates.map((c) => c.recordId)).toEqual(['LBI-A', 'LBI-B', 'LBI-C']);
    expect(role.candidates[0]).toMatchObject({ recordKind: 'labware-instance' });
  });

  it('yields identical candidate order when instances arrive shuffled (D1 pin)', async () => {
    // Insert in non-ascending order; a dropped sort would return ['LBI-C', 'LBI-A', 'LBI-B']
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
      env('LBI-C', 'labware-instance', { label: 'Plate C', labwareId: 'lbw-seed-plate-96-flat' }),
      env('LBI-A', 'labware-instance', { label: 'Plate A', labwareId: 'lbw-seed-plate-96-flat' }),
      env('LBI-B', 'labware-instance', { label: 'Plate B', labwareId: 'lbw-seed-plate-96-flat' }),
    ]);
    const first = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const second = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role1 = first.protocols[0]!.roles[0]!;
    const role2 = second.protocols[0]!.roles[0]!;
    // Both runs produce the same deterministic order regardless of fixture insertion order
    expect(role1.candidates.map((c) => c.recordId)).toEqual(['LBI-A', 'LBI-B', 'LBI-C']);
    expect(JSON.stringify(role1)).toBe(JSON.stringify(role2));
  });

  it('falls back to the definition when a declared labware has no instances', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates).toHaveLength(1);
    expect(role.candidates[0]).toMatchObject({
      recordId: 'lbw-seed-plate-96-flat',
      recordKind: 'labware',
    });
  });

  it('does not propose an instance whose labwareId names an undeclared definition', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
      env('lbw-tube-rack', 'labware', { name: 'Tube Rack', labwareType: 'rack' }),
      env('LBI-1', 'labware-instance', { label: 'Tube Rack Alpha', labwareId: 'lbw-tube-rack' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    const role = result.protocols[0]!.roles[0]!;
    expect(role.state).toBe('proposed');
    expect(role.candidates).toHaveLength(1);
    // The instance points to lbw-tube-rack, which is NOT declared — so only the definition is proposed
    expect(role.candidates[0]).toMatchObject({ recordId: 'lbw-seed-plate-96-flat' });
  });

  it('reports bound when the binding points at a definition id even with instances present', async () => {
    const bindings = {
      labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'lbw-seed-plate-96-flat', type: 'labware' } }],
    };
    const store = fakeStore([
      run(['LPR-1'], bindings),
      localProtocol('LPR-1', 'PRT-uni'),
      universalProtocol('PRT-uni', {
        labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-seed-plate-96-flat'] }],
      }),
      env('lbw-seed-plate-96-flat', 'labware', { name: 'Generic 96 Well Plate', labwareType: 'plate' }),
      env('LBI-1', 'labware-instance', { label: 'Plate Alpha', labwareId: 'lbw-seed-plate-96-flat' }),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1'], bindings) });
    const role = result.protocols[0].roles[0];
    expect(role.state).toBe('bound');
    expect(role.bound).toMatchObject({ recordId: 'lbw-seed-plate-96-flat' });
    // Candidates should still be the instance (not the definition)
    expect(role.candidates).toHaveLength(1);
    expect(role.candidates[0].recordId).toBe('LBI-1');
  });
  it('reports protocolNotFound when protocolRef id is absent from the store', async () => {
    const runPayload = env('RUN-1', 'planned-run', {
      protocolRef: { kind: 'record', id: 'PRT-MISSING', type: 'protocol' },
      sourceType: 'protocol',
      sourceRef: { kind: 'record', id: 'PRT-MISSING', type: 'protocol' },
    });
    const store = fakeStore([runPayload]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: runPayload });
    expect(result.protocols).toHaveLength(1);
    const entry = result.protocols[0]!;
    expect(entry.protocolId).toBe('PRT-MISSING');
    expect(entry.roles).toEqual([]);
    expect(entry.protocolNotFound).toBe(true);
    expect(entry.reason).toContain('PRT-MISSING');
  });

  it('reports reason when protocol exists but declares no roles', async () => {
    const store = fakeStore([
      run(['LPR-1']),
      env('LPR-1', 'local-protocol', {}),
    ]);
    const result = await proposeRoleBindings({ store: store as unknown as RecordStore, run: run(['LPR-1']) });
    expect(result.protocols).toHaveLength(1);
    const entry = result.protocols[0]!;
    expect(entry.protocolId).toBe('LPR-1');
    expect(entry.roles).toEqual([]);
    expect(entry.protocolNotFound).toBeUndefined();
    expect(entry.reason).toContain('declares no labware/material roles');
  });
});

function face(fn: unknown): number {
  return (fn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}
