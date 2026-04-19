import { describe, it, expect } from 'vitest';
import {
  evaluateModelWithUnitCheck,
  type ModelWithUnit,
  type InputWithUnit,
  type UnitWarning,
} from './DerivationModelEngine.js';

describe('evaluateModelWithUnitCheck', () => {
  // Test case 1: All units agree
  it('should have no warnings when all units agree in a sum', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 10, unit: 'mL' },
        b: { value: 5, unit: 'mL' },
      },
      steps: [
        {
          name: 'total',
          op: 'sum',
          operands: [{ ref: 'a' }, { ref: 'b' }],
          unit: 'mL',
        },
      ],
      output: 'total',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(0);
    expect(result.output).toBe(15);
  });

  // Test case 2: Operand unit mismatch in sum
  it('should emit a warning when operand units differ in a sum', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 10, unit: 'mL' },
        b: { value: 5, unit: 'uL' },
      },
      steps: [
        {
          name: 'total',
          op: 'sum',
          operands: [{ ref: 'a' }, { ref: 'b' }],
          unit: 'mL',
        },
      ],
      output: 'total',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(1);
    const warning: UnitWarning = result.unit_warnings[0]!;
    expect(warning.step_name).toBe('total');
    expect(warning.declared_unit).toBe('mL');
    expect(warning.inferred_unit).toBe('mL');
    expect(warning.reason).toContain('mL');
    expect(warning.reason).toContain('uL');
  });

  // Test case 3: Declared vs inferred mismatch in multiply
  it('should emit a warning when declared unit differs from inferred in multiply', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 2, unit: 'mol' },
        b: { value: 3, unit: 'L^-1' },
      },
      steps: [
        {
          name: 'concentration',
          op: 'multiply',
          operands: [{ ref: 'a' }, { ref: 'b' }],
          unit: 'mL',
        },
      ],
      output: 'concentration',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(1);
    const warning: UnitWarning = result.unit_warnings[0]!;
    expect(warning.step_name).toBe('concentration');
    expect(warning.declared_unit).toBe('mL');
    expect(warning.inferred_unit).toBe('mol·L^-1');
    expect(warning.reason).toContain('multiply unit mismatch');
  });

  // Test case 4: Divide dimensionless - no warning when declared is empty
  it('should have no warning when divide of same units declares dimensionless', () => {
    const model: ModelWithUnit = {
      inputs: {
        numerator: { value: 10, unit: 'mol' },
        denominator: { value: 2, unit: 'mol' },
      },
      steps: [
        {
          name: 'ratio',
          op: 'divide',
          operands: [{ ref: 'numerator' }, { ref: 'denominator' }],
          unit: '',
        },
      ],
      output: 'ratio',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(0);
  });

  // Test case 5: Divide dimensionless - warning when declared is not dimensionless
  it('should emit a warning when divide of same units declares non-dimensionless unit', () => {
    const model: ModelWithUnit = {
      inputs: {
        numerator: { value: 10, unit: 'mol' },
        denominator: { value: 2, unit: 'mol' },
      },
      steps: [
        {
          name: 'ratio',
          op: 'divide',
          operands: [{ ref: 'numerator' }, { ref: 'denominator' }],
          unit: 'mol',
        },
      ],
      output: 'ratio',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(1);
    const warning: UnitWarning = result.unit_warnings[0]!;
    expect(warning.step_name).toBe('ratio');
    expect(warning.declared_unit).toBe('mol');
    expect(warning.inferred_unit).toBe('');
    expect(warning.reason).toContain('dimensionless');
  });

  // Test case 6: Unknown operand unit (ref to non-existent step/input)
  it('should emit a warning when an operand references an unknown source', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 10, unit: 'mL' },
        b: { value: 5, unit: 'mL' },
      },
      steps: [
        {
          name: 'total',
          op: 'sum',
          operands: [{ ref: 'a' }, { ref: 'b' }, { ref: 'unknown_step' }],
          unit: 'mL',
        },
      ],
      output: 'total',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    // Should have a warning about unknown unit for 'unknown_step'
    const unknownUnitWarning = result.unit_warnings.find(w => w.reason.includes('unknown unit'));
    expect(unknownUnitWarning).toBeDefined();
    expect(unknownUnitWarning?.inferred_unit).toBeNull();
    expect(unknownUnitWarning?.reason).toContain('unknown_step');
  });

  // Test case 7: Backward compatibility - output matches legacy behavior
  it('should produce correct output values matching legacy evaluation', () => {
    const model: ModelWithUnit = {
      inputs: {
        x: { value: 100, unit: 'uL' },
        y: { value: 25, unit: 'uL' },
      },
      steps: [
        {
          name: 'sum_result',
          op: 'sum',
          operands: [{ ref: 'x' }, { ref: 'y' }],
          unit: 'uL',
        },
      ],
      output: 'sum_result',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.output).toBe(125);
    expect(result.unit_warnings.length).toBe(0);
  });

  // Test case 8: Multiple steps with unit propagation
  it('should handle multiple steps with unit propagation', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 10, unit: 'mL' },
        b: { value: 5, unit: 'mL' },
      },
      steps: [
        {
          name: 'step1',
          op: 'sum',
          operands: [{ ref: 'a' }, { ref: 'b' }],
          unit: 'mL',
        },
        {
          name: 'step2',
          op: 'assign',
          operands: [{ ref: 'step1' }],
          unit: 'mL',
        },
      ],
      output: 'step2',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(0);
  });

  // Test case 9: Assign op should not emit warnings (inferred_unit = null)
  it('should not emit warnings for assign operations', () => {
    const model: ModelWithUnit = {
      inputs: {
        value: { value: 42, unit: 'g' },
      },
      steps: [
        {
          name: 'copy',
          op: 'assign',
          operands: [{ ref: 'value' }],
          unit: 'g',
        },
      ],
      output: 'copy',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    // Assign should not emit warnings
    expect(result.unit_warnings.length).toBe(0);
  });

  // Test case 10: Multiply with matching declared unit
  it('should have no warning when multiply declared unit matches inferred', () => {
    const model: ModelWithUnit = {
      inputs: {
        a: { value: 2, unit: 'mol' },
        b: { value: 3, unit: 'L^-1' },
      },
      steps: [
        {
          name: 'result',
          op: 'multiply',
          operands: [{ ref: 'a' }, { ref: 'b' }],
          unit: 'mol·L^-1',
        },
      ],
      output: 'result',
    };

    const result = evaluateModelWithUnitCheck(model, model.inputs);
    expect(result.unit_warnings.length).toBe(0);
  });
});
