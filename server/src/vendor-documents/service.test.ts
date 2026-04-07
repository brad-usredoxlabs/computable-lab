import { describe, expect, it } from 'vitest';
import { buildVendorDocumentExtraction } from './service.js';

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
