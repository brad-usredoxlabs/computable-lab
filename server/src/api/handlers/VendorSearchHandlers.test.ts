import { describe, expect, it } from 'vitest';
import { parseDeclaredConcentrationText, parseVendorIds, VALID_VENDOR_IDS } from './VendorSearchHandlers.js';
import { validateIntakeRequest } from '../../protocol/ProtocolIdeIntakeContracts.js';

describe('VendorSearchHandlers', () => {
  it('parses declared concentration from vendor text', () => {
    expect(parseDeclaredConcentrationText('Clofibrate sodium salt solution, 100 mM')).toEqual({
      concentration: {
        value: 100,
        unit: 'mM',
        basis: 'molar',
      },
      sourceText: 'Clofibrate sodium salt solution, 100 mM',
    });
  });

  it('normalizes percent volume fractions', () => {
    expect(parseDeclaredConcentrationText('Triton X-100, 0.1% v/v in PBS')).toEqual({
      concentration: {
        value: 0.1,
        unit: '% v/v',
        basis: 'volume_fraction',
      },
      sourceText: 'Triton X-100, 0.1% v/v in PBS',
    });
  });

  it('returns null when no supported concentration is present', () => {
    expect(parseDeclaredConcentrationText('Dimethyl sulfoxide, molecular biology grade')).toBeNull();
  });

  describe('parseVendorIds', () => {
    it('accepts all six vendor ids', () => {
      const result = parseVendorIds('thermo,sigma,fisher,vwr,cayman,thomas');
      expect(result).toEqual(['thermo', 'sigma', 'fisher', 'vwr', 'cayman', 'thomas']);
    });

    it('accepts a subset of vendor ids', () => {
      const result = parseVendorIds('fisher,vwr');
      expect(result).toEqual(['fisher', 'vwr']);
    });

    it('filters out unknown vendor ids', () => {
      const result = parseVendorIds('thermo,unknown,sigma,bad');
      expect(result).toEqual(['thermo', 'sigma']);
    });

    it('handles case-insensitive input', () => {
      const result = parseVendorIds('Thermo,SIGMA,Fisher');
      expect(result).toEqual(['thermo', 'sigma', 'fisher']);
    });

    it('returns empty array for empty string', () => {
      const result = parseVendorIds('');
      expect(result).toEqual([]);
    });

    it('trims whitespace around vendor ids', () => {
      const result = parseVendorIds(' thermo , sigma ');
      expect(result).toEqual(['thermo', 'sigma']);
    });

    it('deduplicates vendor ids', () => {
      const result = parseVendorIds('thermo,thermo,sigma');
      expect(result).toEqual(['thermo', 'sigma']);
    });
  });

  describe('VALID_VENDOR_IDS', () => {
    it('contains exactly six vendor ids', () => {
      expect(VALID_VENDOR_IDS).toHaveLength(6);
    });

    it('includes all required vendors', () => {
      expect(VALID_VENDOR_IDS).toContain('thermo');
      expect(VALID_VENDOR_IDS).toContain('sigma');
      expect(VALID_VENDOR_IDS).toContain('fisher');
      expect(VALID_VENDOR_IDS).toContain('vwr');
      expect(VALID_VENDOR_IDS).toContain('cayman');
      expect(VALID_VENDOR_IDS).toContain('thomas');
    });

    it('does not contain unknown vendors', () => {
      expect(VALID_VENDOR_IDS).not.toContain('atcc');
      expect(VALID_VENDOR_IDS).not.toContain('other');
    });
  });
});

// ---------------------------------------------------------------------------
// Protocol IDE intake validation tests
// ---------------------------------------------------------------------------

describe('Protocol IDE intake validation', () => {
  describe('vendor_document source mode', () => {
    it('accepts a valid vendor_document intake', () => {
      const request = {
        directiveText: 'extract the DNA extraction protocol and extend it to a 96-well format',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'DNA Extraction Protocol v2',
          pdfUrl: 'https://example.com/protocol.pdf',
          landingUrl: 'https://example.com/protocol',
          snippet: 'A comprehensive DNA extraction protocol.',
          documentType: 'protocol',
          sessionIdHint: 'thermo::DNA Extraction Protocol v2',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.directiveText).toBe(request.directiveText);
        expect(result.request.source.sourceKind).toBe('vendor_document');
        expect(result.request.source.vendor).toBe('thermo');
        expect(result.request.source.title).toBe('DNA Extraction Protocol v2');
      }
    });

    it('rejects vendor_document with missing vendor', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          title: 'Test',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('vendor');
      }
    });

    it('rejects vendor_document with missing title', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('title');
      }
    });

    it('rejects vendor_document with missing landingUrl', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'Test',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('landingUrl');
      }
    });
  });

  describe('pasted_url source mode', () => {
    it('accepts a valid pasted_url intake', () => {
      const request = {
        directiveText: 'extract the DNA extraction protocol',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.source.sourceKind).toBe('pasted_url');
        expect(result.request.source.url).toBe('https://example.com/protocol.pdf');
      }
    });

    it('rejects pasted_url with missing url', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'pasted_url',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('url');
      }
    });
  });

  describe('uploaded_pdf source mode', () => {
    it('accepts a valid uploaded_pdf intake', () => {
      const request = {
        directiveText: 'extract the protocol from this PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.source.sourceKind).toBe('uploaded_pdf');
        expect(result.request.source.uploadId).toBe('upload-abc123');
        expect(result.request.source.fileName).toBe('protocol.pdf');
        expect(result.request.source.mediaType).toBe('application/pdf');
      }
    });

    it('rejects uploaded_pdf with missing uploadId', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('uploadId');
      }
    });

    it('rejects uploaded_pdf with missing fileName', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('fileName');
      }
    });

    it('rejects uploaded_pdf with missing mediaType', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('mediaType');
      }
    });
  });

  describe('directiveText validation', () => {
    it('rejects empty directiveText', () => {
      const request = {
        directiveText: '',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });

    it('rejects whitespace-only directiveText', () => {
      const request = {
        directiveText: '   ',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });

    it('rejects missing directiveText', () => {
      const request = {
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });
  });

  describe('invalid sourceKind', () => {
    it('rejects unknown sourceKind', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'unknown_kind',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown sourceKind');
      }
    });

    it('rejects missing sourceKind', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          vendor: 'thermo',
          title: 'Test',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('sourceKind');
      }
    });
  });

  describe('invalid input types', () => {
    it('rejects null input', () => {
      const result = validateIntakeRequest(null);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });

    it('rejects non-object input', () => {
      const result = validateIntakeRequest('not an object');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });

    it('rejects array input', () => {
      const result = validateIntakeRequest([]);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });
  });

  describe('directiveText trimming', () => {
    it('trims whitespace from directiveText', () => {
      const request = {
        directiveText: '  extract the protocol  ',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.directiveText).toBe('extract the protocol');
      }
    });
  });
});
