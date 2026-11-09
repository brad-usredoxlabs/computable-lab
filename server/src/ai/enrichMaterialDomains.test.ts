import { describe, expect, it, vi } from 'vitest';
import { enrichMaterialDomains } from './enrichMaterialDomains.js';

const hepg2Record = {
  record: { recordId: 'MAT-MESH-D056945', payload: { kind: 'material', id: 'MAT-MESH-D056945', name: 'HepG2 Cell', domain: 'cell_line' } },
};

function addMaterial(ref: Record<string, unknown>) {
  return { event_type: 'add_material', details: { wells: ['A2'], material_ref: ref } };
}

describe('the material’s TYPE comes from the record, not the model’s memory', () => {
  it('fills the domain of a grounded ref from the stored record', async () => {
    // The reported defect: a grounded HepG2 pick kept the CHEMICAL rule
    // (concentration + volume) because nothing carried `domain: cell_line`.
    const store = { get: vi.fn(async () => hepg2Record) };
    const { events, enriched } = await enrichMaterialDomains(
      [addMaterial({ kind: 'record', id: 'MAT-MESH-D056945', type: 'material', label: 'HepG2 Cell' })],
      store,
    );
    const ref = ((events[0] as Record<string, unknown>).details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect(ref.domain).toBe('cell_line');
    expect(ref.label).toBe('HepG2 Cell');
    expect(enriched).toEqual(['MAT-MESH-D056945']);
    expect(store.get).toHaveBeenCalledWith('MAT-MESH-D056945');
  });

  it('leaves a MINT alone — an ungrounded material has no type yet', async () => {
    const store = { get: vi.fn(async () => hepg2Record) };
    const { events, enriched } = await enrichMaterialDomains([addMaterial({ mint: { label: 'HepG2 cells' } })], store);
    expect(enriched).toEqual([]);
    expect(store.get).not.toHaveBeenCalled();
    expect(((events[0] as Record<string, unknown>).details as Record<string, unknown>).material_ref).toEqual({ mint: { label: 'HepG2 cells' } });
  });

  it('never overwrites a domain the draft already declared', async () => {
    const store = { get: vi.fn(async () => hepg2Record) };
    const { events } = await enrichMaterialDomains(
      [addMaterial({ kind: 'record', id: 'MAT-x', domain: 'chemical' })],
      store,
    );
    const ref = ((events[0] as Record<string, unknown>).details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect(ref.domain).toBe('chemical');
    expect(store.get).not.toHaveBeenCalled();
  });

  it('survives a lookup that fails or finds nothing', async () => {
    const throwing = { get: vi.fn(async () => { throw new Error('no such record'); }) };
    const missing = { get: vi.fn(async () => null) };
    for (const store of [throwing, missing]) {
      const { events, enriched } = await enrichMaterialDomains([addMaterial({ kind: 'record', id: 'MAT-gone' })], store);
      expect(enriched).toEqual([]);
      expect(((events[0] as Record<string, unknown>).details as Record<string, unknown>).material_ref).toEqual({ kind: 'record', id: 'MAT-gone' });
    }
  });

  it('is a pass-through with no store at all', async () => {
    const events = [addMaterial({ kind: 'record', id: 'MAT-x' })];
    const { events: out, enriched } = await enrichMaterialDomains(events, undefined);
    expect(out).toEqual(events);
    expect(enriched).toEqual([]);
  });
});
