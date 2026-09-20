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
