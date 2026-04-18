import { describe, it, expect } from 'vitest';
import { ContextRoleVerifier, type ContextRole } from './ContextRoleVerifier.js';
import type { Context } from '../types/context.js';

const subject = { kind: 'record' as const, id: 'LI-1', type: 'labware-instance' };

describe('ContextRoleVerifier', () => {
  const role: ContextRole = {
    id: 'CR-positive-control-for-ros',
    name: 'Positive control for ROS',
    prerequisites: [
      { has_material_class: { class: 'ros-inducer' } },
    ],
  };

  it('passes when context contains a ros-inducer component', () => {
    const ctx: Context = {
      id: 'CTX-1',
      subject_ref: subject,
      contents: [
        { material_ref: { kind: 'ontology', id: 'CHEBI:27342', namespace: 'ChEBI', label: 'H2O2' }, volume: { value: 10, unit: 'uL' } } as unknown as Context['contents'] extends (infer T)[] | undefined ? T : never,
      ] as Context['contents'],
    };
    // Inject material_class through an any-cast — the type doesn't yet have it.
    (ctx.contents![0] as unknown as Record<string, unknown>).material_class = 'ros-inducer';
    const v = new ContextRoleVerifier().verify(role, ctx);
    expect(v.passed).toBe(true);
    expect(v.failed_count).toBe(0);
    expect(v.predicate_results[0]?.op).toBe('has_material_class');
  });

  it('fails with explanatory reason when class does not match', () => {
    const ctx: Context = {
      id: 'CTX-2',
      subject_ref: subject,
      contents: [
        { material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' }, volume: { value: 100, unit: 'uL' } },
      ] as Context['contents'],
    };
    (ctx.contents![0] as unknown as Record<string, unknown>).material_class = 'solvent';
    const v = new ContextRoleVerifier().verify(role, ctx);
    expect(v.passed).toBe(false);
    expect(v.failed_count).toBe(1);
  });

  it('fails with an invalid-predicate reason on malformed prerequisite', () => {
    const bad: ContextRole = {
      id: 'CR-bad',
      name: 'bad',
      prerequisites: [42 as unknown as object],
    };
    const ctx: Context = { id: 'CTX-3', subject_ref: subject, contents: [] };
    const v = new ContextRoleVerifier().verify(bad, ctx);
    expect(v.passed).toBe(false);
    expect(v.predicate_results[0]?.op).toBe('<invalid>');
  });
});
