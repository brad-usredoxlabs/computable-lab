/**
 * Standard operator registry for derivation engine.
 * 
 * Implements the 8 Phase 1 operators:
 * assign, sum, subtract, divide, multiply, clamp, weighted_average, lookup_constant
 * 
 * Operators dispatch on step.op and read arguments from named fields on the step record.
 */

import type { OperatorRegistry, DerivationStep, WorkingState, Quantity, WorkingValue, Unit } from './DerivationEngine.js';
import { parseUnit, multiplyUnits, divideUnits, convertTo, dimensionsEqual } from './units.js';

export interface ConstantsTable {
  get(id: string): Quantity | number | undefined;
}

/**
 * Check if a value is a Quantity (has value and unit properties).
 */
function isQuantity(v: WorkingValue): v is Quantity {
  return typeof v === 'object' && v !== null && 'value' in v && 'unit' in v;
}

/**
 * Check if a value is finite (not NaN, Infinity, or -Infinity).
 */
function isFiniteNumber(v: number): boolean {
  return Number.isFinite(v);
}

/**
 * StandardOperatorRegistry implements OperatorRegistry with 8 operators.
 */
export class StandardOperatorRegistry implements OperatorRegistry {
  constructor(private readonly constants?: ConstantsTable) {}

  invoke(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const op = step.op;
    
    if (typeof op !== 'string') {
      return { ok: false, reason: 'unknown operator: undefined' };
    }

    switch (op) {
      case 'assign':
        return this.opAssign(step, state);
      case 'sum':
        return this.opSum(step, state);
      case 'subtract':
        return this.opSubtract(step, state);
      case 'divide':
        return this.opDivide(step, state);
      case 'multiply':
        return this.opMultiply(step, state);
      case 'clamp':
        return this.opClamp(step, state);
      case 'weighted_average':
        return this.opWeightedAverage(step, state);
      case 'lookup_constant':
        return this.opLookupConstant(step, state);
      default:
        return { ok: false, reason: `unknown operator: ${op}` };
    }
  }

