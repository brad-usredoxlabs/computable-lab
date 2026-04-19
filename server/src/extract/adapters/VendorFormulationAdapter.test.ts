import { describe, expect, it } from 'vitest';
import { createVendorFormulationAdapter, VENDOR_FORMULATION_DIAGNOSTIC_CODES } from './VendorFormulationAdapter.js';

describe('VendorFormulationAdapter', () => {
  describe('JSON path', () => {
    it('parses JSON array of components and emits material-spec candidates', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const jsonText = JSON.stringify([
        { name: 'Water', amount: 50, unit: '%' },
        { name: 'NaCl', amount: 0.9, unit: '%' }
      ]);
      
      const result = await adapter.extract({
        text: jsonText,
        hint: { sourceKind: 'vendor_formulation_json' }
      });
      
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]?.target_kind).toBe('material-spec');
      expect(result.candidates[0]?.draft.display_name).toContain('Water');
      expect(result.candidates[0]?.draft.amount).toBe(50);
      expect(result.candidates[0]?.draft.unit).toBe('%');
      expect(result.candidates[1]?.draft.display_name).toContain('NaCl');
      expect(result.candidates[1]?.draft.amount).toBe(0.9);
      expect(result.candidates[1]?.draft.unit).toBe('%');
    });

    it('parses JSON object with components array', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const jsonText = JSON.stringify({
        components: [
          { name: 'Glucose', amount: 2, unit: 'g/L' },
          { name: 'Sodium bicarbonate', amount: 2, unit: 'g/L' }
        ]
      });
      
      const result = await adapter.extract({
        text: jsonText,
        hint: { sourceKind: 'vendor_formulation_json' }
      });
      
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]?.draft.display_name).toContain('Glucose');
      expect(result.candidates[0]?.draft.amount).toBe(2);
      expect(result.candidates[1]?.draft.display_name).toContain('Sodium bicarbonate');
    });
  });

  describe('HTML path', () => {
    it('parses HTML with composition section and list items', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const htmlText = '<h2>Composition</h2><ul><li>Water 50%</li><li>NaCl 0.9%</li></ul>';
      
      const result = await adapter.extract({
        text: htmlText,
        hint: { sourceKind: 'vendor_formulation_html' }
      });
      
      expect(result.candidates.length).toBeGreaterThan(0);
      const hasWater = result.candidates.some(c => 
        c.draft.display_name?.toString().toLowerCase().includes('water')
      );
      const hasNaCl = result.candidates.some(c => 
        c.draft.display_name?.toString().toLowerCase().includes('nacl')
      );
      expect(hasWater).toBe(true);
      expect(hasNaCl).toBe(true);
    });

    it('parses HTML with formulation section and table-like rows', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const htmlText = `
        <h1>Product Details</h1>
        <h2>Formulation</h2>
        <p>Glucose 2 g/L</p>
        <p>Sodium bicarbonate 2 g/L</p>
        <p>L-Glutamine 0.3 g/L</p>
      `;
      
      const result = await adapter.extract({
        text: htmlText
      });
      
      expect(result.candidates.length).toBeGreaterThan(0);
      const hasGlucose = result.candidates.some(c => 
        c.draft.display_name?.toString().toLowerCase().includes('glucose')
      );
      expect(hasGlucose).toBe(true);
    });

    it('handles HTML without explicit section headers', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const htmlText = '<p>Water 50%</p><p>NaCl 0.9%</p>';
      
      const result = await adapter.extract({
        text: htmlText
      });
      
      // Should still find components even without section headers
      expect(result.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('returns diagnostic for malformed JSON', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const result = await adapter.extract({
        text: 'not valid json {',
        hint: { sourceKind: 'vendor_formulation_json' }
      });
      
      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.severity).toBe('error');
      expect(result.diagnostics[0]?.code).toBe(VENDOR_FORMULATION_DIAGNOSTIC_CODES.VENDOR_FORMULATION_PARSE_FAILED);
    });

    it('never throws on invalid input', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      // Should not throw even with completely invalid input
      await expect(adapter.extract({ text: '' })).resolves.toEqual({
        candidates: [],
        diagnostics: expect.any(Array)
      });
    });
  });

  describe('Target kind', () => {
    it('emits candidates with target_kind material-spec for JSON path', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const result = await adapter.extract({
        text: JSON.stringify([{ name: 'Test', amount: 1 }]),
        hint: { sourceKind: 'vendor_formulation_json' }
      });
      
      expect(result.candidates[0]?.target_kind).toBe('material-spec');
    });

    it('emits candidates with target_kind material-spec for HTML path', async () => {
      const adapter = await createVendorFormulationAdapter();
      
      const result = await adapter.extract({
        text: '<h2>Composition</h2><p>Test 10%</p>'
      });
      
      if (result.candidates.length > 0) {
        expect(result.candidates[0]?.target_kind).toBe('material-spec');
      }
    });
  });
});
