// ARCHITECTURAL INVARIANT
// ------------------------
// corrected_fluorescence is a WELL-CONTEXT FIELD computed in the
// derive_context pass family. Projection passes READ it; they do NOT
// compute it. See compiler-specs/70-derivation-models.md §9.4.
// Static cross-family enforcement lives in spec-073's
// DerivationBoundary.invariant.test.ts — adding a projection pass that
// imports DerivationEngine will fail that invariant.

/**
 * Tests for DM-fluorescence-background-subtraction seed model.
 * 
 * This model implements per-well background subtraction for fluorescence
 * readings: corrected = sample - blank. The output is a well-context field
 * that must be computed in the derive_context pass family, NOT in projection.
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

describe('DM-fluorescence-background-subtraction', () => {
  describe('happy path', () => {
    it('sample 5000 AU, blank 500 AU → corrected 4500 AU', () => {
      const model = loadSeedModel(getModelPath('DM-fluorescence-background-subtraction.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      // Use dimensionless unit for AU (arbitrary units)
      const dimensionlessUnit = parseUnit('1');
      
      const inputs = {
        sample_fluorescence: { value: 5000, unit: dimensionlessUnit },
        blank_fluorescence: { value: 500, unit: dimensionlessUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          expect(quantity.value).toBe(4500);
        }
      }
    });
  });

  describe('zero blank', () => {
    it('blank = 0 AU → corrected equals sample', () => {
      const model = loadSeedModel(getModelPath('DM-fluorescence-background-subtraction.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      const dimensionlessUnit = parseUnit('1');
      
      const inputs = {
        sample_fluorescence: { value: 3200, unit: dimensionlessUnit },
        blank_fluorescence: { value: 0, unit: dimensionlessUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          expect(quantity.value).toBe(3200);
        }
      }
    });
  });

  describe('negative corrected', () => {
    it('sample 100, blank 150 → corrected = -50 (NOT an error)', () => {
      const model = loadSeedModel(getModelPath('DM-fluorescence-background-subtraction.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      const dimensionlessUnit = parseUnit('1');
      
      const inputs = {
        sample_fluorescence: { value: 100, unit: dimensionlessUnit },
        blank_fluorescence: { value: 150, unit: dimensionlessUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.output;
        expect(typeof output).toBe('object');
        if (typeof output === 'object' && output !== null && 'value' in output) {
          const quantity = output as { value: number; unit: unknown };
          expect(quantity.value).toBe(-50);
        }
      }
    });
  });

  describe('dimension mismatch', () => {
    it('sample in AU, blank in mM → engine {ok:false} from subtract dim check', () => {
      const model = loadSeedModel(getModelPath('DM-fluorescence-background-subtraction.yaml'));
      const engine = new DerivationEngine(new StandardOperatorRegistry());
      
      const dimensionlessUnit = parseUnit('1');
      const mMUnit = parseUnit('mM');
      
      const inputs = {
        sample_fluorescence: { value: 5000, unit: dimensionlessUnit },
        blank_fluorescence: { value: 500, unit: mMUnit },
      };
      
      const result = engine.run(model, inputs);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
        expect(result.reason).toContain('dimension mismatch');
      }
    });
  });

  describe('load model', () => {
    it('loader returns model with version === 1, output.name === "corrected_fluorescence", steps.length === 1', () => {
      const model = loadSeedModel(getModelPath('DM-fluorescence-background-subtraction.yaml'));
      
      expect(model.kind).toBe('derivation-model');
      expect(model.id).toBe('DM-fluorescence-background-subtraction');
      expect(model.name).toBe('Fluorescence background subtraction');
      expect(model.version).toBe(1);
      expect(typeof model.version).toBe('number');
      expect(Number.isInteger(model.version)).toBe(true);
      expect(model.output.name).toBe('corrected_fluorescence');
      expect(model.output.type).toBe('quantity');
      expect(model.steps.length).toBe(1);
      
      // Verify the step has the correct structure
      const step = model.steps[0];
      expect(step).toBeDefined();
      expect(step?.op).toBe('subtract');
      expect(step?.lhs).toBe('sample_fluorescence');
      expect(step?.rhs).toBe('blank_fluorescence');
      expect(step?.into).toBe('corrected_fluorescence');
    });
  });

  describe('validation - rejects invalid models', () => {
    it('rejects semver string version', () => {
      const yamlContent = `
kind: derivation-model
id: DM-fluorescence-test
name: "Fluorescence test model"
version: "1.0.0"
inputs:
  - name: sample
    type: quantity
  - name: blank
    type: quantity
output:
  name: corrected
  type: quantity
steps:
  - op: subtract
    lhs: sample
    rhs: blank
    into: corrected
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
id: DM-fluorescence-test
name: "Fluorescence test model"
version: 1
inputs:
  - name: sample
    type: quantity
  - name: blank
    type: quantity
outputs:
  - name: corrected
    type: quantity
steps:
  - op: subtract
    lhs: sample
    rhs: blank
    into: corrected
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
id: fluorescence-background
name: "Fluorescence test model"
version: 1
inputs:
  - name: sample
    type: quantity
  - name: blank
    type: quantity
output:
  name: corrected
  type: quantity
steps:
  - op: subtract
    lhs: sample
    rhs: blank
    into: corrected
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
