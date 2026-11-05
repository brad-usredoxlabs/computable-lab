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
  'mesh:D056945': 'Hep G2 Cells',
  'XCO:0000988': "Dulbecco's Modified Eagle's Medium",
  'MSIO:0000017': 'fetal bovine serum',
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

  it('unwraps local-prefixed ontology CURIEs instead of treating them as local records', async () => {
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({ materials: [{ ref: { curie: 'local:XCO:0000988' } }] })],
      stubLabeler,
    );

    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toEqual({
      kind: 'ontology',
      id: 'XCO:0000988',
      namespace: 'XCO',
      label: "Dulbecco's Modified Eagle's Medium",
    });
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
    expect((snapshot[0]!.component_ref as Record<string, unknown>).label).toBe('methanol');
    expect((snapshot[1]!.component_ref as Record<string, unknown>).label).toBe('water');
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

  it('strips legacy scalar material_ref fields even when material_ref is otherwise healthy', async () => {
    const event = addMaterial({
      details: {
        material_ref_kind: 'ontology',
        material_ref_id: 'NCBITaxon:10275',
        material_ref_label: 'HepG2 cells',
        material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: "Dulbecco's Modified Eagle's Medium" },
      },
    });

    const [out] = await enrichAddMaterialRefs([event], stubLabeler);
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref_kind).toBeUndefined();
    expect(details.material_ref_id).toBeUndefined();
    expect(details.material_ref_label).toBeUndefined();
    expect(details.material_ref).toMatchObject({ id: 'XCO:0000988' });
  });

  it('strips an invented aliquot ref and rebuilds the cell event from a grounded CURIE', async () => {
    const store = { get: async () => null };
    const [out] = await enrichAddMaterialRefs(
      [
        addMaterial({
          details: {
            aliquot_ref: { kind: 'record', id: 'ALQ-HEPG2-001', type: 'aliquot', label: 'Hep G2 Cells' },
            count: 10000,
          },
          materials: [{ role: 'cells', ref: { curie: 'mesh:D056945' } }],
        }),
      ],
      stubLabeler,
      { store: store as any },
    );

    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.aliquot_ref).toBeUndefined();
    expect(details.material_ref).toEqual({
      kind: 'ontology',
      id: 'mesh:D056945',
      namespace: 'mesh',
      label: 'Hep G2 Cells',
    });
    expect(details.material_source_requirement).toMatchObject({
      status: 'unresolved',
      material_ref: { id: 'mesh:D056945' },
    });
  });

  it('strips an invented material-spec ref and rebuilds DMEM plus 10% FBS from prompt mentions', async () => {
    const store = { get: async () => null };
    const [out] = await enrichAddMaterialRefs(
      [
        addMaterial({
          details: {
            material_spec_ref: { kind: 'record', id: 'MSP-DMEM-10FBS', type: 'material-spec', label: 'DMEM with 10% FBS' },
            volume: { value: 200, unit: 'uL' },
            note: 'Added 200 uL of DMEM with 10% FBS',
          },
        }),
      ],
      stubLabeler,
      {
        store: store as any,
        mentions: [
          { type: 'material', entityKind: 'material', id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" },
          { type: 'material', entityKind: 'material', id: 'MSIO:0000017', label: 'fetal bovine serum' },
        ],
      },
    );

    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_spec_ref).toBeUndefined();
    expect(details.material_ref).toMatchObject({ id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" });
    expect(details.formulation_kind).toBe('complex_composition');
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toMatchObject({ role: 'buffer_component', component_ref: { id: 'XCO:0000988' } });
    expect(snapshot[0]!.concentration).toBeUndefined();
    expect(snapshot[1]).toMatchObject({
      role: 'additive',
      component_ref: { id: 'MSIO:0000017' },
      concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
    });
  });

  it('normalizes duplicated details.materials with component volumes into one cell event and one media event', async () => {
    const event = addMaterial({
      details: {
        labwareId: 'lbw-seed-plate-96-flat',
        wells: ['A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5', 'H5'],
        volume: { value: 200, unit: 'uL' },
        materials: [
          { ref: { curie: 'mesh:D056945' }, role: 'cells', count: 10000 },
          { ref: { curie: 'XCO:0000988' }, role: 'solvent', concentration: { value: 180, unit: 'uL' } },
          { ref: { curie: 'MSIO:0000017' }, role: 'additive', concentration: { value: 20, unit: 'uL' } },
        ],
      },
    });

    const out = await enrichAddMaterialRefs([event, structuredClone(event)], stubLabeler);

    expect(out).toHaveLength(2);
    const cellDetails = (out[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(cellDetails.materials).toBeUndefined();
    expect(cellDetails.material_ref).toMatchObject({ id: 'mesh:D056945', label: 'Hep G2 Cells' });
    expect(cellDetails.count).toBe(10000);
    expect(cellDetails.volume).toBeUndefined();

    const mediumDetails = (out[1] as Record<string, unknown>).details as Record<string, unknown>;
    expect(mediumDetails.materials).toBeUndefined();
    expect(mediumDetails.material_ref).toMatchObject({ id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" });
    const snapshot = mediumDetails.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toMatchObject({ role: 'buffer_component', component_ref: { id: 'XCO:0000988' } });
    expect(snapshot[0]!.concentration).toBeUndefined();
    expect(snapshot[1]).toMatchObject({
      role: 'additive',
      component_ref: { id: 'MSIO:0000017' },
      concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
    });
  });

  it('splits mixed cell and media additions into cell-count and media-formulation events', async () => {
    const out = await enrichAddMaterialRefs(
      [
        addMaterial({
          eventId: 'ai-evt-001',
          details: {
            labwareId: 'lbw-seed-plate-96-flat',
            wells: ['A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5', 'H5'],
            count: 10000,
            volume: { value: 200, unit: 'uL' },
            note: 'Addition of Hep G2 cells and culture medium (DMEM + 10% FBS) to seed plate.',
          },
          materials: [
            {
              ref: { curie: 'mesh:D056945' },
              role: 'cells',
              concentration: { value: 1250, unit: 'cells/uL', basis: 'total_cells_per_volume' },
            },
            { ref: { curie: 'local:XCO:0000988' }, role: 'solvent', concentration: { value: 90, unit: 'percent', basis: 'volume' } },
            {
              ref: { curie: 'local:MSIO:0000017' },
              role: 'additive',
              concentration: { value: 10, unit: 'percent' },
            },
          ],
        }),
      ],
      stubLabeler,
    );

    expect(out).toHaveLength(2);
    const cellDetails = (out[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect((out[0] as Record<string, unknown>).eventId).toBe('ai-evt-001-cells');
    expect(cellDetails.material_ref).toMatchObject({ id: 'mesh:D056945', label: 'Hep G2 Cells' });
    expect(cellDetails.count).toBe(10000);
    expect(cellDetails.volume).toBeUndefined();
    expect(cellDetails.composition_snapshot).toBeUndefined();

    const mediumDetails = (out[1] as Record<string, unknown>).details as Record<string, unknown>;
    expect((out[1] as Record<string, unknown>).eventId).toBe('ai-evt-001-medium');
    expect(mediumDetails.material_ref).toMatchObject({ id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" });
    expect(mediumDetails.count).toBeUndefined();
    expect(mediumDetails.volume).toEqual({ value: 200, unit: 'uL' });
    expect(mediumDetails.formulation_kind).toBe('complex_composition');
    const snapshot = mediumDetails.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toMatchObject({ role: 'buffer_component', component_ref: { id: 'XCO:0000988' } });
    expect(snapshot[1]).toMatchObject({
      role: 'additive',
      component_ref: { id: 'MSIO:0000017' },
      concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
    });
  });

  it('ignores non-add_material events', async () => {
    const event = { eventId: 'evt-2', event_type: 'transfer', verb: 'transfer', details: {} };
    const [out] = await enrichAddMaterialRefs([event], stubLabeler);
    expect(out).toBe(event);
  });

  /* ── S-1 through S-7: single-ref formulation composition expansion ── */

  const formulationFixture = {
    recordId: 'MSP-PR9-TEST-CLO-1MM',
    schemaId: 'material-spec',
    payload: {
      kind: 'material-spec',
      id: 'MSP-PR9-TEST-CLO-1MM',
      name: '1 mM Clofibrate in DMSO',
      material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
      formulation: {
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
        solvent_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
        composition: [
          {
            component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
            role: 'solute',
            concentration: { value: 1, unit: 'mM', basis: 'molar' },
          },
          {
            component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
            role: 'solvent',
          },
        ],
      },
    },
  };

  function makeStoreWithFixture(fixture: any) {
    return { get: async (id: string) => id === 'MSP-PR9-TEST-CLO-1MM' ? fixture : null };
  }

  it('S-1: expands a single bound formulation ref into its declared composition snapshot', async () => {
    const store = makeStoreWithFixture(formulationFixture) as any;
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store },
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toMatchObject({
      role: 'solute',
      component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO' },
      concentration: { value: 1, unit: 'mM', basis: 'molar' },
    });
    expect(snapshot[1]).toMatchObject({
      role: 'solvent',
      component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO' },
    });
    // solvent entry must have NO concentration key (eOPT discipline)
    expect(snapshot[1]!.concentration).toBeUndefined();
    // concentration key must be ABSENT, not undefined
    expect('concentration' in snapshot[1]!).toBe(false);
  });

  it('S-2: expands a single formulation mention (entityKind material-spec) into a snapshot', async () => {
    const store = makeStoreWithFixture(formulationFixture) as any;
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material: '1 mM Clofibrate in DMSO',
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      {
        store,
        mentions: [
          { type: 'material', entityKind: 'material-spec', id: 'MSP-PR9-TEST-CLO-1MM', label: '1 mM Clofibrate in DMSO' },
        ],
      },
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect((details.material_spec_ref as Record<string, unknown>).id).toBe('MSP-PR9-TEST-CLO-1MM');
    expect((details.material_ref as Record<string, unknown>).type).toBe('material-spec');
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
  });

  it('S-3: writes material_ref and material_spec_ref together so accept cannot mint a second spec', async () => {
    const store = makeStoreWithFixture(formulationFixture) as any;
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store },
    );
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toBeDefined();
    expect(details.material_spec_ref).toBeDefined();
    expect((details.material_ref as Record<string, unknown>).id).toBe('MSP-PR9-TEST-CLO-1MM');
    expect((details.material_spec_ref as Record<string, unknown>).id).toBe('MSP-PR9-TEST-CLO-1MM');
    // getAddMaterialRef must resolve to the MSP id (R4 check)
    expect((details.material_spec_ref as Record<string, unknown>).id).toBe('MSP-PR9-TEST-CLO-1MM');
  });

  it('S-4: does not expand when store misses / throws / payload is not material-spec / composition is empty', async () => {
    // Store returns null
    const nullStore = { get: async () => null } as any;
    const [out1] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: 'stock' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store: nullStore },
    );
    expect((out1 as Record<string, unknown>).details).not.toHaveProperty('composition_snapshot');

    // Store throws
    const throwStore = { get: async () => { throw new Error('not found'); } } as any;
    const [out2] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: 'stock' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store: throwStore },
    );
    expect((out2 as Record<string, unknown>).details).not.toHaveProperty('composition_snapshot');

    // Payload kind is not material-spec
    const wrongKindStore = {
      get: async () => ({ payload: { kind: 'material-instance' } }),
    } as any;
    const [out3] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: 'stock' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store: wrongKindStore },
    );
    expect((out3 as Record<string, unknown>).details).not.toHaveProperty('composition_snapshot');

    // No composition array
    const noCompStore = {
      get: async () => ({ envelope: { payload: { kind: 'material-spec', formulation: { concentration: { value: 1, unit: 'mM' } } } } }),
    } as any;
    const [out4] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: 'stock' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store: noCompStore },
    );
    expect((out4 as Record<string, unknown>).details).not.toHaveProperty('composition_snapshot');
  });

  it('S-5: drops entries with no component_ref or no role; no snapshot if < 2 valid', async () => {
    const partialFixture = {
      payload: {
        kind: 'material-spec',
        id: 'MSP-PARTIAL',
        name: 'partial formulation',
        material_ref: { kind: 'record', id: 'MAT-X', type: 'material', label: 'X' },
        formulation: {
          composition: [
            { role: 'solute', concentration: { value: 1, unit: 'mM' } },
            { component_ref: { kind: 'record', id: 'MAT-Y', type: 'material' } },
          ],
        },
      },
    };
    const partialStore = { get: async () => partialFixture } as any;
    const [out] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PARTIAL', type: 'material-spec', label: 'partial' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store: partialStore },
    );
    expect((out as Record<string, unknown>).details).not.toHaveProperty('composition_snapshot');
  });

  it('S-6: regression — multi-ref snapshot is byte-identical', async () => {
    const events = [
      addMaterial({
        materials: [{ ref: { curie: 'CHEBI:17790' } }, { ref: { curie: 'CHEBI:15377' } }],
      }),
    ];
    const [out] = await enrichAddMaterialRefs(events, stubLabeler);
    const details = (out as Record<string, unknown>).details as Record<string, unknown>;
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(2);
    expect((snapshot[0]!.component_ref as Record<string, unknown>).label).toBe('methanol');
    expect((snapshot[1]!.component_ref as Record<string, unknown>).label).toBe('water');
    expect(snapshot.every((s) => s.role === 'other')).toBe(true);
    expect((details.material_ref as Record<string, unknown>).label).toBe('methanol');
  });

  it('S-7: idempotent — existing composition_snapshot is not overwritten', async () => {
    const store = makeStoreWithFixture(formulationFixture) as any;
    const [first] = await enrichAddMaterialRefs(
      [addMaterial({
        details: {
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
          volume: { value: 1, unit: 'uL' },
        },
      })],
      stubLabeler,
      { store },
    );
    const firstDetails = (first as Record<string, unknown>).details as Record<string, unknown>;
    const firstSnapshot = firstDetails.composition_snapshot as Array<Record<string, unknown>>;
    expect(firstSnapshot).toHaveLength(2);

    // Run enrichment again on the already-expanded event
    const [second] = await enrichAddMaterialRefs(
      [first],
      stubLabeler,
      { store },
    );
    const secondDetails = (second as Record<string, unknown>).details as Record<string, unknown>;
    const secondSnapshot = secondDetails.composition_snapshot as Array<Record<string, unknown>>;
    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(secondSnapshot).toHaveLength(2);
  });
});
