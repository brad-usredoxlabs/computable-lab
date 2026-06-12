import { describe, expect, it } from 'vitest';
import {
  enrichAddMaterialRefs,
  splitCurieList,
  type MaterialLabeler,
} from './materialRefLabels.js';

const LABELS: Record<string, string> = {
  'CHEBI:17790': 'methanol',
  'CHEBI:15377': 'water',
  'local:MAT-tris-7f2a': 'Tris buffer',
};

const stubLabeler: MaterialLabeler = {
  lookup: async (curie) => LABELS[curie] ?? null,
};

function addMaterial(overrides: Record<string, unknown>): Record<string, unknown> {
  return { eventId: 'evt-1', event_type: 'add_material', verb: 'add_material', details: {}, ...overrides };
}

describe('splitCurieList', () => {
  it('splits a comma-joined CURIE list', () => {
    expect(splitCurieList('CHEBI:17790, GO:0006915')).toEqual(['CHEBI:17790', 'GO:0006915']);
  });

  it('never tears apart chemical names with commas', () => {
    expect(splitCurieList('1,2-dichloroethane')).toBeNull();
  });

  it('returns null for a single CURIE', () => {
    expect(splitCurieList('CHEBI:17790')).toBeNull();
  });
});

describe('enrichAddMaterialRefs', () => {
  it('labels a grounded ontology CURIE', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { curie: 'CHEBI:17790' } }] })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toEqual({
      kind: 'ontology',
      id: 'CHEBI:17790',
      namespace: 'CHEBI',
      label: 'methanol',
    });
  });

  it('falls back to the CURIE when no tier knows the label', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { curie: 'XCO:54321' } }] })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect((details.material_ref as Record<string, unknown>).label).toBe('XCO:54321');
  });

  it('maps local: CURIEs to record refs with the record name', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { curie: 'local:MAT-tris-7f2a' } }] })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toEqual({
      kind: 'record',
      id: 'MAT-tris-7f2a',
      type: 'material',
      label: 'Tris buffer',
    });
  });

  it('maps mint refs to draft refs', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { mint: { label: 'mystery juice' } } }] })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toEqual({
      kind: 'draft',
      id: 'mint:mystery juice',
      label: 'mystery juice',
    });
  });

  it('expands multi-entry materials[] into a composition snapshot', async () => {
    const [out] = await enrichAddMaterialRefs(
      [
        addMaterial({
          materials: [{ ref: { curie: 'CHEBI:17790' } }, { ref: { curie: 'CHEBI:15377' } }],
        }),
      ],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect((snapshot[0]!.componentRef as Record<string, unknown>).label).toBe('methanol');
    expect((snapshot[1]!.componentRef as Record<string, unknown>).label).toBe('water');
    expect(snapshot.every((s) => s.role === 'other')).toBe(true);
    expect((details.material_ref as Record<string, unknown>).label).toBe('methanol');
  });

  it('splits a comma-joined CURIE list inside one grounded ref', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { curie: 'CHEBI:17790,CHEBI:15377' } }] })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect((details.composition_snapshot as unknown[]).length).toBe(2);
  });

  it('repairs a degraded comma-joined details.material_ref string', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ details: { material_ref: 'CHEBI:17790,CHEBI:15377' } })],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect((details.composition_snapshot as unknown[]).length).toBe(2);
    expect((details.material_ref as Record<string, unknown>).label).toBe('methanol');
  });

  it('repairs a CURIE-echoed label on an object material_ref', async () => {
    const [out] = await enrichAddMaterialRefs(
      [
        addMaterial({
          details: {
            material_ref: { kind: 'ontology', id: 'CHEBI:17790', namespace: 'CHEBI', label: 'CHEBI:17790' },
          },
        }),
      ],
      stubLabeler,
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect((details.material_ref as Record<string, unknown>).label).toBe('methanol');
  });

  it('leaves a healthy labeled material_ref alone', async () => {
    const ref = { kind: 'ontology', id: 'CHEBI:17790', namespace: 'CHEBI', label: 'methanol (HPLC grade)' };
    const event = addMaterial({ details: { material_ref: ref } });
    const [out] = await enrichAddMaterialRefs([event], stubLabeler);
    expect(out).toBe(event);
  });

  it('leaves events with sibling refs alone', async () => {
    const event = addMaterial({
      details: { aliquot_ref: { id: 'ALQ-1' } },
      materials: [{ ref: { curie: 'CHEBI:17790' } }],
    });
    const [out] = await enrichAddMaterialRefs([event], stubLabeler);
    expect(out).toBe(event);
  });

  it('ignores non-add_material events', async () => {
    const event = { eventId: 'evt-2', event_type: 'transfer', verb: 'transfer', details: {} };
    const [out] = await enrichAddMaterialRefs([event], stubLabeler);
    expect(out).toBe(event);
  });
});
