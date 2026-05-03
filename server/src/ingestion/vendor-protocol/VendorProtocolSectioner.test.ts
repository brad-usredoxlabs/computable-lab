import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('VendorProtocolSectioner', () => {
  it('identifies the primary Zymo protocol section and excludes appendices/ordering content', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });

    const protocol = document.sections.find((section) => section.kind === 'protocol');
    expect(protocol).toBeDefined();
    expect(protocol?.sourceText).toContain('Sample Lysis');
    expect(protocol?.sourceText).toContain('17. Transfer the supernatant');
    expect(protocol?.sourceText).not.toContain('Appendices\nAppendix A');
    expect(protocol?.sourceText).not.toContain('Ordering Information');
    expect(protocol?.provenance.pageStart).toBeGreaterThan(0);
    expect(protocol?.provenance.pageEnd).toBeGreaterThanOrEqual(protocol!.provenance.pageStart);
  });

  it('extracts protocol-relevant tables with page provenance', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });

    const sampleInput = document.tables.find((table) => table.id === 'table-sample-input');
    expect(sampleInput).toBeDefined();
    expect(sampleInput?.headers).toEqual(['Sample Type', 'Maximum Input']);
    expect(sampleInput?.rows).toContainEqual({ 'Sample Type': 'Feces', 'Maximum Input': '100 mg' });
    expect(sampleInput?.provenance.pageStart).toBeGreaterThan(0);

    const productContents = document.tables.find((table) => table.id === 'table-product-contents');
    expect(productContents).toBeDefined();
    expect(productContents?.rows.some((row) => row.Component.includes('MagBinding Buffer'))).toBe(true);
  });
});
