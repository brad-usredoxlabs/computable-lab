import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('Zymo PDF decode', () => {
  it('extracts text pages containing the protocol section and vendor steps 1-17', async () => {
    const buffer = await readFile(zymoPdfPath);
    const document = await decodeVendorProtocolPdf(buffer, {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });

    expect(document.source.title).toBe('ZymoBIOMICS 96 MagBead DNA Kit');
    expect(document.source.vendor).toBe('Zymo Research');
    expect(document.source.version).toBe('1.4.1');
    expect(document.pages.length).toBeGreaterThanOrEqual(29);
    expect(document.text).toContain('Protocol');
    expect(document.text).toContain('1.      Add sample to the BashingBead');
    expect(document.text).toContain('17. Transfer the supernatant');
  });
});

