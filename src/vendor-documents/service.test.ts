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
});
