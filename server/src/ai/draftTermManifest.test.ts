import { describe, expect, it } from 'vitest';
import { draftTermManifest, proposedTerms } from './draftTermManifest.js';

const draft = [
  {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['A2'],
      material_ref: { kind: 'draft', id: 'mint:F praus', label: 'F praus' },
    },
  },
  {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['B2'],
      material_spec_ref: { kind: 'record', id: 'MSP-1', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
      material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
    },
  },
];

describe('draftTermManifest — what each term matched, and where', () => {
  it('classifies a minted term as unmatched and says where it appeared', () => {
    const row = draftTermManifest(draft).find((t) => t.label === 'F praus')!;
    expect(row.source).toBe('minted');
    expect(row.id).toBe('mint:F praus');
    expect(row.eventIndex).toBe(0);
    expect(row.field).toBe('material_ref');
  });

  it('classifies a record ref, an ontology CURIE and a vendor ref', () => {
    const manifest = draftTermManifest(draft);
    expect(manifest.find((t) => t.label === '1 mM Clofibrate in DMSO')!.source).toBe('local-record');
    expect(manifest.find((t) => t.label === 'fenofibrate')!.source).toBe('ontology');

    const vendor = draftTermManifest([
      {
        event_type: 'add_material',
        details: {
          wells: ['A1'],
          vendor_product_ref: {
            kind: 'record',
            id: 'VND-9',
            label: 'Sigma 100% methanol',
            vendor: 'Sigma',
            catalogNumber: '322415',
          },
        },
      },
    ]);
    expect(vendor[0]!.source).toBe('vendor-product');
    expect(vendor[0]!.catalogNumber).toBe('322415');
    expect(vendor[0]!.vendor).toBe('Sigma');
  });

  it('lists a material once even when many wells use it', () => {
    const manifest = draftTermManifest([
      draft[0]!,
      { ...draft[0]!, details: { ...draft[0]!.details, wells: ['C2'] } },
    ]);
    expect(manifest.filter((t) => t.label === 'F praus')).toHaveLength(1);
  });

  it('reads a mint that arrived as `mint:<label>` with no label field', () => {
    const manifest = draftTermManifest([
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'draft', id: 'mint:DMEM' } } },
    ]);
    expect(manifest[0]).toMatchObject({ label: 'DMEM', source: 'minted' });
  });

  it('reads a nested {mint:{label}} ref (the shape small models emit)', () => {
    const manifest = draftTermManifest([
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: { mint: { label: 'HepG2 cells', domain: 'cell_line' } } } },
    ]);
    expect(manifest[0]).toMatchObject({ label: 'HepG2 cells', source: 'minted' });
  });

  it('separates the terms the lab does not have yet', () => {
    expect(proposedTerms(draftTermManifest(draft)).map((t) => t.label)).toEqual(['F praus']);
  });

  it('is empty for a draft with no material refs, and tolerates nothing at all', () => {
    expect(draftTermManifest([{ event_type: 'mix', details: { wells: ['A1'] } }])).toEqual([]);
    expect(draftTermManifest(undefined)).toEqual([]);
    expect(draftTermManifest([])).toEqual([]);
  });
});

describe('labware and equipment appear in the manifest, kind-tagged', () => {
  const wholeDraft = {
    events: [
      { event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' } } },
    ],
    labwareRequirements: [{ classCurie: 'CL:96_well_plate' }],
    labwareAdditions: [{ recordId: 'LBW-7X2Q' }],
    equipmentRequirements: [{ recordId: 'EQP-thermocycler-1', handle: 'cycler 1' }],
  };

  it('classifies a requested labware class (definition) as a labware ontology term', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.kind === 'labware' && t.label === 'CL:96_well_plate')!;
    expect(row.kind).toBe('labware');
    expect(row.source).toBe('ontology');
    expect(row.id).toBe('CL:96_well_plate');
  });

  it('classifies a concrete labware addition as a local-record', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.id === 'LBW-7X2Q')!;
    expect(row.source).toBe('local-record');
    expect(row.kind).toBe('labware');
  });

  it('classifies equipment with a recordId as a local-record', () => {
    const row = draftTermManifest(wholeDraft).find((t) => t.id === 'EQP-thermocycler-1')!;
    expect(row.source).toBe('local-record');
    expect(row.kind).toBe('equipment');
    expect(row.label).toBe('cycler 1'); // prefer handle/name over the id
  });

  it('treats a generic equipment classCurie (no record) as an equipment ontology term', () => {
    const m = draftTermManifest({
      events: [],
      equipmentRequirements: [{ classCurie: 'equipment:water_bath', handle: 'bath 55' }],
    });
    const row = m.find((t) => t.kind === 'equipment')!;
    expect(row.label).toBe('bath 55');
    expect(row.id).toBe('equipment:water_bath');
    expect(row.source).toBe('ontology');
  });

  it('dedupes across events and requirements by label|source|kind without flattening kinds', () => {
    const m = draftTermManifest({
      events: [{ event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' } } }],
      labwareAdditions: [{ recordId: 'LBW-7X2Q' }],
    });
    expect(m.filter((t) => t.id === 'LBW-7X2Q')).toHaveLength(1);
    // a material and a labware with the same label are NOT collapsed
    const both = draftTermManifest({
      events: [{ event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-96well', label: '96 well plate' } } }],
      labwareRequirements: [{ classCurie: 'CL:96_well_plate', handle: '96 well plate' }],
    });
    expect(both.filter((t) => t.label === '96 well plate')).toHaveLength(2);
    expect(both.filter((t) => t.label === '96 well plate').map((t) => t.kind).sort())
      .toEqual(['labware', 'material']);
  });
});
