import { describe, it, expect } from 'vitest';
import { diffContexts } from './ContextDiff.js';
import type { Context } from '../types/context.js';

const baseSubject = { kind: 'record' as const, id: 'LI-1', type: 'labware-instance' };

describe('diffContexts', () => {
  it('reports total_volume delta', () => {
    const a: Context = { id: 'CTX-A', subject_ref: baseSubject, contents: [], total_volume: { value: 100, unit: 'uL' } };
    const b: Context = { id: 'CTX-B', subject_ref: baseSubject, contents: [], total_volume: { value: 125, unit: 'uL' } };
    const d = diffContexts(a, b);
    expect(d.total_volume).toEqual({ from: 100, to: 125, delta: 25 });
    expect(d.warnings).toHaveLength(0);
  });

  it('flags new material as from=undefined', () => {
    const a: Context = { id: 'CTX-A', subject_ref: baseSubject, contents: [] };
    const b: Context = { id: 'CTX-B', subject_ref: baseSubject, contents: [
      { material_ref: { kind: 'ontology', id: 'CHEBI:17234', namespace: 'ChEBI', label: 'glucose' }, volume: { value: 6.25, unit: 'uL' } },
    ] };
    const d = diffContexts(a, b);
    const entry = d.contents.find(c => c.material_id === 'CHEBI:17234')!;
    expect(entry.from).toBeUndefined();
    expect(entry.to?.volume_value).toBeCloseTo(6.25);
  });

  it('flags removed material as to=undefined', () => {
    const a: Context = { id: 'CTX-A', subject_ref: baseSubject, contents: [
      { material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' }, volume: { value: 100, unit: 'uL' } },
    ] };
    const b: Context = { id: 'CTX-B', subject_ref: baseSubject, contents: [] };
    const d = diffContexts(a, b);
    const entry = d.contents.find(c => c.material_id === 'CHEBI:15377')!;
    expect(entry.to).toBeUndefined();
    expect(entry.from?.volume_value).toBe(100);
  });

  it('warns on total_volume unit mismatch', () => {
    const a: Context = { id: 'CTX-A', subject_ref: baseSubject, contents: [], total_volume: { value: 1, unit: 'mL' } };
    const b: Context = { id: 'CTX-B', subject_ref: baseSubject, contents: [], total_volume: { value: 1000, unit: 'uL' } };
    const d = diffContexts(a, b);
    expect(d.warnings.some(w => w.includes('unit mismatch'))).toBe(true);
    expect(d.total_volume?.delta).toBeNull();
  });
});
