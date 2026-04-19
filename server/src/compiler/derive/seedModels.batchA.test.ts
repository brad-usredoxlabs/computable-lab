/**
 * Tests for seed model loader (Batch A).
 * 
 * Tests for DM-ideal-mixing-concentration and DM-dilution-serial models,
 * including loading, structural validation, and execution via DerivationEngine.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect } from 'vitest';
import { loadSeedModel } from './seedModels.js';
import { DerivationEngine } from './DerivationEngine.js';
import { StandardOperatorRegistry } from './operators.js';
import { parseUnit } from './units.js';

/**
 * Create a temporary YAML file with the given content and return its path.
 */
function createTempYaml(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-models-test-'));
  const filePath = path.join(tmpDir, 'test-model.yaml');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Get the path to a model file in the schema/knowledge/derivation-models directory.
 */
function getModelPath(modelName: string): string {
  const repoRoot = path.resolve(__dirname, '../../../..');
  return path.join(repoRoot, 'schema/knowledge/derivation-models', modelName);
}

describe('loadSeedModel - Batch A', () => {
  describe('DM-ideal-mixing-concentration', () => {
    it('loads successfully and has correct structure', () => {
      const model = loadSeedModel(getModelPath('DM-ideal-mixing-concentration.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-ideal-mixing-concentration');
      expect(model.name).toBe('Ideal mixing (2-aliquot concentration)');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('final_concentration');
      expect(model.output.type).toBe('concentration');
      expect(model.steps.length).toBe(5);
      
      // Verify all steps have op field
      for (const step of model.steps) {
        expect(typeof step.op).toBe('string');
      }
    });

    it('runs successfully with 50 mL of 10 mM + 50 mL of 0 mM', () => {
      const model = loadSeedModel(getModelPath('DM-ideal-mixing-concentration.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      // Create Quantity values for the inputs
      const volumeUnit = parseUnit('mL');
      const concentrationUnit = parseUnit('mM');
      
      const inputs: Record<string, unknown> = {
        volume_a: { value: 50, unit: volumeUnit },
        concentration_a: { value: 10, unit: concentrationUnit },
        volume_b: { value: 50, unit: volumeUnit },
        concentration_b: { value: 0, unit: concentrationUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          expect(quantity.value).toBeCloseTo(5, 9); // 5 mM
        }
      }
    });
  });

  describe('DM-dilution-serial', () => {
    it('loads successfully and has correct structure', () => {
      const model = loadSeedModel(getModelPath('DM-dilution-serial.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-dilution-serial');
      expect(model.name).toBe('Serial dilution (K=2 steps)');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('final_concentration');
      expect(model.output.type).toBe('concentration');
      expect(model.steps.length).toBe(2);
      
      // Verify all steps have op field
      for (const step of model.steps) {
        expect(typeof step.op).toBe('string');
      }
    });

    it('runs successfully with stock 100 mM, factor 10 (dimensionless)', () => {
      const model = loadSeedModel(getModelPath('DM-dilution-serial.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      // Create Quantity values for the inputs
      // Factor is dimensionless - use a Quantity with empty base dimensions
      const concentrationUnit = parseUnit('mM');
      const dimensionlessUnit = { base: {}, scale: 1 };  // dimensionless unit
      
      const inputs: Record<string, unknown> = {
        stock_concentration: { value: 100, unit: concentrationUnit },
        factor: { value: 10, unit: dimensionlessUnit },  // dimensionless factor as Quantity
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        // Output should be a Quantity (concentration / dimensionless = concentration)
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          expect(quantity.value).toBeCloseTo(1, 9); // 1 mM
        } else if (typeof output === 'number') {
          // Fallback if engine returns plain number
          expect(output).toBeCloseTo(1, 9);
        }
      }
    });
  });

  describe('validation - rejects invalid models', () => {
    it('rejects semver string version', () => {
      const yamlContent = `
kind: derivation-model
id: DM-test
name: "Test model"
version: "1.0.0"
inputs:
  - name: x
    type: number
output:
  name: y
  type: number
steps:
  - op: assign
    from: x
    into: y
`;
      const tempPath = createTempYaml(yamlContent);
      
      try {
        loadSeedModel(tempPath);
        expect.fail('Should have thrown an error for semver string version');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const message = (err as Error).message;
        expect(message).toContain('invalid derivation model');
        expect(message).toContain('integer');
      } finally {
        // Clean up temp file
        fs.unlinkSync(tempPath);
        fs.rmdirSync(path.dirname(tempPath));
      }
    });

    it('rejects plural outputs (array)', () => {
      const yamlContent = `
kind: derivation-model
id: DM-test
name: "Test model"
version: 1
inputs:
  - name: x
    type: number
outputs:
  - name: y
    type: number
steps:
  - op: assign
    from: x
    into: y
`;
      const tempPath = createTempYaml(yamlContent);
      
      try {
        loadSeedModel(tempPath);
        expect.fail('Should have thrown an error for plural outputs');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const message = (err as Error).message;
        expect(message).toContain('invalid derivation model');
        expect(message).toContain('single output');
      } finally {
        // Clean up temp file
        fs.unlinkSync(tempPath);
        fs.rmdirSync(path.dirname(tempPath));
      }
    });

    it('rejects bad id (not matching DM-* pattern)', () => {
      const yamlContent = `
kind: derivation-model
id: not-a-dm-id
name: "Test model"
version: 1
inputs:
  - name: x
    type: number
output:
  name: y
  type: number
steps:
  - op: assign
    from: x
    into: y
`;
      const tempPath = createTempYaml(yamlContent);
      
      try {
        loadSeedModel(tempPath);
        expect.fail('Should have thrown an error for bad id');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const message = (err as Error).message;
        expect(message).toContain('invalid derivation model');
        expect(message).toContain('DM-');
      } finally {
        // Clean up temp file
        fs.unlinkSync(tempPath);
        fs.rmdirSync(path.dirname(tempPath));
      }
    });
  });

  describe('dimension rejection at run time', () => {
    it('rejects ideal-mixing with volume_b in grams (wrong dimension)', () => {
      const model = loadSeedModel(getModelPath('DM-ideal-mixing-concentration.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      const volumeUnit = parseUnit('mL');
      const massUnit = parseUnit('g');
      const concentrationUnit = parseUnit('mM');
      
      const inputs: Record<string, unknown> = {
        volume_a: { value: 50, unit: volumeUnit },
        concentration_a: { value: 10, unit: concentrationUnit },
        volume_b: { value: 50, unit: massUnit }, // Wrong! Should be volume
        concentration_b: { value: 0, unit: concentrationUnit },
      };
      
      const result = engine.run(model, inputs);
      
      // Engine should fail because we're trying to add volume (mL) and mass (g)
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
      }
    });
  });
});