  /**
   * assign: updates[into] = state.get(from)
   */
  private opAssign(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const from = step.from;
    const into = step.into;

    if (from === undefined || typeof from !== 'string') {
      return { ok: false, reason: 'operator assign: missing field from' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator assign: missing field into' };
    }

    const value = state.get(from);
    if (value === undefined) {
      return { ok: false, reason: `operator assign: unbound name ${from}` };
    }

    return { ok: true, result: { updates: { [into]: value } } };
  }

  /**
   * sum: add two numeric or Quantity values
   */
  private opSum(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const lhsName = step.lhs;
    const rhsName = step.rhs;
    const into = step.into;

    if (lhsName === undefined || typeof lhsName !== 'string') {
      return { ok: false, reason: 'operator sum: missing field lhs' };
    }
    if (rhsName === undefined || typeof rhsName !== 'string') {
      return { ok: false, reason: 'operator sum: missing field rhs' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator sum: missing field into' };
    }

    const lhs = state.get(lhsName);
    const rhs = state.get(rhsName);

    if (lhs === undefined) {
      return { ok: false, reason: `operator sum: unbound name ${lhsName}` };
    }
    if (rhs === undefined) {
      return { ok: false, reason: `operator sum: unbound name ${rhsName}` };
    }

    // Both are numbers
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      const result = lhs + rhs;
      if (!isFiniteNumber(result)) {
        return { ok: false, reason: 'operator sum: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: result } } };
    }

    // Both are Quantity
    if (isQuantity(lhs) && isQuantity(rhs)) {
      const dimCheck = dimensionsEqual(lhs.unit, rhs.unit);
      if (!dimCheck.ok) {
        return { ok: false, reason: `operator sum: dimension mismatch between ${lhsName} and ${rhsName}: ${dimCheck.reason}` };
      }
      // Convert rhs to lhs's unit and add
      const rhsInLhsUnit = convertTo(rhs.value, rhs.unit, lhs.unit);
      const resultValue = lhs.value + rhsInLhsUnit;
      if (!isFiniteNumber(resultValue)) {
        return { ok: false, reason: 'operator sum: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: { value: resultValue, unit: lhs.unit } } } };
    }

    // Mixed: one is Quantity, one is number
    return { ok: false, reason: `operator sum: quantity / number mix` };
  }

  /**
   * subtract: subtract two numeric or Quantity values
   */
  private opSubtract(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const lhsName = step.lhs;
    const rhsName = step.rhs;
    const into = step.into;

    if (lhsName === undefined || typeof lhsName !== 'string') {
      return { ok: false, reason: 'operator subtract: missing field lhs' };
    }
    if (rhsName === undefined || typeof rhsName !== 'string') {
      return { ok: false, reason: 'operator subtract: missing field rhs' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator subtract: missing field into' };
    }

    const lhs = state.get(lhsName);
    const rhs = state.get(rhsName);

    if (lhs === undefined) {
      return { ok: false, reason: `operator subtract: unbound name ${lhsName}` };
    }
    if (rhs === undefined) {
      return { ok: false, reason: `operator subtract: unbound name ${rhsName}` };
    }

    // Both are numbers
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      const result = lhs - rhs;
      if (!isFiniteNumber(result)) {
        return { ok: false, reason: 'operator subtract: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: result } } };
    }

    // Both are Quantity
    if (isQuantity(lhs) && isQuantity(rhs)) {
      const dimCheck = dimensionsEqual(lhs.unit, rhs.unit);
      if (!dimCheck.ok) {
        return { ok: false, reason: `operator subtract: dimension mismatch between ${lhsName} and ${rhsName}: ${dimCheck.reason}` };
      }
      const rhsInLhsUnit = convertTo(rhs.value, rhs.unit, lhs.unit);
      const resultValue = lhs.value - rhsInLhsUnit;
      if (!isFiniteNumber(resultValue)) {
        return { ok: false, reason: 'operator subtract: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: { value: resultValue, unit: lhs.unit } } } };
    }

    // Mixed
    return { ok: false, reason: `operator subtract: quantity / number mix` };
  }

  /**
   * divide: divide two numeric or Quantity values
   */
  private opDivide(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const lhsName = step.lhs;
    const rhsName = step.rhs;
    const into = step.into;

    if (lhsName === undefined || typeof lhsName !== 'string') {
      return { ok: false, reason: 'operator divide: missing field lhs' };
    }
    if (rhsName === undefined || typeof rhsName !== 'string') {
      return { ok: false, reason: 'operator divide: missing field rhs' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator divide: missing field into' };
    }

    const lhs = state.get(lhsName);
    const rhs = state.get(rhsName);

    if (lhs === undefined) {
      return { ok: false, reason: `operator divide: unbound name ${lhsName}` };
    }
    if (rhs === undefined) {
      return { ok: false, reason: `operator divide: unbound name ${rhsName}` };
    }

    // Both are numbers
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      if (rhs === 0) {
        return { ok: false, reason: 'operator divide: non-finite result' };
      }
      const result = lhs / rhs;
      if (!isFiniteNumber(result)) {
        return { ok: false, reason: 'operator divide: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: result } } };
    }

    // Both are Quantity
    if (isQuantity(lhs) && isQuantity(rhs)) {
      if (rhs.value === 0) {
        return { ok: false, reason: 'operator divide: non-finite result' };
      }
      const resultValue = lhs.value / rhs.value;
      const resultUnit = divideUnits(lhs.unit, rhs.unit);
      if (!isFiniteNumber(resultValue)) {
        return { ok: false, reason: 'operator divide: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: { value: resultValue, unit: resultUnit } } } };
    }

    // Mixed
    return { ok: false, reason: `operator divide: quantity / number mix` };
  }

  /**
   * multiply: multiply two numeric or Quantity values
   */
  private opMultiply(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const lhsName = step.lhs;
    const rhsName = step.rhs;
    const into = step.into;

    if (lhsName === undefined || typeof lhsName !== 'string') {
      return { ok: false, reason: 'operator multiply: missing field lhs' };
    }
    if (rhsName === undefined || typeof rhsName !== 'string') {
      return { ok: false, reason: 'operator multiply: missing field rhs' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator multiply: missing field into' };
    }

    const lhs = state.get(lhsName);
    const rhs = state.get(rhsName);

    if (lhs === undefined) {
      return { ok: false, reason: `operator multiply: unbound name ${lhsName}` };
    }
    if (rhs === undefined) {
      return { ok: false, reason: `operator multiply: unbound name ${rhsName}` };
    }

    // Both are numbers
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      const result = lhs * rhs;
      if (!isFiniteNumber(result)) {
        return { ok: false, reason: 'operator multiply: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: result } } };
    }

    // Both are Quantity
    if (isQuantity(lhs) && isQuantity(rhs)) {
      const resultValue = lhs.value * rhs.value;
      const resultUnit = multiplyUnits(lhs.unit, rhs.unit);
      if (!isFiniteNumber(resultValue)) {
        return { ok: false, reason: 'operator multiply: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: { value: resultValue, unit: resultUnit } } } };
    }

    // Mixed
    return { ok: false, reason: `operator multiply: quantity / number mix` };
  }

  /**
   * clamp: clamp a numeric value between min and max
   * If unit is given, convert Quantity to that unit first, clamp, wrap back as Quantity
   */
  private opClamp(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const valueName = step.value;
    const min = step.min;
    const max = step.max;
    const into = step.into;
    const unitStr = step.unit;

    if (valueName === undefined || typeof valueName !== 'string') {
      return { ok: false, reason: 'operator clamp: missing field value' };
    }
    if (min === undefined || typeof min !== 'number') {
      return { ok: false, reason: 'operator clamp: missing field min' };
    }
    if (max === undefined || typeof max !== 'number') {
      return { ok: false, reason: 'operator clamp: missing field max' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator clamp: missing field into' };
    }

    const value = state.get(valueName);
    if (value === undefined) {
      return { ok: false, reason: `operator clamp: unbound name ${valueName}` };
    }

    // If unit is specified, handle Quantity conversion
    if (unitStr !== undefined && typeof unitStr === 'string') {
      if (!isQuantity(value)) {
        return { ok: false, reason: 'operator clamp: unit specified but value is not a Quantity' };
      }
      const targetUnit = parseUnit(unitStr);
      const convertedValue = convertTo(value.value, value.unit, targetUnit);
      const clamped = Math.min(Math.max(convertedValue, min), max);
      if (!isFiniteNumber(clamped)) {
        return { ok: false, reason: 'operator clamp: non-finite result' };
      }
      return { ok: true, result: { updates: { [into]: { value: clamped, unit: targetUnit } } } };
    }

    // Plain numeric clamp
    if (typeof value !== 'number') {
      return { ok: false, reason: 'operator clamp: value is not a number' };
    }
    const clamped = Math.min(Math.max(value, min), max);
    if (!isFiniteNumber(clamped)) {
      return { ok: false, reason: 'operator clamp: non-finite result' };
    }
    return { ok: true, result: { updates: { [into]: clamped } } };
  }

  /**
   * weighted_average: compute weighted average of multiple values
   * weights are literal numbers embedded in the step
   */
  private opWeightedAverage(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const values = step.values;
    const weights = step.weights;
    const into = step.into;

    if (values === undefined || !Array.isArray(values)) {
      return { ok: false, reason: 'operator weighted_average: missing field values' };
    }
    if (weights === undefined || !Array.isArray(weights)) {
      return { ok: false, reason: 'operator weighted_average: missing field weights' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator weighted_average: missing field into' };
    }
    if (values.length !== weights.length) {
      return { ok: false, reason: 'operator weighted_average: values and weights must have same length' };
    }
    if (values.length === 0) {
      return { ok: false, reason: 'operator weighted_average: values array is empty' };
    }

    // Validate all values are bound and weights are numbers
    const resolvedValues: WorkingValue[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (typeof v !== 'string') {
        return { ok: false, reason: `operator weighted_average: values[${i}] is not a string` };
      }
      const resolved = state.get(v);
      if (resolved === undefined) {
        return { ok: false, reason: `operator weighted_average: unbound name ${v}` };
      }
      resolvedValues.push(resolved);
    }

    // Validate weights are numbers and compute sum
    const numericWeights: number[] = [];
    let weightSum = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (typeof w !== 'number') {
        return { ok: false, reason: `operator weighted_average: weights[${i}] is not a number` };
      }
      numericWeights.push(w);
      weightSum += w;
    }

    if (weightSum <= 0) {
      return { ok: false, reason: 'operator weighted_average: weights must sum to a positive number' };
    }

    // Check dimension compatibility for Quantity values
    // All Quantity values must have the same dimensions
    const firstValue = resolvedValues[0]!;
    let targetUnit: Unit | undefined;
    if (isQuantity(firstValue)) {
      targetUnit = firstValue.unit;
    }

    // Convert all values to the target unit (if Quantity) and compute weighted sum
    let weightedSum = 0;
    for (let i = 0; i < resolvedValues.length; i++) {
      const v = resolvedValues[i]!;
      const w = numericWeights[i]!;

      if (isQuantity(v)) {
        if (targetUnit === undefined) {
          return { ok: false, reason: 'operator weighted_average: mixed number and Quantity values' };
        }
        const dimCheck = dimensionsEqual(v.unit, targetUnit);
        if (!dimCheck.ok) {
          return { ok: false, reason: `operator weighted_average: dimension mismatch between ${values[i]} and ${values[0]}: ${dimCheck.reason}` };
        }
        const convertedValue = convertTo(v.value, v.unit, targetUnit);
        weightedSum += convertedValue * w;
      } else if (typeof v === 'number') {
        if (targetUnit !== undefined) {
          return { ok: false, reason: 'operator weighted_average: mixed number and Quantity values' };
        }
        weightedSum += v * w;
      } else {
        return { ok: false, reason: `operator weighted_average: unsupported value type at index ${i}` };
      }
    }

    const resultValue = weightedSum / weightSum;
    if (!isFiniteNumber(resultValue)) {
      return { ok: false, reason: 'operator weighted_average: non-finite result' };
    }

    // Return as Quantity if targetUnit exists, otherwise as number
    if (targetUnit !== undefined) {
      return { ok: true, result: { updates: { [into]: { value: resultValue, unit: targetUnit } } } };
    }
    return { ok: true, result: { updates: { [into]: resultValue } } };
  }

  /**
   * lookup_constant: look up a constant from the constants table
   */
  private opLookupConstant(
    step: DerivationStep,
    _state: WorkingState,
  ): { ok: true; result: { updates: Record<string, WorkingValue> } } | { ok: false; reason: string } {
    const id = step.id;
    const into = step.into;

    if (id === undefined || typeof id !== 'string') {
      return { ok: false, reason: 'operator lookup_constant: missing field id' };
    }
    if (into === undefined || typeof into !== 'string') {
      return { ok: false, reason: 'operator lookup_constant: missing field into' };
    }

    if (this.constants === undefined) {
      return { ok: false, reason: `operator lookup_constant: no constants table configured` };
    }

    const constant = this.constants.get(id);
    if (constant === undefined) {
      return { ok: false, reason: `operator lookup_constant: unknown constant ${id}` };
    }

    return { ok: true, result: { updates: { [into]: constant } } };
  }
}
