// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { writeRoleBindings, type BindingLists, type RoleBindingWriteResult } from './roleBindingWrite.js';
import { createPlannedRunHandlers } from '../api/handlers/PlannedRunHandlers.js';

function env(recordId: string, kind: string, body: Record<string, unknown> = {}): RecordEnvelope {
  return { recordId, schemaId: 'test', payload: { kind, recordId, ...body }, meta: { kind } };
}

function fakeStore(records: RecordEnvelope[]) {
  return {
    get: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
    update: vi.fn(async () => ({ success: true })),
  };
}

const asStore = (store: unknown) => store as unknown as RecordStore;

// Schema-valid chain: local-protocol carries no `roles` (unevaluatedProperties:
// false); the declarations live on the universal protocol via inherits_from.id.
const universalProtocol = (roles: Record<string, unknown>) => env('PRT-U1', 'protocol', { roles });
const chainedProtocol = (roles: Record<string, unknown>) => [
  universalProtocol(roles),
  env('PRT-1', 'local-protocol', { inherits_from: { kind: 'record', id: 'PRT-U1', type: 'protocol' } }),
];

const run = (body: Record<string, unknown> = {}) =>
  env('RUN-1', 'planned-run', {
    localProtocolRefs: [{ kind: 'record', id: 'PRT-1', type: 'local-protocol' }],
    ...body,
  });

const write = (records: RecordEnvelope[], bindings: BindingLists, body: Record<string, unknown> = {}) =>
  writeRoleBindings({ store: asStore(fakeStore(records)), run: run(body), bindings });

function bindingsOf(result: RoleBindingWriteResult): Record<string, unknown> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.bindings;
}

const labwareRole = { labwareRoles: [{ roleId: 'plate', expectedLabwareKinds: ['lbw-x'] }] };
const materialRole = { materialRoles: [{ roleId: 'reagent', allowedMaterialIds: ['M-1'] }] };

