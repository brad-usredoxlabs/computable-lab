import { describe, expect, it } from 'vitest';
import { buildVendorDocumentExtraction } from './service.js';
import {
  shapeDocumentResult,
  filterAndShapeDocumentResults,
  getCuratedProtocolIdeVendors,
} from './service.js';
import { PROTOCOL_IDE_VENDORS, isCuratedVendor } from './protocolIdeVendors.js';

describe('vendor document extraction service', () => {
  it('builds a composition draft from plain text content', async () => {
    const text = [
      'RPMI 1640 formulation',
      'Glucose 2 g/L',
      'L-Glutamine 2 mM',
      'Sodium bicarbonate 2 g/L',
    ].join('\n');

    const result = await buildVendorDocumentExtraction({
      fileName: 'rpmi-1640.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from(text, 'utf8').toString('base64'),
      documentKind: 'formulation_sheet',
      title: 'RPMI 1640 formulation',
    });

    expect(result.document).toMatchObject({
      title: 'RPMI 1640 formulation',
      document_kind: 'formulation_sheet',
      file_ref: {
        file_name: 'rpmi-1640.txt',
        media_type: 'text/plain',
        page_count: 1,
      },
      extraction: {
        method: 'plain_text',
      },
    });
    expect(result.draft).toBeDefined();
    expect((result.draft as { items: Array<{ component_name: string; concentration: { value: number; unit: string } }> }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component_name: 'Glucose',
          concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
        }),
        expect.objectContaining({
          component_name: 'L-Glutamine',
          concentration: { value: 2, unit: 'mM', basis: 'molar' },
        }),
      ]),
    );
  });

  it('builds a composition draft from vendor formulation HTML content', async () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>RPMI-1640 Media Formulation</title></head>
        <body>
          <h1>RPMI-1640 Media Formulation</h1>
          <h2>RPMI-1640 Medium Composition</h2>
          <table>
            <tr><th>Component</th><th>[1x] g/L</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>L-Glutamine</td><td>0.3 g/L</td></tr>
          </table>
          <h2>RPMI-1640 Medium HEPES Modification</h2>
          <table>
            <tr><th>Component</th><th>[1x] g/L</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>HEPES</td><td>4.77 g/L</td></tr>
          </table>
        </body>
      </html>
    `;

    const result = await buildVendorDocumentExtraction({
      fileName: 'rpmi-1640.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(html, 'utf8').toString('base64'),
      documentKind: 'formulation_sheet',
      title: 'RPMI-1640 formulation page',
    });

    expect(result.document).toMatchObject({
      title: 'RPMI-1640 formulation page',
      document_kind: 'formulation_sheet',
      file_ref: {
        file_name: 'rpmi-1640.html',
        media_type: 'text/html',
        page_count: 1,
      },
      extraction: {
        method: 'html_section_parser',
      },
    });
    expect(result.draft).toBeDefined();
    expect(result.drafts).toHaveLength(2);
    expect((result.draft as { extraction_method: string; items: Array<{ component_name: string; concentration?: { value: number; unit: string } }> }).extraction_method).toBe('html_section_parser');
    expect((result.drafts as Array<{ notes?: string }>)[1]?.notes).toContain('HEPES Modification');
    expect((result.draft as { items: Array<{ component_name: string; concentration?: { value: number; unit: string } }> }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component_name: 'Glucose',
          concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
        }),
        expect.objectContaining({
          component_name: 'L-Glutamine',
          concentration: { value: 0.3, unit: 'g/L', basis: 'mass_per_volume' },
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Curated vendor filtering tests
// ---------------------------------------------------------------------------

describe('curated vendor filtering', () => {
  it('returns all six curated vendors', () => {
    const vendors = getCuratedProtocolIdeVendors();
    expect(vendors).toHaveLength(6);
    expect(vendors).toEqual(PROTOCOL_IDE_VENDORS);
  });

  it('recognizes all curated vendor IDs', () => {
    for (const vendor of PROTOCOL_IDE_VENDORS) {
      expect(isCuratedVendor(vendor)).toBe(true);
    }
  });

  it('rejects non-curated vendor IDs', () => {
    expect(isCuratedVendor('atcc')).toBe(false);
    expect(isCuratedVendor('abcam')).toBe(false);
    expect(isCuratedVendor('unknown')).toBe(false);
  });

  it('is case-sensitive for vendor IDs', () => {
    expect(isCuratedVendor('THERMO')).toBe(false);
    expect(isCuratedVendor('Thermo')).toBe(false);
    expect(isCuratedVendor('thermo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Document-oriented search result shaping tests
// ---------------------------------------------------------------------------

describe('document result shaping', () => {
  it('shapes a curated vendor result with all fields', () => {
    const result = shapeDocumentResult(
      'thermo',
      'DNA Extraction Protocol v2',
      'https://www.thermofisher.com/order/catalog/product/12345',
      'A comprehensive DNA extraction protocol for 96-well format.',
    );

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('thermo');
    expect(result!.title).toBe('DNA Extraction Protocol v2');
    expect(result!.pdfUrl).toBe('https://www.thermofisher.com/order/catalog/product/12345');
    expect(result!.landingUrl).toBe('https://www.thermofisher.com/order/catalog/product/12345');
    expect(result!.snippet).toBe('A comprehensive DNA extraction protocol for 96-well format.');
    expect(result!.documentType).toBe('protocol');
    expect(result!.sessionIdHint).toBe('thermo::DNA Extraction Protocol v2');
  });

  it('infers document type from title keywords', () => {
    const protocolResult = shapeDocumentResult('sigma', 'Cell Culture Protocol', 'https://example.com');
    expect(protocolResult?.documentType).toBe('protocol');

    const manualResult = shapeDocumentResult('fisher', 'User Manual for Device X', 'https://example.com');
    expect(manualResult?.documentType).toBe('manual');

    const whitepaperResult = shapeDocumentResult('cayman', 'White Paper on AhR Activation', 'https://example.com');
    expect(whitepaperResult?.documentType).toBe('white_paper');

    const appNoteResult = shapeDocumentResult('vwr', 'Application Note: Redox Assay', 'https://example.com');
    expect(appNoteResult?.documentType).toBe('application_note');

    const otherResult = shapeDocumentResult('thomas', 'General Product Info', 'https://example.com');
    expect(otherResult?.documentType).toBe('other');
  });

  it('returns null for non-curated vendors', () => {
    const result = shapeDocumentResult('atcc', 'ATCC Protocol', 'https://example.com');
    expect(result).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const result = shapeDocumentResult('thermo', 'Minimal Document');
    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('thermo');
    expect(result!.title).toBe('Minimal Document');
    expect(result!.pdfUrl).toBeUndefined();
    expect(result!.landingUrl).toBe('');
    expect(result!.snippet).toBeUndefined();
    expect(result!.documentType).toBe('other');
  });

  it('filterAndShapeDocumentResults is an alias for shapeDocumentResult', () => {
    const shaped = shapeDocumentResult('thermo', 'Test Protocol', 'https://example.com', 'A test');
    const filtered = filterAndShapeDocumentResults('thermo', 'Test Protocol', 'https://example.com', 'A test');
    expect(filtered).toEqual(shaped);
  });
});
