import { describe, expect, it } from 'vitest';
import { parseVendorProtocolPdf } from './vendorProtocolPdf.js';

// Representative DNA extraction protocol text fixture
const PROTOCOL_TEXT = `DNeasy Blood & Tissue Kit Protocol

1. Pipet 20 µL proteinase K into a 1.5 mL microcentrifuge tube.
2. Add 200 µL Buffer AL to the sample. Mix thoroughly by vortexing.
3. Incubate at 56°C for 10 min.
4. Add 200 µL ethanol (96-100%) to the sample. Mix thoroughly by vortexing.
5. Pipet the mixture into the DNeasy Mini spin column placed in a 2 mL collection tube. Centrifuge at 6000 x g for 1 min. Discard flow-through.
6. Add 500 µL Buffer AW1. Centrifuge at 6000 x g for 1 min. Discard flow-through.
7. Add 500 µL Buffer AW2. Centrifuge at 20,000 x g for 3 min.
8. Transfer the spin column to a new 1.5 mL microcentrifuge tube. Add 200 µL Buffer AE. Incubate at room temperature for 1 min. Centrifuge at 6000 x g for 1 min.`;

describe('vendorProtocolPdf adapter', () => {
  describe('parseVendorProtocolPdf', () => {
    it('extracts the correct number of steps from protocol text', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      expect(result.steps).toHaveLength(8);
    });

    it('extracts the protocol title correctly', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      expect(result.title).toBe('DNeasy Blood & Tissue Kit Protocol');
    });

    it('extracts correct verb keywords for multiple steps', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      // Step 1: Pipet
      const step1 = result.steps.find(s => s.stepNumber === 1);
      expect(step1?.verbKeyword).toBe('pipette');
      
      // Step 2: Add
      const step2 = result.steps.find(s => s.stepNumber === 2);
      expect(step2?.verbKeyword).toBe('add');
      
      // Step 3: Incubate
      const step3 = result.steps.find(s => s.stepNumber === 3);
      expect(step3?.verbKeyword).toBe('incubate');
      
      // Step 5: Pipet (first verb in the step)
      const step5 = result.steps.find(s => s.stepNumber === 5);
      expect(step5?.verbKeyword).toBe('pipette');
      
      // Step 8: Transfer
      const step8 = result.steps.find(s => s.stepNumber === 8);
      expect(step8?.verbKeyword).toBe('transfer');
    });

    it('extracts materials with volumes from steps', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      // Step 2 should have Buffer AL with volume
      const step2 = result.steps.find(s => s.stepNumber === 2);
      expect(step2?.materials.length).toBeGreaterThanOrEqual(1);
      const bufferAl = step2?.materials.find(m => m.name.includes('Buffer AL'));
      expect(bufferAl).toBeDefined();
      expect(bufferAl?.volume).toBe('200 µL');
      
      // Step 6 should have Buffer AW1 with volume
      const step6 = result.steps.find(s => s.stepNumber === 6);
      expect(step6?.materials.length).toBeGreaterThanOrEqual(1);
      const bufferAw1 = step6?.materials.find(m => m.name.includes('Buffer AW1'));
      expect(bufferAw1).toBeDefined();
      expect(bufferAw1?.volume).toBe('500 µL');
    });

    it('extracts equipment hints from steps', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      // Step 3 should have incubator hint
      const step3 = result.steps.find(s => s.stepNumber === 3);
      expect(step3?.equipmentHints).toContain('incubator');
      
      // Step 5 should have centrifuge hint
      const step5 = result.steps.find(s => s.stepNumber === 5);
      expect(step5?.equipmentHints).toContain('centrifuge');
      
      // Step 2 should have vortex hint
      const step2 = result.steps.find(s => s.stepNumber === 2);
      expect(step2?.equipmentHints).toContain('vortex');
    });

    it('extracts parameters correctly', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      // Step 3: Incubate at 56°C for 10 min
      const step3 = result.steps.find(s => s.stepNumber === 3);
      expect(step3?.parameters.temperature).toBe('56°C');
      expect(step3?.parameters.duration).toBe('10 min');
      
      // Step 5: Centrifuge at 6000 x g for 1 min
      const step5 = result.steps.find(s => s.stepNumber === 5);
      expect(step5?.parameters.speed).toBe('6000 x g');
      expect(step5?.parameters.duration).toBe('1 min');
      
      // Step 6: Add 500 µL Buffer AW1
      const step6 = result.steps.find(s => s.stepNumber === 6);
      expect(step6?.parameters.volume).toBe('500 µL');
    });

    it('creates a deduplicated materials index', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      expect(result.materialsIndex.length).toBeGreaterThan(0);
      
      // Check that Buffer AL, Buffer AW1, Buffer AW2, Buffer AE are in the index
      const materialNames = result.materialsIndex.map(m => m.name);
      expect(materialNames).toContain('Buffer AL');
      expect(materialNames).toContain('Buffer AW1');
      expect(materialNames).toContain('Buffer AW2');
      expect(materialNames).toContain('Buffer AE');
      
      // Verify no duplicates
      const uniqueNames = new Set(materialNames);
      expect(materialNames.length).toBe(uniqueNames.size);
    });

    it('creates a deduplicated equipment index', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      expect(result.equipmentIndex.length).toBeGreaterThan(0);
      
      // Check for expected equipment hints
      expect(result.equipmentIndex).toContain('centrifuge');
      expect(result.equipmentIndex).toContain('vortex');
      expect(result.equipmentIndex).toContain('incubator');
      
      // Verify no duplicates
      const uniqueHints = new Set(result.equipmentIndex);
      expect(result.equipmentIndex.length).toBe(uniqueHints.size);
    });

    it('handles empty input gracefully', () => {
      const result = parseVendorProtocolPdf('');
      expect(result.steps).toHaveLength(0);
      expect(result.materialsIndex).toHaveLength(0);
      expect(result.equipmentIndex).toHaveLength(0);
    });

    it('handles whitespace-only input gracefully', () => {
      const result = parseVendorProtocolPdf('   \n\n   ');
      expect(result.steps).toHaveLength(0);
      expect(result.materialsIndex).toHaveLength(0);
      expect(result.equipmentIndex).toHaveLength(0);
    });

    it('preserves raw text for each step', () => {
      const result = parseVendorProtocolPdf(PROTOCOL_TEXT);
      
      const step3 = result.steps.find(s => s.stepNumber === 3);
      expect(step3?.rawText).toBe('Incubate at 56°C for 10 min.');
      
      const step6 = result.steps.find(s => s.stepNumber === 6);
      expect(step6?.rawText).toBe('Add 500 µL Buffer AW1. Centrifuge at 6000 x g for 1 min. Discard flow-through.');
    });
  });
});