describe('writeRoleBindings', () => {
  it('resolves declared roles through inherits_from on the universal protocol', async () => {
    const result = await write(
      [run(), ...chainedProtocol(labwareRole), env('LAB-1', 'labware', { name: 'Plate' })],
      { labware: [{ roleId: 'plate', labwareInstanceRef: 'LAB-1' }] },
    );
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);

    expect(result.bindings.labware).toEqual([
      { roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'LAB-1', type: 'labware' } },
    ]);
  });

  it('rejects a roleId no attached protocol declares and writes nothing', async () => {
    const store = fakeStore([run(), ...chainedProtocol(labwareRole)]);
    const result = await writeRoleBindings({
      store: asStore(store),
      run: run(),
      bindings: { labware: [{ roleId: 'plat', labwareInstanceRef: 'LAB-1' }] },
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_A_DECLARED_ROLE' });
    if (result.ok) throw new Error('expected rejection');
    expect(result.message).toContain('plat');
    expect(store.update).not.toHaveBeenCalled();
    expect(store.get.mock.calls.map((c) => c[0])).toContain('PRT-1');
    expect(store.get.mock.calls.map((c) => c[0])).toContain('PRT-U1');
  });

  it('writes the ref type from the target record kind, not a literal', async () => {
    const bindings = bindingsOf(await write(
      [run(), ...chainedProtocol(labwareRole), env('LAB-1', 'labware', { name: 'Plate' })],
      { labware: [{ roleId: 'plate', labwareInstanceRef: 'LAB-1' }] },
    ));

    expect(bindings.labware).toEqual([
      { roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'LAB-1', type: 'labware' } },
    ]);
  });

  it('carries lotNumber where the target record schema keeps it, absent otherwise', async () => {
    // The lot paths are the schemas' declared paths; the fixtures also omit the
    // required `id` and carry an injected payload.recordId, so they are not Ajv-valid.
    const records = [
      run(),
      ...chainedProtocol(materialRole),
      env('MI-1', 'material-instance', { name: 'Reagent A', material_ref: { kind: 'record', id: 'MAT-1', type: 'material' }, lot: { lot_number: 'L-77' } }),
      env('LOT-1', 'material-lot', { material_ref: { kind: 'record', id: 'MAT-1', type: 'material' }, lot_number: 'L-88' }),
      env('VPR-1', 'vendor-product'),
    ];
    const bind = async (id: string) =>
      bindingsOf(await write(records, { materials: [{ roleId: 'reagent', materialInstanceRef: id }] }));

    expect((await bind('MI-1')).materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'MI-1', type: 'material-instance' }, lotNumber: 'L-77' },
    ]);
    expect((await bind('LOT-1')).materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'LOT-1', type: 'material-lot' }, lotNumber: 'L-88' },
    ]);

    const withoutLot = await bind('VPR-1');
    expect(withoutLot.materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'VPR-1', type: 'vendor-product' } },
    ]);
    const [material] = withoutLot.materials as Array<Record<string, unknown>>;
    expect(Object.keys(material!)).not.toContain('lotNumber');
  });

  it('prefers supplier.vendor_lot over lot_number for material-lot', async () => {
    // vendor_lot takes precedence (mirrors shelfLookup.ts canonical reader).
    const records = [
      run(),
      ...chainedProtocol(materialRole),
      // Case A: only vendor_lot, no lot_number — must carry VL-9
      env('LOT-2', 'material-lot', { material_ref: { kind: 'record', id: 'MAT-1', type: 'material' }, supplier: { name: 'Sigma', vendor_lot: 'VL-9' } }),
      // Case B: both vendor_lot and lot_number — vendor_lot wins
      env('LOT-3', 'material-lot', { material_ref: { kind: 'record', id: 'MAT-1', type: 'material' }, lot_number: 'L-88', supplier: { vendor_lot: 'VL-9' } }),
      // Case C: aliquot with lot.lot_number — pins the arm advc could delete green
      env('ALQ-1', 'aliquot', { lot: { lot_number: 'L-55' } }),
    ];
    const bind = async (id: string) =>
      bindingsOf(await write(records, { materials: [{ roleId: 'reagent', materialInstanceRef: id }] }));

    // Case A: vendor_lot only
    expect((await bind('LOT-2')).materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'LOT-2', type: 'material-lot' }, lotNumber: 'VL-9' },
    ]);

    // Case B: vendor_lot wins over lot_number
    expect((await bind('LOT-3')).materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'LOT-3', type: 'material-lot' }, lotNumber: 'VL-9' },
    ]);

    // Case C: aliquot carries lot
    expect((await bind('ALQ-1')).materials).toEqual([
      { roleId: 'reagent', materialRef: { kind: 'record', id: 'ALQ-1', type: 'aliquot' }, lotNumber: 'L-55' },
    ]);
  });

  it('rejects an unknown target id by name', async () => {
    const store = fakeStore([run(), ...chainedProtocol(labwareRole)]);
    const result = await writeRoleBindings({
      store: asStore(store),
      run: run(),
      bindings: { labware: [{ roleId: 'plate', labwareInstanceRef: 'LAB-404' }] },
    });

    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_BINDING_TARGET' });
    if (result.ok) throw new Error('expected rejection');
    expect(result.message).toContain('LAB-404');
    expect(store.update).not.toHaveBeenCalled();
  });

  it('replaces only the posted roles and keeps bindings for other roles', async () => {
    const other = { roleId: 'other', labwareInstanceRef: { kind: 'record', id: 'LAB-9', type: 'labware' } };
    const bindings = bindingsOf(await write(
      [run({ bindings: { labware: [other] } }), ...chainedProtocol(labwareRole), env('LAB-1', 'labware')],
      { labware: [{ roleId: 'plate', labwareInstanceRef: 'LAB-1' }] },
      { bindings: { labware: [other] } },
    ));

    expect(bindings.labware).toEqual([
      other,
      { roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'LAB-1', type: 'labware' } },
    ]);
  });

  it('handler saves only the run envelope and maps a rejected role to 400', async () => {
    const records = [run(), ...chainedProtocol(labwareRole), env('LAB-1', 'labware')];
    const store = fakeStore(records);
    const handlers = createPlannedRunHandlers({ store: asStore(store) } as unknown as AppContext);
    const reply = { status: vi.fn().mockReturnThis() } as unknown as FastifyReply;
    const request = (roleId: string) =>
      ({ params: { id: 'RUN-1' }, body: { labware: [{ roleId, labwareInstanceRef: 'LAB-1' }] } }) as any;

    expect(await handlers.updateBindings(request('plate'), reply)).toEqual({ success: true });
    expect(store.update).toHaveBeenCalledTimes(1);
    const saved = store.update.mock.calls[0]![0] as { envelope: RecordEnvelope };
    expect(saved.envelope.recordId).toBe('RUN-1');
    expect(saved.envelope.payload.kind).toBe('planned-run');
    expect(records.slice(1).map((r) => r.recordId)).not.toContain(saved.envelope.recordId);

    const rejected = await handlers.updateBindings(request('plat'), reply);
    expect(rejected).toMatchObject({ error: 'NOT_A_DECLARED_ROLE' });
    if (!('error' in rejected)) throw new Error('expected ApiError');
    expect(rejected.message).toContain('plat');
    expect(store.update).toHaveBeenCalledTimes(1);
  });
});
