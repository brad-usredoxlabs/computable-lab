import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('VendorProtocolCandidateExtractor', () => {
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
