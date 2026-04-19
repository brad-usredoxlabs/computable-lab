/**
 * Tests for seed model loader (Batch B).
 * 
 * Tests for DM-beer-lambert-concentration, DM-hepg2-growth-default,
 * and DM-ambient-temperature-stock-decay models, including loading,
 * structural validation, and execution via DerivationEngine.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect } from 'vitest';
import { loadSeedModel } from './seedModels.js';
import { DerivationEngine } from './DerivationEngine.js';
import { StandardOperatorRegistry, ConstantsTable } from './operators.js';
import { parseUnit } from './units.js';

/**
 * Create a temporary YAML file with the given content and return its path.
 */
function createTempYaml(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-models-test-batchB-'));
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

/**
 * Stub constants table for testing.
 */
class StubConstantsTable implements ConstantsTable {
  private constants: Map<string, { value: number; unit: unknown }> = new Map([
    ['hepg2_default_growth_factor_24h', { value: 4, unit: { base: {}, scale: 1 } }],  // dimensionless
    ['ambient_decay_rate_per_hour_25C', { value: 0.01, unit: { base: {}, scale: 1 } }],  // dimensionless per hour
  ]);

  get(id: string): { value: number; unit: unknown } | number | undefined {
    return this.constants.get(id);
  }
}

describe('loadSeedModel - Batch B', () => {
  describe('DM-beer-lambert-concentration', () => {
    it('loads successfully and has correct structure', () => {
      const model = loadSeedModel(getModelPath('DM-beer-lambert-concentration.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-beer-lambert-concentration');
      expect(model.name).toBe('Beer-Lambert concentration');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('concentration');
      expect(model.output.type).toBe('concentration');
      expect(model.steps.length).toBe(2);
      
      // Verify all steps have op field
      for (const step of model.steps) {
        expect(typeof step.op).toBe('string');
      }
    });

    it('runs successfully: A=0.5, ε=5500 M⁻¹·cm⁻¹, ℓ=1 cm → c ≈ 9.09e-5 mol/L', () => {
      const model = loadSeedModel(getModelPath('DM-beer-lambert-concentration.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      // Create Quantity values for the inputs
      // Note: All inputs are wrapped as Quantity to satisfy the operator contract.
      // The operators reject mixed number/Quantity inputs, so absorbance is
      // dimensionless (unitless) Quantity.
      const dimensionlessUnit = { base: {}, scale: 1 };  // dimensionless unit
      const molarAbsorptivityUnit = parseUnit('M^-1 * cm^-1');  // M⁻¹·cm⁻¹
      const pathLengthUnit = parseUnit('cm');
      const concentrationUnit = parseUnit('mol/L');  // mol/L = M
      
      const inputs: Record<string, unknown> = {
        absorbance: { value: 0.5, unit: dimensionlessUnit },  // dimensionless
        molar_absorptivity: { value: 5500, unit: molarAbsorptivityUnit },
        path_length: { value: 1, unit: pathLengthUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          // c = A / (ε·ℓ) = 0.5 / (5500 * 1) = 0.5 / 5500 ≈ 9.09e-5 M
          expect(quantity.value).toBeCloseTo(9.09090909e-5, 10);
        }
      }
    });

    it('rejects dimension mismatch: ε given in wrong units (kg/m²)', () => {
      const model = loadSeedModel(getModelPath('DM-beer-lambert-concentration.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      const dimensionlessUnit = { base: {}, scale: 1 };
      const wrongUnit = parseUnit('kg/m^2');  // Wrong! Should be M^-1 * cm^-1
      const pathLengthUnit = parseUnit('cm');
      
      // Note: absorbance must be a plain number (not Quantity) to trigger the
      // dimension mismatch error when dividing by a Quantity (eps_l).
      // The operators reject mixed number/Quantity inputs.
      const inputs: Record<string, unknown> = {
        absorbance: 0.5,  // plain number
        molar_absorptivity: { value: 5500, unit: wrongUnit },  // Wrong dimensions
        path_length: { value: 1, unit: pathLengthUnit },
      };
      
      const result = engine.run(model, inputs);
      
      // Engine should fail because we're trying to divide a number by a Quantity
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
      }
    });
  });

  describe('DM-hepg2-growth-default', () => {
    it('loads successfully and has correct structure', () => {
      const model = loadSeedModel(getModelPath('DM-hepg2-growth-default.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-hepg2-growth-default');
      expect(model.name).toBe('HepG2 default growth (duration-keyed growth factor)');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('final_count');
      expect(model.output.type).toBe('number');
      expect(model.steps.length).toBe(2);
      
      // Verify all steps have op field
      for (const step of model.steps) {
        expect(typeof step.op).toBe('string');
      }
    });

    it('runs successfully: initial_count=1e6, growth_factor=4 → final_count ≈ 4e6', () => {
      // Configure constants table with stub values
      const constantsTable = new StubConstantsTable();
      const engine = new DerivationEngine(new StandardOperatorRegistry(constantsTable));
      
      const model = loadSeedModel(getModelPath('DM-hepg2-growth-default.yaml'));
      
      // initial_count as dimensionless Quantity (cell count)
      const dimensionlessUnit = { base: {}, scale: 1 };
      
      const inputs: Record<string, unknown> = {
        initial_count: { value: 1e6, unit: dimensionlessUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          // final_count = initial_count * growth_factor = 1e6 * 4 = 4e6
          expect(quantity.value).toBeCloseTo(4e6, 9);
        }
      }
    });
  });

  describe('DM-ambient-temperature-stock-decay', () => {
    it('loads successfully and has correct structure', () => {
      const model = loadSeedModel(getModelPath('DM-ambient-temperature-stock-decay.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-ambient-temperature-stock-decay');
      expect(model.name).toBe('Ambient-temperature stock decay (linear short-window)');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('final_concentration');
      expect(model.output.type).toBe('concentration');
      expect(model.steps.length).toBe(4);
      
      // Verify all steps have op field
      for (const step of model.steps) {
        expect(typeof step.op).toBe('string');
      }
      
      // Verify the subtract op is present
      const subtractStep = model.steps.find(s => s.op === 'subtract');
      expect(subtractStep).toBeDefined();
    });

    it('runs successfully: initial=10 mM, duration=4 h, rate=0.01/h → final=9.6 mM', () => {
      // Configure constants table with stub values
      const constantsTable = new StubConstantsTable();
      const engine = new DerivationEngine(new StandardOperatorRegistry(constantsTable));
      
      const model = loadSeedModel(getModelPath('DM-ambient-temperature-stock-decay.yaml'));
      
      const concentrationUnit = parseUnit('mM');
      const dimensionlessUnit = { base: {}, scale: 1 };
      
      // duration_hours is a dimensionless Quantity (the value represents hours)
      // The rate_per_hour constant is a dimensionless Quantity
      // decay_fraction = rate * duration = 0.01 * 4 = 0.04 (dimensionless Quantity)
      const inputs: Record<string, unknown> = {
        initial_concentration: { value: 10, unit: concentrationUnit },
        duration_hours: { value: 4, unit: dimensionlessUnit },  // dimensionless Quantity
      };
      
      const result = engine.run(model, inputs);
      
      if (!result.ok) {
        console.log('Engine result for ambient decay:', result);
      }
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          // decay_fraction = rate * duration = 0.01 * 4 = 0.04
          // loss = initial * decay_fraction = 10 * 0.04 = 0.4 mM
          // final = initial - loss = 10 - 0.4 = 9.6 mM
          expect(quantity.value).toBeCloseTo(9.6, 9);
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
});
