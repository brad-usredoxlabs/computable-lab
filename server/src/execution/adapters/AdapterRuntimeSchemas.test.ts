import { describe, expect, it } from 'vitest';
import {
  getActiveReadParameterShape,
  getExecuteParameterShape,
  listActiveReadTargets,
  listExecuteTargets,
  validateActiveReadParameters,
  validateExecuteParameters,
} from './AdapterRuntimeSchemas.js';

describe('AdapterRuntimeSchemas', () => {
  it('lists targets and exposes shapes', () => {
    const executeTargets = listExecuteTargets();
    const activeReadTargets = listActiveReadTargets();
    expect(executeTargets).toContain('integra_assist');
    expect(activeReadTargets).toContain('molecular_devices_gemini');

    const executeShape = getExecuteParameterShape('integra_assist');
    const activeShape = getActiveReadParameterShape('molecular_devices_gemini');
    expect(Object.keys(executeShape)).toContain('mixCycles');
    expect(Object.keys(activeShape)).toContain('wavelengthNm');
  });

  it('validates and rejects unknown keys', () => {
    const ok = validateExecuteParameters('integra_assist', { simulate: true, mixCycles: 4 });
    expect(ok['simulate']).toBe(true);
    expect(ok['mixCycles']).toBe(4);
    expect(() => validateExecuteParameters('integra_assist', { bad: true })).toThrow(/Invalid execute parameters/);
    expect(() => validateActiveReadParameters('molecular_devices_gemini', { nope: 1 })).toThrow(/Invalid active-read parameters/);
  });
});

