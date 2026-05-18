import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('VendorProtocolCandidateExtractor', () => {
  it('extracts generic non-Zymo protocol candidates from text', () => {
    const document = {
      source: {
        documentId: 'vendor-protocol-generic-dna',
        filename: 'generic-dna.pdf',
        title: 'Generic Magnetic Bead DNA Protocol',
        pageCount: 1,
      },
      text: [
        'Generic Magnetic Bead DNA Protocol',
        '',
        'Product Contents',
        'Lysis Buffer',
        'Proteinase K',
        'Wash Buffer 1',
        'Elution Buffer',
        '',
        'Protocol',
        '1. Add 200 ul Lysis Buffer and 20 ul Proteinase K to each microcentrifuge tube.',
        '2. Incubate at 56 C for 10 minutes.',
        '3. Transfer the lysate to a spin column and centrifuge at 6,000 x g for 1 minute.',
        '4. Add 500 ul Wash Buffer 1 and centrifuge for 1 minute.',
        '5. Place the spin column in a clean collection tube and add 50 ul Elution Buffer.',
      ].join('\n'),
      pages: [{
        pageNumber: 1,
        text: '',
      }],
      sections: [
        {
          id: 'section-product-contents',
          kind: 'product_contents' as const,
          title: 'Product Contents',
          sourceText: 'Product Contents\nLysis Buffer\nProteinase K\nWash Buffer 1\nElution Buffer',
          provenance: { documentId: 'vendor-protocol-generic-dna', pageStart: 1 },
        },
        {
          id: 'section-protocol',
          kind: 'protocol' as const,
          title: 'Protocol',
          sourceText: [
            'Protocol',
            '1. Add 200 ul Lysis Buffer and 20 ul Proteinase K to each microcentrifuge tube.',
            '2. Incubate at 56 C for 10 minutes.',
            '3. Transfer the lysate to a spin column and centrifuge at 6,000 x g for 1 minute.',
            '4. Add 500 ul Wash Buffer 1 and centrifuge for 1 minute.',
            '5. Place the spin column in a clean collection tube and add 50 ul Elution Buffer.',
          ].join('\n'),
          provenance: { documentId: 'vendor-protocol-generic-dna', pageStart: 1, spanStart: 100 },
        },
      ],
      tables: [],
      diagnostics: [],
    };

    const candidate = extractVendorProtocolCandidate(document);

    expect(candidate.steps.map((step) => step.stepNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(candidate.steps[0]?.materials).toEqual(expect.arrayContaining(['lysis buffer', 'proteinase K']));
    expect(candidate.steps[0]?.labware).toContain('microcentrifuge tube');
    expect(candidate.steps[2]?.actions.map((action) => action.actionKind)).toEqual(expect.arrayContaining(['transfer', 'centrifuge']));
    expect(candidate.steps[2]?.equipment).toContain('centrifuge');
    expect(candidate.materials.map((item) => item.label)).toEqual(expect.arrayContaining([
      'lysis buffer',
      'proteinase K',
      'Wash Buffer 1',
      'elution buffer',
    ]));
    expect(candidate.labware.map((item) => item.label)).toEqual(expect.arrayContaining([
      'microcentrifuge tube',
      'spin column',
      'collection tube',
    ]));
    expect(candidate.equipment.map((item) => item.label)).toContain('centrifuge');
  });

  it('converts the Zymo protocol section into a canonical candidate with provenance', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });
    const candidate = extractVendorProtocolCandidate(document);

    expect(candidate.kind).toBe('vendor-protocol-candidate');
    expect(candidate.title).toBe('ZymoBIOMICS 96 MagBead DNA Kit');
    expect(candidate.steps.map((step) => step.stepNumber)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
    expect(candidate.steps.every((step) => step.provenance.pageStart > 0)).toBe(true);
    expect(candidate.steps.every((step) => step.provenance.sectionId === 'section-protocol')).toBe(true);
    expect(candidate.diagnostics.find((diag) => diag.code === 'vendor_protocol_step_discontinuity')).toBeUndefined();
  });

  it('extracts multi-action steps, conditional branches, notes, materials, labware, and equipment', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });
    const candidate = extractVendorProtocolCandidate(document);

    const step5 = candidate.steps.find((step) => step.stepNumber === 5);
    expect(step5?.actions.map((action) => action.actionKind)).toEqual(expect.arrayContaining(['transfer', 'add']));
    expect(step5?.materials).toContain('ZymoBIOMICS MagBinding Buffer');
    expect(step5?.conditions.volumes?.map((volume) => volume.raw)).toEqual(expect.arrayContaining(['up to 200 µl', '600 µl']));

    const step1 = candidate.steps.find((step) => step.stepNumber === 1);
    expect(step1?.branches.length).toBeGreaterThanOrEqual(2);
    expect(step1?.notes.some((note) => note.includes('DNA/RNA Shield'))).toBe(true);

    const step7 = candidate.steps.find((step) => step.stepNumber === 7);
    expect(step7?.actions.map((action) => action.actionKind)).toEqual(expect.arrayContaining(['magnetize', 'aspirate']));
    expect(step7?.equipment).toContain('magnetic stand');

    expect(candidate.materials.map((item) => item.label)).toEqual(expect.arrayContaining([
      'ZymoBIOMICS Lysis Solution',
      'DNA/RNA Shield',
      'ZymoBIOMICS MagBinding Buffer',
      'ZymoBIOMICS MagBinding Beads',
      'ZymoBIOMICS MagWash 1',
      'ZymoBIOMICS MagWash 2',
      'ZymoBIOMICS DNase/RNase Free Water',
    ]));
    expect(candidate.labware.map((item) => item.label)).toEqual(expect.arrayContaining([
      'BashingBead Lysis Rack',
      'ZR BashingBead Lysis Tubes',
      'deep-well block',
      '96-well block',
      'clean elution plate or tube',
    ]));
    expect(candidate.equipment.map((item) => item.label)).toEqual(expect.arrayContaining([
      'bead beater',
      'centrifuge',
      'magnetic stand',
      'heating element',
      'pipette',
      'shaker plate',
    ]));
    expect(candidate.tables.map((table) => table.id)).toEqual(expect.arrayContaining([
      'table-product-contents',
      'table-sample-input',
    ]));
  });
});
