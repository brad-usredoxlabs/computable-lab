import { describe, expect, it } from 'vitest';
import { parseDeclaredConcentrationText, parseVendorIds, VALID_VENDOR_IDS } from './VendorSearchHandlers.js';

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
