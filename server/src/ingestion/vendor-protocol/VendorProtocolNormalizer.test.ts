import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import { normalizeZymoProtocolCandidate } from './ZymoNormalization.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

async function normalizedZymo() {
  const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
    filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
    documentId: 'vendor-protocol-zymo-magbead',
  });
  return normalizeZymoProtocolCandidate(extractVendorProtocolCandidate(document));
}

describe('VendorProtocolNormalizer', () => {
  it('resolves known Zymo materials, labware, output, and instrument roles', async () => {
    const normalized = await normalizedZymo();

    expect(normalized.kind).toBe('normalized-vendor-protocol-candidate');
    expect(normalized.materialRoles.map((role) => role.roleId)).toEqual(expect.arrayContaining([
      'lysis_solution',
      'dna_rna_shield',
      'magbinding_buffer',
      'magbinding_beads',
      'magwash_1',
      'magwash_2',
      'dnase_rnase_free_water',
      'sample',
      'eluted_dna',
    ]));
    expect(normalized.materialRoles.find((role) => role.roleId === 'magbinding_buffer')).toMatchObject({
      normalizedId: 'zymo-magbinding-buffer',
      status: 'resolved',
    });
    expect(normalized.labwareRoles.find((role) => role.roleId === 'primary_sample_plate')).toMatchObject({
      normalizedId: '96-well-deepwell-plate',
      status: 'resolved',
    });
    expect(normalized.labwareRoles.find((role) => role.roleId === 'reagent_reservoir')).toMatchObject({
      normalizedId: '12-well-reservoir',
      status: 'resolved',
    });
    expect(normalized.labwareRoles.find((role) => role.roleId === 'elution_plate')).toMatchObject({
      normalizedId: '96-well-conical-pcr-plate',
      status: 'resolved',
    });
    expect(normalized.instrumentRoles.find((role) => role.roleId === 'bead_beater')).toMatchObject({
      status: 'manual',
    });
    expect(normalized.instrumentRoles.find((role) => role.roleId === 'centrifuge')).toMatchObject({
      status: 'manual',
    });
    expect(normalized.outputRoles.find((role) => role.roleId === 'eluted_dna')).toBeDefined();
  });

  it('surfaces unresolved waste handling as a normalization gap', async () => {
    const normalized = await normalizedZymo();

    expect(normalized.labwareRoles.find((role) => role.roleId === 'waste')).toMatchObject({
      status: 'unresolved',
    });
    expect(normalized.gaps).toContainEqual(expect.objectContaining({
      code: 'zymo_waste_role_unresolved',
      severity: 'warning',
    }));
  });
});

